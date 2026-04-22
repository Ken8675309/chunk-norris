#!/home/ken/chunk-norris/.venv/bin/python
"""
Chunk Norris - Whisper transcription script
Supports resumable transcription via checkpoint files.
Checkpoint saves every 10 minutes; on retry, resumes from last save.
"""

import sys
import json
import argparse
import os
import subprocess
import tempfile

import torch
from faster_whisper import WhisperModel

CHECKPOINT_INTERVAL_SEC = 600  # save checkpoint every 10 minutes of audio


def trim_audio(audio_path, start_sec):
    """Extract audio from start_sec to end using ffmpeg. Returns temp file path."""
    tmp = tempfile.mktemp(suffix='.wav')
    result = subprocess.run(
        ['ffmpeg', '-y', '-i', audio_path,
         '-ss', str(start_sec),
         '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
         tmp],
        capture_output=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg trim failed: {result.stderr.decode()[-300:]}")
    return tmp


def save_checkpoint(checkpoint_path, segments, last_timestamp):
    try:
        with open(checkpoint_path, 'w') as f:
            json.dump({'segments': segments, 'last_timestamp': last_timestamp}, f)
    except Exception as e:
        print(f"[whisper] Checkpoint save failed: {e}", flush=True)


def load_checkpoint(checkpoint_path):
    try:
        with open(checkpoint_path) as f:
            data = json.load(f)
        segments = data.get('segments', [])
        last_ts = float(data.get('last_timestamp', 0.0))
        print(f"[whisper] Resuming from checkpoint: {last_ts:.1f}s ({len(segments)} segments done)", flush=True)
        return segments, last_ts
    except Exception as e:
        print(f"[whisper] Checkpoint load failed ({e}), starting fresh", flush=True)
        return [], 0.0


def transcribe(audio_path: str, model_size: str = 'large-v3', checkpoint_dir: str = None) -> dict:
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # ── Checkpoint setup ─────────────────────────────────────────────────────
    stem = os.path.splitext(os.path.basename(audio_path))[0]
    checkpoint_path = os.path.join(checkpoint_dir, f"{stem}_checkpoint.json") if checkpoint_dir else None

    previous_segments = []
    resume_timestamp = 0.0

    if checkpoint_path and os.path.exists(checkpoint_path):
        previous_segments, resume_timestamp = load_checkpoint(checkpoint_path)

    # ── Load model ────────────────────────────────────────────────────────────
    device = "cpu"
    compute_type = "int8"
    cpu_threads = 24
    num_workers = 4
    print(f"[whisper] device={device}, compute_type={compute_type}, threads={cpu_threads}", flush=True)

    model = WhisperModel(
        model_size,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
        num_workers=num_workers,
    )

    # ── Trim audio if resuming ────────────────────────────────────────────────
    trimmed_path = None
    audio_to_transcribe = audio_path

    if resume_timestamp > 0:
        print(f"[whisper] Trimming audio from {resume_timestamp:.1f}s for resume", flush=True)
        trimmed_path = trim_audio(audio_path, resume_timestamp)
        audio_to_transcribe = trimmed_path

    # ── Initial prompt from tail of previous transcript ───────────────────────
    initial_prompt = None
    if previous_segments:
        last_text = ' '.join(s['text'] for s in previous_segments[-5:])
        initial_prompt = last_text[-200:] if len(last_text) > 200 else last_text

    # ── Transcribe ────────────────────────────────────────────────────────────
    segments_gen, info = model.transcribe(
        audio_to_transcribe,
        beam_size=5,
        word_timestamps=False,
        vad_filter=True,
        initial_prompt=initial_prompt,
    )

    clip_duration = info.duration if info.duration else 0
    total_duration = clip_duration + resume_timestamp

    segments_out = list(previous_segments)
    full_text_parts = [s['text'] for s in previous_segments]
    last_pct = (resume_timestamp / total_duration * 100) if total_duration > 0 else 0
    last_checkpoint_ts = resume_timestamp

    for seg in segments_gen:
        actual_start = round(seg.start + resume_timestamp, 2)
        actual_end   = round(seg.end   + resume_timestamp, 2)
        text = seg.text.strip()

        segments_out.append({'start': actual_start, 'end': actual_end, 'text': text})
        full_text_parts.append(text)

        if total_duration > 0:
            pct = min(99, (actual_end / total_duration) * 100)
            if pct - last_pct >= 1.5:
                print(f"PROGRESS:{pct:.1f}", flush=True)
                last_pct = pct

        # Save checkpoint every CHECKPOINT_INTERVAL_SEC of audio processed
        if checkpoint_path and (actual_end - last_checkpoint_ts) >= CHECKPOINT_INTERVAL_SEC:
            save_checkpoint(checkpoint_path, segments_out, actual_end)
            last_checkpoint_ts = actual_end
            print(f"[whisper] Checkpoint saved at {actual_end:.1f}s", flush=True)

    # ── Cleanup ───────────────────────────────────────────────────────────────
    if trimmed_path and os.path.exists(trimmed_path):
        os.unlink(trimmed_path)

    if checkpoint_path and os.path.exists(checkpoint_path):
        os.unlink(checkpoint_path)
        print(f"[whisper] Checkpoint deleted (complete)", flush=True)

    print("PROGRESS:100", flush=True)

    result = {
        'text': ' '.join(full_text_parts),
        'segments': segments_out,
        'duration': round(total_duration, 2),
        'language': info.language,
    }
    print(json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('audio_path')
    parser.add_argument('--model', default='large-v3')
    parser.add_argument('--checkpoint-dir', default=None)
    args = parser.parse_args()

    try:
        transcribe(args.audio_path, args.model, args.checkpoint_dir)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
