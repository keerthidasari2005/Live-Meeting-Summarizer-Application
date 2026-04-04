import logging
import mimetypes
import os
import tempfile
import wave
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

# DEBUG: Verify environment variables are loaded
print("=" * 60)
print("GROQ KEY LOADED:", os.getenv("GROQ_API_KEY"))
print("VITE_GROQ_API_KEY:", os.getenv("VITE_GROQ_API_KEY"))
print("=" * 60)

GROQ_API_BASE_URL = os.getenv("GROQ_API_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
TRANSCRIPTION_MODEL = os.getenv("TRANSCRIPTION_MODEL", "whisper-large-v3")
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", "llama-3.1-8b-instant")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "text-bison-001")
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


def split_wav_file_to_chunks(file_path, max_chunk_bytes=16 * BYTE_MULTIPLIER):
    chunk_files = []
    chunk_dir = None
    try:
        with wave.open(str(file_path), "rb") as source_wave:
            n_channels = source_wave.getnchannels()
            sampwidth = source_wave.getsampwidth()
            framerate = source_wave.getframerate()
            total_frames = source_wave.getnframes()
            bytes_per_frame = n_channels * sampwidth

            if bytes_per_frame == 0:
                return []

            if chunk_dir is None:
                chunk_dir = Path(tempfile.mkdtemp(dir=file_path.parent))

            max_frames = max_chunk_bytes // bytes_per_frame
            if max_frames < 1:
                max_frames = 1

            remaining_frames = total_frames
            chunk_index = 0

            while remaining_frames > 0:
                frames_to_write = min(remaining_frames, max_frames)
                frames = source_wave.readframes(frames_to_write)

                chunk_file = chunk_dir / f"{file_path.stem}_chunk_{chunk_index}.wav"
                with wave.open(str(chunk_file), "wb") as out_wave:
                    out_wave.setnchannels(n_channels)
                    out_wave.setsampwidth(sampwidth)
                    out_wave.setframerate(framerate)
                    out_wave.writeframes(frames)

                chunk_files.append(chunk_file)
                remaining_frames -= frames_to_write
                chunk_index += 1

    except (wave.Error, EOFError):
        return []

    return chunk_files


def build_summary_prompt(filename, transcript_text):
    prepared_transcript = " ".join(transcript_text.split())
    if len(prepared_transcript) > SUMMARY_MAX_CHARS:
        prepared_transcript = (
            prepared_transcript[:SUMMARY_MAX_CHARS]
            + "\n\n[Transcript truncated to fit summarization limits.]"
        )

    return f"""
You are an expert meeting assistant.

Create a clean, professional meeting summary for the uploaded recording: {filename}

Return plain text only, using these exact headings in this order:
Executive Summary:
Key Points:
Action Items:
Decisions:
Next Steps:

- Use short paragraphs for the Executive Summary.
- Use bullet items for Key Points, Action Items, Decisions, and Next Steps.
- If a section has no content, write "None identified." under that heading.
- Do not include JSON, XML, or markdown fences.
- Do not invent any details.

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

    if file_path.suffix.lower() == ".wav" and file_path.stat().st_size > 20 * BYTE_MULTIPLIER:
        chunk_paths = split_wav_file_to_chunks(file_path, max_chunk_bytes=16 * BYTE_MULTIPLIER)
        if chunk_paths:
            transcripts = []
            try:
                for index, chunk_path in enumerate(chunk_paths):
                    with chunk_path.open("rb") as media_file:
                        response = requests.post(
                            f"{GROQ_API_BASE_URL}/audio/transcriptions",
                            headers={"Authorization": f"Bearer {api_key}"},
                            data={
                                "model": TRANSCRIPTION_MODEL,
                                "temperature": "0",
                                "response_format": "json",
                            },
                            files={"file": (f"{original_filename}.part{index}.wav", media_file, mime_type)},
                            timeout=(30, AI_REQUEST_TIMEOUT_SECONDS),
                        )

                    if not response.ok:
                        raise AIServiceError(extract_error_message(response))

                    payload = response.json()
                    chunk_text = (payload.get("text") or "").strip()
                    if not chunk_text:
                        raise AIServiceError(
                            "Transcription succeeded, but one of the WAV chunks returned no transcript text."
                        )
                    transcripts.append(chunk_text)

                return "\n".join(transcripts).strip()
            finally:
                parent_dir = chunk_paths[0].parent if chunk_paths else None
                for chunk_path in chunk_paths:
                    try:
                        if chunk_path.exists():
                            chunk_path.unlink()
                    except Exception:
                        pass
                if parent_dir and parent_dir.exists():
                    try:
                        parent_dir.rmdir()
                    except Exception:
                        pass

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
        f"https://generativelanguage.googleapis.com/v1beta2/models/{GEMINI_MODEL}:generateText?key={api_key}",
        headers={"Content-Type": "application/json"},
        json={
            "prompt": {
                "text": build_summary_prompt(filename, transcript_text),
            },
            "temperature": 0.2,
            "maxOutputTokens": 1000,
        },
        timeout=(30, AI_REQUEST_TIMEOUT_SECONDS),
    )

    if not response.ok:
        raise AIServiceError(extract_error_message(response))

    payload = response.json()
    candidates = payload.get("candidates") or []
    if not candidates:
        raise AIServiceError("Gemini summary response did not contain any candidates.")

    summary_text = (candidates[0].get("content") or {}).get("text", "").strip()
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

    gemini_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if gemini_key:
        try:
            return transcript_text, summarize_with_gemini(transcript_text, original_filename)
        except AIServiceError as gemini_error:
            logging.getLogger(__name__).warning(
                "Gemini summary failed, falling back to Groq: %s", gemini_error
            )

    return transcript_text, summarize_with_groq(transcript_text, original_filename)


def create_app():
    app = Flask(__name__)
    app.url_map.strict_slashes = False
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

    max_upload_mb = int(os.getenv("MAX_UPLOAD_MB", os.getenv("MAX_CONTENT_LENGTH_MB", "250")))
    upload_folder = resolve_upload_folder()

    app.config["JSON_SORT_KEYS"] = False
    app.config["UPLOAD_FOLDER"] = str(upload_folder)
    app.config["MAX_CONTENT_LENGTH"] = 50 * BYTE_MULTIPLIER  # 50MB limit for individual requests
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

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

    @app.route("/upload_init", methods=["POST"])
    @app.route("/api/upload_init", methods=["POST"])
    def upload_init():
        data = request.get_json(silent=True) or {}
        filename = str(data.get("filename") or "").strip()
        total_chunks = int(data.get("total_chunks") or 0)
        file_size = int(data.get("file_size") or 0)
        mime_type = str(data.get("mime_type") or "").strip()

        if not filename or total_chunks <= 0 or file_size <= 0:
            return jsonify({"success": False, "error": "Invalid upload initialization data."}), 400

        upload_id = str(uuid4())
        upload_dir = Path(app.config["UPLOAD_FOLDER"]) / upload_id
        upload_dir.mkdir(parents=True, exist_ok=True)

        # Store metadata
        metadata = {
            "filename": filename,
            "total_chunks": total_chunks,
            "file_size": file_size,
            "mime_type": mime_type,
            "uploaded_chunks": 0,
            "chunks": {}
        }

        with (upload_dir / "metadata.json").open("w") as f:
            import json
            json.dump(metadata, f)

        return jsonify({
            "success": True,
            "upload_id": upload_id,
            "message": "Upload initialized successfully."
        }), 200

    @app.route("/upload_chunk", methods=["POST"])
    @app.route("/api/upload_chunk", methods=["POST"])
    def upload_chunk():
        upload_id = ""
        chunk_index = -1
        chunk_data = ""
        chunk_file = request.files.get("chunk")

        if chunk_file is not None:
            upload_id = str(request.form.get("upload_id") or "").strip()
            try:
                chunk_index = int(request.form.get("chunk_index") or -1)
            except ValueError:
                chunk_index = -1
        else:
            data = request.get_json(silent=True) or {}
            upload_id = str(data.get("upload_id") or "").strip()
            try:
                chunk_index = int(data.get("chunk_index") or -1)
            except (ValueError, TypeError):
                chunk_index = -1
            chunk_data = str(data.get("chunk_data") or "").strip()

        if not upload_id or chunk_index < 0 or (chunk_file is None and not chunk_data):
            app.logger.warning(
                "Invalid chunk data. content_type=%s form_keys=%s json_keys=%s has_file=%s",
                request.content_type,
                list(request.form.keys()),
                list((request.get_json(silent=True) or {}).keys()),
                chunk_file is not None,
            )
            return jsonify({"success": False, "error": "Invalid chunk data."}), 400

        upload_dir = Path(app.config["UPLOAD_FOLDER"]) / upload_id
        if not upload_dir.exists():
            return jsonify({"success": False, "error": "Upload session not found."}), 404

        metadata_path = upload_dir / "metadata.json"
        if not metadata_path.exists():
            return jsonify({"success": False, "error": "Upload metadata not found."}), 404

        import json
        with metadata_path.open("r") as f:
            metadata = json.load(f)

        chunk_path = upload_dir / f"chunk_{chunk_index}.bin"
        if chunk_file is not None:
            chunk_file.save(chunk_path)
        else:
            import base64
            try:
                chunk_bytes = base64.b64decode(chunk_data)
            except Exception:
                return jsonify({"success": False, "error": "Invalid base64 chunk data."}), 400
            with chunk_path.open("wb") as f:
                f.write(chunk_bytes)

        metadata["chunks"][str(chunk_index)] = True
        metadata["uploaded_chunks"] = len(metadata["chunks"])

        with metadata_path.open("w") as f:
            json.dump(metadata, f)

        return jsonify({
            "success": True,
            "chunk_index": chunk_index,
            "uploaded_chunks": metadata["uploaded_chunks"],
            "total_chunks": metadata["total_chunks"]
        }), 200

    @app.route("/process_upload", methods=["POST"])
    @app.route("/api/process_upload", methods=["POST"])
    def process_upload():
        data = request.get_json(silent=True) or {}
        upload_id = str(data.get("upload_id") or "").strip()

        if not upload_id:
            return jsonify({"success": False, "error": "Missing upload_id."}), 400

        upload_dir = Path(app.config["UPLOAD_FOLDER"]) / upload_id
        if not upload_dir.exists():
            return jsonify({"success": False, "error": "Upload session not found."}), 404

        metadata_path = upload_dir / "metadata.json"
        if not metadata_path.exists():
            return jsonify({"success": False, "error": "Upload metadata not found."}), 404

        import json
        with metadata_path.open("r") as f:
            metadata = json.load(f)

        # Check if all chunks are uploaded
        if metadata["uploaded_chunks"] != metadata["total_chunks"]:
            return jsonify({
                "success": False,
                "error": f"Upload incomplete. {metadata['uploaded_chunks']}/{metadata['total_chunks']} chunks uploaded."
            }), 400

        # Reconstruct file from uploaded chunks
        final_filename = f"{uuid4().hex}_{sanitize_filename(metadata['filename'])}"
        final_path = Path(app.config["UPLOAD_FOLDER"]) / final_filename

        try:
            with final_path.open("wb") as final_file:
                for i in range(metadata["total_chunks"]):
                    b64_chunk_path = upload_dir / f"chunk_{i}.b64"
                    bin_chunk_path = upload_dir / f"chunk_{i}.bin"

                    if bin_chunk_path.exists():
                        with bin_chunk_path.open("rb") as chunk_file:
                            final_file.write(chunk_file.read())
                        continue

                    if b64_chunk_path.exists():
                        with b64_chunk_path.open("r") as chunk_file:
                            chunk_data = chunk_file.read().strip()
                        import base64
                        chunk_bytes = base64.b64decode(chunk_data)
                        final_file.write(chunk_bytes)
                        continue

                    raise ValueError(f"Chunk {i} missing")

            # Clean up upload directory
            import shutil
            shutil.rmtree(upload_dir)

            # Process the file
            transcript_text, summary_text = generate_summary_from_upload(final_path, metadata["filename"])

            return jsonify({
                "success": True,
                "message": "File uploaded and processed successfully.",
                "filename": final_filename,
                "original_filename": metadata["filename"],
                "size_bytes": final_path.stat().st_size,
                "transcript": transcript_text,
                "summary": summary_text,
            }), 200

        except Exception as e:
            app.logger.error("File reconstruction failed: %s", e)
            # Clean up on failure
            if final_path.exists():
                final_path.unlink()
            return jsonify({"success": False, "error": f"File processing failed: {str(e)}"}), 500

    @app.route("/chat", methods=["POST", "OPTIONS"])
    @app.route("/api/chat", methods=["POST", "OPTIONS"])
    def chat():
        if request.method == "OPTIONS":
            return jsonify({"ok": True}), 200

        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            payload = {}

        user_message = str(payload.get("message") or "").strip()
        context = str(payload.get("context") or "").strip()
        history = payload.get("history") or []

        if not user_message:
            return jsonify({"success": False, "error": "No message provided."}), 400

        # Build conversation context
        messages = []

        # Add system message with context
        if context:
            messages.append({
                "role": "system",
                "content": context
            })

        # Add conversation history
        for msg in history[-6:]:  # Keep last 6 messages for context
            if isinstance(msg, dict) and "role" in msg and "content" in msg:
                messages.append({
                    "role": msg["role"],
                    "content": str(msg["content"])
                })

        # Add current user message
        messages.append({
            "role": "user",
            "content": user_message
        })

        # Use Groq for chat
        api_key = (os.getenv("GROQ_API_KEY") or "").strip()
        if not api_key:
            return jsonify({
                "success": False,
                "error": "Chat service not configured.",
                "response": "I'm sorry, the chat service is currently unavailable."
            }), 503

        try:
            response = requests.post(
                f"{GROQ_API_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 1000,
                },
                timeout=(30, 60),
            )

            if not response.ok:
                app.logger.warning("Chat API error: %s", response.text)
                return jsonify({
                    "success": False,
                    "error": "Chat service temporarily unavailable.",
                    "response": "I'm having trouble connecting right now. Please try again in a moment."
                }), 502

            payload = response.json()
            choices = payload.get("choices") or []
            if not choices:
                return jsonify({
                    "success": False,
                    "error": "No response generated.",
                    "response": "I couldn't generate a response. Please try again."
                }), 502

            ai_response = choices[0].get("message", {}).get("content", "").strip()
            if not ai_response:
                return jsonify({
                    "success": False,
                    "error": "Empty response generated.",
                    "response": "I couldn't generate a response. Please try again."
                }), 502

            return jsonify({
                "success": True,
                "response": ai_response,
                "message": user_message,
                "model": "llama-3.1-8b-instant",
            }), 200

        except requests.RequestException as e:
            app.logger.error("Chat request failed: %s", e)
            return jsonify({
                "success": False,
                "error": "Chat service error.",
                "response": "I'm having trouble connecting right now. Please try again in a moment."
            }), 502

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
