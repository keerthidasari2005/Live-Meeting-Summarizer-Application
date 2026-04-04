# MeetingMate AI

MeetingMate AI is a full-stack meeting assistant for recording conversations, uploading long media files, generating structured summaries, saving notes, and exporting reports.

Inside the UI, the product is mostly branded as `MeetingMind`. In the codebase and some backend/email strings, it is still called `MeetingMate AI`. They refer to the same project.

## What This Project Does

This codebase supports two main ways to create meeting summaries:

1. `Live meeting mode`
   - Starts from the browser.
   - Uses the browser's Speech Recognition API for live transcription.
   - Generates the final summary on the frontend from the captured transcript.
   - Saves meetings, workspaces, notes, and sessions in browser storage.

2. `Upload mode`
   - Sends large audio or video files to the Flask backend.
   - Normalizes media with `ffmpeg`.
   - Splits long files into chunks.
   - Transcribes chunks through Groq.
   - Builds a final summary in the background.
   - Lets the frontend poll job status until the summary is ready.

On top of that, the app also includes:

- OTP-based signup and password reset using EmailJS
- A dashboard with workspace switching, reports, analytics, notes, and calendar views
- PDF and DOCX export
- Email delivery for exported reports through SMTP or Resend
- A floating AI chat assistant that uses Groq directly from the frontend

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion
- Backend: Flask, Python, requests
- AI services: Groq for transcription and summarization
- Media processing: `ffmpeg`
- Email:
  - EmailJS for OTP emails
  - SMTP or Resend for sending exported report emails
- Storage:
  - Browser `localStorage` and `sessionStorage` for frontend data
  - `backend/storage` for uploaded files, chunks, jobs, transcripts, and summaries

## Main Features

- Live recording with browser speech-to-text
- AI-style summary generation for live meetings
- Large audio/video upload with background processing
- Workspaces for separating different teams or clients
- Dashboard analytics and report views
- Private meeting notes linked to sessions
- Calendar view of saved meetings
- PDF and DOCX exports
- Emailing exported summaries as attachments
- OTP sign up, login, forgot password, and reset password
- Floating "Ask AI" assistant for recent meeting context

## How The App Is Structured

### Frontend flow

- `src/pages/Login.tsx`
  - Handles sign up, OTP verification, login, forgot password, and reset password.
- `src/pages/Dashboard.tsx`
  - Hosts the main workspace UI.
- `src/hooks/useMeetingStore.tsx`
  - Central app state for meetings, workspaces, notifications, and summary generation for live meetings.
- `src/hooks/useRecording.ts`
  - Wraps browser speech recognition for live capture.
- `src/components/FileUpload.tsx`
  - Uploads media to Flask, starts processing, polls status, and saves the result back into the frontend meeting store.

### Backend flow

- `backend/app.py`
  - Accepts uploads
  - Stores job metadata on disk
  - Runs background workers
  - Normalizes media to MP3
  - Splits large files into chunks
  - Calls Groq for transcription and summarization
  - Returns progress and final output
  - Sends exported reports through SMTP or Resend

### Legacy / partial pieces

- `server.js`
  - Legacy Express SMTP OTP server on port `5000`
  - Present in the repo, but the current login flow uses EmailJS directly instead
- `/api/send-notification-email`
  - The frontend has a helper for this, but `backend/app.py` does not currently expose the route

## Project Layout

```text
project-root/
|- backend/                 Flask upload and export-email backend
|- public/                  Static frontend assets
|- scripts/                 Local dev helpers
|- src/
|  |- components/           Dashboard, auth, upload, notes, reports, exports
|  |- hooks/                Meeting store and recording logic
|  |- lib/                  Auth, OTP, report export, email helpers
|  |- pages/                Login, dashboard, not-found
|  |- test/                 Vitest tests for auth and OTP helpers
|  `- types/                Shared frontend types
|- .env.example             Environment variable template
|- package.json             Frontend scripts and dependencies
`- vite.config.ts           Frontend dev server and API proxy setup
```

## Local Setup

### Prerequisites

- Node.js and npm
- Python 3
- `ffmpeg` available on your system `PATH` if you want upload processing to work

### 1. Install dependencies

```bash
npm install
pip install -r backend/requirements.txt
```

If you prefer, create a virtual environment before installing Python packages.

### 2. Create your environment file

Copy `.env.example` to `.env` and fill in the values you need.

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Start the app

Run both frontend and backend together:

```bash
npm run dev:all
```

Or start them separately:

```bash
npm run dev:web
python backend/app.py
```

Default local URLs:

- Frontend: `http://127.0.0.1:8080`
- Backend: `http://127.0.0.1:5001`

## Environment Variables

### Core frontend + backend

These are the most important values for the full app:

- `VITE_API_BASE_URL`
  - Flask backend base URL
  - Default local value: `http://127.0.0.1:5001`
- `GROQ_API_KEY`
  - Recommended server-side Groq key for upload transcription and summary generation
- `VITE_GROQ_API_KEY`
  - Used by the frontend chat assistant
- `CORS_ORIGINS`
  - Allowed frontend origins for Flask

### EmailJS for OTP auth

Required if you want signup and forgot-password OTP emails to work:

- `VITE_EMAILJS_SERVICE_ID`
- `VITE_EMAILJS_TEMPLATE_ID`
- `VITE_EMAILJS_PUBLIC_KEY`
- `VITE_EMAILJS_ACCESS_TOKEN`
  - Optional, only if your EmailJS account requires it

