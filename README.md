# AI-Powered Resume Screener

## Overview
Recruiters upload multiple PDF resumes and enter a job description (JD). The backend extracts text from each PDF and uses an LLM to generate structured screening results (candidate name, match score 0–100, top strengths, top gaps, and a one-line summary). Results are ranked in a leaderboard, and recruiters can ask follow-up questions in a chat interface that uses the screened candidate context.

## Tech Stack
- Backend: Python 3.10+, FastAPI, Uvicorn, `pdfplumber`, OpenAI SDK
- Frontend: React 18+, TypeScript (strict), Vite, Tailwind CSS

## Core Features
- Multi-file PDF upload with drag-and-drop
- Per-file upload progress and status (queued/uploading/done/error)
- Resume screening via structured LLM output
- MD5-based caching to avoid re-screening the same resume during a server session
- Leaderboard UI: sort by score or name + highlight top candidate
- Export ranked candidates as CSV
- Dark mode toggle
- Streaming recruiter chat (real-time token streaming to the UI)

## Setup (Local)
### Backend
1. `cd backend`
2. Copy `backend/.env.example` to `backend/.env` and set your keys
3. Create venv + install deps:
   - `python -m venv venv`
   - `call venv\Scripts\activate.bat`
   - `pip install -r requirements.txt`
4. Run:
   - `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
5. API docs:
   - `http://localhost:8000/docs`

### Frontend
1. `cd frontend`
2. Copy `frontend/.env.example` to `frontend/.env`
3. Set `VITE_API_URL` to your backend (default: `http://localhost:8000`)
4. Run:
   - `npm install`
   - `npm run dev`
5. App:
   - `http://localhost:5173/`

## API Contract
Base URL: `VITE_API_URL` (default `http://localhost:8000`)

- `POST /screen` (multi-file)
  - Form fields: `job_description` (string), `files` (list of PDFs)
  - Response: `CandidateResult[]`

- `POST /screen_one` (single-file; used by the UI for per-file progress)
  - Form fields: `job_description` (string), `file` (one PDF)
  - Response: `CandidateResult`

- `POST /chat` (non-streaming)
  - Body: `{ message, candidates, history? }`
  - Response: `{ response: string }`

- `POST /chat_stream` (streaming)
  - Body: `{ message, candidates, history? }`
  - Response: `text/plain` streamed response chunks

## Deployment Notes
### Backend (Render.com)
- Start command example:
  - `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Add env vars:
  - `OPENAI_API_KEY` (and `GOOGLE_API_KEY` if you extend to Gemini)

### Frontend (Vercel)
- Import `frontend/` and set project root to `frontend/`
- Add env var:
  - `VITE_API_URL=<your-render-backend-url>`

## Known Limitations
- LLM caching is in-memory only (resets when the backend restarts / scales).
- Resume parsing quality depends on PDF text extraction.
