#!/usr/bin/env python3
"""
Chunk Norris - First-run Python dependency installer
Installs all required packages into the project venv.
"""

import subprocess
import sys
import os

VENV_PYTHON = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    '.venv', 'bin', 'python'
)

PACKAGES = [
    'faster-whisper',
    'pymupdf',
    'ebooklib',
    'beautifulsoup4',
    'python-docx',
    'odfpy',
    'qdrant-client',
]

def main():
    if os.path.exists(VENV_PYTHON):
        python = VENV_PYTHON
    else:
        python = sys.executable

    print("CHUNK NORRIS :: Installing Python dependencies...")
    print(f"Using Python: {python}")
    print()

    for pkg in PACKAGES:
        print(f"  Installing {pkg}...", end='', flush=True)
        try:
            result = subprocess.run(
                [python, '-m', 'pip', 'install', pkg, '-q'],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                print(' OK')
            else:
                print(f' FAILED\n    {result.stderr.strip()[:200]}')
        except Exception as e:
            print(f' ERROR: {e}')

    print()
    print("Done. Run the app to begin ingesting files.")

if __name__ == '__main__':
    main()