Expected template variables:

- `{{to_email}}`
- `{{otp_code}}`
- `{{otp_purpose}}`
- `{{otp_expiry_minutes}}`
- `{{app_name}}`

### SMTP or Resend for exporting reports by email

Required if you want the "Email" buttons for exports to work:

- `MAIL_SERVER`
- `MAIL_PORT`
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_FROM`
- `MAIL_FROM_NAME`
- `MAIL_USE_TLS`
- `MAIL_MAX_ATTACHMENT_MB`

Legacy `SMTP_*` names are also supported by the backend.

Optional Resend fallback values:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`

### Upload processing controls

These control file limits and background behavior:

- `MAX_UPLOAD_MB`
- `MAX_FORM_MEMORY_MB`
- `MAX_FORM_PARTS`
- `STORAGE_DIR`
- `UPLOAD_STORAGE_DIR`
- `JOB_STORAGE_DIR`
- `NORMALIZED_STORAGE_DIR`
- `CHUNK_DURATION_SECONDS`
- `JOB_QUEUE_WORKERS`
- `TRANSCRIPTION_WORKERS`
- `CHUNK_TRANSCRIPTION_RETRIES`
- `SUMMARY_RETRIES`
- `SUMMARY_DIRECT_CHAR_LIMIT`
- `KEEP_SOURCE_UPLOADS`
- `KEEP_CHUNK_ARTIFACTS`
- `UPLOAD_TIMEOUT_SECONDS`
- `TRANSCRIPTION_TIMEOUT_SECONDS`
- `SUMMARY_TIMEOUT_SECONDS`
- `TRANSCRIPTION_MODEL`
- `SUMMARY_MODEL`
- `GUNICORN_WORKERS`
- `GUNICORN_THREADS`
- `VITE_MAX_UPLOAD_MB`

## How Upload Processing Works

When a user uploads media through the dashboard, the flow is:

1. `POST /api/upload`
   - Saves the file to disk
   - Creates a `job_id`
   - Returns immediately with a `202`
2. `POST /api/process`
   - Queues background processing
3. Backend worker pipeline
   - Convert media to normalized MP3
   - Split into chunks
   - Transcribe each chunk
   - Merge transcripts
   - Generate final summary
4. `GET /api/status/<job_id>`
   - Returns progress, warnings, transcript, and summary when finished

Available backend endpoints:

- `GET /api/health`
- `POST /api/upload`
- `POST /api/process`
- `POST /api/summarize`
  - Alias for the same processing start behavior
- `GET /api/status/<job_id>`
- `GET /api/jobs/<job_id>`
- `POST /api/send-export-email`
  - Compatible aliases: `POST /api/send-email`, `POST /send-email`

## Data Storage Model

This app does not use a database right now.

Frontend data is stored in browser storage:

- Registered users: `localStorage`
- Active session: `localStorage`
- Meetings and workspaces: `localStorage`
- Notes: `localStorage`
- Pending OTP challenge: `sessionStorage`

Backend processing data is stored on disk:

- Uploads: `backend/storage/uploads`
- Jobs: `backend/storage/jobs`
- Normalized audio: `backend/storage/normalized`
- Chunks and temporary artifacts: under the job storage directory

## Authentication Behavior

Current auth is intentionally simple and frontend-driven:

- Sign up requires OTP verification before the user is stored
- Duplicate emails are blocked
- Forgot password only works for existing users
- OTPs are 6 digits and expire after 5 minutes
- Users and passwords are stored in browser storage, not in a database

This is convenient for demos and local projects, but it is not production-grade authentication.

## Exporting Reports

Users can export summaries in two ways:

- Download as `PDF`
- Download as `DOCX`

They can also email the generated export through the Flask backend if SMTP or Resend is configured.

Report generation and formatting are handled in:

- `src/lib/meetingReport.ts`
- `src/lib/reportExport.ts`
- `src/lib/exportEmail.ts`

## Testing

The repo includes lightweight frontend tests with Vitest:

```bash
npm test
```

Current automated coverage is focused on:

- Auth storage helpers
- OTP helpers

## Production Notes

The repo includes deployment-oriented backend files:

- `backend/gunicorn.conf.py`
- `backend/nginx.conf.example`
- `backend/wsgi.py`

For large uploads in production, keep your reverse proxy and app server timeouts aligned and make sure your upload size limits match across the stack.

## Known Limitations

- Live transcription depends on browser speech recognition, so Chrome-based browsers work best.
- Live mode does not provide real speaker diarization; it keeps a stable `Speaker 1` label.
- Uploaded file summaries are generated on the backend, but the frontend currently rebuilds a printable summary from the returned transcript before saving it locally.
- Auth is frontend-only and stores passwords in browser storage.
- The floating chat assistant uses a frontend Groq key, which is fine for demos but should be moved server-side before production use.
- The UI mixes `MeetingMind` and `MeetingMate AI` branding.
- A legacy OTP mail server (`server.js`) still exists in the repo even though the current auth flow uses EmailJS.
- The frontend includes notification-email helpers, but the matching backend route is not implemented yet.

## Recommended Next Improvements

If you want to take this beyond a demo or portfolio project, the biggest upgrades would be:

- Move auth to a real backend and database
- Store users securely with hashed passwords
- Move all AI calls behind backend APIs
- Replace browser-only live transcription with a more reliable streaming speech pipeline
- Persist meetings and notes in a database instead of browser storage
- Unify the product name across UI, README, backend, and email templates
