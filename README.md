

# Interview Bot - AI Mock Interview Trainer

An end-to-end AI-powered mock interview platform for students and job seekers.

Interview Bot combines resume intelligence, job-description alignment, adaptive questioning, voice interaction, and structured post-interview evaluation in a single full-stack application.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Project Overview](#project-overview)
3. [Key Features](#key-features)
4. [System Architecture](#system-architecture)
5. [Interview Engine Design](#interview-engine-design)
6. [Speech Models](#speech-models)
7. [Tech Stack](#tech-stack)
8. [Repository Structure](#repository-structure)
9. [Prerequisites](#prerequisites)
10. [Environment Configuration](#environment-configuration)
11. [Setup and Installation](#setup-and-installation)
12. [How to Run](#how-to-run)
13. [Docker Deployment](#docker-deployment)
14. [API Endpoints](#api-endpoints)
15. [Data Model](#data-model)
16. [Reliability and Resilience](#reliability-and-resilience)
17. [Troubleshooting](#troubleshooting)
18. [License](#license)

---

## Problem Statement

Most interview preparation tools are static and generic. They do not adapt to a candidate's actual resume, a specific target job description, or the quality and depth of previous answers.

Interview Bot addresses this by generating dynamic, role-targeted interviews that adapt in real time and produce actionable feedback after completion.

---

## Project Overview

Interview Bot supports two interview modes:

**Resume Interview**
- Uses resume data and a selected job description
- Creates personalized role-specific questions
- Applies adaptive follow-up logic based on each answer

**Topic Interview**
- Uses admin-published topic banks
- Supports optional timed interviews per topic
- Mixes topic bank questions with AI-generated follow-ups

The platform provides:
- Secure user authentication with JWT and email OTP verification
- Resume upload and AI parsing
- AI-recommended role suggestions from resume content
- Resume vs job-description alignment checks
- Real-time interview state management via Redis
- Voice-enabled interviewing (TTS + STT)
- Detailed interview reports with per-question scoring
- Admin dashboards for analytics, content management, and user oversight

---

## Key Features

### Student Features

- Signup with email verification (OTP)
- Password reset via email link
- Resume upload (PDF, DOCX, TXT) with AI parsing
- Skill extraction and manual skill editing
- AI-recommended role list from resume content
- Personal job description management (create, update, delete)
- Job description file upload with AI extraction
- Pre-interview JD compatibility check
- Resume interview and topic interview modes
- Voice interaction:
  - Backend TTS question playback (XTTS v2)
  - Backend STT answer transcription (faster-whisper)
  - Editable transcript before final submit
- Report history and detailed report views

### Admin Features

- Role CRUD and requirement management
- Topic CRUD with publish/hide controls
- Optional per-topic timer configuration
- Question CRUD and bulk import from PDF
- Job description management across users
- User management with cascading delete
- Analytics dashboard:
  - Total students, live users, new users today
  - Average scores and top performers
  - Common weak areas
- Quit interview monitoring and report auditing

---

## System Architecture

```mermaid
flowchart LR
    A[Next.js Frontend] --> B[FastAPI Backend]
    B --> C[MongoDB Atlas]
    B --> D[Redis]
    B --> E[Gemini API]
    B --> F[XTTS v2 + faster-whisper]
```

### Runtime Flow

```mermaid
flowchart TD
    U[User Login] --> R[Upload Resume]
    R --> P[Resume Parsing via Gemini]
    P --> S[Skills + Recommended Roles Saved]
    S --> J[Select Job Description]
    J --> V[Optional Resume-JD Verification]
    V --> I[Start Interview]
    I --> Q[Redis Queue Orchestration]
    Q --> A1[Answer Submission]
    A1 --> F1[Adaptive Follow-up Generation]
    F1 --> Q
    Q --> C{Interview Complete?}
    C -- No --> A1
    C -- Yes --> E1[Final Evaluation via Gemini]
    E1 --> M[Report Stored in MongoDB]
    M --> UI[Report UI and Analytics]
```

---

## Interview Engine Design

### Queue Architecture

- `question_queue` keeps the next questions ready for low-latency delivery
- `question_backlog` stores overflow to avoid generation stalls
- Deduplication via normalized fingerprinting prevents repeated or near-duplicate questions

### Resume Interview Flow

- Requires a resume and a selected job description
- Starts with a personalized intro question
- Seeds an initial AI question batch in the background
- Maintains up to 10 questions by default
- Stores answers immediately; processes follow-ups asynchronously

### Topic Interview Flow

- Requires a published topic
- Starts with the DB topic question bank
- Generates AI follow-ups after the initial stage
- Supports optional per-topic timer set by admin

### Follow-up Diversity Policy

- Up to 2 consecutive same-topic follow-ups are allowed
- A third same-topic follow-up is only generated when follow-up need score is >= 95
- Otherwise the system switches to a different focus skill from the resume

### Evaluation

- Per-answer scoring runs in the background while the interview continues
- Final report generated on completion or on quit (if answers exist)
- Redis session data is cleaned after report is stored

---

## Speech Models

### Text-to-Speech: Coqui XTTS v2

| Property | Value |
|---|---|
| Package | TTS==0.22.0 (Coqui TTS) |
| Model | tts_models/multilingual/multi-dataset/xtts_v2 |
| Download size | ~2 GB (automatic on first run) |
| Default female voice | Alexandra Hisakawa |
| Default male voice | Abrahan Mack |
| GPU env var | XTTS_USE_GPU=auto (auto-detects CUDA; set to 0 to force CPU) |
| Concurrency limit | TTS_MAX_CONCURRENT=4 (configurable) |
| Model cache location | Windows: %APPDATA%\tts\ / Linux: ~/.local/share/tts/ |

XTTS v2 is a multilingual multi-speaker neural TTS model. It requires PyTorch. On first startup the model weights (~2 GB) are downloaded automatically from Hugging Face. Subsequent startups load from the local cache and take 15-30 seconds for warmup.

XTTS requires acceptance of the Coqui TTS license: set `COQUI_TOS_AGREED=1` in your environment before starting the server.

### Speech-to-Text: faster-whisper

| Property | Value |
|---|---|
| Package | faster-whisper==1.0.3 |
| Backend | CTranslate2 (quantized inference) |
| Default model | small.en (~240 MB, English-only) |
| Model size env var | WHISPER_MODEL_SIZE=small.en |
| Device env var | WHISPER_DEVICE=auto (auto-detects CUDA) |
| Available sizes | tiny, base, small, medium, large-v2, large-v3 |
| Language variants | Append .en for English-only (e.g. base.en, medium.en) |

faster-whisper uses CTranslate2 for optimized inference on both CPU and GPU. On first use the selected model is downloaded automatically. GPU inference uses float16; CPU uses int8. Automatic CPU fallback activates when CUDA runtime errors are detected.

---

## Tech Stack

### Backend

| Component | Package |
|---|---|
| API framework | FastAPI 0.115.0 |
| Server | Uvicorn 0.30.0 |
| MongoDB driver | Motor 3.5.0 (async) |
| Redis client | redis-py 5.0.0 (asyncio) |
| Auth | python-jose 3.3.0, passlib, bcrypt |
| AI | google-genai 1.5.0 (Gemini) |
| Interview graph | LangGraph 0.2.0 |
| TTS | Coqui TTS 0.22.0 + XTTS v2 model |
| STT | faster-whisper 1.0.3 |
| Deep learning | PyTorch 2.x |
| Resume parsing | pypdf 5.4.0, python-docx 1.1.2 |
| Email | aiosmtplib |
| Rate limiting | slowapi |
| Config | pydantic-settings 2.5.0 |
| Testing | pytest, pytest-asyncio, httpx |

### Frontend

| Component | Package |
|---|---|
| Framework | Next.js 16.1.7 (App Router) |
| Runtime | React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| HTTP client | Axios |
| State | TanStack React Query v5 |
| Animations | Framer Motion |
| Notifications | Sonner |
| Icons | Lucide React |
| PDF export | jsPDF |

---

## Repository Structure

```text
interview-bot/
|- backend/
|  |- main.py              # FastAPI app factory, lifespan, middleware
|  |- config.py            # Pydantic settings, env validation
|  |- database.py          # MongoDB + Redis connection management
|  |- auth/                # JWT helpers
|  |- routers/             # auth, resume, profile, interview, reports, admin, speech
|  |- schemas/             # Pydantic request/response models
|  |- services/            # Business logic, AI services, speech models
|  |- utils/               # Gemini client, helpers, resume text extraction
|  |- models/              # MongoDB collection helpers
|  |- uploads/             # Resume upload storage (gitignored)
|  |- tests/               # pytest integration tests
|  |- requirements.txt
|  |- Dockerfile
|- frontend/
|  |- src/
|  |  |- app/              # Next.js App Router pages
|  |  |- components/       # Shared UI components
|  |  |- lib/              # API client, auth helpers, speech utilities
|  |  |- types/            # TypeScript type definitions
|  |- public/
|  |- package.json
|  |- Dockerfile
|- docker-compose.yml
|- .env.example            # Full environment template with inline documentation
|- Dockerfile              # Backend production Dockerfile
|- README.md
|- LICENSE
```

---

## Prerequisites

| Requirement | Minimum version | Notes |
|---|---|---|
| Python | 3.10 | 3.11 also tested |
| Node.js | 20 | LTS recommended |
| npm | 9+ | Bundled with Node.js |
| Git | any | For cloning |
| MongoDB Atlas | — | Free M0 cluster is sufficient |
| Redis | — | Upstash free tier or local Docker |
| Gemini API key | — | Free tier at aistudio.google.com |
| CUDA toolkit (optional) | 12.x | For GPU-accelerated TTS and STT |

**Disk space:** Allow at least 5 GB free — XTTS v2 (~2 GB) + Whisper small.en (~240 MB) + Python packages (~2 GB).

---

## Environment Configuration

### Backend: `backend/.env`

Copy `.env.example` to `backend/.env` and fill in the required values.

```env
# App mode: "production" enforces cloud-only URLs; "development" relaxes them
APP_ENV=production
APP_HOST=0.0.0.0
APP_PORT=8000

# Gemini — required
# Free key at https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIza...
# Optional: comma-separated extra keys for round-robin (15 RPM per key)
GEMINI_API_KEYS=AIza...key2,AIza...key3
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODELS=gemini-2.0-flash,gemini-2.0-flash-lite

# MongoDB Atlas — required
# Create a free cluster at https://cloud.mongodb.com
# Format: mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=interview_bot

# Redis — required
# Upstash free tier: https://upstash.com (use rediss:// for TLS)
REDIS_URL=rediss://your_redis_host:6380

# JWT — required
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=replace_with_a_long_random_string
JWT_ALGORITHM=HS256
JWT_EXPIRY=3600

# File storage
UPLOAD_DIR=./uploads

# CORS — set to your frontend URL in production
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Admin role domain
# Emails ending with this domain are assigned the admin role on signup
# Leave empty to disable automatic admin promotion (safest default)
ADMIN_EMAIL_DOMAIN=

# Frontend URL — used in password reset email links
FRONTEND_URL=http://localhost:3000

# SMTP — optional
# Leave SMTP_HOST empty to print OTP codes to the backend console instead
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
SMTP_FROM_NAME=Interview Bot
SMTP_USE_TLS=true
OTP_TTL_SECONDS=600
RESET_TOKEN_TTL_SECONDS=1800

# Speech — required
COQUI_TOS_AGREED=1
XTTS_USE_GPU=auto
WHISPER_DEVICE=auto
WHISPER_MODEL_SIZE=small.en
TTS_MAX_CONCURRENT=4
```

Validation rules enforced by the backend at startup:
- `MONGO_URI` must use `mongodb+srv://` (no localhost in production mode)
- `REDIS_URL` must start with `redis://` or `rediss://` (no localhost in production mode)
- `COQUI_TOS_AGREED=1` must be set or XTTS will refuse to load

### Frontend: `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

---

## Setup and Installation

### Step 1: Clone the repository

```bash
git clone <your-repo-url>
cd interview-bot
```

### Step 2: Create the Python virtual environment

From the project root:

```bash
python -m venv inter
```

Activate it:

**Windows (PowerShell):**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
inter\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```cmd
inter\Scripts\activate.bat
```

**Linux / macOS:**
```bash
source inter/bin/activate
```

Your shell prompt should show `(inter)` when the environment is active.

### Step 3: Install PyTorch

PyTorch must be installed before Coqui TTS because `pip install TTS` pulls in a CPU-only torch by default. Installing the correct CUDA build first ensures GPU support.

**Check your CUDA version first:**
```bash
nvidia-smi   # shows CUDA version in top-right corner
```

**With CUDA 12.1 (most common for RTX 30xx/40xx):**
```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
```

**With CUDA 12.4:**
```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
```

**With CUDA 11.8 (older GPUs):**
```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118
```

**CPU only (no GPU / Apple Silicon):**
```bash
pip install torch torchaudio
```

Verify the installation:
```bash
python -c "import torch; print(torch.__version__); print('CUDA:', torch.cuda.is_available())"
```

### Step 4: Install Coqui TTS

```bash
pip install TTS==0.22.0
```

This installs the Coqui TTS library. The XTTS v2 model weights (~2 GB) are downloaded automatically on first server startup — you do not need to download them manually.

### Step 5: Install remaining backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Step 6: Configure the backend environment

```bash
# Linux / macOS
cp ../.env.example .env

# Windows PowerShell
Copy-Item ..\\.env.example .env
```

Edit `backend/.env` and fill in at minimum:
- `GEMINI_API_KEY`
- `MONGO_URI`
- `REDIS_URL`
- `JWT_SECRET`
- `COQUI_TOS_AGREED=1`

### Step 7: Install frontend dependencies

```bash
cd ../frontend
npm install
```

### Step 8: Configure the frontend environment

```bash
# Linux / macOS
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" > .env.local

# Windows PowerShell
"NEXT_PUBLIC_API_URL=http://127.0.0.1:8000" | Out-File -Encoding utf8 .env.local
```

---

## How to Run

### Start the backend

From the `backend/` directory with the virtual environment active:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Expected startup output:

```
INFO  database: Connected to MongoDB Atlas
INFO  database: Connected to Redis
 > tts_models/multilingual/multi-dataset/xtts_v2 is already downloaded.
INFO  main: XTTS warmup: ready
INFO  main: Whisper warmup: ready
INFO  main: Interview Bot API running in production mode
INFO  Application startup complete.
```

On **first run**, XTTS v2 will be downloaded (~2 GB). This can take several minutes. Progress is printed to the console. Subsequent startups load from cache and take 15-30 seconds for warmup.

Available endpoints:
- Health check: `http://localhost:8000/health`
- Service status: `http://localhost:8000/health/services`
- Swagger docs: `http://localhost:8000/docs`

### Start the frontend

From the `frontend/` directory:

```bash
npm run dev
```

Frontend: `http://localhost:3000`

### First Run Checklist

1. Open `http://localhost:3000` and register a student account
2. If SMTP is not configured, check the **backend console** for the OTP code
3. Enter the OTP on the verify-email page
4. Log in and open Settings
5. Upload a resume (PDF, DOCX, or TXT); required filename format: `<12-digit-reg-no>_<Name>.pdf`
6. Add at least one Job Description
7. Go to Dashboard and start a Resume Interview
8. Complete the interview and open Reports

---

## Docker Deployment

Docker Compose builds and runs both the backend and frontend together.

### Requirements

- Docker 24+
- Docker Compose v2+

### Setup

Copy and fill in the root `.env` file:

```bash
cp .env.example .env   # then edit .env with your real values
```

### Production (cloud MongoDB + Redis)

```bash
docker compose up --build
```

- Backend API: `http://localhost:8000`
- Frontend: `http://localhost:3000`

### Development (with local Redis container)

```bash
docker compose --profile dev up --build
```

This starts a local Redis container on port 6379. Use `REDIS_URL=redis://redis:6379` in your `.env`.

### Notes

- XTTS v2 needs up to 90 seconds on first container start. The healthcheck `start_period` is set to 90s so the frontend waits until the backend is actually ready.
- The frontend is built using Next.js standalone output mode. The `NEXT_PUBLIC_API_URL` is baked in at image build time.
- Resume uploads are stored in the `uploads_data` named volume and persist across container restarts.

---

## API Endpoints

All secured endpoints require the header: `Authorization: Bearer <token>`

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Fast liveness check |
| GET | `/health/services` | MongoDB, Redis, TTS, Whisper status |

### Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/auth/signup` | Register (returns email verification required flag) |
| POST | `/auth/login` | Login and receive JWT |
| POST | `/auth/refresh` | Silent token refresh |
| POST | `/auth/verify-email` | Verify email with OTP |
| POST | `/auth/resend-otp` | Resend OTP (60-second cooldown) |
| POST | `/auth/forgot-password` | Send password reset link |
| POST | `/auth/reset-password` | Set new password via reset token |

### Resume

| Method | Path | Description |
|---|---|---|
| POST | `/resume/upload` | Upload and parse resume (max 5 MB) |

Accepted formats: PDF, DOCX, TXT.
Required filename format: `<12-digit-reg-no>_<Name>.<ext>` — e.g. `714023200122_Name.pdf`

### Profile

| Method | Path | Description |
|---|---|---|
| GET | `/profile` | Get profile, resume data, skills |
| PUT | `/profile/speech-settings` | Update voice preference |
| PUT | `/profile/skills` | Update skill list |
| PUT | `/profile/resume-data` | Update structured resume fields |
| GET | `/profile/job-descriptions` | List job descriptions |
| POST | `/profile/job-descriptions` | Create job description |
| PUT | `/profile/job-descriptions/{jd_id}` | Update job description |
| DELETE | `/profile/job-descriptions/{jd_id}` | Delete job description |

### Interview

| Method | Path | Description |
|---|---|---|
| POST | `/interview/start` | Start interview session |
| POST | `/interview/verify` | Resume vs JD verification |
| POST | `/interview/answer` | Submit answer and get next question |
| GET | `/interview/next_question` | Peek next queued question |
| POST | `/interview/quit` | Quit interview; generates partial report |
| GET | `/interview/report` | Get or generate final report |
| GET | `/interview/latency` | Latency summary (p50/p95) |
| POST | `/interview/latency/reset` | Reset latency metrics |

### Reports

| Method | Path | Description |
|---|---|---|
| GET | `/reports/history` | Student report history |

### Speech

| Method | Path | Description |
|---|---|---|
| GET | `/speech/health` | TTS and STT readiness check |
| POST | `/speech/warmup` | Manually warm speech models |
| POST | `/speech/synthesize` | Convert text to WAV audio |
| POST | `/speech/transcribe` | Transcribe uploaded audio file |

### Admin

| Method | Path | Description |
|---|---|---|
| GET/POST/PUT/DELETE | `/admin/roles` (+ `/{id}`) | Job role management |
| GET/POST/PUT/DELETE | `/admin/questions` (+ `/{id}`) | Question management |
| POST | `/admin/questions/upload` | Bulk import questions from PDF |
| GET/POST/PUT/DELETE | `/admin/topics` (+ `/{id}`) | Topic management |
| PUT | `/admin/topics/{id}/publish` | Publish/hide topic and set timer |
| GET/POST/DELETE | `/admin/requirements` | Role requirement management |
| GET | `/admin/analytics` | Dashboard analytics |
| GET | `/admin/quit-interviews` | Quit interview details |
| GET | `/admin/reports` | Report summaries |
| GET | `/admin/reports/{session_id}` | Report detail |
| GET | `/admin/users` | Student list (paginated: limit, skip) |
| DELETE | `/admin/users/{user_id}` | Delete student and all linked data |
| GET/POST/PUT/DELETE | `/admin/job-descriptions` | Admin JD management |

---

## Data Model

Primary MongoDB collections:

| Collection | Purpose |
|---|---|
| users | Accounts, roles, speech preferences, email verification status |
| resumes | Parsed resume data, register number, recommended roles |
| skills | Extracted and manually confirmed skills per user |
| job_roles | Admin-managed job role definitions |
| job_descriptions | User-created and admin job descriptions |
| jd_verifications | Cached resume vs JD compatibility results |
| role_requirements | Skill requirements per role |
| questions | Admin-created questions per role |
| topics | Admin-published interview topics |
| topic_questions | Questions per topic |
| sessions | Interview session records |
| answers | Per-question answers with timestamps |
| results | Final evaluation reports |

Redis stores in-progress interview state with TTL:
- Session metadata and question count
- Question queue and backlog lists
- Asked question fingerprint sets
- Q/A similarity hashes for deduplication
- Follow-up context cache

---

## Reliability and Resilience

- Gemini fallback chain: automatic model switch on 503/quota errors
- MongoDB auto-retry: `retryWrites=True, retryReads=True` on transient Atlas blips
- Connection pool hygiene: `maxIdleTimeMS=600000` prevents stale pool connections
- XTTS concurrency semaphore: caps synthesis jobs at `TTS_MAX_CONCURRENT`
- Whisper CPU fallback: automatic on CUDA runtime mismatch
- Loose JSON parsing: recovers from malformed Gemini output
- Deterministic fallback questions: used when AI output is empty or duplicate
- Queue/backlog buffering: avoids blocking next question delivery
- Placeholder report detection and regeneration
- Partial reports on quit: recovered from MongoDB answers when Redis is cleared

---

## Troubleshooting

### Login fails despite correct credentials

Check that the frontend can reach the backend:
1. Confirm backend is running on port 8000
2. Confirm `frontend/.env.local` contains `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`
3. Restart the frontend after any `.env.local` change

### XTTS model download is slow or stalls

The XTTS v2 model is ~2 GB. On slow connections the first download can take 10-30 minutes. Progress is visible in the backend console.

If a download fails midway, delete the partial cache and restart:

```
Windows: %APPDATA%\tts\tts_models--multilingual--multi-dataset--xtts_v2\
Linux:   ~/.local/share/tts/tts_models--multilingual--multi-dataset--xtts_v2/
```

### XTTS or Whisper CUDA errors

Both models fall back to CPU automatically. To explicitly disable GPU and avoid the error messages:

```env
XTTS_USE_GPU=0
WHISPER_DEVICE=cpu
```

### Speech warmup timeout on startup

If warmup times out (default 45 s per model), the server still starts normally. You can trigger warmup manually after startup:

```bash
curl -X POST http://localhost:8000/speech/warmup -H "Authorization: Bearer <token>"
```

### OTP not received in email

If `SMTP_HOST` is empty, OTPs are printed to the backend console. Look for:

```
[EMAIL TO: user@example.com | SUBJECT: Verify your email]
Your verification code is: 123456
```

For Gmail SMTP, use a Google App Password (not your account password): myaccount.google.com/apppasswords (requires 2FA enabled on your Google account).

### Resume interview start fails

Check:
- A resume has been uploaded in Settings
- A Job Description is selected with `required_skills` filled in
- `recommended_roles` exists in your profile — if missing, re-upload the resume

### MongoDB AutoReconnect messages in logs

These are non-fatal background pool maintenance events. The driver retries automatically. They appear when Atlas closes an idle connection before the pool does. Ensure your `MONGO_URI` includes `retryWrites=true&w=majority`.

### Startup validation errors

- `MONGO_URI must use mongodb+srv://` — use a MongoDB Atlas connection string, not localhost
- `REDIS_URL must start with redis://` — check for typos in your Redis URL
- Set `APP_ENV=development` to relax these checks for local testing with local databases

---

## License

This project is licensed under the MIT License.
See [LICENSE](LICENSE) for details.
