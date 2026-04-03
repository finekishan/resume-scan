from fastapi import FastAPI, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Literal, Iterator, Dict, Any
from starlette.responses import StreamingResponse
import os
import hashlib
import tempfile

from dotenv import load_dotenv
import openai

from utils import extract_text_from_pdf
from models import CandidateResult
from openai_llm import call_openai_llm
from gemini_llm import call_gemini_llm, call_gemini_chat

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    # Recruiter question
    message: str
    # Screened candidates to use as context
    candidates: List[CandidateResult]
    # Optional prior conversation turns (excluding the current `message`)
    history: List[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
openai.api_key = OPENAI_API_KEY


def md5_file(file_bytes: bytes) -> str:
    return hashlib.md5(file_bytes).hexdigest()


# Simple in-memory cache for demo (not for production persistence)
llm_cache: Dict[str, CandidateResult] = {}


def build_prompt(resume_text: str, job_description: str) -> str:
    return (
        "You are an expert recruiter AI.\n"
        "Return ONLY a valid JSON object (no markdown, no extra text) with exactly these keys:\n"
        "- name: string\n"
        "- score: integer 0-100\n"
        "- strengths: array of exactly 3 strings\n"
        "- gaps: array of exactly 2 strings\n"
        "- summary: string (one line)\n\n"
        f"Resume text:\n{resume_text}\n\n"
        f"Job description:\n{job_description}\n"
    )


def call_llm(prompt: str) -> dict:
    if OPENAI_API_KEY:
        openai_res = call_openai_llm(prompt)
        # If OpenAI fails (quota/rate limit), fall back to Gemini if available.
        if (
            openai_res.get("summary", "").startswith("Error: Could not get AI response")
            and GOOGLE_API_KEY
        ):
            return call_gemini_llm(prompt)
        return openai_res

    if GOOGLE_API_KEY:
        return call_gemini_llm(prompt)

    # Fallback to mock if no API key (keeps the demo running)
    return {
        "name": "Sample Candidate",
        "score": 80,
        "strengths": ["Python", "Teamwork", "ML"],
        "gaps": ["Kubernetes", "Go"],
        "summary": "Strong Python developer with ML experience.",
    }


def build_chat_openai_messages(data: ChatRequest) -> List[dict]:
    candidate_context_lines = []
    for idx, c in enumerate(data.candidates, start=1):
        candidate_context_lines.append(
            f"{idx}) {c.name}\n"
            f"   Score: {c.score}\n"
            f"   Strengths: {', '.join(c.strengths)}\n"
            f"   Gaps: {', '.join(c.gaps)}\n"
            f"   Summary: {c.summary}"
        )

    system_prompt = (
        "You are an AI-first recruiter assistant. Use the candidate screening context provided.\n"
        "When answering, refer to candidates by their number from the list (e.g., 'Candidate 2' / '2)').\n"
        "Be concise, recruiter-friendly, and avoid fabricating details not present in the context.\n"
        "If the question requests comparison, compare the relevant candidates explicitly."
    )

    messages: List[dict] = [{"role": "system", "content": system_prompt}]
    if candidate_context_lines:
        messages.append(
            {"role": "system", "content": "Candidate screening results:\n" + "\n".join(candidate_context_lines)}
        )

    for turn in data.history:
        messages.append({"role": turn.role, "content": turn.content})

    messages.append({"role": "user", "content": data.message})
    return messages


def build_chat_gemini_prompt_text(data: ChatRequest) -> str:
    candidate_context_lines = []
    for idx, c in enumerate(data.candidates, start=1):
        candidate_context_lines.append(
            f"{idx}) {c.name}\n"
            f"   Score: {c.score}\n"
            f"   Strengths: {', '.join(c.strengths)}\n"
            f"   Gaps: {', '.join(c.gaps)}\n"
            f"   Summary: {c.summary}"
        )

    history_lines = []
    for turn in data.history:
        role = "Recruiter" if turn.role == "user" else "Assistant"
        history_lines.append(f"{role}: {turn.content}")

    system_prompt = (
        "You are an AI-first recruiter assistant. Use the candidate screening context.\n"
        "Refer to candidates by their number from the list.\n"
        "Be concise and recruiter-friendly. Do not invent details not present in the context.\n"
    )

    return (
        system_prompt
        + ("\nCandidate screening results:\n" + "\n".join(candidate_context_lines) if candidate_context_lines else "")
        + ("\n\nConversation history:\n" + "\n".join(history_lines) if history_lines else "")
        + f"\n\nRecruiter question: {data.message}\n"
    )


def stream_openai_chat(messages: List[dict]) -> Iterator[str]:
    # Yields plain text chunks; frontend appends them in real time.
    if not OPENAI_API_KEY:
        mock = f"AI (mock): You asked '{messages[-1]['content']}'. There are {len(messages)} context blocks."
        for i in range(0, len(mock), 12):
            yield mock[i : i + 12]
        return

    try:
        # OpenAI SDK v1+: use client.chat.completions.create(..., stream=True)
        # Only fall back to the old SDK if the v1 client cannot be imported.
        try:
            from openai import OpenAI  # type: ignore

            client = OpenAI(api_key=OPENAI_API_KEY)
            stream = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=700,
                temperature=0.2,
                stream=True,
            )
            for event in stream:
                piece = getattr(event.choices[0].delta, "content", None)  # type: ignore[attr-defined]
                if piece:
                    yield piece
        except ImportError:
            # Backward-compat: OpenAI SDK v0.x streaming
            response = openai.ChatCompletion.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=700,
                temperature=0.2,
                stream=True,
            )
            for chunk in response:
                delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
                content_piece = delta.get("content")
                if content_piece:
                    yield content_piece
    except Exception as e:
        yield f"Error: Could not get AI response. ({type(e).__name__})"


