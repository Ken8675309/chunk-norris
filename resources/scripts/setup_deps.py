#!/usr/bin/env python3
"""
Chunk Norris - First-run Python dependency installer
Run this once to install all required Python packages.
"""

import subprocess
import sys

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
    print("CHUNK NORRIS :: Installing Python dependencies...")
    print(f"Using Python: {sys.executable}")
    print()

    for pkg in PACKAGES:
        print(f"  Installing {pkg}...", end='', flush=True)
        try:
            result = subprocess.run(
                [sys.executable, '-m', 'pip', 'install', pkg, '-q'],
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
