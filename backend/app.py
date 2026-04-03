import base64
import binascii
import json
import logging
import os
import queue
import re
import shutil
import smtplib
import ssl
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, Request, jsonify, request
from flask_cors import CORS
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
MB = 1024 * 1024
TERMINAL_STATUSES = {"completed", "completed_with_warnings", "failed"}
RETRIABLE_ERRORS = {"quota_exceeded", "upstream_error", "upstream_timeout", "upstream_unreachable"}

load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BASE_DIR / ".env", override=True)


def env_flag(*names, default=False):
    for name in names:
        value = os.getenv(name)
        if value is None:
            continue
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return default

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "250"))
MAX_FORM_MEMORY_MB = int(os.getenv("MAX_FORM_MEMORY_MB", "8"))
MAX_FORM_PARTS = int(os.getenv("MAX_FORM_PARTS", "8"))
CHUNK_DURATION_SECONDS = int(os.getenv("CHUNK_DURATION_SECONDS", "600"))
JOB_QUEUE_WORKERS = int(os.getenv("JOB_QUEUE_WORKERS", "2"))
JOB_WRITE_RETRIES = int(os.getenv("JOB_WRITE_RETRIES", "6"))
JOB_WRITE_RETRY_DELAY_SECONDS = float(os.getenv("JOB_WRITE_RETRY_DELAY_SECONDS", "0.15"))
TRANSCRIPTION_WORKERS = int(os.getenv("TRANSCRIPTION_WORKERS", "3"))
CHUNK_TRANSCRIPTION_RETRIES = int(os.getenv("CHUNK_TRANSCRIPTION_RETRIES", "3"))
SUMMARY_RETRIES = int(os.getenv("SUMMARY_RETRIES", "2"))
UPLOAD_TIMEOUT_SECONDS = int(os.getenv("UPLOAD_TIMEOUT_SECONDS", "3600"))
TRANSCRIPTION_TIMEOUT_SECONDS = int(os.getenv("TRANSCRIPTION_TIMEOUT_SECONDS", str(UPLOAD_TIMEOUT_SECONDS)))
SUMMARY_TIMEOUT_SECONDS = int(os.getenv("SUMMARY_TIMEOUT_SECONDS", "300"))
SUMMARY_DIRECT_CHAR_LIMIT = int(os.getenv("SUMMARY_DIRECT_CHAR_LIMIT", "18000"))
GROQ_API_BASE_URL = os.getenv("GROQ_API_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
TRANSCRIPTION_MODEL = os.getenv("TRANSCRIPTION_MODEL", "whisper-large-v3")
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "llama-3.1-8b-instant")
KEEP_SOURCE_UPLOADS = os.getenv("KEEP_SOURCE_UPLOADS", "false").lower() == "true"
KEEP_CHUNK_ARTIFACTS = os.getenv("KEEP_CHUNK_ARTIFACTS", "false").lower() == "true"
MAIL_SERVER = os.getenv("MAIL_SERVER") or os.getenv("SMTP_HOST") or "smtp.gmail.com"
MAIL_PORT = int(os.getenv("MAIL_PORT") or os.getenv("SMTP_PORT") or "587")
MAIL_USERNAME = os.getenv("MAIL_USERNAME") or os.getenv("SMTP_EMAIL") or ""
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD") or os.getenv("SMTP_APP_PASSWORD") or ""
MAIL_FROM = os.getenv("MAIL_FROM") or MAIL_USERNAME
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME") or "MeetingMate AI"
MAIL_USE_TLS = env_flag("MAIL_USE_TLS", "SMTP_USE_TLS", default=True)
MAIL_USE_SSL = env_flag("MAIL_USE_SSL", "SMTP_USE_SSL", default=MAIL_PORT == 465)
MAIL_MAX_ATTACHMENT_MB = int(os.getenv("MAIL_MAX_ATTACHMENT_MB", "10"))

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", str(BASE_DIR / "storage")))
UPLOAD_STORAGE_DIR = Path(os.getenv("UPLOAD_STORAGE_DIR", str(STORAGE_DIR / "uploads")))
JOB_STORAGE_DIR = Path(os.getenv("JOB_STORAGE_DIR", str(STORAGE_DIR / "jobs")))
NORMALIZED_STORAGE_DIR = Path(os.getenv("NORMALIZED_STORAGE_DIR", str(STORAGE_DIR / "normalized")))
for path in (STORAGE_DIR, UPLOAD_STORAGE_DIR, JOB_STORAGE_DIR, NORMALIZED_STORAGE_DIR):
    path.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg", ".mpeg", ".mpga"}
ALLOWED_MIME_PREFIXES = ("audio/", "video/")
THREAD_LOCAL = threading.local()
JOB_QUEUE = queue.Queue()
JOB_LOCK = threading.RLock()
JOBS = {}

