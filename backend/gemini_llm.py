import os
import json
import re
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")


def _extract_json_object(content: str) -> Dict[str, Any]:
    """
    Best-effort extraction of a JSON object from model output.
    Handles cases where the model wraps JSON in markdown fences.
    """
    if not content:
        raise ValueError("Empty model content")

    text = content.strip()
    text = re.sub(r"^```json\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^```\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]

    return json.loads(text)


def _coerce_int(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        try:
            return int(value)
        except Exception:
            return 0
    # Strings like "85" or "85%"
    s = str(value).strip().replace("%", "")
    try:
        return int(float(s))
    except Exception:
        return 0


def _coerce_string_list(value: Any, max_items: Optional[int] = None) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        items: List[str] = []
        for v in value:
            if v is None:
                continue
            items.append(str(v).strip())
        items = [x for x in items if x]
        return items[: max_items if max_items is not None else len(items)]

    if isinstance(value, str):
        # Split on common delimiters.
        parts = [p.strip() for p in re.split(r"[,;\n]+", value) if p.strip()]
        return parts[: max_items if max_items is not None else len(parts)]

    return [str(value).strip()]


def _find_value_by_key_patterns(obj: Dict[str, Any], patterns: List[str]) -> Any:
    lower_map = {str(k).lower(): k for k in obj.keys()}
    for lower_key, original_key in lower_map.items():
        for pat in patterns:
            if pat in lower_key:
                return obj[original_key]
    return None


def _normalize_candidate_result(raw: Any) -> Dict[str, Any]:
    # Gemini sometimes returns nested wrappers.
    if isinstance(raw, list) and raw:
        raw = raw[0]
    if not isinstance(raw, dict):
        return {"name": "Unknown", "score": 0, "strengths": [], "gaps": [], "summary": "Error: Could not summarize."}

    if "candidate" in raw and isinstance(raw["candidate"], dict):
        raw = raw["candidate"]

    name_val = raw.get("name")
    if name_val is None:
        name_val = _find_value_by_key_patterns(raw, ["candidate name", "candidate", "name"])

    score_val = raw.get("score")
    if score_val is None:
        score_val = _find_value_by_key_patterns(raw, ["match score", "match", "score"])

    strengths_val = raw.get("strengths")
    if strengths_val is None:
        strengths_val = _find_value_by_key_patterns(raw, ["strengths", "top strengths", "strength"])

    gaps_val = raw.get("gaps")
    if gaps_val is None:
        gaps_val = _find_value_by_key_patterns(raw, ["gaps", "top gaps", "gap"])

    summary_val = raw.get("summary")
    if summary_val is None:
        summary_val = _find_value_by_key_patterns(raw, ["summary", "one-line summary", "one line summary"])

    name = str(name_val).strip() if name_val is not None else "Unknown"
    score = _coerce_int(score_val)
    strengths = _coerce_string_list(strengths_val, max_items=3)
    gaps = _coerce_string_list(gaps_val, max_items=2)
    summary = str(summary_val).strip() if summary_val is not None else "Error: Could not summarize."

    # Ensure array sizes.
    strengths = strengths[:3]
    gaps = gaps[:2]

    return {"name": name or "Unknown", "score": score, "strengths": strengths, "gaps": gaps, "summary": summary}


def _gemini_client():
    """
    Lazily import gemini SDK to avoid import errors until the provider is used.
    """
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY is not set")
    import google.generativeai as genai  # type: ignore

    genai.configure(api_key=GOOGLE_API_KEY)
    return genai


def call_gemini_llm(prompt: str) -> dict:
    """
    Screening call: expects the model to output a JSON object matching CandidateResult.
    """
    genai = _gemini_client()
    model_name = os.getenv("GEMINI_MODEL", "models/gemini-2.5-flash")

    try:
        # Hint Gemini to return JSON-only by setting response_mime_type.
        model = genai.GenerativeModel(
            model_name,
            generation_config={"response_mime_type": "application/json", "temperature": 0.2},
        )
        resp = model.generate_content(prompt)
        txt = resp.text or ""
        raw_obj = _extract_json_object(txt)
        return _normalize_candidate_result(raw_obj)
    except Exception as e:
        # Keep the same return shape as openai_llm fallback.
        return {
            "name": "Unknown",
            "score": 0,
            "strengths": [],
            "gaps": [],
            "summary": f"Error: Could not get AI response. ({type(e).__name__})",
        }


def call_gemini_chat(prompt: str) -> str:
    """
    Chat call: returns plain text to be streamed/displayed in the UI.
    """
    genai = _gemini_client()
    model_name = os.getenv("GEMINI_CHAT_MODEL", os.getenv("GEMINI_MODEL", "models/gemini-2.5-flash"))

    resp = genai.GenerativeModel(model_name).generate_content(prompt)
    return resp.text or ""

