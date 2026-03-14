"""
Music Generation Service - IMPLEMENT IN feature/music-generation BRANCH

This service generates background music using:
- ElevenLabs Sound Generation API (PRD Section 8.6)
- FFmpeg for trimming/concatenation

Entry point: generate_music_for_section() returns GeneratedTrack
"""

import logging
import asyncio
import random
from typing import Optional
from .analysis_types import (
    SectionAnalysis,
    GeneratedTrack,
    build_music_prompt,
)

logger = logging.getLogger("scoreflow.music")

# Set to True once real implementation is ready
USE_REAL_GENERATION = False

# From config.py (PRD Section 3)
MUSIC_QUEUE_CONCURRENCY = 2
MUSIC_RETRY_MAX = 3
MUSIC_RETRY_BASE_DELAY_MS = 1000

# Semaphore for concurrent generation (PRD Section 8.7)
_semaphore = asyncio.Semaphore(MUSIC_QUEUE_CONCURRENCY)


async def generate_music_for_section(
    section: dict,
    brief: dict,
    project_id: str
) -> GeneratedTrack:
    """
    Generate music for a single section.

    This is called when user clicks "Generate" button.

    Args:
        section: Section data from database (includes analysis fields)
        brief: User's creative brief
        project_id: Project UUID

    Returns:
        GeneratedTrack with storage_path and metadata
    """
    if USE_REAL_GENERATION:
        return await _generate_with_retry(section, brief, project_id)
    else:
        logger.info(f"[MUSIC] Mock generation for section {section['id'][:8]}")
        return GeneratedTrack(
            section_id=section["id"],
            storage_path="mock/track.mp3",
            stream_url=None,
            duration=section.get("duration", 10),
            generation_prompt=build_music_prompt(section, brief),
            trimmed_to_fit=False,
        )


# ============================================================================
# REAL IMPLEMENTATION - TODO IN feature/music-generation BRANCH
# ============================================================================

async def _generate_with_retry(
    section: dict,
    brief: dict,
    project_id: str
) -> GeneratedTrack:
    """
    Generate music with retry logic (PRD Section 8.7).

    Uses semaphore for concurrency control and exponential backoff.
    """
    async with _semaphore:
        for attempt in range(1, MUSIC_RETRY_MAX + 1):
            try:
                return await _call_elevenlabs(section, brief, project_id)
            except Exception as e:
                logger.warning(f"[MUSIC] Attempt {attempt} failed: {e}")
                if attempt == MUSIC_RETRY_MAX:
                    raise
                # Exponential backoff with jitter
                delay = (MUSIC_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1))) / 1000
                delay *= (0.5 + random.random() * 0.5)
                await asyncio.sleep(delay)


async def _call_elevenlabs(
    section: dict,
    brief: dict,
    project_id: str
) -> GeneratedTrack:
    """
    Call ElevenLabs Sound Generation API (PRD Section 8.6).

    POST https://api.elevenlabs.io/v1/sound-generation
    {
        "text": "<prompt>",
        "duration_seconds": <section.duration>,
        "prompt_influence": 0.7
    }

    Steps:
    1. Build prompt using build_music_prompt()
    2. If duration > 30s, split into chunks and concatenate
    3. Call API
    4. Always trim result with FFmpeg to exact section.duration
    5. Upload to Supabase Storage
    6. Return GeneratedTrack

    Note: If generated audio is shorter than section.duration, use as-is.
    Silence fills the remainder during preview/export.
    Set trimmed_to_fit = True. Never retry for duration mismatch.
    """
    raise NotImplementedError("Implement in feature/music-generation branch")


async def trim_audio(
    input_path: str,
    output_path: str,
    duration: float
) -> str:
    """
    Trim audio to exact duration using FFmpeg (PRD Section 8.6).

    Command:
        ffmpeg -i track.mp3 -t {duration} -c copy trimmed.mp3

    Returns:
        Path to trimmed file
    """
    raise NotImplementedError("Implement in feature/music-generation branch")


async def concatenate_audio_chunks(
    chunk_paths: list,
    output_path: str
) -> str:
    """
    Concatenate multiple audio chunks for long sections.

    Used when section.duration > 30s. Each chunk generated with same prompt.

    Returns:
        Path to concatenated file
    """
    raise NotImplementedError("Implement in feature/music-generation branch")


async def upload_track_to_storage(
    file_path: str,
    project_id: str,
    section_id: str
) -> str:
    """
    Upload generated track to Supabase Storage.

    Returns:
        storage_path for database
    """
    raise NotImplementedError("Implement in feature/music-generation branch")