REPORT_PROMPT = """You are an advanced AI assistant responsible for analyzing transcripts and generating professional summary reports.

Step 1: Content type detection
Before generating the report, classify the transcript as exactly one of the following:
1. Meeting
2. Lecture / Educational Video
3. Interview / Conversation

Classification guidance:
- Meeting: multiple speakers, discussions, decisions, tasks, business or team interaction
- Lecture / Educational Video: single speaker or instructor, teaching concepts or skills, no decisions or task assignments
- Interview / Conversation: question and answer format, two or more participants, informational exchange

Step 2: Adapt the output structure based on the detected type

If type = Meeting:
- Generate a formal business meeting report
- Include: Meeting Title, Date, Participants
- Use sections: Executive Summary, Key Discussion Points, Important Decisions, Action Items, Next Steps, Risks / Concerns, Conclusion

If type = Lecture / Educational Video:
- Generate a structured learning report
- Do not include participants, decisions, or action items unless clearly instructional
- Include: Title, Date
- Use sections: Introduction, Overview of Topic, Key Concepts Explained, Examples / Demonstrations, Learning Takeaways, Practical Applications, Conclusion

If type = Interview / Conversation:
- Generate a structured conversational summary
- Include participants if identifiable
- Use sections: Overview, Key Topics Discussed, Important Insights, Notable Responses, Conclusion

General rules:
- Use a professional and formal tone
- Ensure clean, printable formatting
- Avoid repetition
- Do not include raw transcript text
- Do not hallucinate decisions or tasks
- Keep the content concise and structured
- Use bullet points where appropriate
- Ensure readability for real-world use

Output format:
Start with:
Content Type: (Detected Type)

Then generate the report accordingly."""

CHUNK_SUMMARY_PROMPT = """You are summarizing one chunk from a long meeting or lecture transcript.
Return a concise structured summary with:
- Main topics
- Key decisions or insights
- Action items if any
- Important names or entities if mentioned

Keep it under 180 words and avoid repetition."""

FINAL_FROM_CHUNKS_PROMPT = """You are combining chunk summaries from a long recording into one final, professional summary report.
Use the same high-quality structure and reasoning you would use for a full meeting summary.
Do not mention that the content came from chunk summaries unless there were missing chunks."""


class LargeUploadRequest(Request):
    max_content_length = MAX_UPLOAD_MB * MB
    max_form_memory_size = MAX_FORM_MEMORY_MB * MB
    max_form_parts = MAX_FORM_PARTS


class ApiError(Exception):
    def __init__(self, message, *, status_code=400, error="bad_request", payload=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error = error
        self.payload = payload or {}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def slugify_filename(filename):
    safe_name = secure_filename(filename or "")
    if safe_name:
        return safe_name
    return "upload.bin"


def create_http_session():
    session = requests.Session()
    retries = Retry(
        total=2,
        connect=2,
        read=2,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def get_http_session():
    session = getattr(THREAD_LOCAL, "http_session", None)
    if session is None:
        session = create_http_session()
        THREAD_LOCAL.http_session = session
    return session


def parse_origins():
    raw = os.getenv("CORS_ORIGINS", "*").strip()
    if raw == "*":
        return "*"
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def get_mail_config_error():
    if not MAIL_SERVER:
        return "Mail delivery is not configured. Add MAIL_SERVER or SMTP_HOST to your .env file."
    if MAIL_PORT <= 0:
        return "Mail delivery is not configured. Set MAIL_PORT or SMTP_PORT to a valid port."
    if not MAIL_FROM:
        return "Mail delivery is not configured. Add MAIL_FROM to your .env file."
    if bool(MAIL_USERNAME) != bool(MAIL_PASSWORD):
        return "Mail delivery is not configured. Set both MAIL_USERNAME and MAIL_PASSWORD together."
    return None


def is_valid_email_address(value):
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value or ""))


