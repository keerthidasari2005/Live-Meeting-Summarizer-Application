import logging
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
BYTE_MULTIPLIER = 1024 * 1024

load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BASE_DIR / ".env", override=True)


def resolve_upload_folder():
    configured_path = os.getenv("UPLOAD_FOLDER", "uploads").strip() or "uploads"
    upload_path = Path(configured_path)
    if not upload_path.is_absolute():
        upload_path = BASE_DIR / upload_path
    upload_path.mkdir(parents=True, exist_ok=True)
    return upload_path


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

        if not request.files:
            return jsonify(
                {
                    "success": False,
                    "error": "No file part in the request.",
                }
            ), 400

        uploaded_file = request.files.get("file")
        if uploaded_file is None:
            uploaded_file = next(iter(request.files.values()), None)

        if uploaded_file is None:
            return jsonify(
                {
                    "success": False,
                    "error": "No file part in the request.",
                }
            ), 400

        original_filename = (uploaded_file.filename or "").strip()
        if not original_filename:
            return jsonify(
                {
                    "success": False,
                    "error": "No file selected.",
                }
            ), 400

        safe_name = secure_filename(original_filename)
        if not safe_name:
            safe_name = f"upload-{uuid4().hex}"

        stored_filename = f"{uuid4().hex}_{safe_name}"
        save_path = Path(app.config["UPLOAD_FOLDER"]) / stored_filename
        save_path.parent.mkdir(parents=True, exist_ok=True)
        uploaded_file.save(save_path)

        return jsonify(
            {
                "success": True,
                "message": "File uploaded successfully.",
                "filename": stored_filename,
                "original_filename": original_filename,
                "size_bytes": save_path.stat().st_size,
            }
        ), 201

    @app.route("/chat", methods=["POST"])
    @app.route("/api/chat", methods=["POST"])
    def chat():
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
