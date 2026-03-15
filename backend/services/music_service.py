"""
Music Generation Service - ElevenLabs Sound Generation API

This service generates background music using:
- ElevenLabs Sound Generation API (PRD Section 8.6)
- FFmpeg for trimming/concatenation

Entry point: generate_music_for_section() returns GeneratedTrack
"""

import logging
import asyncio
import random
import os
import uuid
import httpx
from typing import Optional, List
from .analysis_types import (
    SectionAnalysis,
    GeneratedTrack,
    build_music_prompt,
)
from database import supabase
from config import (
    ELEVENLABS_API_KEY,
    ELEVENLABS_BASE_URL,
    FFMPEG_PATH,
    AUDIO_DIR,
    MUSIC_QUEUE_CONCURRENCY,
    MUSIC_RETRY_MAX,
    MUSIC_RETRY_BASE_DELAY_MS,
)

logger = logging.getLogger("scoreflow.music")

# Set to True once real implementation is ready
USE_REAL_GENERATION = True

# Maximum duration per ElevenLabs API call (seconds)
MAX_CHUNK_DURATION = 30

# Minimum generation duration (API may have issues with very short durations)
MIN_GENERATION_DURATION = 5

# Semaphore for concurrent generation (PRD Section 8.7)
_semaphore = asyncio.Semaphore(MUSIC_QUEUE_CONCURRENCY)

# Ensure audio directory exists
os.makedirs(AUDIO_DIR, exist_ok=True)


async def generate_music_for_section(
    section: dict,
    brief: dict,
    project_id: str,
    prev_section: dict = None,
    next_section: dict = None,
) -> GeneratedTrack:
    """
    Generate music for a single section.

    Args:
        section: Section data from database (includes analysis fields)
        brief: User's creative brief
        project_id: Project UUID
        prev_section: Previous section data for transition context
        next_section: Next section data for transition context

    Returns:
        GeneratedTrack with storage_path and metadata
    """
    if USE_REAL_GENERATION:
        return await _generate_with_retry(section, brief, project_id, prev_section, next_section)
    else:
        logger.info(f"[MUSIC] Mock generation for section {section['id'][:8]}")
        return GeneratedTrack(
            section_id=section["id"],
            storage_path="mock/track.mp3",
            stream_url=None,
            duration=section.get("duration", 10),
            generation_prompt=build_music_prompt(section, brief, prev_section, next_section),
            trimmed_to_fit=False,
        )


# ============================================================================
# REAL IMPLEMENTATION
# ============================================================================

async def _generate_with_retry(
    section: dict,
    brief: dict,
    project_id: str,
    prev_section: dict = None,
    next_section: dict = None,
) -> GeneratedTrack:
    """
    Generate music with retry logic (PRD Section 8.7).

    Uses semaphore for concurrency control and exponential backoff.
    """
    async with _semaphore:
        last_error = None
        for attempt in range(1, MUSIC_RETRY_MAX + 1):
            try:
                return await _generate_music(section, brief, project_id, prev_section, next_section)
            except Exception as e:
                last_error = e
                logger.warning(f"[MUSIC] Attempt {attempt} failed: {e}")
                if attempt == MUSIC_RETRY_MAX:
                    raise
                # Exponential backoff with jitter
                delay = (MUSIC_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1))) / 1000
                delay *= (0.5 + random.random() * 0.5)
                await asyncio.sleep(delay)

        raise last_error