def decode_export_attachment(encoded_content):
    normalized = re.sub(r"\s+", "", encoded_content or "")
    if not normalized:
        raise ApiError(
            "Export attachment content is required.",
            status_code=400,
            error="missing_attachment",
        )

    try:
        data = base64.b64decode(normalized, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ApiError(
            f"Export attachment content is not valid base64: {exc}",
            status_code=400,
            error="invalid_attachment",
        ) from exc

    if not data:
        raise ApiError(
            "Export attachment content was empty.",
            status_code=400,
            error="empty_attachment",
        )

    max_attachment_bytes = MAIL_MAX_ATTACHMENT_MB * MB
    if len(data) > max_attachment_bytes:
        raise ApiError(
            f"Export attachment exceeds the configured {MAIL_MAX_ATTACHMENT_MB} MB mail limit.",
            status_code=413,
            error="attachment_too_large",
            payload={"max_attachment_mb": MAIL_MAX_ATTACHMENT_MB},
        )

    return data


def build_export_email_message(to_email, report_title, export_format, attachment_name, attachment_bytes, mime_type):
    readable_title = report_title or "Meeting export"
    readable_format = (export_format or "file").upper()
    message = EmailMessage()
    message["Subject"] = f"MeetingMate AI export: {readable_title}"
    message["From"] = formataddr((MAIL_FROM_NAME, MAIL_FROM)) if MAIL_FROM_NAME else MAIL_FROM
    message["To"] = to_email

    plain_text = (
        f"Your {readable_format} export for \"{readable_title}\" is attached.\n\n"
        "Sent from MeetingMate AI."
    )
    html = (
        "<div style=\"font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;\">"
        "<h2 style=\"margin: 0 0 12px;\">Your MeetingMate AI export is ready</h2>"
        f"<p style=\"margin: 0 0 12px;\">Attached is your {escape(readable_format)} export for <strong>{escape(readable_title)}</strong>.</p>"
        "<p style=\"margin: 0; color: #475569; font-size: 14px;\">You can open the attachment directly from this email.</p>"
        "</div>"
    )

    message.set_content(plain_text)
    message.add_alternative(html, subtype="html")

    if "/" in mime_type:
        maintype, subtype = mime_type.split("/", 1)
    else:
        maintype, subtype = "application", "octet-stream"

    message.add_attachment(
        attachment_bytes,
        maintype=maintype,
        subtype=subtype,
        filename=attachment_name,
    )
    return message


def send_smtp_message(message):
    config_error = get_mail_config_error()
    if config_error:
        raise ApiError(
            config_error,
            status_code=500,
            error="configuration_error",
        )

    try:
        if MAIL_USE_SSL or MAIL_PORT == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(MAIL_SERVER, MAIL_PORT, timeout=60, context=context) as smtp:
                if MAIL_USERNAME and MAIL_PASSWORD:
                    smtp.login(MAIL_USERNAME, MAIL_PASSWORD)
                smtp.send_message(message)
            return

        with smtplib.SMTP(MAIL_SERVER, MAIL_PORT, timeout=60) as smtp:
            smtp.ehlo()
            if MAIL_USE_TLS:
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            if MAIL_USERNAME and MAIL_PASSWORD:
                smtp.login(MAIL_USERNAME, MAIL_PASSWORD)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        raise ApiError(
            f"Failed to send export email: {exc}",
            status_code=502,
            error="mail_send_failed",
        ) from exc


def get_groq_api_key():
    api_key = os.getenv("GROQ_API_KEY") or os.getenv("VITE_GROQ_API_KEY")
    if not api_key:
        raise ApiError(
            "The upload service is missing GROQ_API_KEY configuration.",
            status_code=500,
            error="configuration_error",
        )
    return api_key.strip("\"'")


def ensure_ffmpeg():
    if shutil.which("ffmpeg") is None:
        raise ApiError(
            "ffmpeg is required for chunking large media files. Install ffmpeg on the backend host.",
            status_code=500,
            error="missing_dependency",
        )


def allowed_upload(filename, mimetype):
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ApiError(
            f"Unsupported file type '{suffix or 'unknown'}'. Allowed types: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
            status_code=415,
            error="unsupported_media_type",
        )

    normalized_type = (mimetype or "").lower()
    if normalized_type and not normalized_type.startswith(ALLOWED_MIME_PREFIXES):
        raise ApiError(
            f"Unsupported content type '{mimetype}'. Upload an audio or video file.",
            status_code=415,
            error="unsupported_media_type",
        )


def job_dir(job_id):
    path = JOB_STORAGE_DIR / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def job_file(job_id):
    return job_dir(job_id) / "job.json"


def transcript_file(job_id):
    return job_dir(job_id) / "transcript.txt"


def summary_file(job_id):
    return job_dir(job_id) / "summary.txt"


def chunk_dir(job_id):
    path = job_dir(job_id) / "chunks"
    path.mkdir(parents=True, exist_ok=True)
    return path


def normalized_file(job_id):
    return NORMALIZED_STORAGE_DIR / f"{job_id}.mp3"


def is_retryable_storage_error(error):
    return isinstance(error, PermissionError) or getattr(error, "winerror", None) in {5, 32}


def cleanup_temp_file(path):
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def persist_text(path, content, *, encoding="utf-8"):
    path.parent.mkdir(parents=True, exist_ok=True)
    attempts = max(JOB_WRITE_RETRIES, 1)
    last_error = None

    # Keep temp files in the same directory so os.replace stays atomic when it succeeds.
    for attempt in range(attempts):
        temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temp_path.open("w", encoding=encoding) as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, path)
            return
        except OSError as exc:
            last_error = exc
            cleanup_temp_file(temp_path)
            if not is_retryable_storage_error(exc) or attempt == attempts - 1:
                break
            time.sleep(JOB_WRITE_RETRY_DELAY_SECONDS * (attempt + 1))

    if last_error and not is_retryable_storage_error(last_error):
        raise last_error

    try:
        with path.open("w", encoding=encoding) as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
    except OSError as exc:
        raise last_error or exc


def persist_job(job):
    path = job_file(job["job_id"])
    persist_text(path, json.dumps(job, indent=2), encoding="utf-8")