def screen_file_bytes(file_bytes: bytes, job_description: str) -> CandidateResult:
    file_hash = md5_file(file_bytes)
    if file_hash in llm_cache:
        return llm_cache[file_hash]

    # Save to a temp file for pdfplumber (works cross-platform)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file_hash}.pdf") as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        resume_text = extract_text_from_pdf(tmp_path) or ""
        prompt = build_prompt(resume_text, job_description)
        llm_response = call_llm(prompt)

        # Be defensive: LLM can return malformed JSON.
        try:
            result = CandidateResult(**llm_response)
        except Exception:
            score_raw: Any = llm_response.get("score", 0)
            try:
                score_int = int(score_raw)
            except Exception:
                score_int = 0
            result = CandidateResult(
                name=str(llm_response.get("name", "Unknown")),
                score=score_int,
                strengths=list(llm_response.get("strengths", []) or []),
                gaps=list(llm_response.get("gaps", []) or []),
                summary=str(llm_response.get("summary", "Error: Could not summarize.")),
            )
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

    llm_cache[file_hash] = result
    return result


@app.post("/screen_one", response_model=CandidateResult)
async def screen_one(job_description: str = Form(...), file: UploadFile = File(...)):
    file_bytes = await file.read()
    return screen_file_bytes(file_bytes, job_description)


@app.post("/screen", response_model=list[CandidateResult])
async def screen_resumes(job_description: str = Form(...), files: list[UploadFile] = File(...)):
    results: List[CandidateResult] = []
    for file in files:
        file_bytes = await file.read()
        results.append(screen_file_bytes(file_bytes, job_description))

    # Sort by score descending
    results.sort(key=lambda x: x.score, reverse=True)
    return results


# Non-stream chat endpoint (fallback for clients that don't support streaming)
@app.post("/chat", response_model=ChatResponse)
async def chat_with_ai(data: ChatRequest = Body(...)):
    if GOOGLE_API_KEY:
        try:
            prompt = build_chat_gemini_prompt_text(data)
            text = call_gemini_chat(prompt)
            return ChatResponse(response=text)
        except Exception as e:
            return ChatResponse(response=f"Error: Could not get AI response. ({type(e).__name__})")

    messages = build_chat_openai_messages(data)
    if not OPENAI_API_KEY:
        return ChatResponse(
            response=f"AI (mock): You asked '{data.message}'. There are {len(data.candidates)} candidates screened."
        )

    try:
        # Keep existing OpenAI behavior as a fallback provider.
        try:
            from openai import OpenAI  # type: ignore

            client = OpenAI(api_key=OPENAI_API_KEY)
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=700,
                temperature=0.2,
            )
            content = response.choices[0].message.content or ""
            return ChatResponse(response=content)
        except ImportError:
            response = openai.ChatCompletion.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=700,
                temperature=0.2,
            )
            content = response.choices[0].message.content or ""
            return ChatResponse(response=content)
    except Exception as e:
        return ChatResponse(response=f"Error: Could not get AI response. ({type(e).__name__})")


@app.post("/chat_stream")
def chat_stream(data: ChatRequest = Body(...)):
    if GOOGLE_API_KEY:
        def gen() -> Iterator[str]:
            try:
                prompt = build_chat_gemini_prompt_text(data)
                text = call_gemini_chat(prompt)
                # Simulate streaming by chunking the completed text.
                chunk_size = 24
                for i in range(0, len(text), chunk_size):
                    yield text[i : i + chunk_size]
            except Exception as e:
                yield f"Error: Could not get AI response. ({type(e).__name__})"

        return StreamingResponse(gen(), media_type="text/plain")

    messages = build_chat_openai_messages(data)

    def gen() -> Iterator[str]:
        yield from stream_openai_chat(messages)

    # Stream plain text chunks; frontend appends them immediately.
    return StreamingResponse(gen(), media_type="text/plain")


@app.get("/debug/openai")
def debug_openai():
    info: Dict[str, Any] = {}
    try:
        info["openai_version"] = getattr(openai, "__version__", None)
        info["openai_file"] = getattr(openai, "__file__", None)
    except Exception as e:
        info["openai_version"] = None
        info["openai_file"] = None
        info["openai_version_error"] = type(e).__name__

    try:
        from openai import OpenAI  # type: ignore

        info["has_v1_client_OpenAI"] = True
        info["OpenAI_type"] = str(OpenAI)
    except ImportError:
        info["has_v1_client_OpenAI"] = False
    except Exception as e:
        info["has_v1_client_OpenAI"] = False
        info["OpenAI_import_error"] = type(e).__name__

    return info
