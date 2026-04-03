import openai
import os
from dotenv import load_dotenv
import json
import re
import time

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai.api_key = OPENAI_API_KEY

# Real OpenAI LLM call for production

def _extract_json_object(content: str) -> dict:
    """
    Best-effort extraction of a JSON object from model output.
    Handles cases where the model wraps JSON in ```json ... ``` blocks.
    """
    if not content:
        raise ValueError("Empty model content")

    text = content.strip()
    # Strip markdown fences if present
    text = re.sub(r"^```json\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^```\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    # If the output contains extra text, extract the first {...} region.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]

    return json.loads(text)


def call_openai_llm(prompt: str) -> dict:
    max_retries = 3
    for attempt in range(max_retries):
        try:
            # OpenAI SDK v1+: use `OpenAI()` client + `chat.completions.create`.
            # Only fall back to the old SDK if the v1 client cannot be imported.
            try:
                from openai import OpenAI  # type: ignore

                client = OpenAI(api_key=OPENAI_API_KEY)
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are an expert recruiter AI. Respond with valid JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    max_tokens=512,
                    temperature=0.2,
                )
                content = response.choices[0].message.content or ""
                return _extract_json_object(content)
            except ImportError:
                # Backward-compat: OpenAI SDK v0.x
                response = openai.ChatCompletion.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are an expert recruiter AI. Respond with valid JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    max_tokens=512,
                    temperature=0.2,
                )
                content = response.choices[0].message.content or ""
                return _extract_json_object(content)
        except Exception as e:
            print(f"OpenAI LLM error (attempt {attempt + 1}/{max_retries}): {e}")
            # Exponential backoff for transient errors / rate limits
            if attempt < max_retries - 1:
                time.sleep(1.5 * (2**attempt))

    # Final fallback keeps the demo alive if OpenAI errors persist.
    return {
        "name": "Unknown",
        "score": 0,
        "strengths": [],
        "gaps": [],
        "summary": "Error: Could not get AI response.",
    }