def read_job_snapshot(job_id):
    path = job_file(job_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def load_jobs_from_disk():
    for candidate in JOB_STORAGE_DIR.glob("*/job.json"):
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
        except Exception:
            continue
        with JOB_LOCK:
            JOBS[payload["job_id"]] = payload


def merge_job(existing, updates):
    updated = dict(existing)
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(updated.get(key), dict):
            merged = dict(updated[key])
            merged.update(value)
            updated[key] = merged
        elif isinstance(value, list) and isinstance(updated.get(key), list) and key == "warnings":
            updated[key] = existing.get(key, []) + value
        else:
            updated[key] = value
    updated["updated_at"] = now_iso()
    return updated


def register_job(job):
    with JOB_LOCK:
        JOBS[job["job_id"]] = job
        persist_job(job)
    return dict(job)


def get_job(job_id):
    try:
        payload = read_job_snapshot(job_id)
    except Exception:
        payload = None
    if payload:
        with JOB_LOCK:
            JOBS[job_id] = payload
        return dict(payload)
    with JOB_LOCK:
        current = JOBS.get(job_id)
    if current:
        return dict(current)
    return None


def update_job(job_id, **updates):
    with JOB_LOCK:
        current = JOBS.get(job_id)
        if current is None:
            try:
                current = read_job_snapshot(job_id)
            except Exception:
                current = None
        elif job_file(job_id).exists():
            try:
                current = read_job_snapshot(job_id) or current
            except Exception:
                current = current

        if current is None:
            raise KeyError(job_id)

        updated = merge_job(current, updates)
        JOBS[job_id] = updated
        persist_job(updated)
    return dict(updated)


def write_artifact(path, content):
    persist_text(path, content, encoding="utf-8")


def read_artifact(path):
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None


def public_job_payload(job):
    payload = {
        "job_id": job["job_id"],
        "status": job["status"],
        "stage": job["stage"],
        "progress": job["progress"],
        "message": job["message"],
        "warnings": job.get("warnings", []),
        "created_at": job.get("created_at"),
        "updated_at": job.get("updated_at"),
        "upload": {
            "filename": job.get("filename"),
            "size_mb": job.get("size_mb"),
        },
        "chunk_count": job.get("chunk_count", 0),
        "successful_chunks": job.get("successful_chunks", 0),
        "failed_chunks": job.get("failed_chunks", 0),
        "status_url": f"/api/status/{job['job_id']}",
        "process_url": "/api/process",
    }
    if job["status"] in TERMINAL_STATUSES:
        payload["summary"] = read_artifact(summary_file(job["job_id"]))
        payload["transcript"] = read_artifact(transcript_file(job["job_id"]))
    return payload


def create_job_record(job_id, filename, content_type, file_path, size_bytes):
    return {
        "job_id": job_id,
        "status": "uploaded",
        "stage": "uploaded",
        "progress": 5,
        "message": "Upload complete. Start processing to begin normalization, chunking, transcription, and summary generation.",
        "filename": filename,
        "content_type": content_type,
        "file_path": str(file_path),
        "size_bytes": size_bytes,
        "size_mb": round(size_bytes / MB, 2),
        "warnings": [],
        "chunk_count": 0,
        "successful_chunks": 0,
        "failed_chunks": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }


def persist_upload(file_storage, job_id):
    filename = slugify_filename(file_storage.filename or "")
    if not filename:
        raise ApiError(
            "No file was uploaded. Use multipart/form-data and provide the file in the 'file' field.",
            status_code=400,
            error="missing_file",
        )

    allowed_upload(filename, file_storage.mimetype)
    target = UPLOAD_STORAGE_DIR / f"{job_id}_{filename}"

    try:
        with target.open("wb") as handle:
            shutil.copyfileobj(file_storage.stream, handle, length=MB)
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise ApiError(
            f"Failed to store the uploaded file: {exc}",
            status_code=500,
            error="upload_persist_failed",
        ) from exc

    size_bytes = target.stat().st_size
    if size_bytes == 0:
        target.unlink(missing_ok=True)
        raise ApiError(
            "The uploaded file was empty.",
            status_code=400,
            error="empty_upload",
        )

    return target, filename, (file_storage.mimetype or "application/octet-stream"), size_bytes


def parse_provider_error(response, default_message, *, transcript=None):
    payload = {}
    try:
        payload = response.json()
    except ValueError:
        payload = {}

    provider_message = payload.get("error", {}).get("message") or payload.get("message") or default_message
    details = {"provider_status": response.status_code}
    if transcript:
        details["transcript"] = transcript

    if response.status_code == 429:
        raise ApiError(
            provider_message,
            status_code=429,
            error="quota_exceeded",
            payload=details,
        )

    if response.status_code in (401, 403):
        raise ApiError(
            "The server-side Groq credentials were rejected.",
            status_code=500,
            error="configuration_error",
            payload=details,
        )

    raise ApiError(
        provider_message,
        status_code=502,
        error="upstream_error",
        payload=details,
    )


def is_retriable(error):
    return isinstance(error, ApiError) and error.error in RETRIABLE_ERRORS


def sleep_backoff(attempt):
    time.sleep(min(2 ** attempt, 8))


def run_command(command):
    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise ApiError(
            result.stderr.strip() or "Command execution failed.",
            status_code=500,
            error="media_processing_failed",
    )
    return result


def normalize_audio_to_mp3(job_id, source_file):
    ensure_ffmpeg()
    target = normalized_file(job_id)
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_file),
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        str(target),
    ]
    run_command(command)
    if not target.exists() or target.stat().st_size == 0:
        raise ApiError(
            "Audio normalization failed and produced no MP3 output.",
            status_code=500,
            error="normalization_failed",
        )
    return target


def split_media_into_chunks(job_id, source_file):
    ensure_ffmpeg()
    output_dir = chunk_dir(job_id)
    pattern = output_dir / "chunk_%03d.mp3"

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_file),
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        "-f",
        "segment",
        "-segment_time",
        str(CHUNK_DURATION_SECONDS),
        "-reset_timestamps",
        "1",
        str(pattern),
    ]
    run_command(command)

    chunk_paths = sorted(output_dir.glob("chunk_*.mp3"))
    if not chunk_paths:
        raise ApiError(
            "Chunking produced no audio segments. Verify that the media file contains an audio track.",
            status_code=422,
            error="chunking_failed",
        )

    chunks = []
    for index, path in enumerate(chunk_paths):
        chunks.append(
            {
                "index": index,
                "path": path,
                "label": f"{int(index * CHUNK_DURATION_SECONDS // 60):02d}:{int(index * CHUNK_DURATION_SECONDS % 60):02d}",
                "start_seconds": index * CHUNK_DURATION_SECONDS,
            }
        )
    return chunks


