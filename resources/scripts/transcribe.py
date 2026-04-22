#!/home/ken/chunk-norris/.venv/bin/python
"""
Chunk Norris - Whisper transcription script
- Temperature fallback tuple prevents infinite repetition loops at temp=0.0
- Pre-splits files >10 hours into 1-hour chunks to avoid memory issues
- Checkpoint every 10 minutes; resumes from last save on retry
"""

import sys
import json
import argparse
import os
import subprocess
import tempfile
import shutil

from faster_whisper import WhisperModel

CHECKPOINT_INTERVAL_SEC = 600   # save checkpoint every 10 min of audio
LONG_FILE_THRESHOLD_SEC = 36000 # pre-split files longer than 10 hours
CHUNK_SIZE_SEC = 3600           # 1-hour chunks


# ── Audio utilities ───────────────────────────────────────────────────────────

def get_audio_duration(audio_path):
    result = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', audio_path],
        capture_output=True, text=True
    )
    try:
        return float(json.loads(result.stdout)['format']['duration'])
    except Exception:
        return 0.0


def trim_audio(audio_path, start_sec):
    """Extract audio from start_sec to end. Returns temp WAV path."""
    tmp = tempfile.mktemp(suffix='.wav')
    r = subprocess.run(
        ['ffmpeg', '-y', '-i', audio_path,
         '-ss', str(start_sec),
         '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', tmp],
        capture_output=True
    )
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg trim failed: {r.stderr.decode()[-300:]}")
    return tmp


def split_audio_chunks(audio_path):
    """Split audio into CHUNK_SIZE_SEC segments. Returns (tmpdir, [chunk_paths])."""
    tmpdir = tempfile.mkdtemp(prefix='cn_chunks_')
    pattern = os.path.join(tmpdir, 'chunk_%04d.mp3')
    r = subprocess.run(
        ['ffmpeg', '-y', '-i', audio_path,
         '-f', 'segment', '-segment_time', str(CHUNK_SIZE_SEC),
         '-c', 'copy', pattern],
        capture_output=True
    )
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg split failed: {r.stderr.decode()[-300:]}")
    chunks = sorted(os.path.join(tmpdir, f) for f in os.listdir(tmpdir) if f.endswith('.mp3'))
    print(f"[whisper] Split into {len(chunks)} chunks", flush=True)
    return tmpdir, chunks


# ── Checkpoint utilities ──────────────────────────────────────────────────────

def save_checkpoint(path, segments, last_ts):
    try:
        with open(path, 'w') as f:
            json.dump({'segments': segments, 'last_timestamp': last_ts}, f)
    except Exception as e:
        print(f"[whisper] Checkpoint save failed: {e}", flush=True)


def load_checkpoint(path):
    try:
        with open(path) as f:
            data = json.load(f)
        segs = data.get('segments', [])
        ts   = float(data.get('last_timestamp', 0.0))
        print(f"[whisper] Resuming from checkpoint: {ts:.1f}s ({len(segs)} segments)", flush=True)
        return segs, ts
    except Exception as e:
        print(f"[whisper] Checkpoint load failed ({e}), starting fresh", flush=True)
        return [], 0.0


# ── Main transcription ────────────────────────────────────────────────────────