async def _generate_music(
    section: dict,
    brief: dict,
    project_id: str,
    prev_section: dict = None,
    next_section: dict = None,
) -> GeneratedTrack:
    """
    Main music generation flow.

    1. Build prompt (with transition context from neighbors)
    2. Determine if chunking needed (duration > 30s)
    3. Call ElevenLabs API
    4. Trim to exact duration
    5. Upload to storage
    6. Return GeneratedTrack
    """
    section_id = section["id"]
    target_duration = section.get("duration", 10)
    prompt = build_music_prompt(section, brief, prev_section, next_section)

    logger.info(f"[MUSIC] Generating music for section {section_id[:8]}, duration={target_duration:.2f}s")
    logger.info(f"[MUSIC] Prompt: {prompt[:100]}...")

    # Determine generation strategy
    if target_duration > MAX_CHUNK_DURATION:
        # Need to generate multiple chunks and concatenate
        audio_path = await _generate_chunked(section_id, prompt, target_duration)
    else:
        # Single generation
        generation_duration = max(MIN_GENERATION_DURATION, target_duration + 2)  # Request a bit extra
        generation_duration = min(generation_duration, MAX_CHUNK_DURATION)
        audio_path = await _call_elevenlabs(section_id, prompt, generation_duration)

    # Trim to exact duration
    trimmed_path = os.path.join(AUDIO_DIR, f"{section_id}_trimmed.mp3")
    trimmed_to_fit = await trim_audio(audio_path, trimmed_path, target_duration)

    # Clean up original if different from trimmed
    if audio_path != trimmed_path and os.path.exists(audio_path):
        try:
            os.remove(audio_path)
        except Exception:
            pass

    # Upload to Supabase Storage
    storage_path, stream_url = await upload_track_to_storage(
        trimmed_path, project_id, section_id
    )

    # Clean up local file after upload
    if os.path.exists(trimmed_path):
        try:
            os.remove(trimmed_path)
        except Exception:
            pass

    return GeneratedTrack(
        section_id=section_id,
        storage_path=storage_path,
        stream_url=stream_url,
        duration=target_duration,
        generation_prompt=prompt,
        trimmed_to_fit=trimmed_to_fit,
    )


async def _generate_chunked(
    section_id: str,
    prompt: str,
    total_duration: float
) -> str:
    """
    Generate music in chunks for sections longer than 30s.
    """
    logger.info(f"[MUSIC] Chunked generation: {total_duration:.2f}s total")

    chunk_paths = []
    remaining = total_duration
    chunk_idx = 0

    while remaining > 0:
        # Calculate this chunk's duration
        chunk_duration = min(MAX_CHUNK_DURATION, remaining + 2)  # Request a bit extra
        chunk_duration = max(MIN_GENERATION_DURATION, chunk_duration)

        logger.info(f"[MUSIC] Generating chunk {chunk_idx + 1}, duration={chunk_duration:.2f}s")

        chunk_path = await _call_elevenlabs(
            f"{section_id}_chunk{chunk_idx}",
            prompt,
            chunk_duration
        )
        chunk_paths.append(chunk_path)

        remaining -= MAX_CHUNK_DURATION
        chunk_idx += 1

    # Concatenate all chunks
    if len(chunk_paths) == 1:
        return chunk_paths[0]

    output_path = os.path.join(AUDIO_DIR, f"{section_id}_concat.mp3")
    await concatenate_audio_chunks(chunk_paths, output_path)

    # Clean up chunk files
    for path in chunk_paths:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass

    return output_path


async def _call_elevenlabs(
    file_prefix: str,
    prompt: str,
    duration_seconds: float
) -> str:
    """
    Call ElevenLabs Sound Generation API (PRD Section 8.6).

    POST https://api.elevenlabs.io/v1/sound-generation
    {
        "text": "<prompt>",
        "duration_seconds": <duration>,
        "prompt_influence": 0.7
    }

    Returns:
        Path to generated audio file
    """
    url = f"{ELEVENLABS_BASE_URL}/v1/sound-generation"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "text": prompt,
        "duration_seconds": min(duration_seconds, MAX_CHUNK_DURATION),
        "prompt_influence": 0.7,
    }

    logger.info(f"[MUSIC] Calling ElevenLabs API: duration={duration_seconds:.1f}s")

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            error_msg = f"ElevenLabs API error: {response.status_code} - {response.text[:200]}"
            logger.error(f"[MUSIC] {error_msg}")
            raise Exception(error_msg)

        # Response is audio/mpeg binary
        audio_bytes = response.content

        if len(audio_bytes) < 1000:
            error_msg = f"ElevenLabs returned suspiciously small audio: {len(audio_bytes)} bytes"
            logger.error(f"[MUSIC] {error_msg}")
            raise Exception(error_msg)

        logger.info(f"[MUSIC] Received {len(audio_bytes)} bytes from ElevenLabs")

    # Save to temp file
    output_path = os.path.join(AUDIO_DIR, f"{file_prefix}.mp3")
    with open(output_path, "wb") as f:
        f.write(audio_bytes)

    logger.info(f"[MUSIC] Saved audio to {output_path}")
    return output_path