def transcribe_chunk(chunk):
    session = get_http_session()
    last_error = None
    for attempt in range(CHUNK_TRANSCRIPTION_RETRIES):
        try:
            with chunk["path"].open("rb") as uploaded_file:
                response = session.post(
                    f"{GROQ_API_BASE_URL}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {get_groq_api_key()}"},
                    data={"model": TRANSCRIPTION_MODEL},
                    files={"file": (chunk["path"].name, uploaded_file, "audio/mpeg")},
                    timeout=(30, TRANSCRIPTION_TIMEOUT_SECONDS),
                )
        except requests.Timeout:
            last_error = ApiError(
                "Chunk transcription timed out.",
                status_code=504,
                error="upstream_timeout",
            )
        except requests.RequestException as exc:
            last_error = ApiError(
                f"Could not reach the transcription provider: {exc}",
                status_code=502,
                error="upstream_unreachable",
            )
        except Exception as exc:
            last_error = ApiError(
                f"Chunk transcription failed unexpectedly: {exc}",
                status_code=500,
                error="chunk_processing_failed",
            )
        else:
            if response.ok:
                try:
                    data = response.json()
                    transcript = (data.get("text") or "").strip()
                except ValueError as exc:
                    last_error = ApiError(
                        f"Chunk transcription returned invalid JSON: {exc}",
                        status_code=502,
                        error="upstream_error",
                    )
                else:
                    if transcript:
                        return {
                            "index": chunk["index"],
                            "label": chunk["label"],
                            "success": True,
                            "transcript": transcript,
                        }
                    last_error = ApiError(
                        "Chunk transcription returned no text.",
                        status_code=502,
                        error="empty_transcript_chunk",
                    )
            else:
                try:
                    parse_provider_error(response, "Chunk transcription failed.")
                except ApiError as exc:
                    last_error = exc

        if last_error and not is_retriable(last_error):
            break
        if attempt < CHUNK_TRANSCRIPTION_RETRIES - 1:
            sleep_backoff(attempt)

    warning = f"Chunk {chunk['index'] + 1} could not be transcribed after retries."
    if last_error:
        warning = f"{warning} {last_error.message}"

    return {
        "index": chunk["index"],
        "label": chunk["label"],
        "success": False,
        "transcript": "",
        "warning": warning,
    }


def normalize_whitespace(text):
    return re.sub(r"\s+", " ", text or "").strip()


def sentence_list(text, limit=6):
    clean = normalize_whitespace(text)
    if not clean:
        return []
    candidates = re.split(r"(?<=[.!?])\s+", clean)
    sentences = []
    for candidate in candidates:
        value = candidate.strip(" -")
        if not value:
            continue
        sentences.append(value)
        if len(sentences) >= limit:
            break
    return sentences


def heuristic_chunk_summary(text, label):
    bullets = sentence_list(text, limit=4)
    if not bullets and text:
        bullets = [normalize_whitespace(text)[:320]]
    if not bullets:
        bullets = ["No transcript text was available for this chunk."]
    return "\n".join([f"Chunk {label}"] + [f"- {bullet}" for bullet in bullets])


def heuristic_final_summary(filename, transcript_text, chunk_summaries, warnings, successful_chunks, total_chunks):
    bullets = sentence_list(transcript_text, limit=6)
    lines = [
        "Content Type: Recording",
        "",
        f"Title: {Path(filename).stem}",
        "",
        "Executive Summary:",
    ]
    if bullets:
        lines.extend([f"- {bullet}" for bullet in bullets])
    elif chunk_summaries:
        lines.extend([f"- {normalize_whitespace(chunk_summaries[0])[:220]}"])
    else:
        lines.append("- The recording uploaded successfully, but the system could only generate a partial fallback summary.")

    lines.extend(
        [
            "",
            "Processing Notes:",
            f"- Successful chunks: {successful_chunks}/{total_chunks}",
        ]
    )
    if warnings:
        lines.extend([f"- {warning}" for warning in warnings[:3]])

    excerpt = normalize_whitespace(transcript_text)[:1200]
    if excerpt:
        lines.extend(["", "Transcript Excerpt:", excerpt])

    lines.extend(
        [
            "",
            "Next Steps:",
            "- Review the transcript excerpt and rerun processing if any critical sections are missing.",
        ]
    )
    return "\n".join(lines)


