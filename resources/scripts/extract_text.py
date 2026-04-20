#!/home/ken/chunk-norris/.venv/bin/python
"""
Chunk Norris - Document text extraction script
Supports: PDF (pymupdf), EPUB (ebooklib), DOCX (python-docx), ODT (odfpy)
"""

import sys
import json
import argparse
import os

import fitz
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup
from docx import Document
from odf.opendocument import load
from odf.text import P
from odf import teletype


def extract_pdf(path: str) -> dict:
    doc = fitz.open(path)
    pages_text = [page.get_text() for page in doc]
    metadata = doc.metadata or {}
    return {
        'text': '\n\n'.join(pages_text),
        'metadata': {
            'title': metadata.get('title', ''),
            'author': metadata.get('author', ''),
            'pages': len(doc)
        }
    }


def extract_epub(path: str) -> dict:
    book = epub.read_epub(path)
    chapters = []

    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_DOCUMENT:
            soup = BeautifulSoup(item.get_content(), 'html.parser')
            text = soup.get_text(separator='\n', strip=True)
            if text.strip():
                chapters.append(text)

    title = book.get_metadata('DC', 'title')
    author = book.get_metadata('DC', 'creator')

    return {
        'text': '\n\n'.join(chapters),
        'metadata': {
            'title': title[0][0] if title else '',
            'author': author[0][0] if author else '',
            'chapters': len(chapters)
        }
    }


def extract_docx(path: str) -> dict:
    doc = Document(path)
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    props = doc.core_properties
    return {
        'text': '\n\n'.join(paragraphs),
        'metadata': {
            'title': props.title or '',
            'author': props.author or ''
        }
    }


def extract_odt(path: str) -> dict:
    doc = load(path)
    paragraphs = []
    for p in doc.body.getElementsByType(P):
        text = teletype.extractText(p).strip()
        if text:
            paragraphs.append(text)
    return {
        'text': '\n\n'.join(paragraphs),
        'metadata': {}
    }


EXTRACTORS = {
    'pdf':  extract_pdf,
    'epub': extract_epub,
    'docx': extract_docx,
    'odt':  extract_odt,
}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('file_path')
    parser.add_argument('--format', required=True)
    args = parser.parse_args()

    if not os.path.exists(args.file_path):
        print(json.dumps({'error': f'File not found: {args.file_path}'}))
        sys.exit(1)

    extractor = EXTRACTORS.get(args.format)
    if not extractor:
        print(json.dumps({'error': f'Unsupported format: {args.format}'}))
        sys.exit(1)

    try:
        result = extractor(args.file_path)
        print(json.dumps(result))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