async def trim_audio(
    input_path: str,
    output_path: str,
    duration: float
) -> bool:
    """
    Trim audio to exact duration using FFmpeg (PRD Section 8.6).

    Command:
        ffmpeg -i input.mp3 -t {duration} -c copy output.mp3

    Returns:
        True if trimming was needed, False if audio was shorter than duration
    """
    logger.info(f"[MUSIC] Trimming audio to {duration:.2f}s")

    # First, check the input duration
    probe_proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", input_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, _ = await probe_proc.communicate()

    try:
        input_duration = float(stdout.decode().strip())
    except (ValueError, AttributeError):
        input_duration = duration + 10  # Assume longer if probe fails

    trimmed_to_fit = input_duration > duration

    if not trimmed_to_fit:
        # Audio is shorter than target, just copy it
        logger.info(f"[MUSIC] Audio ({input_duration:.2f}s) shorter than target ({duration:.2f}s), using as-is")
        # Still copy to output path for consistency
        import shutil
        shutil.copy2(input_path, output_path)
        return True  # Mark as trimmed since we're "fitting" it to duration

    # Trim using FFmpeg
    proc = await asyncio.create_subprocess_exec(
        FFMPEG_PATH, "-y", "-i", input_path,
        "-t", str(duration),
        "-c", "copy",
        output_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        error_msg = f"FFmpeg trim failed: {stderr.decode()[:200]}"
        logger.error(f"[MUSIC] {error_msg}")
        raise Exception(error_msg)

    logger.info(f"[MUSIC] Trimmed to {duration:.2f}s successfully")
    return trimmed_to_fit


async def concatenate_audio_chunks(
    chunk_paths: List[str],
    output_path: str
) -> str:
    """
    Concatenate multiple audio chunks for long sections.

    Uses FFmpeg concat demuxer:
        ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp3

    Returns:
        Path to concatenated file
    """
    logger.info(f"[MUSIC] Concatenating {len(chunk_paths)} chunks")

    # Create concat list file
    list_path = os.path.join(AUDIO_DIR, f"concat_{uuid.uuid4().hex[:8]}.txt")
    with open(list_path, "w") as f:
        for path in chunk_paths:
            # Escape single quotes in path and use relative paths
            abs_path = os.path.abspath(path)
            f.write(f"file '{abs_path}'\n")

    try:
        proc = await asyncio.create_subprocess_exec(
            FFMPEG_PATH, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path,
            "-c", "copy",
            output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            error_msg = f"FFmpeg concat failed: {stderr.decode()[:200]}"
            logger.error(f"[MUSIC] {error_msg}")
            raise Exception(error_msg)

        logger.info(f"[MUSIC] Concatenation complete: {output_path}")
        return output_path
    finally:
        # Clean up list file
        if os.path.exists(list_path):
            try:
                os.remove(list_path)
            except Exception:
                pass


async def upload_track_to_storage(
    file_path: str,
    project_id: str,
    section_id: str
) -> tuple[str, str]:
    """
    Upload generated track to Supabase Storage.

    Returns:
        (storage_path, stream_url) tuple
    """
    storage_path = f"tracks/{project_id}/{section_id}.mp3"

    logger.info(f"[MUSIC] Uploading track to Supabase Storage: {storage_path}")

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    try:
        # Try to remove existing file first (in case of regeneration)
        try:
            supabase.storage.from_("media").remove([storage_path])
        except Exception:
            pass  # File may not exist

        supabase.storage.from_("media").upload(
            storage_path,
            file_bytes,
            file_options={"content-type": "audio/mpeg"}
        )

        stream_url = supabase.storage.from_("media").get_public_url(storage_path)
        logger.info(f"[MUSIC] Upload complete: {storage_path}")

        return storage_path, stream_url
    except Exception as e:
        logger.error(f"[MUSIC] Storage upload failed: {e}")
        raise