def completion_request(messages, *, timeout_seconds, retries):
    session = get_http_session()
    last_error = None
    for attempt in range(retries):
        try:
            response = session.post(
                f"{GROQ_API_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {get_groq_api_key()}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": SUMMARY_MODEL,
                    "messages": messages,
                },
                timeout=(30, timeout_seconds),
            )
        except requests.Timeout:
            last_error = ApiError(
                "Summary generation timed out.",
                status_code=504,
                error="upstream_timeout",
            )
        except requests.RequestException as exc:
            last_error = ApiError(
                f"Could not reach the summary provider: {exc}",
                status_code=502,
                error="upstream_unreachable",
            )
        except Exception as exc:
            last_error = ApiError(
                f"Summary generation failed unexpectedly: {exc}",
                status_code=500,
                error="summary_failed",
            )
        else:
            if response.ok:
                try:
                    data = response.json()
                    content = (((data.get("choices") or [{}])[0]).get("message") or {}).get("content", "")
                    content = content.strip()
                except ValueError as exc:
                    last_error = ApiError(
                        f"The AI provider returned invalid JSON: {exc}",
                        status_code=502,
                        error="upstream_error",
                    )
                else:
                    if content:
                        return content
                    last_error = ApiError(
                        "The AI provider returned an empty summary.",
                        status_code=502,
                        error="empty_summary",
                    )
            else:
                try:
                    parse_provider_error(response, "Failed to summarize text.")
                except ApiError as exc:
                    last_error = exc

        if last_error and not is_retriable(last_error):
            break
        if attempt < retries - 1:
            sleep_backoff(attempt)

    raise last_error or ApiError("Summary generation failed.", status_code=502, error="summary_failed")


def summarize_direct(transcript_text):
    return completion_request(
        [
            {"role": "system", "content": REPORT_PROMPT},
            {"role": "user", "content": f"TRANSCRIPT:\n{transcript_text}"},
        ],
        timeout_seconds=SUMMARY_TIMEOUT_SECONDS,
        retries=SUMMARY_RETRIES,
    )


def summarize_chunk_transcript(chunk_transcript):
    transcript_text = chunk_transcript["transcript"]
    try:
        summary = completion_request(
            [
                {"role": "system", "content": CHUNK_SUMMARY_PROMPT},
                {
                    "role": "user",
                    "content": f"Chunk label: {chunk_transcript['label']}\n\nTRANSCRIPT:\n{transcript_text}",
                },
            ],
            timeout_seconds=min(SUMMARY_TIMEOUT_SECONDS, 120),
            retries=SUMMARY_RETRIES,
        )
    except ApiError:
        summary = heuristic_chunk_summary(transcript_text, chunk_transcript["label"])

    return {
        "index": chunk_transcript["index"],
        "label": chunk_transcript["label"],
        "summary": summary,
    }


def summarize_hierarchical(filename, transcript_text, chunk_transcripts, warnings):
    successful_chunks = [chunk for chunk in chunk_transcripts if chunk["success"] and chunk["transcript"]]
    if not successful_chunks:
        return heuristic_final_summary(filename, "", [], warnings, 0, len(chunk_transcripts))

    chunk_summaries = []
    with ThreadPoolExecutor(max_workers=min(3, len(successful_chunks))) as executor:
        future_map = {executor.submit(summarize_chunk_transcript, chunk): chunk for chunk in successful_chunks}
        for future in as_completed(future_map):
            chunk = future_map[future]
            try:
                chunk_summaries.append(future.result())
            except Exception:
                chunk_summaries.append(
                    {
                        "index": chunk["index"],
                        "label": chunk["label"],
                        "summary": heuristic_chunk_summary(chunk["transcript"], chunk["label"]),
                    }
                )

    chunk_summaries.sort(key=lambda item: item["index"])
    combined = "\n\n".join(
        [f"Chunk {item['index'] + 1} ({item['label']})\n{item['summary']}" for item in chunk_summaries]
    )

    try:
        final_summary = completion_request(
            [
                {"role": "system", "content": FINAL_FROM_CHUNKS_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Filename: {filename}\n"
                        f"Warnings: {'; '.join(warnings) if warnings else 'None'}\n\n"
                        f"CHUNK SUMMARIES:\n{combined}"
                    ),
                },
            ],
            timeout_seconds=SUMMARY_TIMEOUT_SECONDS,
            retries=SUMMARY_RETRIES,
        )
    except ApiError:
        final_summary = heuristic_final_summary(
            filename,
            transcript_text,
            [item["summary"] for item in chunk_summaries],
            warnings,
            len(successful_chunks),
            len(chunk_transcripts),
        )

    return final_summary


def transcribe_chunks(job_id, chunks):
    ordered = [None] * len(chunks)
    warnings = []
    completed = 0

    with ThreadPoolExecutor(max_workers=min(TRANSCRIPTION_WORKERS, len(chunks))) as executor:
        future_map = {executor.submit(transcribe_chunk, chunk): chunk for chunk in chunks}
        for future in as_completed(future_map):
            chunk = future_map[future]
            try:
                result = future.result()
            except Exception as exc:
                result = {
                    "index": chunk["index"],
                    "label": chunk["label"],
                    "success": False,
                    "transcript": "",
                    "warning": f"Chunk {chunk['index'] + 1} failed unexpectedly: {exc}",
                }
            ordered[result["index"]] = result
            completed += 1
            if not result["success"]:
                warnings.append(result["warning"])
            progress = 20 + int((completed / max(len(chunks), 1)) * 50)
            update_job(
                job_id,
                stage="transcribing",
                progress=progress,
                message=f"Transcribed {completed} of {len(chunks)} audio chunks.",
                warnings=warnings,
            )

    return ordered, warnings


