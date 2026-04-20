#!/home/ken/chunk-norris/.venv/bin/python
"""
Chunk Norris - Whisper transcription script
Uses faster-whisper for audio transcription with progress reporting.
"""

import sys
import json
import argparse
import os

import torch
from faster_whisper import WhisperModel


def transcribe(audio_path: str, model_size: str = 'large-v3') -> dict:
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    device = "cpu"
    compute_type = "int8"
    cpu_threads = 24
    num_workers = 4
    print(f"[whisper] Using device: {device}, compute_type: {compute_type}, threads: {cpu_threads}", flush=True)

    model = WhisperModel(
        model_size,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
        num_workers=num_workers,
    )

    segments_out = []
    full_text_parts = []

    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=False,
        vad_filter=True
    )

    # Track progress by duration
    duration = info.duration if info.duration else 0
    last_pct = 0

    for seg in segments:
        segments_out.append({
            'start': round(seg.start, 2),
            'end': round(seg.end, 2),
            'text': seg.text.strip()
        })
        full_text_parts.append(seg.text.strip())

        if duration > 0:
            pct = min(99, (seg.end / duration) * 100)
            if pct - last_pct >= 2:
                print(f"PROGRESS:{pct:.1f}", flush=True)
                last_pct = pct

    print("PROGRESS:100", flush=True)

    result = {
        'text': ' '.join(full_text_parts),
        'segments': segments_out,
        'duration': round(duration, 2),
        'language': info.language
    }
    print(json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('audio_path')
    parser.add_argument('--model', default='large-v3')
    args = parser.parse_args()

    try:
        transcribe(args.audio_path, args.model)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