def transcribe(audio_path: str, model_size: str = 'large-v3', checkpoint_dir: str = None):
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    stem = os.path.splitext(os.path.basename(audio_path))[0]
    checkpoint_path = os.path.join(checkpoint_dir, f"{stem}_checkpoint.json") if checkpoint_dir else None

    # Load any existing checkpoint
    previous_segments, resume_timestamp = [], 0.0
    if checkpoint_path and os.path.exists(checkpoint_path):
        previous_segments, resume_timestamp = load_checkpoint(checkpoint_path)

    # Get total duration for progress reporting
    total_duration = get_audio_duration(audio_path)
    if not total_duration and previous_segments:
        total_duration = max(s['end'] for s in previous_segments) + CHUNK_SIZE_SEC
    print(f"[whisper] duration={total_duration:.0f}s model={model_size}", flush=True)

    # Load model
    model = WhisperModel(model_size, device='cpu', compute_type='int8',
                         cpu_threads=24, num_workers=4)

    # Build work list: (audio_path, chunk_offset, resume_within_chunk)
    work_items = []
    tmpdir = None

    if total_duration > LONG_FILE_THRESHOLD_SEC:
        print(f"[whisper] Long file ({total_duration/3600:.1f}h) — pre-splitting into 1-hour chunks", flush=True)
        tmpdir, chunks = split_audio_chunks(audio_path)
        for i, chunk_path in enumerate(chunks):
            chunk_start = i * CHUNK_SIZE_SEC
            chunk_end   = (i + 1) * CHUNK_SIZE_SEC
            if chunk_end <= resume_timestamp:
                print(f"[whisper] Skipping chunk {i+1} (before checkpoint)", flush=True)
                continue
            resume_within = max(0.0, resume_timestamp - chunk_start) if chunk_start < resume_timestamp else 0.0
            work_items.append((chunk_path, chunk_start, resume_within))
    else:
        work_items.append((audio_path, 0.0, resume_timestamp))

    # Accumulate across chunks
    segments_out    = list(previous_segments)
    full_text_parts = [s['text'] for s in previous_segments]
    last_pct        = (resume_timestamp / total_duration * 100) if total_duration > 0 else 0
    last_ckpt_ts    = resume_timestamp
    language        = 'en'

    def tail_prompt():
        if not segments_out:
            return None
        tail = ' '.join(s['text'] for s in segments_out[-5:])
        return tail[-200:] if len(tail) > 200 else tail

    for w_idx, (item_path, chunk_offset, resume_within) in enumerate(work_items):
        audio_to_use = item_path
        actual_offset = chunk_offset
        trim_path = None

        if resume_within > 0:
            print(f"[whisper] Trimming chunk {w_idx+1} from {resume_within:.1f}s", flush=True)
            trim_path = trim_audio(item_path, resume_within)
            audio_to_use = trim_path
            actual_offset = chunk_offset + resume_within

        if len(work_items) > 1:
            print(f"[whisper] Chunk {w_idx+1}/{len(work_items)}, offset={actual_offset:.0f}s", flush=True)

        seg_gen, info = model.transcribe(
            audio_to_use,
            language='en',
            temperature=(0.0, 0.2, 0.4, 0.6, 0.8, 1.0),
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            compression_ratio_threshold=2.4,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
            condition_on_previous_text=True,
            initial_prompt=tail_prompt(),
        )

        language = info.language or language

        for seg in seg_gen:
            actual_start = round(seg.start + actual_offset, 2)
            actual_end   = round(seg.end   + actual_offset, 2)
            text = seg.text.strip()
            if not text:
                continue

            segments_out.append({'start': actual_start, 'end': actual_end, 'text': text})
            full_text_parts.append(text)

            if total_duration > 0:
                pct = min(99, (actual_end / total_duration) * 100)
                if pct - last_pct >= 1.5:
                    print(f"PROGRESS:{pct:.1f}", flush=True)
                    last_pct = pct

            if checkpoint_path and (actual_end - last_ckpt_ts) >= CHECKPOINT_INTERVAL_SEC:
                save_checkpoint(checkpoint_path, segments_out, actual_end)
                last_ckpt_ts = actual_end
                print(f"[whisper] Checkpoint saved at {actual_end:.1f}s", flush=True)

        if trim_path and os.path.exists(trim_path):
            os.unlink(trim_path)

    # Cleanup split chunks
    if tmpdir:
        shutil.rmtree(tmpdir, ignore_errors=True)

    # Delete checkpoint on success
    if checkpoint_path and os.path.exists(checkpoint_path):
        os.unlink(checkpoint_path)
        print(f"[whisper] Checkpoint deleted (complete)", flush=True)

    print("PROGRESS:100", flush=True)

    result = {
        'text': ' '.join(full_text_parts),
        'segments': segments_out,
        'duration': round(total_duration, 2),
        'language': language,
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