def combine_transcripts(chunk_results):
    merged = []
    successful = 0
    failed = 0
    for item in chunk_results:
        if item["success"]:
            successful += 1
            merged.append(f"[Chunk {item['index'] + 1} | {item['label']}]\n{item['transcript']}")
        else:
            failed += 1
            merged.append(f"[Chunk {item['index'] + 1} | {item['label']}] Transcription unavailable.")
    return "\n\n".join(merged).strip(), successful, failed


def finalize_job(job_id, *, status, stage, message, warnings=None, summary_text=None, transcript_text=None):
    warnings = warnings or []
    if transcript_text is not None:
        write_artifact(transcript_file(job_id), transcript_text)
    if summary_text is not None:
        write_artifact(summary_file(job_id), summary_text)
    update_job(
        job_id,
        status=status,
        stage=stage,
        progress=100,
        message=message,
        warnings=warnings,
    )


def cleanup_artifacts(job):
    source_path = Path(job["file_path"])
    if not KEEP_SOURCE_UPLOADS:
        source_path.unlink(missing_ok=True)
    normalized_path = normalized_file(job["job_id"])
    normalized_path.unlink(missing_ok=True)
    if not KEEP_CHUNK_ARTIFACTS:
        shutil.rmtree(chunk_dir(job["job_id"]), ignore_errors=True)


def process_job(job_id):
    job = get_job(job_id)
    if not job:
        return

    warnings = []
    transcript_text = ""
    try:
        update_job(
            job_id,
            status="processing",
            stage="normalizing",
            progress=10,
            message="Converting uploaded media into a normalized MP3 stream for stable background processing.",
        )
        normalized_path = normalize_audio_to_mp3(job_id, Path(job["file_path"]))
        update_job(
            job_id,
            stage="chunking",
            progress=16,
            message="Splitting normalized audio into transcription chunks.",
        )
        chunks = split_media_into_chunks(job_id, normalized_path)
        update_job(
            job_id,
            chunk_count=len(chunks),
            stage="chunking",
            progress=20,
            message=f"Prepared {len(chunks)} audio chunks. Starting transcription in the background.",
        )

        chunk_results, transcription_warnings = transcribe_chunks(job_id, chunks)
        warnings.extend(transcription_warnings)
        transcript_text, successful_chunks, failed_chunks = combine_transcripts(chunk_results)
        update_job(
            job_id,
            successful_chunks=successful_chunks,
            failed_chunks=failed_chunks,
            stage="summarizing",
            progress=78,
            message="Building final summary from chunk transcripts.",
        )
        write_artifact(transcript_file(job_id), transcript_text)

        if transcript_text and len(transcript_text) <= SUMMARY_DIRECT_CHAR_LIMIT and failed_chunks == 0:
            try:
                summary_text = summarize_direct(transcript_text)
            except ApiError:
                summary_text = summarize_hierarchical(job["filename"], transcript_text, chunk_results, warnings)
        else:
            summary_text = summarize_hierarchical(job["filename"], transcript_text, chunk_results, warnings)

        status = "completed_with_warnings" if warnings or failed_chunks > 0 else "completed"
        finalize_job(
            job_id,
            status=status,
            stage="completed",
            message="Summary is ready.",
            warnings=warnings,
            summary_text=summary_text,
            transcript_text=transcript_text,
        )
    except Exception as exc:
        logging.exception("Background processing failed for job %s", job_id)
        warning_message = f"Background processing error: {exc}"
        warnings.append(warning_message)
        fallback_summary = heuristic_final_summary(
            job["filename"],
            transcript_text,
            [],
            warnings,
            job.get("successful_chunks", 0),
            job.get("chunk_count", 0),
        )
        status = "completed_with_warnings" if transcript_text or fallback_summary else "failed"
        finalize_job(
            job_id,
            status=status,
            stage="completed" if status != "failed" else "failed",
            message="Processing finished with fallback output." if status != "failed" else "Processing failed.",
            warnings=warnings,
            summary_text=fallback_summary if status != "failed" else None,
            transcript_text=transcript_text or None,
        )
    finally:
        cleanup_artifacts(job)


def worker_loop():
    while True:
        job_id = JOB_QUEUE.get()
        if job_id is None:
            JOB_QUEUE.task_done()
            return
        try:
            process_job(job_id)
        finally:
            JOB_QUEUE.task_done()


def start_workers():
    workers = []
    for index in range(JOB_QUEUE_WORKERS):
        worker = threading.Thread(target=worker_loop, name=f"meeting-worker-{index + 1}", daemon=True)
        worker.start()
        workers.append(worker)
    return workers


def enqueue_job(job_id):
    JOB_QUEUE.put(job_id)


def start_job(job_id):
    job = get_job(job_id)
    if not job:
        raise ApiError(
            "Job not found.",
            status_code=404,
            error="job_not_found",
        )

    if job["status"] == "uploaded":
        update_job(
            job_id,
            status="queued",
            stage="queued",
            progress=max(job.get("progress", 0), 6),
            message="Processing started. Your media is queued for normalization, chunking, transcription, and summary generation.",
        )
        enqueue_job(job_id)
        return get_job(job_id)

    return job


load_jobs_from_disk()
WORKERS = start_workers()


