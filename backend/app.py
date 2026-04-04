import logging
import mimetypes
import os
from pathlib import Path
from uuid import uuid4

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
BYTE_MULTIPLIER = 1024 * 1024
TEXT_UPLOAD_EXTENSIONS = {".txt", ".md", ".csv", ".json"}

load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BASE_DIR / ".env", override=True)

GROQ_API_BASE_URL = os.getenv("GROQ_API_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
TRANSCRIPTION_MODEL = os.getenv("TRANSCRIPTION_MODEL", "whisper-large-v3")
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "llama-3.1-8b-instant")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
AI_REQUEST_TIMEOUT_SECONDS = int(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "300"))
SUMMARY_MAX_CHARS = int(os.getenv("SUMMARY_MAX_CHARS", "30000"))


class AIServiceError(RuntimeError):
    pass


def resolve_upload_folder():
    configured_path = (
        os.getenv("UPLOAD_FOLDER")
        or os.getenv("UPLOAD_TMP_DIR")
        or "uploads"
    ).strip() or "uploads"
    upload_path = Path(configured_path)
    if not upload_path.is_absolute():
        upload_path = BASE_DIR / upload_path
    upload_path.mkdir(parents=True, exist_ok=True)
    return upload_path


def sanitize_filename(filename):
    safe_name = secure_filename(filename or "")
    return safe_name or f"upload-{uuid4().hex}"


def extract_error_message(response):
    try:
        payload = response.json()
    except ValueError:
        return response.text.strip() or f"Upstream AI request failed with status {response.status_code}."

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            return error.get("message") or str(error)
        if error:
            return str(error)
        if payload.get("message"):
            return str(payload["message"])

    return f"Upstream AI request failed with status {response.status_code}."


def read_text_upload(file_path):
    try:
        return file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return file_path.read_text(encoding="utf-8", errors="ignore")


def build_summary_prompt(filename, transcript_text):
    prepared_transcript = " ".join(transcript_text.split())
    if len(prepared_transcript) > SUMMARY_MAX_CHARS:
        prepared_transcript = (
            prepared_transcript[:SUMMARY_MAX_CHARS]
            + "\n\n[Transcript truncated to fit summarization limits.]"
        )

    return f"""
You are an expert meeting assistant.

Create a concise, professional summary for the uploaded recording: {filename}

Return plain text using these sections:
Executive Summary
Key Points
Action Items
Decisions
Next Steps

Do not invent facts. If details are missing, say so briefly.

Transcript:
{prepared_transcript}
""".strip()


def transcribe_media_with_groq(file_path, original_filename):
    api_key = (os.getenv("GROQ_API_KEY") or "").strip()
    if not api_key:
        raise AIServiceError(
            "GROQ_API_KEY is not configured. Add it in Render to transcribe uploaded audio or video files."
        )

    mime_type = mimetypes.guess_type(original_filename)[0] or "application/octet-stream"

    with file_path.open("rb") as media_file:
        response = requests.post(
            f"{GROQ_API_BASE_URL}/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            data={
                "model": TRANSCRIPTION_MODEL,
                "temperature": "0",
                "response_format": "json",
            },
            files={"file": (original_filename, media_file, mime_type)},
            timeout=(30, AI_REQUEST_TIMEOUT_SECONDS),
        )

    if not response.ok:
        raise AIServiceError(extract_error_message(response))

    payload = response.json()
    transcript_text = (payload.get("text") or "").strip()
    if not transcript_text:
        raise AIServiceError("Transcription succeeded, but no transcript text was returned.")

    return transcript_text


def summarize_with_groq(transcript_text, filename):
    api_key = (os.getenv("GROQ_API_KEY") or "").strip()
    if not api_key:
        raise AIServiceError("GROQ_API_KEY is not configured for summary generation.")

    response = requests.post(
        f"{GROQ_API_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": SUMMARY_MODEL,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": "You produce clean, business-ready meeting summaries.",
                },
                {
                    "role": "user",
                    "content": build_summary_prompt(filename, transcript_text),
                },
            ],
        },
        timeout=(30, AI_REQUEST_TIMEOUT_SECONDS),
    )

    if not response.ok:
        raise AIServiceError(extract_error_message(response))

    payload = response.json()
    choices = payload.get("choices") or []
    if not choices:
        raise AIServiceError("Groq summary response did not contain any choices.")

    message = choices[0].get("message") or {}
    content = (message.get("content") or "").strip()
    if not content:
        raise AIServiceError("Groq summary response was empty.")

    return content


