import pdfplumber
from typing import Optional

# Extract text from a PDF file

def extract_text_from_pdf(file) -> Optional[str]:
    try:
        with pdfplumber.open(file) as pdf:
            text = "\n".join(page.extract_text() or '' for page in pdf.pages)
        return text
    except Exception as e:
        print(f"PDF extraction error: {e}")
        return None
