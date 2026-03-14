"""
Video Analysis Service - IMPLEMENT IN feature/sentiment-analysis BRANCH

This service analyzes video clips using:
- GPT-4o Vision for scene understanding (PRD Section 8.4)
- ElevenLabs STT for speech transcription (PRD Section 8.3)
- FFmpeg for frame extraction (PRD Section 8.1)

Entry point: analyze_video() returns FullAnalysisResult
"""

import logging
from typing import List, Optional
from .analysis_types import (
    SectionAnalysis,
    FullAnalysisResult,
    SECTION_TYPES,
    SCENE_TYPES,
    EMOTIONAL_TONES,
    PACING,
    ENERGY_LEVELS,
)
from .mock_analysis import get_mock_analysis_for_project

logger = logging.getLogger("scoreflow.analysis")

# Set to True once real implementation is ready
USE_REAL_ANALYSIS = False


async def analyze_video(
    clips: List[dict],
    brief: dict,
    project_id: str
) -> FullAnalysisResult:
    """
    Analyze video clips and return section breakdown.

    This is the main entry point called after creative brief submission.
    Follows PRD Section 8 pipeline.

    Args:
        clips: List of clip metadata from database
        brief: User's creative brief (overall_energy, music_style_direction, references_text)
        project_id: Project UUID

    Returns:
        FullAnalysisResult with sections list
    """
    if USE_REAL_ANALYSIS:
        return await _real_analyze_video(clips, brief, project_id)
    else:
        logger.info(f"[ANALYSIS] Using mock analysis for project {project_id[:8]}")
        # Create mock sections from clips
        mock_sections = _create_mock_sections_from_clips(clips)
        analyses = get_mock_analysis_for_project(mock_sections)
        return FullAnalysisResult(sections=analyses, analysis_mode="FALLBACK")


def _create_mock_sections_from_clips(clips: List[dict]) -> List[dict]:
    """
    Create mock section data from clips.
    Follows PRD Section 8.5 fallback logic: 4 equal sections.
    """
    if not clips:
        return []

    total_duration = sum(c.get("duration", 0) for c in clips)
    section_duration = total_duration / 4

    fallback_types = ["Hook", "Build", "Climax", "Outro"]
    sections = []

    for i, section_type in enumerate(fallback_types):
        sections.append({
            "id": f"mock-section-{i}",
            "start_time": i * section_duration,
            "end_time": (i + 1) * section_duration,
            "duration": section_duration,
            "section_type": section_type,
            "scene_type": "Vlog/Casual",
            "emotional_tone": "Energetic",
            "pacing": "Medium",
            "energy_level": "Medium",
            "cuts_per_second": 0.5,
            "detected_theme": "Scene analysis pending",
            "dominant_visual": "Pending",
            "suggested_music_style": "Style pending",
        })

    return sections


# ============================================================================
# REAL IMPLEMENTATION - TODO IN feature/sentiment-analysis BRANCH
# ============================================================================

async def _real_analyze_video(
    clips: List[dict],
    brief: dict,
    project_id: str
) -> FullAnalysisResult:
    """
    Real implementation - implement in feature/sentiment-analysis branch.

    Pipeline (PRD Section 8):
    1. Extract frames (8.1) - FFmpeg, 1 fps, 256x144, cap at 120 frames
    2. Compute cut density (8.2) - rolling 5-second windows
    3. Transcribe audio (8.3) - ElevenLabs STT per clip
    4. Call GPT-4o Vision (8.4) - send frames + transcript + brief
    5. Parse response into SectionAnalysis list
    6. If GPT-4o fails/times out (>35s), use fallback (8.5)
    """
    raise NotImplementedError("Implement in feature/sentiment-analysis branch")


async def extract_analysis_frames(clip_path: str) -> List[str]:
    """
    Extract frames for GPT-4o analysis (PRD Section 8.1 Pass 1).

    Command:
        ffmpeg -i clip.mp4 -vf "fps=1,scale=256:144" -q:v 8 frames/clip_N_%04d.jpg

    Cap at MAX_ANALYSIS_FRAMES (120) total across all clips.

    Returns:
        List of paths to extracted frame images (base64 encoded for API)
    """
    raise NotImplementedError("Implement in feature/sentiment-analysis branch")


async def compute_cut_density(clips: List[dict]) -> List[dict]:
    """
    Compute cuts per second in rolling 5-second windows (PRD Section 8.2).

    Uses clip metadata only, no FFmpeg.

    Returns:
        List of {window_start, window_end, cuts_per_second}
    """
    raise NotImplementedError("Implement in feature/sentiment-analysis branch")


async def transcribe_clip(clip_path: str) -> Optional[str]:
    """
    Transcribe a single clip using ElevenLabs STT (PRD Section 8.3).

    POST https://api.elevenlabs.io/v1/speech-to-text
    Request word-level timestamps.

    Returns:
        Transcription text with timestamps, or None if no speech
    """
    raise NotImplementedError("Implement in feature/sentiment-analysis branch")


async def call_gpt4o_vision(
    frames: List[str],
    transcript: str,
    cut_density: List[dict],
    brief: dict
) -> List[SectionAnalysis]:
    """
    Call GPT-4o Vision API (PRD Section 8.4).

    POST https://api.openai.com/v1/chat/completions
    model: gpt-4o
    Timeout: 35 seconds

    Prompt must include:
    - Creative brief (overall_energy, music_style_direction, references_text)
    - Instructions to divide into 3-5 sections at clip boundaries
    - Cut density interpretation guide
    - Exact JSON output format

    AI must return values from SECTION_TYPES, SCENE_TYPES, EMOTIONAL_TONES, PACING, ENERGY_LEVELS.

    Returns:
        List of SectionAnalysis parsed from GPT-4o response
    """
    raise NotImplementedError("Implement in feature/sentiment-analysis branch")


def get_fallback_sections(clips: List[dict]) -> List[SectionAnalysis]:
    """
    Fallback when GPT-4o fails (PRD Section 8.5).

    Divide into 4 equal sections at clip boundaries:
    - Section 1: Hook
    - Section 2: Build
    - Section 3: Climax
    - Section 4: Outro

    All sections get: scene_type="Vlog/Casual", emotional_tone="Energetic",
    pacing="Medium", energy_level="Medium"
    """
    raise NotImplementedError("Implement in feature/sentiment-analysis branch")