def create_app():
    app = Flask(__name__)
    app.request_class = LargeUploadRequest
    app.config.update(
        MAX_CONTENT_LENGTH=MAX_UPLOAD_MB * MB,
        MAX_FORM_MEMORY_SIZE=MAX_FORM_MEMORY_MB * MB,
        MAX_FORM_PARTS=MAX_FORM_PARTS,
        JSON_SORT_KEYS=False,
        PROPAGATE_EXCEPTIONS=False,
    )

    CORS(app, resources={r"/api/*": {"origins": parse_origins()}})
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

    @app.get("/api/health")
    def health():
        return jsonify(
            {
                "status": "ok",
                "max_upload_mb": MAX_UPLOAD_MB,
                "chunk_duration_seconds": CHUNK_DURATION_SECONDS,
                "queue_workers": JOB_QUEUE_WORKERS,
                "transcription_workers": TRANSCRIPTION_WORKERS,
                "queue_size": JOB_QUEUE.qsize(),
                "storage_dir": str(STORAGE_DIR),
                "ffmpeg_available": shutil.which("ffmpeg") is not None,
                "mail_configured": get_mail_config_error() is None,
                "mail_from": MAIL_FROM or None,
            }
        )

    @app.post("/api/send-export-email")
    def send_export_email():
        payload = request.get_json(silent=True) or {}
        to_email = normalize_whitespace(payload.get("to_email"))
        report_title = normalize_whitespace(payload.get("report_title")) or "Meeting export"
        export_format = normalize_whitespace(payload.get("export_format")) or "pdf"
        file_name = normalize_whitespace(payload.get("file_name"))
        mime_type = normalize_whitespace(payload.get("mime_type")) or "application/octet-stream"
        file_content_base64 = payload.get("file_content_base64") or ""

        if not to_email:
            raise ApiError(
                "to_email is required to send the export.",
                status_code=400,
                error="missing_email",
            )
        if not is_valid_email_address(to_email):
            raise ApiError(
                "Provide a valid recipient email address.",
                status_code=400,
                error="invalid_email",
            )
        if not file_name:
            raise ApiError(
                "file_name is required to send the export.",
                status_code=400,
                error="missing_file_name",
            )

        attachment_bytes = decode_export_attachment(file_content_base64)
        message = build_export_email_message(
            to_email,
            report_title,
            export_format,
            file_name,
            attachment_bytes,
            mime_type,
        )
        send_smtp_message(message)

        return jsonify(
            {
                "success": True,
                "message": f"Export emailed to {to_email}.",
            }
        )

    @app.post("/api/upload")
    def upload():
        if "multipart/form-data" not in (request.content_type or "").lower():
            raise ApiError(
                "Content-Type must be multipart/form-data.",
                status_code=400,
                error="invalid_content_type",
            )

        file_storage = request.files.get("file")
        if file_storage is None:
            raise ApiError(
                "No file was uploaded. Use multipart/form-data and include the file in the 'file' field.",
                status_code=400,
                error="missing_file",
            )

        job_id = uuid.uuid4().hex
        file_path, original_name, content_type, size_bytes = persist_upload(file_storage, job_id)
        job = create_job_record(job_id, original_name, content_type, file_path, size_bytes)
        register_job(job)

        response = public_job_payload(job)
        response["message"] = "Upload complete. Call /api/process to begin background processing."
        return jsonify(response), 202

    @app.post("/api/process")
    def process_job_endpoint():
        payload = request.get_json(silent=True) or {}
        job_id = payload.get("job_id")
        if not job_id:
            raise ApiError(
                "job_id is required to start background processing.",
                status_code=400,
                error="missing_job_id",
            )
        job = start_job(job_id)
        response = public_job_payload(job)
        response["message"] = job["message"]
        return jsonify(response), 202

    @app.post("/api/summarize")
    def summarize_endpoint():
        payload = request.get_json(silent=True) or {}
        job_id = payload.get("job_id")
        if not job_id:
            raise ApiError(
                "job_id is required to start background processing.",
                status_code=400,
                error="missing_job_id",
            )
        job = start_job(job_id)
        response = public_job_payload(job)
        response["message"] = job["message"]
        return jsonify(response), 202

    @app.get("/api/jobs/<job_id>")
    @app.get("/api/status/<job_id>")
    def job_status(job_id):
        job = get_job(job_id)
        if not job:
            raise ApiError(
                "Job not found.",
                status_code=404,
                error="job_not_found",
            )
        return jsonify(public_job_payload(job))

    @app.errorhandler(ApiError)
    def handle_api_error(error):
        body = {"error": error.error, "message": error.message}
        body.update(error.payload)
        return jsonify(body), error.status_code

    @app.errorhandler(RequestEntityTooLarge)
    def handle_request_entity_too_large(_error):
        return (
            jsonify(
                {
                    "error": "request_too_large",
                    "message": f"Upload exceeds the configured {MAX_UPLOAD_MB} MB limit.",
                    "max_upload_mb": MAX_UPLOAD_MB,
                    "next_step": "Use chunked upload or direct-to-storage uploads for files larger than this limit.",
                }
            ),
            413,
        )

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        return jsonify({"error": error.name.lower().replace(" ", "_"), "message": error.description}), error.code

    @app.errorhandler(Exception)
    def handle_unexpected_exception(error):
        app.logger.exception("Unexpected upload service failure: %s", error)
        return jsonify({"error": "internal_server_error", "message": "The upload service failed unexpectedly."}), 500

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5001")))