def summarize_with_gemini(transcript_text, filename):
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise AIServiceError("GEMINI_API_KEY is not configured for summary generation.")

    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}",
        headers={"Content-Type": "application/json"},
        json={
            "contents": [
                {
                    "parts": [
                        {
                            "text": build_summary_prompt(filename, transcript_text),
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
            },
        },
        timeout=(30, AI_REQUEST_TIMEOUT_SECONDS),
    )

    if not response.ok:
        raise AIServiceError(extract_error_message(response))

    payload = response.json()
    candidates = payload.get("candidates") or []
    if not candidates:
        raise AIServiceError("Gemini summary response did not contain any candidates.")

    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    summary_text = "\n".join(
        part.get("text", "").strip()
        for part in parts
        if isinstance(part, dict) and part.get("text")
    ).strip()

    if not summary_text:
        raise AIServiceError("Gemini summary response was empty.")

    return summary_text


def generate_summary_from_upload(file_path, original_filename):
    if file_path.suffix.lower() in TEXT_UPLOAD_EXTENSIONS:
        transcript_text = read_text_upload(file_path).strip()
    else:
        transcript_text = transcribe_media_with_groq(file_path, original_filename)

    if not transcript_text:
        raise AIServiceError("The uploaded file did not produce any transcript text.")

    if (os.getenv("GEMINI_API_KEY") or "").strip():
        summary_text = summarize_with_gemini(transcript_text, original_filename)
    else:
        summary_text = summarize_with_groq(transcript_text, original_filename)

    return transcript_text, summary_text


def create_app():
    app = Flask(__name__)
    app.url_map.strict_slashes = False
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

    max_upload_mb = int(os.getenv("MAX_UPLOAD_MB", os.getenv("MAX_CONTENT_LENGTH_MB", "250")))
    upload_folder = resolve_upload_folder()

    app.config["JSON_SORT_KEYS"] = False
    app.config["UPLOAD_FOLDER"] = str(upload_folder)
    app.config["MAX_CONTENT_LENGTH"] = max_upload_mb * BYTE_MULTIPLIER

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    app.logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

    CORS(app, supports_credentials=True)

    @app.after_request
    def after_request(response):
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Headers", "*")
        response.headers.add("Access-Control-Allow-Methods", "*")
        return response

    @app.route("/", methods=["GET"])
    @app.route("/health", methods=["GET"])
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "Backend running"}), 200

    @app.route("/upload", methods=["POST", "OPTIONS"])
    @app.route("/api/upload", methods=["POST", "OPTIONS"])
    def upload_file():
        if request.method == "OPTIONS":
            return jsonify({"ok": True}), 200

        uploaded_file = request.files.get("file")
        if uploaded_file is None:
            return jsonify({"success": False, "error": "No file"}), 400

        original_filename = (uploaded_file.filename or "").strip()
        if not original_filename:
            return jsonify({"success": False, "error": "No file selected."}), 400

        stored_filename = f"{uuid4().hex}_{sanitize_filename(original_filename)}"
        save_path = Path(app.config["UPLOAD_FOLDER"]) / stored_filename
        save_path.parent.mkdir(parents=True, exist_ok=True)
        uploaded_file.save(save_path)

        try:
            transcript_text, summary_text = generate_summary_from_upload(save_path, original_filename)
        except AIServiceError as error:
            app.logger.warning("Upload AI processing failed for %s: %s", original_filename, error)
            return jsonify(
                {
                    "success": False,
                    "error": str(error),
                    "filename": stored_filename,
                    "original_filename": original_filename,
                }
            ), 502

        return jsonify(
            {
                "success": True,
                "message": "File uploaded and summarized successfully.",
                "filename": stored_filename,
                "original_filename": original_filename,
                "size_bytes": save_path.stat().st_size,
                "transcript": transcript_text,
                "summary": summary_text,
            }
        ), 200

    @app.route("/chat", methods=["POST", "OPTIONS"])
    @app.route("/api/chat", methods=["POST", "OPTIONS"])
    def chat():
        if request.method == "OPTIONS":
            return jsonify({"ok": True}), 200

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            payload = {}

        user_message = payload.get("message")
        if user_message is None:
            user_message = request.form.get("message", "")

        user_message = str(user_message or "").strip()
        reply_text = "This is a test AI response from the Flask backend."
        if user_message:
            reply_text = f"Test AI response: I received your message: {user_message}"

        return jsonify(
            {
                "success": True,
                "response": reply_text,
                "message": user_message,
                "model": "dummy-ai",
            }
        ), 200

    @app.errorhandler(RequestEntityTooLarge)
    def handle_large_file(_error):
        return jsonify(
            {
                "success": False,
                "error": f"File too large. Maximum upload size is {max_upload_mb} MB.",
            }
        ), 413

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        return jsonify(
            {
                "success": False,
                "error": error.description or "Request failed.",
            }
        ), error.code or 500

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        app.logger.exception("Unhandled server error: %s", error)
        return jsonify(
            {
                "success": False,
                "error": "Internal server error.",
            }
        ), 500

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=False)
