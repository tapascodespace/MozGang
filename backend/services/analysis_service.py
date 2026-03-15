"""
Video Analysis Service - Phase 2 Implementation

This service analyzes video clips using:
- GPT-4o Vision for scene understanding (PRD Section 8.4)
- ElevenLabs STT for speech transcription (PRD Section 8.3)
- FFmpeg for frame extraction (PRD Section 8.1)

Entry point: analyze_video() returns FullAnalysisResult
"""

import asyncio
import aiohttp
import base64
import json
import logging
import os
import re
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

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

# Set to True to enable real AI analysis (set False for development/testing)
USE_REAL_ANALYSIS = True

# Constants from PRD
MAX_ANALYSIS_FRAMES = 120  # Cap total frames sent to GPT-4o
GPT4O_TIMEOUT_SECONDS = 35  # Timeout triggers fallback
FRAMES_PER_GPT_REQUEST = 12  # Limit frames sent to avoid token overflow (reduced for API limits)
MAX_TRANSCRIPT_CHARS = 2000  # Truncate transcript to avoid token overflow
MAX_DURATION_FOR_ANALYSIS = 180  # Skip AI analysis for content longer than 3 minutes
LONG_CLIP_THRESHOLD = 30  # Clips longer than this get reduced frame rate
LONG_CLIP_FRAME_INTERVAL = 3  # Extract 1 frame every N seconds for long clips


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
# REAL IMPLEMENTATION - PRD SECTIONS 8.1-8.5
# ============================================================================

async def _real_analyze_video(
    clips: List[dict],
    brief: dict,
    project_id: str
) -> FullAnalysisResult:
    """
    Real implementation of video analysis pipeline.

    Pipeline (PRD Section 8):
    1. Extract frames (8.1) - FFmpeg, 1 fps, 256x144, cap at 120 frames
    2. Compute cut density (8.2) - rolling 5-second windows
    3. Transcribe audio (8.3) - ElevenLabs STT per clip
    4. Call GPT-4o Vision (8.4) - send frames + transcript + brief
    5. Parse response into SectionAnalysis list
    6. If GPT-4o fails/times out (>35s), use fallback (8.5)
    """
    total_duration = sum(c.get("duration", 0) for c in clips)

    logger.info(f"[ANALYSIS] ========== Starting real analysis for project {project_id[:8]} ==========")
    logger.info(f"[ANALYSIS] Clips: {len(clips)}, Total duration: {total_duration:.1f}s, Brief: energy={brief.get('overall_energy')}, style={brief.get('music_style_direction')}")

    # Skip AI analysis for very long videos
    if total_duration > MAX_DURATION_FOR_ANALYSIS:
        logger.warning(f"[ANALYSIS] Video too long ({total_duration:.1f}s > {MAX_DURATION_FOR_ANALYSIS}s), using fallback")
        fallback_sections = get_fallback_sections(clips)
        return FullAnalysisResult(sections=fallback_sections, analysis_mode="FALLBACK")

    try:
        # Step 1 & 3: Extract frames and transcribe in parallel
        logger.info("[ANALYSIS] Starting parallel frame extraction and transcription...")

        frames_task = asyncio.create_task(_extract_all_frames(clips, project_id))
        transcripts_task = asyncio.create_task(_transcribe_all_clips(clips))

        # Step 2: Compute cut density (fast, no I/O)
        cut_density = compute_cut_density(clips)
        logger.info(f"[ANALYSIS] Cut density computed: {len(cut_density)} windows")

        # Wait for parallel tasks
        all_frames, all_transcripts = await asyncio.gather(frames_task, transcripts_task)

        logger.info(f"[ANALYSIS] Frame extraction complete: {len(all_frames)} frames")
        logger.info(f"[ANALYSIS] Transcription complete: {len(all_transcripts)} clips transcribed")

        # Merge transcripts with clip time offsets
        merged_transcript = _merge_transcripts(clips, all_transcripts)
        logger.info(f"[ANALYSIS] Merged transcript: {len(merged_transcript)} characters")

        # Truncate transcript to avoid token overflow
        if len(merged_transcript) > MAX_TRANSCRIPT_CHARS:
            merged_transcript = merged_transcript[:MAX_TRANSCRIPT_CHARS] + "... [truncated]"
            logger.info(f"[ANALYSIS] Transcript truncated to {MAX_TRANSCRIPT_CHARS} chars")

        # Step 4: Call GPT-4o Vision
        logger.info("[ANALYSIS] Calling GPT-4o Vision...")
        sections = await call_gpt4o_vision(
            frames=all_frames,
            transcript=merged_transcript,
            cut_density=cut_density,
            brief=brief,
            clips=clips
        )

        # Validate and align sections to clip boundaries
        sections = _align_sections_to_clips(sections, clips)

        logger.info(f"[ANALYSIS] ========== Analysis complete: {len(sections)} sections (AI mode) ==========")
        return FullAnalysisResult(sections=sections, analysis_mode="AI")

    except Exception as e:
        logger.error(f"[ANALYSIS] ✗ Analysis failed: {e}")
        logger.info("[ANALYSIS] Falling back to automatic segmentation (PRD Section 8.5)")

        fallback_sections = get_fallback_sections(clips)
        return FullAnalysisResult(sections=fallback_sections, analysis_mode="FALLBACK")


async def _extract_all_frames(clips: List[dict], project_id: str) -> List[str]:
    """
    Extract analysis frames from all clips.
    Returns list of base64-encoded frame images.
    Uses reduced frame rate for long clips.
    """
    from config import FRAMES_DIR, UPLOAD_DIR

    all_frames = []
    total_duration = sum(c.get("duration", 0) for c in clips)

    # For long videos, we want fewer total frames
    target_total_frames = min(MAX_ANALYSIS_FRAMES, max(10, int(total_duration / 3)))  # ~1 frame per 3 seconds

    for clip in clips:
        clip_duration = clip.get("duration", 0)
        # Allocate frames proportionally
        clip_frame_budget = max(1, int((clip_duration / total_duration) * target_total_frames))

        clip_path = os.path.join(UPLOAD_DIR, clip.get("filename", ""))

        # Check if file exists locally, otherwise try to download from Supabase
        if not os.path.exists(clip_path):
            storage_path = clip.get("storage_path", "")
            if storage_path:
                clip_path = await _download_clip_from_storage(storage_path, clip.get("filename", ""))

        if clip_path and os.path.exists(clip_path):
            frames = await extract_analysis_frames(clip_path, clip_frame_budget)
            all_frames.extend(frames)
        else:
            logger.warning(f"[ANALYSIS] Clip file not found: {clip.get('filename')}")

    # Final limit to stay well under token limits
    max_frames_for_api = 20  # Hard limit for API calls
    if len(all_frames) > max_frames_for_api:
        step = len(all_frames) / max_frames_for_api
        all_frames = [all_frames[int(i * step)] for i in range(max_frames_for_api)]
        logger.info(f"[ANALYSIS] Subsampled to {max_frames_for_api} frames for API")

    return all_frames


async def _download_clip_from_storage(storage_path: str, filename: str) -> Optional[str]:
    """Download clip from Supabase storage to local temp directory."""
    from config import UPLOAD_DIR
    from database import supabase

    try:
        local_path = os.path.join(UPLOAD_DIR, filename)

        # Download from Supabase storage
        response = supabase.storage.from_("media").download(storage_path)

        with open(local_path, "wb") as f:
            f.write(response)

        logger.info(f"[ANALYSIS] Downloaded clip from storage: {filename}")
        return local_path
    except Exception as e:
        logger.error(f"[ANALYSIS] Failed to download clip: {e}")
        return None


async def extract_analysis_frames(
    clip_path: str,
    max_frames: int = 30,
    start_time: float = None,
    end_time: float = None
) -> List[str]:
    """
    Extract frames for GPT-4o analysis (PRD Section 8.1 Pass 1).

    Args:
        clip_path: Path to video file
        max_frames: Maximum frames to extract
        start_time: Optional start time in seconds (for section-specific extraction)
        end_time: Optional end time in seconds (for section-specific extraction)

    Returns:
        List of base64-encoded frame images
    """
    from config import FRAMES_DIR

    # Create unique temp directory for this extraction
    temp_dir = os.path.join(FRAMES_DIR, f"analysis_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # Get video duration
        full_duration = await _get_video_duration(clip_path)
        if full_duration <= 0:
            full_duration = 60  # Default fallback

        # Calculate segment duration
        if start_time is not None and end_time is not None:
            segment_duration = end_time - start_time
        else:
            segment_duration = full_duration
            start_time = 0

        # For long clips, reduce frame rate
        if segment_duration > LONG_CLIP_THRESHOLD:
            # 1 frame every 3 seconds for long clips
            target_fps = 1.0 / LONG_CLIP_FRAME_INTERVAL
            logger.info(f"[ANALYSIS] Long segment ({segment_duration:.1f}s), using {target_fps:.2f} fps")
        else:
            # Normal: aim for max_frames spread across duration
            target_fps = min(1.0, max_frames / segment_duration)

        output_pattern = os.path.join(temp_dir, "frame_%04d.jpg")

        # Build ffmpeg command with optional time range
        cmd = ["ffmpeg"]
        if start_time and start_time > 0:
            cmd.extend(["-ss", str(start_time)])
        cmd.extend(["-i", clip_path])
        if end_time and start_time:
            cmd.extend(["-t", str(segment_duration)])
        cmd.extend([
            "-vf", f"fps={target_fps},scale=256:144",
            "-q:v", "8",
            "-y",
            output_pattern
        ])

        logger.debug(f"[ANALYSIS] FFmpeg command: {' '.join(cmd)}")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60)

        if process.returncode != 0:
            logger.error(f"[ANALYSIS] FFmpeg frame extraction failed: {stderr.decode()[:500]}")
            return []

        # Collect and encode frames
        frames = []
        frame_files = sorted(Path(temp_dir).glob("frame_*.jpg"))

        for frame_file in frame_files[:max_frames]:
            with open(frame_file, "rb") as f:
                frame_data = f.read()
                frames.append(base64.b64encode(frame_data).decode("utf-8"))

        logger.info(f"[ANALYSIS] Extracted {len(frames)} frames from {os.path.basename(clip_path)} (segment: {start_time:.1f}s-{end_time or full_duration:.1f}s)")
        return frames

    except asyncio.TimeoutError:
        logger.error(f"[ANALYSIS] Frame extraction timed out for {clip_path}")
        return []
    except Exception as e:
        logger.error(f"[ANALYSIS] Frame extraction error: {e}")
        return []
    finally:
        # Cleanup temp directory
        try:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass


async def _get_video_duration(video_path: str) -> float:
    """Get video duration using ffprobe."""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=10)
        return float(stdout.decode().strip())
    except Exception:
        return 0.0


async def _extract_single_frame(clip_path: str, timestamp: float) -> Optional[str]:
    """
    Extract a single frame at a specific timestamp from a video file.

    Args:
        clip_path: Path to video file
        timestamp: Time in seconds within the clip

    Returns:
        Base64-encoded JPEG frame, or None on failure
    """
    from config import FRAMES_DIR

    temp_path = os.path.join(FRAMES_DIR, f"shot_{uuid.uuid4().hex[:8]}.jpg")

    try:
        cmd = [
            "ffmpeg",
            "-ss", str(max(0, timestamp)),
            "-i", clip_path,
            "-frames:v", "1",
            "-vf", "scale=256:144",
            "-q:v", "8",
            "-y",
            temp_path
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        await asyncio.wait_for(process.communicate(), timeout=10)

        if process.returncode == 0 and os.path.exists(temp_path):
            with open(temp_path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        return None

    except Exception as e:
        logger.warning(f"[ANALYSIS] Failed to extract frame at {timestamp:.1f}s: {e}")
        return None
    finally:
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass


async def _extract_per_shot_frames(
    clips: List[dict],
    scene_changes: List[float],
    max_frames: int = 16
) -> List[str]:
    """
    Extract one representative frame per shot segment for scenic content.

    Instead of evenly-spaced frames (which may miss distinct shots),
    this extracts a frame from the midpoint of each shot segment between
    consecutive cuts. This gives GPT-4o visual coverage of every distinct shot.

    Args:
        clips: List of clip metadata with start_time, end_time, filename
        scene_changes: Sorted list of all cut timestamps (absolute timeline)
        max_frames: Maximum frames to return

    Returns:
        List of base64-encoded JPEG frames in chronological order
    """
    from config import UPLOAD_DIR

    if not scene_changes:
        return []

    total_duration = max(c.get("end_time", 0) for c in clips) if clips else 0
    if total_duration <= 0:
        return []

    # Build shot segments: intervals between consecutive cuts
    # Include 0 and total_duration as boundaries
    boundaries = sorted(set([0.0] + list(scene_changes) + [total_duration]))
    segments = []
    for i in range(len(boundaries) - 1):
        seg_start = boundaries[i]
        seg_end = boundaries[i + 1]
        duration = seg_end - seg_start
        if duration >= 0.5:  # Skip very short segments
            midpoint = (seg_start + seg_end) / 2
            segments.append({"start": seg_start, "end": seg_end, "mid": midpoint})

    if not segments:
        return []

    # If too many segments, subsample evenly
    if len(segments) > max_frames:
        step = len(segments) / max_frames
        segments = [segments[int(i * step)] for i in range(max_frames)]

    logger.info(f"[ANALYSIS] Extracting {len(segments)} per-shot frames from {len(scene_changes)} cuts")

    # Extract one frame per segment
    frames = []
    for seg in segments:
        midpoint = seg["mid"]

        # Find which clip contains this midpoint
        target_clip = None
        clip_offset = 0.0
        for clip in clips:
            clip_start = clip.get("start_time", 0)
            clip_end = clip.get("end_time", 0)
            if clip_start <= midpoint < clip_end:
                target_clip = clip
                clip_offset = midpoint - clip_start
                break

        if not target_clip:
            continue

        # Get clip file path
        clip_path = os.path.join(UPLOAD_DIR, target_clip.get("filename", ""))
        if not os.path.exists(clip_path):
            storage_path = target_clip.get("storage_path", "")
            if storage_path:
                clip_path = await _download_clip_from_storage(storage_path, target_clip.get("filename", ""))

        if clip_path and os.path.exists(clip_path):
            frame = await _extract_single_frame(clip_path, clip_offset)
            if frame:
                frames.append(frame)

    logger.info(f"[ANALYSIS] Extracted {len(frames)} per-shot frames")
    return frames


def compute_cut_density(clips: List[dict]) -> List[dict]:
    """
    Compute cuts per second in rolling 5-second windows (PRD Section 8.2).

    Uses clip metadata only, no FFmpeg.
    A "cut" is a clip boundary (start or end of a clip).

    Returns:
        List of {window_start, window_end, cuts_per_second}
    """
    if not clips:
        return []

    # Calculate total duration
    total_duration = max(c.get("end_time", 0) for c in clips)
    if total_duration <= 0:
        return []

    # Collect all cut points (clip boundaries)
    cut_points = set()
    for clip in clips:
        cut_points.add(clip.get("start_time", 0))
        cut_points.add(clip.get("end_time", 0))
    cut_points = sorted(cut_points)

    # Rolling 5-second windows
    window_size = 5.0
    windows = []

    window_start = 0.0
    while window_start < total_duration:
        window_end = min(window_start + window_size, total_duration)
        window_duration = window_end - window_start

        # Count cuts within this window
        cuts_in_window = sum(
            1 for cp in cut_points
            if window_start < cp < window_end  # Exclude boundaries at window edges
        )

        cuts_per_second = cuts_in_window / window_duration if window_duration > 0 else 0

        windows.append({
            "window_start": round(window_start, 2),
            "window_end": round(window_end, 2),
            "cuts_per_second": round(cuts_per_second, 3)
        })

        window_start += window_size

    return windows


async def _transcribe_all_clips(clips: List[dict]) -> List[Optional[str]]:
    """
    Transcribe all clips in parallel.
    Returns list of transcripts (None if transcription failed).
    """
    from config import UPLOAD_DIR

    tasks = []
    for clip in clips:
        clip_path = os.path.join(UPLOAD_DIR, clip.get("filename", ""))

        # Check if file exists, otherwise note for later
        if os.path.exists(clip_path):
            tasks.append(transcribe_clip(clip_path))
        else:
            # Try with storage path
            storage_path = clip.get("storage_path", "")
            tasks.append(_transcribe_from_storage(storage_path, clip.get("filename", "")))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    transcripts = []
    for result in results:
        if isinstance(result, Exception):
            logger.warning(f"[ANALYSIS] Transcription error: {result}")
            transcripts.append(None)
        else:
            transcripts.append(result)

    return transcripts


async def _transcribe_from_storage(storage_path: str, filename: str) -> Optional[str]:
    """Download and transcribe a clip from storage."""
    from config import UPLOAD_DIR

    local_path = await _download_clip_from_storage(storage_path, filename)
    if local_path:
        return await transcribe_clip(local_path)
    return None


async def transcribe_clip(clip_path: str) -> Optional[str]:
    """
    Transcribe a single clip using ElevenLabs STT (PRD Section 8.3).

    POST https://api.elevenlabs.io/v1/speech-to-text
    Request word-level timestamps.

    Returns:
        Transcription text with timestamps, or None if no speech
    """
    from config import ELEVENLABS_API_KEY, ELEVENLABS_BASE_URL

    if not ELEVENLABS_API_KEY:
        logger.warning("[ANALYSIS] ElevenLabs API key not configured, skipping transcription")
        return None

    url = f"{ELEVENLABS_BASE_URL}/v1/speech-to-text"

    try:
        # Read video file
        with open(clip_path, "rb") as f:
            file_data = f.read()

        # Prepare multipart form data
        data = aiohttp.FormData()
        data.add_field("file", file_data, filename=os.path.basename(clip_path))
        data.add_field("model_id", "scribe_v1")
        data.add_field("language_code", "en")

        headers = {
            "xi-api-key": ELEVENLABS_API_KEY
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=data, headers=headers, timeout=aiohttp.ClientTimeout(total=120)) as response:
                if response.status == 200:
                    result = await response.json()

                    # Extract text from response
                    # ElevenLabs returns: {"text": "...", "words": [...]}
                    text = result.get("text", "")

                    # Format with word timestamps if available
                    words = result.get("words", [])
                    if words:
                        # Create timestamped transcript
                        formatted_parts = []
                        for word_info in words:
                            word = word_info.get("text", "")
                            start = word_info.get("start", 0)
                            formatted_parts.append(f"[{start:.1f}s] {word}")
                        text = " ".join(formatted_parts)

                    logger.info(f"[ANALYSIS] Transcribed {os.path.basename(clip_path)}: {len(text)} chars")
                    return text if text else None
                else:
                    error_text = await response.text()
                    logger.error(f"[ANALYSIS] ElevenLabs STT error {response.status}: {error_text[:200]}")
                    return None

    except asyncio.TimeoutError:
        logger.error(f"[ANALYSIS] Transcription timed out for {clip_path}")
        return None
    except Exception as e:
        logger.error(f"[ANALYSIS] Transcription error: {e}")
        return None


def _merge_transcripts(clips: List[dict], transcripts: List[Optional[str]]) -> str:
    """
    Merge transcripts with clip time offsets to produce full timeline transcript.
    """
    merged_parts = []

    for clip, transcript in zip(clips, transcripts):
        if transcript:
            start_time = clip.get("start_time", 0)
            # Add clip offset annotation
            merged_parts.append(f"[Clip at {start_time:.1f}s]: {transcript}")

    return "\n".join(merged_parts) if merged_parts else ""


async def _create_smart_sections_from_transcript(
    frames: List[str],
    transcript: str,
    brief: dict,
    clips: List[dict],
    gold_standard_style: str,
    video_structure: str,
    total_duration: float,
    scene_changes: List[float] = None
) -> List[SectionAnalysis]:
    """
    Create intelligent sections by analyzing transcript for topic changes.

    For talking head / vlog content, we:
    1. Find intro phrases (beginning)
    2. Detect topic shifts in transcript
    3. Find outro phrases (ending)
    4. Place section boundaries near visual cuts that align with topic changes

    Args:
        frames: Sample frames from the video
        transcript: Full transcript with timestamps
        brief: User's creative brief
        clips: List of clip metadata
        gold_standard_style: Confirmed music style
        video_structure: Detected video type
        total_duration: Total video duration
        scene_changes: List of detected cut timestamps

    Returns:
        List of 2-3 SectionAnalysis objects
    """
    # Parse transcript to extract timestamps and text
    transcript_segments = _parse_transcript_timestamps(transcript)
    clean_transcript = clean_transcript_timestamps(transcript)

    # Find logical section boundaries based on transcript content
    boundaries = _find_transcript_boundaries(
        transcript_segments,
        scene_changes or [],
        total_duration
    )

    logger.info(f"[ANALYSIS] Found {len(boundaries)} boundaries from transcript analysis: {boundaries}")

    # Determine base emotional tone from brief
    base_tone = "Informative"
    base_pacing = "Medium"
    base_energy = "Medium"

    energy_str = brief.get("overall_energy", "").lower()
    if energy_str in ("chill", "calm", "relaxed"):
        base_tone = "Calm"
        base_pacing = "Slow"
        base_energy = "Low"
    elif energy_str in ("energetic", "upbeat", "high"):
        base_tone = "Uplifting"
        base_pacing = "Medium"
        base_energy = "Medium High"

    # Use gold standard style
    suggested_style = gold_standard_style or brief.get("music_style_direction", "Background music")

    # Scene type based on video structure
    scene_type = "Vlog/Casual"
    if video_structure == "Tutorial":
        scene_type = "Tutorial"
    elif video_structure == "Interview":
        scene_type = "Interview"

    # Create sections based on boundaries
    sections = []

    # If we found meaningful boundaries, use them
    if len(boundaries) >= 1:
        all_points = [0.0] + boundaries + [total_duration]

        section_configs = [
            ("Intro", "Uplifting", "Introduction and setup"),
            ("Demonstration", base_tone, "Main content"),
            ("Outro", "Calm", "Conclusion and wrap-up"),
        ]

        for i in range(len(all_points) - 1):
            start = all_points[i]
            end = all_points[i + 1]

            if i < len(section_configs):
                section_type, tone, theme = section_configs[i]
            else:
                section_type = "Setup"
                tone = base_tone
                theme = "Content"

            sections.append(SectionAnalysis(
                start_time=round(start, 2),
                end_time=round(end, 2),
                section_type=section_type,
                scene_type=scene_type,
                emotional_tone=tone,
                pacing=base_pacing,
                energy_level=base_energy,
                cuts_per_second=0.2,
                detected_theme=theme,
                dominant_visual=f"{video_structure} content",
                suggested_music_style=suggested_style
            ))
            logger.info(f"[ANALYSIS] Section {i}: {section_type} {start:.1f}-{end:.1f}s")
    else:
        # Fallback: create intro (15%), main (70%), outro (15%)
        intro_end = total_duration * 0.15
        outro_start = total_duration * 0.85

        sections = [
            SectionAnalysis(
                start_time=0.0,
                end_time=round(intro_end, 2),
                section_type="Intro",
                scene_type=scene_type,
                emotional_tone="Uplifting",
                pacing=base_pacing,
                energy_level=base_energy,
                cuts_per_second=0.2,
                detected_theme="Introduction",
                dominant_visual=f"{video_structure} content",
                suggested_music_style=suggested_style
            ),
            SectionAnalysis(
                start_time=round(intro_end, 2),
                end_time=round(outro_start, 2),
                section_type="Demonstration",
                scene_type=scene_type,
                emotional_tone=base_tone,
                pacing=base_pacing,
                energy_level=base_energy,
                cuts_per_second=0.2,
                detected_theme="Main content",
                dominant_visual=f"{video_structure} content",
                suggested_music_style=suggested_style
            ),
            SectionAnalysis(
                start_time=round(outro_start, 2),
                end_time=round(total_duration, 2),
                section_type="Outro",
                scene_type=scene_type,
                emotional_tone="Calm",
                pacing="Slow",
                energy_level="Low",
                cuts_per_second=0.2,
                detected_theme="Conclusion",
                dominant_visual=f"{video_structure} content",
                suggested_music_style=suggested_style
            ),
        ]
        logger.info(f"[ANALYSIS] Created 3 sections using percentage splits")

    return sections


def _parse_transcript_timestamps(transcript: str) -> List[dict]:
    """
    Parse transcript to extract timestamps and corresponding text.

    ElevenLabs format: "[0.6s] Welcome [0.9s] to [1.0s] my [1.1s] video..."

    Returns:
        List of {timestamp: float, text: str} entries
    """
    segments = []

    # Match timestamp patterns like [0.6s] or [12.34s]
    pattern = r'\[(\d+\.?\d*)s?\]'
    parts = re.split(pattern, transcript)

    current_time = 0.0
    for i in range(len(parts)):
        part = parts[i].strip()
        if not part:
            continue

        # Check if this is a timestamp
        try:
            timestamp = float(part)
            current_time = timestamp
        except ValueError:
            # This is text content
            if part and current_time >= 0:
                segments.append({
                    "timestamp": current_time,
                    "text": part
                })

    return segments


def _find_transcript_boundaries(
    segments: List[dict],
    scene_changes: List[float],
    total_duration: float
) -> List[float]:
    """
    Find logical section boundaries by analyzing transcript content.

    Looks for:
    1. Intro phrases in first 20% of video
    2. Outro/conclusion phrases in last 20% of video
    3. Topic transitions (e.g., "now let's talk about", "moving on to")

    Then finds nearby visual cuts to align boundaries.

    Returns:
        List of boundary timestamps (1-2 boundaries for 2-3 sections)
    """
    if not segments:
        return []

    boundaries = []

    # Combine all segment text with timestamps
    transcript_with_times = []
    for seg in segments:
        transcript_with_times.append((seg["timestamp"], seg["text"].lower()))

    # Look for intro end - phrases that signal intro is over
    intro_end_phrases = [
        "today", "in this video", "let me show you", "let's get started",
        "let's begin", "let's dive in", "let's go", "so basically",
        "welcome to", "my name is", "i'm going to", "i'll be showing"
    ]

    # Look for outro start - phrases that signal conclusion
    outro_phrases = [
        "thank you", "thanks for watching", "see you", "bye",
        "that's it", "that's all", "hope you enjoyed", "subscribe",
        "comment below", "let me know", "in conclusion", "to wrap up",
        "finally", "lastly", "in summary"
    ]

    # Topic transition phrases
    transition_phrases = [
        "now let's", "moving on", "next up", "another thing",
        "also", "additionally", "the next", "after that",
        "so then", "and then", "but first"
    ]

    intro_end_time = None
    outro_start_time = None

    # Find intro end (in first 30% of video)
    intro_cutoff = total_duration * 0.30
    for timestamp, text in transcript_with_times:
        if timestamp > intro_cutoff:
            break
        if timestamp > 5:  # Skip very beginning
            for phrase in intro_end_phrases:
                if phrase in text:
                    intro_end_time = timestamp
                    break
            if intro_end_time:
                break

    # Find outro start (in last 25% of video)
    outro_cutoff = total_duration * 0.75
    for timestamp, text in reversed(transcript_with_times):
        if timestamp < outro_cutoff:
            break
        for phrase in outro_phrases:
            if phrase in text:
                outro_start_time = timestamp
                break
        if outro_start_time:
            break

    # Snap to nearby cuts if available
    def snap_to_cut(target_time: float, cuts: List[float], max_distance: float = 5.0) -> float:
        """Find closest cut within max_distance seconds."""
        if not cuts:
            return target_time
        closest = min(cuts, key=lambda c: abs(c - target_time))
        if abs(closest - target_time) <= max_distance:
            return closest
        return target_time

    # Add intro boundary
    if intro_end_time and intro_end_time > 8:
        snapped = snap_to_cut(intro_end_time, scene_changes)
        # Ensure minimum intro length of 10s
        if snapped >= 10:
            boundaries.append(snapped)

    # Add outro boundary
    if outro_start_time and (total_duration - outro_start_time) > 8:
        snapped = snap_to_cut(outro_start_time, scene_changes)
        # Ensure outro isn't too close to intro boundary
        if not boundaries or (snapped - boundaries[-1]) > 20:
            # Ensure outro is at least 10s
            if (total_duration - snapped) >= 10:
                boundaries.append(snapped)

    # If no boundaries found, try to find a major transition in the middle
    if not boundaries and scene_changes:
        # Find a cut near the middle third of the video
        mid_start = total_duration * 0.3
        mid_end = total_duration * 0.7
        mid_cuts = [c for c in scene_changes if mid_start < c < mid_end]

        if mid_cuts:
            # Use the cut closest to 30% mark for intro
            intro_cut = min(mid_cuts, key=lambda c: abs(c - total_duration * 0.3))
            if intro_cut > 10:
                boundaries.append(intro_cut)

            # Use the cut closest to 80% mark for outro
            outro_cut = min(scene_changes, key=lambda c: abs(c - total_duration * 0.8))
            if outro_cut > intro_cut + 20 and (total_duration - outro_cut) > 8:
                boundaries.append(outro_cut)

    return sorted(boundaries)


async def call_gpt4o_vision(
    frames: List[str],
    transcript: str,
    cut_density: List[dict],
    brief: dict,
    clips: List[dict],
    gold_standard_style: str = None,
    auto_boundaries: List[float] = None,
    video_structure: str = None,
    scene_changes: List[float] = None
) -> List[SectionAnalysis]:
    """
    Call GPT-4o Vision API (PRD Section 8.4).

    POST https://api.openai.com/v1/chat/completions
    model: gpt-4o
    Timeout: 35 seconds

    Args:
        frames: List of base64-encoded frame images
        transcript: Merged transcript text
        cut_density: Cut density windows
        brief: User's creative brief
        clips: List of clip metadata
        gold_standard_style: Optional confirmed music style (used as default for all sections)
        auto_boundaries: Optional suggested section boundaries from pre-analysis
        video_structure: Detected video type (e.g., "Vlog", "Talking Head")
        scene_changes: All detected cut timestamps (for scenic content analysis)

    Returns:
        List of SectionAnalysis parsed from GPT-4o response
    """
    from config import OPENAI_API_KEY, OPENAI_BASE_URL, SCENIC_VIDEO_TYPES

    if not OPENAI_API_KEY:
        raise ValueError("OpenAI API key not configured")

    # Build clip boundaries info for GPT-4o
    clip_boundaries = []
    for i, clip in enumerate(clips):
        clip_boundaries.append({
            "clip_index": i,
            "start_time": clip.get("start_time", 0),
            "end_time": clip.get("end_time", 0),
            "duration": clip.get("duration", 0)
        })

    # Format cut density summary
    cut_density_summary = []
    for window in cut_density:
        # Handle both old format (cuts_per_second) and new format (density)
        cuts_val = window.get("cuts_per_second") or window.get("density", 0.5)
        pacing = _cuts_to_pacing(cuts_val)
        start = window.get("window_start") or window.get("start", 0)
        end = window.get("window_end") or window.get("end", 0)
        cut_density_summary.append(
            f"{start:.1f}-{end:.1f}s: {pacing} ({cuts_val:.2f} cuts/s)"
        )

    # Compact clip boundaries and calculate total duration
    clip_times = [(c["start_time"], c["end_time"]) for c in clip_boundaries]
    total_duration = max(c["end_time"] for c in clip_boundaries) if clip_boundaries else 0

    # Build gold standard style instruction
    style_instruction = ""
    if gold_standard_style:
        style_instruction = f"\n\nIMPORTANT: Use '{gold_standard_style}' as the BASE music style for ALL sections. Only deviate for sections that are dramatically different in tone (e.g., a tense moment in an otherwise upbeat video). suggested_music_style should be variations of '{gold_standard_style}'."

    # Include auto-boundaries as hints if available
    boundary_hint = ""
    is_scenic = video_structure in SCENIC_VIDEO_TYPES
    if auto_boundaries and len(auto_boundaries) > 0:
        boundary_hint = f"\n\nSuggested section breaks (based on pacing changes): {auto_boundaries}. Consider these when dividing sections."

    # For scenic content, include all cut timestamps so GPT-4o knows where shots change
    scene_change_hint = ""
    if is_scenic and scene_changes and len(scene_changes) > 0:
        # Only include interior cuts (not start/end of video)
        total_dur = max(c.get("end_time", 0) for c in clips) if clips else 0
        interior_cuts = [round(c, 1) for c in scene_changes if 0.5 < c < (total_dur - 0.5)]
        if interior_cuts:
            scene_change_hint = f"\n\nShot change timestamps (visual cuts between different shots): {interior_cuts}. Each frame provided represents one distinct shot between these cuts."

    # Adjust section count based on video structure
    # Talking head / vlog content should have fewer sections (jump cuts don't count as scene changes)
    section_guidance = "Divide into 3-5 sections"
    if video_structure in ("Talking Head", "Interview", "Tutorial"):
        section_guidance = "Divide into 2-3 sections (talking head content - only split at major topic changes, not jump cuts)"
    elif video_structure == "Montage":
        section_guidance = "Divide into 3-4 sections (montage - group similar pacing together)"
    elif is_scenic:
        section_guidance = (
            "Divide into 3-5 sections based on LOCATION or SUBJECT changes. "
            "Each provided frame represents a distinct shot. Group shots of the same place, setting, "
            "or visual subject together into one section. Place section boundaries where the "
            "location, setting, or visual subject changes significantly (e.g., mountains to beach, "
            "city to countryside). Do NOT create a new section for every shot - only where the "
            "topic/location truly changes"
        )

    # Build compact prompt to save tokens
    system_prompt = f"""Score video for music. Brief: {brief.get('overall_energy', 'Medium')} energy, {brief.get('music_style_direction', 'background music')}.

TOTAL VIDEO DURATION: {total_duration:.1f} seconds. All section times MUST be within 0 to {total_duration:.1f}.
Video type: {video_structure or 'Mixed'}
Clip times: {clip_times}
Pacing: {'; '.join(cut_density_summary[:5])}{boundary_hint}{scene_change_hint}{style_instruction}

Transcript excerpt: {transcript[:500] if transcript else "(none)"}

{section_guidance}. Section times must be within 0 to {total_duration:.1f} seconds. Return JSON array only:
[{{"start_time":float,"end_time":float,"section_type":"Hook|Intro|Setup|Build|Anticipation|Reveal|Reaction|Demonstration|Montage|Transition|Recap|Climax|Cooldown|Testimonial|CTA|Outro|Scenic","scene_type":"Talking Head|Walk and Talk|Travel Montage|Product Showcase|Tutorial|Action Moment|Crowd/Event|Vlog/Casual|B-Roll|Interview","emotional_tone":"Energetic|Playful|Suspenseful|Inspirational|Dramatic|Calm|Informative|Nostalgic|Mysterious|Confident|Uplifting","pacing":"Very Slow|Slow|Medium|Fast|Very Fast","energy_level":"Very Low|Low|Medium Low|Medium|Medium High|High|Very High","detected_theme":"12 words max","dominant_visual":"8 words max","suggested_music_style":"20 words max"}}]"""

    # Build messages with limited frames
    messages = [{"role": "system", "content": system_prompt}]

    # Use maximum 8 frames normally, 14 for scenic content (need to see each shot)
    frame_content = []
    frame_limit = 14 if is_scenic else 8
    max_frames_for_analysis = min(frame_limit, len(frames))
    if len(frames) > max_frames_for_analysis:
        # Evenly sample frames
        step = len(frames) / max_frames_for_analysis
        frames_to_send = [frames[int(i * step)] for i in range(max_frames_for_analysis)]
    else:
        frames_to_send = frames[:max_frames_for_analysis]

    for frame_b64 in frames_to_send:
        frame_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{frame_b64}",
                "detail": "low"
            }
        })

    if is_scenic:
        frame_text = (
            f"Analyze {len(frames_to_send)} frames. Each frame is from a distinct shot (different camera angle or location). "
            f"Group shots showing the same location/subject into one section. Return JSON array only."
        )
    else:
        frame_text = f"Analyze {len(frames_to_send)} frames. Return JSON array only."

    frame_content.append({
        "type": "text",
        "text": frame_text
    })

    messages.append({"role": "user", "content": frame_content})

    url = f"{OPENAI_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "gpt-4o",
        "messages": messages,
        "max_tokens": 1000,
        "temperature": 0.3
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=GPT4O_TIMEOUT_SECONDS)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise ValueError(f"GPT-4o API error {response.status}: {error_text[:500]}")

                result = await response.json()

        # Extract content from response
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        logger.debug(f"[ANALYSIS] GPT-4o raw response: {content[:500]}...")

        # Parse JSON from response
        sections = _parse_gpt4o_response(content, clips)

        if not sections:
            raise ValueError("GPT-4o returned empty or invalid sections")

        logger.info(f"[ANALYSIS] GPT-4o returned {len(sections)} valid sections")
        return sections

    except asyncio.TimeoutError:
        logger.error(f"[ANALYSIS] GPT-4o timed out after {GPT4O_TIMEOUT_SECONDS}s")
        raise
    except Exception as e:
        logger.error(f"[ANALYSIS] GPT-4o call failed: {e}")
        raise


def _parse_gpt4o_response(content: str, clips: List[dict]) -> List[SectionAnalysis]:
    """
    Parse GPT-4o JSON response and validate against enums.
    Also validates section times are within video duration.
    """
    # Calculate total duration from clips
    total_duration = max(c.get("end_time", 0) for c in clips) if clips else 0

    # Try to extract JSON from response (handle markdown code blocks)
    content = content.strip()

    # Remove markdown code blocks if present
    if content.startswith("```"):
        # Find the actual JSON
        match = re.search(r'\[[\s\S]*\]', content)
        if match:
            content = match.group(0)

    try:
        sections_data = json.loads(content)
    except json.JSONDecodeError as e:
        logger.error(f"[ANALYSIS] Failed to parse GPT-4o JSON: {e}")
        logger.error(f"[ANALYSIS] Content was: {content[:500]}")
        raise ValueError(f"Invalid JSON from GPT-4o: {e}")

    if not isinstance(sections_data, list):
        raise ValueError("GPT-4o response is not a list")

    sections = []
    for i, section_data in enumerate(sections_data):
        try:
            # Validate and fix enum values
            section_data = _validate_and_fix_section(section_data, i)

            # Parse times
            start_time = float(section_data.get("start_time", 0))
            end_time = float(section_data.get("end_time", 0))

            logger.info(f"[ANALYSIS] GPT-4o section {i} raw: {start_time:.2f}-{end_time:.2f}s (total_duration={total_duration:.2f}s)")

            # Skip sections that start at or beyond the video end
            if start_time >= total_duration:
                logger.warning(f"[ANALYSIS] Skipping section {i}: start_time ({start_time:.2f}) >= total_duration ({total_duration:.2f})")
                continue

            # Clamp start to valid range
            start_time = max(0, start_time)

            # Clamp end to video duration
            end_time = min(end_time, total_duration)

            # Ensure end > start with minimum 1 second duration
            if end_time <= start_time:
                end_time = min(start_time + 10, total_duration)

            # Final check: must have positive duration
            if end_time <= start_time:
                logger.warning(f"[ANALYSIS] Skipping section {i}: invalid duration after clamping")
                continue

            logger.info(f"[ANALYSIS] Section {i} clamped: {start_time:.2f}-{end_time:.2f}s (duration={end_time - start_time:.2f}s)")

            section = SectionAnalysis(
                start_time=start_time,
                end_time=end_time,
                section_type=section_data.get("section_type", "Build"),
                scene_type=section_data.get("scene_type", "Vlog/Casual"),
                emotional_tone=section_data.get("emotional_tone", "Energetic"),
                pacing=section_data.get("pacing", "Medium"),
                energy_level=section_data.get("energy_level", "Medium"),
                cuts_per_second=float(section_data.get("cuts_per_second", 0.5)),
                detected_theme=str(section_data.get("detected_theme", ""))[:100],  # Truncate
                dominant_visual=str(section_data.get("dominant_visual", ""))[:50],
                suggested_music_style=str(section_data.get("suggested_music_style", ""))[:200]
            )
            sections.append(section)
        except Exception as e:
            logger.warning(f"[ANALYSIS] Failed to parse section {i}: {e}")
            continue

    return sections


def _validate_and_fix_section(section_data: dict, index: int) -> dict:
    """
    Validate section data against PRD enums and fix invalid values.
    """
    # Validate section_type
    if section_data.get("section_type") not in SECTION_TYPES:
        logger.warning(f"[ANALYSIS] Invalid section_type: {section_data.get('section_type')}, using 'Build'")
        section_data["section_type"] = "Build"

    # Validate scene_type
    if section_data.get("scene_type") not in SCENE_TYPES:
        logger.warning(f"[ANALYSIS] Invalid scene_type: {section_data.get('scene_type')}, using 'Vlog/Casual'")
        section_data["scene_type"] = "Vlog/Casual"

    # Validate emotional_tone
    if section_data.get("emotional_tone") not in EMOTIONAL_TONES:
        logger.warning(f"[ANALYSIS] Invalid emotional_tone: {section_data.get('emotional_tone')}, using 'Energetic'")
        section_data["emotional_tone"] = "Energetic"

    # Validate pacing
    if section_data.get("pacing") not in PACING:
        logger.warning(f"[ANALYSIS] Invalid pacing: {section_data.get('pacing')}, using 'Medium'")
        section_data["pacing"] = "Medium"

    # Validate energy_level
    if section_data.get("energy_level") not in ENERGY_LEVELS:
        logger.warning(f"[ANALYSIS] Invalid energy_level: {section_data.get('energy_level')}, using 'Medium'")
        section_data["energy_level"] = "Medium"

    return section_data


def _cuts_to_pacing(cuts_per_second: float) -> str:
    """Convert cuts per second to pacing string (PRD Section 8.4)."""
    if cuts_per_second > 2.0:
        return "Very Fast"
    elif cuts_per_second > 1.0:
        return "Fast"
    elif cuts_per_second > 0.3:
        return "Medium"
    elif cuts_per_second > 0.1:
        return "Slow"
    else:
        return "Very Slow"


def _align_sections_to_clips(sections: List[SectionAnalysis], clips: List[dict]) -> List[SectionAnalysis]:
    """
    Align section boundaries to clip boundaries.
    PRD requires sections to snap to clip boundaries.
    Also validates sections are within total video duration.

    IMPORTANT: For single-clip videos, we DON'T force alignment to clip boundaries
    since the AI-detected section times are based on internal scene changes.
    """
    if not clips or not sections:
        return sections

    # Get all clip boundaries and total duration
    clip_boundaries = sorted(set(
        [c.get("start_time", 0) for c in clips] +
        [c.get("end_time", 0) for c in clips]
    ))

    total_duration = max(c.get("end_time", 0) for c in clips)
    logger.info(f"[ANALYSIS] Aligning {len(sections)} sections to {len(clip_boundaries)} boundaries, total_duration={total_duration:.2f}s")

    # For single-clip videos (only 2 boundaries: start and end),
    # skip boundary alignment and just validate times
    if len(clip_boundaries) <= 2:
        logger.info("[ANALYSIS] Single clip detected - keeping AI section times (no clip boundary alignment)")
        validated_sections = []
        for i, section in enumerate(sections):
            # Just clamp to video duration, don't snap to boundaries
            start_time = max(0, min(section.start_time, total_duration))
            end_time = max(0, min(section.end_time, total_duration))

            # Ensure valid duration
            if end_time <= start_time:
                continue

            validated_section = SectionAnalysis(
                start_time=start_time,
                end_time=end_time,
                section_type=section.section_type,
                scene_type=section.scene_type,
                emotional_tone=section.emotional_tone,
                pacing=section.pacing,
                energy_level=section.energy_level,
                cuts_per_second=section.cuts_per_second,
                detected_theme=section.detected_theme,
                dominant_visual=section.dominant_visual,
                suggested_music_style=section.suggested_music_style
            )
            validated_sections.append(validated_section)
            logger.info(f"[ANALYSIS] Final section {i}: {section.section_type} {start_time:.2f}-{end_time:.2f}s ({end_time - start_time:.2f}s)")

        return validated_sections if validated_sections else sections

    aligned_sections = []
    prev_end = 0.0

    for i, section in enumerate(sections):
        # Clamp section times to valid range
        raw_start = max(0, min(section.start_time, total_duration))
        raw_end = max(0, min(section.end_time, total_duration))

        # Find nearest clip boundary for start_time
        start_time = _find_nearest_boundary(raw_start, clip_boundaries)
        # Find nearest clip boundary for end_time
        end_time = _find_nearest_boundary(raw_end, clip_boundaries)

        # Ensure start_time doesn't overlap with previous section
        if i > 0 and start_time < prev_end:
            start_time = prev_end

        # Ensure end > start
        if end_time <= start_time:
            # Find next boundary after start_time
            for boundary in clip_boundaries:
                if boundary > start_time:
                    end_time = boundary
                    break
            # If still no valid end, use total_duration
            if end_time <= start_time:
                end_time = total_duration

        # Final validation: ensure within bounds
        start_time = max(0, min(start_time, total_duration))
        end_time = max(start_time + 0.1, min(end_time, total_duration))

        logger.debug(f"[ANALYSIS] Section {i}: raw=[{section.start_time:.2f}-{section.end_time:.2f}] -> aligned=[{start_time:.2f}-{end_time:.2f}]")

        aligned_section = SectionAnalysis(
            start_time=start_time,
            end_time=end_time,
            section_type=section.section_type,
            scene_type=section.scene_type,
            emotional_tone=section.emotional_tone,
            pacing=section.pacing,
            energy_level=section.energy_level,
            cuts_per_second=section.cuts_per_second,
            detected_theme=section.detected_theme,
            dominant_visual=section.dominant_visual,
            suggested_music_style=section.suggested_music_style
        )
        aligned_sections.append(aligned_section)
        prev_end = end_time

    # Remove any sections with zero or negative duration, or that start at the end
    valid_sections = [
        s for s in aligned_sections
        if s.end_time > s.start_time and s.start_time < total_duration
    ]

    # If we ended up with no valid sections, create a single fallback section
    if not valid_sections:
        logger.warning("[ANALYSIS] No valid sections after alignment, creating fallback")
        valid_sections = [SectionAnalysis(
            start_time=0.0,
            end_time=total_duration,
            section_type="Build",
            scene_type="Vlog/Casual",
            emotional_tone="Energetic",
            pacing="Medium",
            energy_level="Medium",
            cuts_per_second=0.5,
            detected_theme="Video content",
            dominant_visual="Video frames",
            suggested_music_style="Background music"
        )]

    # Log final sections
    for i, s in enumerate(valid_sections):
        logger.info(f"[ANALYSIS] Final section {i}: {s.section_type} {s.start_time:.2f}-{s.end_time:.2f}s ({s.end_time - s.start_time:.2f}s)")

    logger.info(f"[ANALYSIS] Aligned to {len(valid_sections)} valid sections")
    return valid_sections


def _find_nearest_boundary(time: float, boundaries: List[float]) -> float:
    """Find the nearest clip boundary to the given time."""
    if not boundaries:
        return time

    nearest = boundaries[0]
    min_diff = abs(time - nearest)

    for boundary in boundaries:
        diff = abs(time - boundary)
        if diff < min_diff:
            min_diff = diff
            nearest = boundary

    return nearest


async def pre_analyze_video(
    clips: List[dict],
    project_id: str,
    vibe: str = None
) -> dict:
    """
    Pre-analyze video clips before creative brief is submitted.

    Now includes:
    - Frame extraction
    - Audio transcription
    - Cut density (clip boundaries)
    - Scene detection (internal cuts) - NEW
    - Auto-boundary detection (section suggestions) - NEW
    - Video structure detection - NEW
    - Music style recommendation (if vibe provided) - NEW

    These operations don't need the full creative brief, so we can run them
    while the user fills out a simplified questionnaire.

    Args:
        clips: List of clip metadata
        project_id: Project UUID
        vibe: Optional user-selected vibe for music style recommendation

    Returns:
        dict with all pre-analysis results
    """
    from database import supabase

    logger.info(f"[PRE-ANALYSIS] ========== Starting enhanced pre-analysis for project {project_id[:8]} ==========")
    logger.info(f"[PRE-ANALYSIS] Processing {len(clips)} clips, vibe={vibe or '(not set)'}")

    total_duration = sum(c.get("duration", 0) for c in clips)

    try:
        # Update status to ANALYZING
        supabase.table("projects").update({
            "pre_analysis_status": "ANALYZING"
        }).eq("id", project_id).execute()

        # Step 1: Run frame extraction, transcription, and scene detection in parallel
        logger.info("[PRE-ANALYSIS] Starting parallel extraction tasks...")

        frames_task = asyncio.create_task(_extract_all_frames(clips, project_id))
        transcripts_task = asyncio.create_task(_transcribe_all_clips(clips))
        scene_detection_task = asyncio.create_task(detect_all_scene_changes(clips))

        # Wait for all parallel tasks
        all_frames, all_transcripts, all_scene_changes = await asyncio.gather(
            frames_task, transcripts_task, scene_detection_task
        )

        logger.info(f"[PRE-ANALYSIS] Frame extraction complete: {len(all_frames)} frames")
        logger.info(f"[PRE-ANALYSIS] Transcription complete: {len(all_transcripts)} clips transcribed")
        logger.info(f"[PRE-ANALYSIS] Scene detection complete: {len(all_scene_changes)} total cuts")

        # Step 2: Merge transcripts
        merged_transcript = _merge_transcripts(clips, all_transcripts)
        logger.info(f"[PRE-ANALYSIS] Merged transcript: {len(merged_transcript)} characters")

        # Truncate transcript to avoid token overflow
        if len(merged_transcript) > MAX_TRANSCRIPT_CHARS:
            merged_transcript = merged_transcript[:MAX_TRANSCRIPT_CHARS] + "... [truncated]"
            logger.info(f"[PRE-ANALYSIS] Transcript truncated to {MAX_TRANSCRIPT_CHARS} chars")

        # Step 3: Compute cut density using ALL cuts (clip boundaries + scene changes)
        density_windows = calculate_density_windows(all_scene_changes, total_duration)
        logger.info(f"[PRE-ANALYSIS] Density computed: {len(density_windows)} windows")

        # Step 4: Detect video structure using fast heuristics (no GPT-4o call)
        # Do this BEFORE auto-boundaries so we can use video_structure to adjust sensitivity
        clean_transcript = clean_transcript_timestamps(merged_transcript)
        structure_result = detect_video_structure_fast(merged_transcript, density_windows)
        video_structure = structure_result.get("video_structure", "Mixed")
        theme_summary = structure_result.get("theme_summary", "Video content")
        logger.info(f"[PRE-ANALYSIS] Video structure: {video_structure}")
        logger.info(f"[PRE-ANALYSIS] Theme: {theme_summary}")

        # Step 5: Find auto-boundaries based on pacing changes + video structure
        # For talking head/vlog content, we're more conservative (jump cuts don't create sections)
        auto_boundaries = find_auto_boundaries(
            density_windows, total_duration,
            video_structure=video_structure,
            transcript=clean_transcript,
            scene_changes=all_scene_changes
        )
        logger.info(f"[PRE-ANALYSIS] Auto-boundaries: {len(auto_boundaries)} suggested section breaks")

        # Step 6: Suggest music style if vibe is provided
        # Also check if vibe was already set on the project (from earlier setVibe call)
        recommended_music_style = None
        vibe_to_use = vibe

        if not vibe_to_use:
            # Check if vibe was already set on the project
            try:
                from database import supabase as db_check
                project_check = db_check.table("projects").select("selected_vibe").eq("id", project_id).execute()
                if project_check.data and project_check.data[0].get("selected_vibe"):
                    vibe_to_use = project_check.data[0]["selected_vibe"]
                    logger.info(f"[PRE-ANALYSIS] Found existing vibe: {vibe_to_use}")
            except Exception as e:
                logger.warning(f"[PRE-ANALYSIS] Could not check existing vibe: {e}")

        if vibe_to_use:
            recommended_music_style = suggest_music_style(vibe_to_use, video_structure, theme_summary)
            logger.info(f"[PRE-ANALYSIS] Recommended music style: {recommended_music_style}")

        # Also compute legacy cut_density for backward compatibility
        legacy_cut_density = compute_cut_density(clips)

        # Store all pre-analysis results in database
        update_data = {
            "pre_analysis_status": "COMPLETE",
            "pre_analysis_frames": all_frames,
            "pre_analysis_transcript": merged_transcript,
            "pre_analysis_cut_density": legacy_cut_density,
            "pre_analysis_scene_changes": all_scene_changes,
            "pre_analysis_auto_boundaries": auto_boundaries,
            "detected_video_structure": video_structure,
            "detected_theme_summary": theme_summary,
        }

        # Only update vibe if it was provided (don't overwrite existing)
        if vibe:
            update_data["selected_vibe"] = vibe
        # Always update recommended style if we have one (better recommendation with video_structure)
        if recommended_music_style:
            update_data["recommended_music_style"] = recommended_music_style

        supabase.table("projects").update(update_data).eq("id", project_id).execute()

        logger.info(f"[PRE-ANALYSIS] ========== Enhanced pre-analysis complete for project {project_id[:8]} ==========")

        return {
            "frames": all_frames,
            "transcript": merged_transcript,
            "cut_density": legacy_cut_density,
            "scene_changes": all_scene_changes,
            "density_windows": density_windows,
            "auto_boundaries": auto_boundaries,
            "video_structure": video_structure,
            "theme_summary": theme_summary,
            "recommended_music_style": recommended_music_style,
        }

    except Exception as e:
        logger.error(f"[PRE-ANALYSIS] ✗ Pre-analysis failed: {e}")

        # Mark as failed
        supabase.table("projects").update({
            "pre_analysis_status": "FAILED"
        }).eq("id", project_id).execute()

        raise


async def analyze_video_with_preanalysis(
    clips: List[dict],
    brief: dict,
    project_id: str,
    pre_analysis: dict,
    gold_standard_style: str = None
) -> FullAnalysisResult:
    """
    Analyze video using pre-computed frames, transcript, and cut density.
    Only calls GPT-4o Vision since other data is already available.

    Args:
        clips: List of clip metadata
        brief: User's creative brief
        project_id: Project UUID
        pre_analysis: Pre-computed analysis data (frames, transcript, etc.)
        gold_standard_style: Confirmed music style to use as default for all sections
    """
    logger.info(f"[ANALYSIS] ========== Using pre-analysis data for project {project_id[:8]} ==========")

    try:
        all_frames = pre_analysis.get("frames", [])
        merged_transcript = pre_analysis.get("transcript", "")
        cut_density = pre_analysis.get("cut_density", [])
        auto_boundaries = pre_analysis.get("auto_boundaries", [])
        density_windows = pre_analysis.get("density_windows", [])
        video_structure = pre_analysis.get("video_structure")
        scene_changes = pre_analysis.get("scene_changes", [])

        # Use density_windows if available (more detailed), fall back to cut_density
        density_data = density_windows if density_windows else cut_density

        # Get video_structure and scene_changes from project if not in pre_analysis
        if not video_structure or not scene_changes:
            from database import supabase
            project_result = supabase.table("projects").select(
                "detected_video_structure, pre_analysis_scene_changes"
            ).eq("id", project_id).execute()
            if project_result.data:
                if not video_structure:
                    video_structure = project_result.data[0].get("detected_video_structure")
                if not scene_changes:
                    scene_changes = project_result.data[0].get("pre_analysis_scene_changes") or []

        logger.info(f"[ANALYSIS] Pre-analysis data: {len(all_frames)} frames, {len(merged_transcript)} chars transcript")
        logger.info(f"[ANALYSIS] Auto-boundaries: {auto_boundaries}, video_structure: {video_structure}, scene_changes: {len(scene_changes)}")
        if gold_standard_style:
            logger.info(f"[ANALYSIS] Gold standard music style: {gold_standard_style}")

        # Check if we should use transcript-based sectioning for talking head content
        # This is ONLY for true talking head / interview / tutorial with no significant pacing changes
        # "Vlog" is excluded - it's too generic and may contain scenic or mixed content
        # that benefits from GPT-4o visual analysis instead
        is_uniform_talking_head = (
            video_structure in ("Talking Head", "Interview", "Tutorial")
            and (not auto_boundaries or len(auto_boundaries) == 0)
        )

        total_duration = sum(c.get("duration", 0) for c in clips)

        if is_uniform_talking_head:
            logger.info("[ANALYSIS] Talking head content - using transcript-based section detection")
            # Use smart transcript analysis to find intro/main/outro sections
            sections = await _create_smart_sections_from_transcript(
                frames=all_frames,
                transcript=merged_transcript,
                brief=brief,
                clips=clips,
                gold_standard_style=gold_standard_style,
                video_structure=video_structure,
                total_duration=total_duration,
                scene_changes=scene_changes
            )
        else:
            # For non-talking-head content (montage, travel, scenic, etc.), use GPT-4o sectioning
            from config import SCENIC_VIDEO_TYPES
            is_scenic = video_structure in SCENIC_VIDEO_TYPES

            # For scenic content: extract per-shot frames instead of using evenly-spaced ones
            # This ensures GPT-4o sees a representative frame from each distinct shot
            frames_for_gpt = all_frames
            if is_scenic and scene_changes and len(scene_changes) >= 3:
                logger.info("[ANALYSIS] Scenic content - extracting per-shot frames for better visual coverage...")
                per_shot_frames = await _extract_per_shot_frames(clips, scene_changes)
                if per_shot_frames and len(per_shot_frames) >= 3:
                    frames_for_gpt = per_shot_frames
                    logger.info(f"[ANALYSIS] Using {len(frames_for_gpt)} per-shot frames (replacing {len(all_frames)} evenly-spaced)")
                else:
                    logger.info("[ANALYSIS] Per-shot extraction returned too few frames, using evenly-spaced frames")

            logger.info(f"[ANALYSIS] {'Scenic' if is_scenic else 'Non-talking-head'} content - calling GPT-4o Vision for section analysis...")
            sections = await call_gpt4o_vision(
                frames=frames_for_gpt,
                transcript=merged_transcript,
                cut_density=density_data,
                brief=brief,
                clips=clips,
                gold_standard_style=gold_standard_style,
                auto_boundaries=auto_boundaries,
                video_structure=video_structure,
                scene_changes=scene_changes if is_scenic else None
            )

        # Validate and align sections to clip boundaries
        sections = _align_sections_to_clips(sections, clips)

        logger.info(f"[ANALYSIS] ========== Analysis complete: {len(sections)} sections (AI mode with pre-analysis) ==========")
        return FullAnalysisResult(sections=sections, analysis_mode="AI")

    except Exception as e:
        logger.error(f"[ANALYSIS] ✗ Analysis with pre-analysis failed: {e}")
        logger.info("[ANALYSIS] Falling back to automatic segmentation (PRD Section 8.5)")

        fallback_sections = get_fallback_sections(clips)
        return FullAnalysisResult(sections=fallback_sections, analysis_mode="FALLBACK")


async def reanalyze_section(
    section: dict,
    clips: List[dict],
    brief: dict,
    project_id: str
) -> dict:
    """
    Re-analyze a single section after merge/split operations.

    Extracts frames and transcribes only for the section's time range,
    then calls GPT-4o to analyze just this section.

    Returns:
        Updated section data with new analysis attributes
    """
    from database import supabase
    from config import UPLOAD_DIR

    section_id = section["id"]
    section_start = section.get("start_time", 0)
    section_end = section.get("end_time", 0)
    section_duration = section_end - section_start

    logger.info(f"[REANALYZE] ========== Re-analyzing section {section_id[:8]} ({section_start:.1f}s - {section_end:.1f}s) ==========")

    # Skip analysis for very long sections
    if section_duration > MAX_DURATION_FOR_ANALYSIS:
        logger.warning(f"[REANALYZE] Section too long ({section_duration:.1f}s > {MAX_DURATION_FOR_ANALYSIS}s), using fallback")
        # Use fallback values
        supabase.table("sections").update({
            "analysis_status": "COMPLETE",
            "detected_theme": "Section too long for AI analysis",
            "dominant_visual": "Video content",
            "suggested_music_style": f"Background music matching {brief.get('music_style_direction', 'overall energy')}"
        }).eq("id", section_id).execute()
        return section

    try:
        # Update section status to ANALYZING
        supabase.table("sections").update({
            "analysis_status": "ANALYZING"
        }).eq("id", section_id).execute()

        # Find clips that overlap with this section's time range
        section_clips = [
            c for c in clips
            if c["start_time"] < section_end and c["end_time"] > section_start
        ]

        if not section_clips:
            logger.warning(f"[REANALYZE] No clips found for section time range")
            supabase.table("sections").update({
                "analysis_status": "COMPLETE",
                "detected_theme": "No video content in section",
            }).eq("id", section_id).execute()
            return section

        logger.info(f"[REANALYZE] Processing {len(section_clips)} overlapping clips for section")

        # Extract frames only for the section's time range
        all_frames = []
        for clip in section_clips:
            clip_path = os.path.join(UPLOAD_DIR, clip.get("filename", ""))

            if not os.path.exists(clip_path):
                storage_path = clip.get("storage_path", "")
                if storage_path:
                    clip_path = await _download_clip_from_storage(storage_path, clip.get("filename", ""))

            if clip_path and os.path.exists(clip_path):
                # Calculate the portion of this clip that falls within the section
                clip_start_in_section = max(0, section_start - clip["start_time"])
                clip_end_in_section = min(clip["duration"], section_end - clip["start_time"])

                # Extract frames only for this portion
                frames = await extract_analysis_frames(
                    clip_path,
                    max_frames=FRAMES_PER_GPT_REQUEST,
                    start_time=clip_start_in_section,
                    end_time=clip_end_in_section
                )
                all_frames.extend(frames)

        # Limit total frames
        if len(all_frames) > FRAMES_PER_GPT_REQUEST:
            step = len(all_frames) / FRAMES_PER_GPT_REQUEST
            all_frames = [all_frames[int(i * step)] for i in range(FRAMES_PER_GPT_REQUEST)]

        logger.info(f"[REANALYZE] Extracted {len(all_frames)} frames for section")

        # For transcript, we'll use a simplified approach - just note the section time range
        # Full transcription would require more complex audio slicing
        merged_transcript = f"Section from {section_start:.1f}s to {section_end:.1f}s of the video."

        # Compute cut density for section time range
        cut_density = compute_cut_density(section_clips)

        # Call GPT-4o for single section analysis
        section_analysis = await _analyze_single_section(
            frames=all_frames,
            transcript=merged_transcript,
            cut_density=cut_density,
            brief=brief,
            section=section,
            clips=section_clips
        )

        # Update section with new analysis data
        update_data = {
            "analysis_status": "COMPLETE",
            "music_status": "PENDING",  # Reset music status since analysis changed
            "section_type": section_analysis.section_type,
            "scene_type": section_analysis.scene_type,
            "emotional_tone": section_analysis.emotional_tone,
            "pacing": section_analysis.pacing,
            "energy_level": _energy_level_to_float(section_analysis.energy_level),
            "cuts_per_second": section_analysis.cuts_per_second,
            "detected_theme": section_analysis.detected_theme,
            "dominant_visual": section_analysis.dominant_visual,
            "suggested_music_style": section_analysis.suggested_music_style,
        }

        result = supabase.table("sections").update(update_data).eq("id", section_id).execute()

        logger.info(f"[REANALYZE] ========== Section {section_id[:8]} re-analysis complete ==========")

        return result.data[0] if result.data else section

    except Exception as e:
        logger.error(f"[REANALYZE] ✗ Re-analysis failed: {e}")

        # Mark as failed but don't throw - use fallback values
        supabase.table("sections").update({
            "analysis_status": "COMPLETE",
            "detected_theme": "AI analysis unavailable",
            "dominant_visual": "Video content",
            "suggested_music_style": f"Background music matching {brief.get('music_style_direction', 'overall energy')}"
        }).eq("id", section_id).execute()

        return section


def _energy_level_to_float(energy_str: str) -> float:
    """Convert energy level string to float (0.0-1.0) for database compatibility."""
    mapping = {
        "Very Low": 0.1,
        "Low": 0.25,
        "Medium Low": 0.4,
        "Medium": 0.5,
        "Medium High": 0.65,
        "High": 0.8,
        "Very High": 0.95,
    }
    return mapping.get(energy_str, 0.5)


async def _analyze_single_section(
    frames: List[str],
    transcript: str,
    cut_density: List[dict],
    brief: dict,
    section: dict,
    clips: List[dict]
) -> SectionAnalysis:
    """
    Call GPT-4o to analyze a single section (not divide into multiple).
    Uses minimal frames to stay within token limits.
    """
    from config import OPENAI_API_KEY, OPENAI_BASE_URL

    if not OPENAI_API_KEY:
        raise ValueError("OpenAI API key not configured")

    # Format cut density summary (compact)
    avg_cuts = sum(w["cuts_per_second"] for w in cut_density) / len(cut_density) if cut_density else 0.5
    pacing_hint = _cuts_to_pacing(avg_cuts)

    # Build scene type and section type lists from the canonical enums
    scene_types_str = "|".join(SCENE_TYPES)
    section_types_str = "|".join(SECTION_TYPES)
    emotional_tones_str = "|".join(EMOTIONAL_TONES)
    pacing_str = "|".join(PACING)
    energy_str = "|".join(ENERGY_LEVELS)

    # Compact system prompt to save tokens
    system_prompt = f"""Analyze this video section for music scoring.

Brief: {brief.get('overall_energy', 'Medium')} energy, {brief.get('music_style_direction', 'background music')} style
Section: {section.get('start_time', 0):.1f}s - {section.get('end_time', 0):.1f}s
Pacing hint: {pacing_hint} ({avg_cuts:.2f} cuts/s)

Return JSON only:
{{"section_type":"<{section_types_str}>","scene_type":"<{scene_types_str}>","emotional_tone":"<{emotional_tones_str}>","pacing":"<{pacing_str}>","energy_level":"<{energy_str}>","detected_theme":"<12 words max>","dominant_visual":"<8 words max>","suggested_music_style":"<20 words max>"}}"""

    # Build messages with limited frames (max 6 for efficiency)
    messages = [{"role": "system", "content": system_prompt}]

    frame_content = []
    max_frames_to_send = min(6, len(frames))  # Limit to 6 frames max
    frames_to_send = frames[:max_frames_to_send]

    for frame_b64 in frames_to_send:
        frame_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{frame_b64}",
                "detail": "low"
            }
        })

    frame_content.append({
        "type": "text",
        "text": f"Analyze these {len(frames_to_send)} frames. Return JSON only."
    })

    messages.append({"role": "user", "content": frame_content})

    url = f"{OPENAI_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "gpt-4o",
        "messages": messages,
        "max_tokens": 500,
        "temperature": 0.3
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=GPT4O_TIMEOUT_SECONDS)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise ValueError(f"GPT-4o API error {response.status}: {error_text[:500]}")

                result = await response.json()

        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        logger.info(f"[REANALYZE] GPT-4o raw response: {content[:500]}")

        # Parse JSON response
        content = content.strip()
        if content.startswith("```"):
            match = re.search(r'\{[\s\S]*\}', content)
            if match:
                content = match.group(0)

        section_data = json.loads(content)
        logger.info(f"[REANALYZE] Parsed section data before validation: scene_type={section_data.get('scene_type')}, section_type={section_data.get('section_type')}, emotional_tone={section_data.get('emotional_tone')}")
        section_data = _validate_and_fix_section(section_data, 0)
        logger.info(f"[REANALYZE] After validation: scene_type={section_data.get('scene_type')}, section_type={section_data.get('section_type')}")

        # Use computed cuts_per_second
        section_data["cuts_per_second"] = avg_cuts

        return SectionAnalysis(
            start_time=section.get("start_time", 0),
            end_time=section.get("end_time", 0),
            section_type=section_data.get("section_type", "Build"),
            scene_type=section_data.get("scene_type", "Vlog/Casual"),
            emotional_tone=section_data.get("emotional_tone", "Energetic"),
            pacing=section_data.get("pacing", "Medium"),
            energy_level=section_data.get("energy_level", "Medium"),
            cuts_per_second=float(section_data.get("cuts_per_second", 0.5)),
            detected_theme=str(section_data.get("detected_theme", ""))[:100],
            dominant_visual=str(section_data.get("dominant_visual", ""))[:50],
            suggested_music_style=str(section_data.get("suggested_music_style", ""))[:200]
        )

    except Exception as e:
        logger.error(f"[REANALYZE] GPT-4o call failed: {e}")
        # Return fallback analysis
        return SectionAnalysis(
            start_time=section.get("start_time", 0),
            end_time=section.get("end_time", 0),
            section_type=section.get("section_type", "Build"),
            scene_type="Vlog/Casual",
            emotional_tone="Energetic",
            pacing=_cuts_to_pacing(avg_cuts),
            energy_level="Medium",
            cuts_per_second=avg_cuts,
            detected_theme="AI analysis unavailable",
            dominant_visual="Video content",
            suggested_music_style=f"{brief.get('music_style_direction', 'Background music')} matching video energy"
        )


# ============================================================================
# SCENE DETECTION AND AUTO-BOUNDARY DETECTION
# ============================================================================

async def detect_scene_changes(video_path: str, threshold: float = None) -> List[float]:
    """
    Detect scene changes (cuts, transitions) within a video using FFmpeg.

    Args:
        video_path: Path to video file
        threshold: Scene detection sensitivity (0.2-0.4, lower = more sensitive)

    Returns:
        List of timestamps (in seconds) where scene changes occur
    """
    from config import SCENE_DETECTION_THRESHOLD

    if threshold is None:
        threshold = SCENE_DETECTION_THRESHOLD

    if not os.path.exists(video_path):
        logger.warning(f"[SCENE] Video file not found: {video_path}")
        return []

    try:
        # FFmpeg scene detection command
        # select='gt(scene,threshold)' detects frames where scene change > threshold
        # showinfo outputs frame timestamps
        cmd = [
            "ffmpeg",
            "-i", video_path,
            "-filter:v", f"select='gt(scene,{threshold})',showinfo",
            "-f", "null",
            "-"
        ]

        logger.info(f"[SCENE] Running scene detection on {os.path.basename(video_path)} (threshold={threshold})")

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        _, stderr = await asyncio.wait_for(process.communicate(), timeout=120)

        # Parse showinfo output for timestamps
        # Format: [Parsed_showinfo_1 @ ...] n:   0 pts:   1234 pts_time:1.234567 ...
        scene_changes = []
        stderr_text = stderr.decode()

        for line in stderr_text.split('\n'):
            if 'pts_time:' in line:
                try:
                    # Extract pts_time value
                    pts_match = re.search(r'pts_time:(\d+\.?\d*)', line)
                    if pts_match:
                        timestamp = float(pts_match.group(1))
                        scene_changes.append(round(timestamp, 3))
                except (ValueError, AttributeError):
                    continue

        logger.info(f"[SCENE] Detected {len(scene_changes)} scene changes in {os.path.basename(video_path)}")
        return scene_changes

    except asyncio.TimeoutError:
        logger.error(f"[SCENE] Scene detection timed out for {video_path}")
        return []
    except Exception as e:
        logger.error(f"[SCENE] Scene detection error: {e}")
        return []


async def detect_all_scene_changes(clips: List[dict]) -> List[float]:
    """
    Detect scene changes across all clips and merge with clip boundaries.

    Args:
        clips: List of clip metadata

    Returns:
        Sorted list of all cut timestamps (clip boundaries + internal scene changes)
    """
    from config import UPLOAD_DIR

    all_cuts = set()

    # Add clip boundaries (existing logic)
    for clip in clips:
        all_cuts.add(clip.get("start_time", 0))
        all_cuts.add(clip.get("end_time", 0))

    # Detect scene changes within each clip
    for clip in clips:
        clip_path = os.path.join(UPLOAD_DIR, clip.get("filename", ""))

        if not os.path.exists(clip_path):
            storage_path = clip.get("storage_path", "")
            if storage_path:
                clip_path = await _download_clip_from_storage(storage_path, clip.get("filename", ""))

        if clip_path and os.path.exists(clip_path):
            # Detect scene changes within this clip
            internal_changes = await detect_scene_changes(clip_path)

            # Offset by clip's start time on the timeline
            clip_start = clip.get("start_time", 0)
            clip_duration = clip.get("duration", 0)

            for change in internal_changes:
                # Only include changes within clip bounds
                if 0 < change < clip_duration:
                    absolute_time = round(clip_start + change, 3)
                    all_cuts.add(absolute_time)

    return sorted(all_cuts)


def calculate_density_windows(cuts: List[float], total_duration: float, window_size: float = None) -> List[dict]:
    """
    Calculate cut density in rolling windows.

    Args:
        cuts: Sorted list of cut timestamps
        total_duration: Total video duration in seconds
        window_size: Window size in seconds (default from config)

    Returns:
        List of density windows with categorization
    """
    from config import (
        DENSITY_WINDOW_SIZE,
        DENSITY_MONTAGE_THRESHOLD,
        DENSITY_MEDIUM_THRESHOLD,
        DENSITY_SLOW_THRESHOLD
    )

    if window_size is None:
        window_size = DENSITY_WINDOW_SIZE

    if not cuts or total_duration <= 0:
        return []

    windows = []
    window_start = 0.0

    while window_start < total_duration:
        window_end = min(window_start + window_size, total_duration)
        window_duration = window_end - window_start

        # Count cuts within this window (excluding window boundaries)
        cuts_in_window = sum(
            1 for c in cuts
            if window_start < c < window_end
        )

        density = cuts_in_window / window_duration if window_duration > 0 else 0

        # Categorize based on density thresholds
        if density > DENSITY_MONTAGE_THRESHOLD:
            category = "MONTAGE"
        elif density > DENSITY_MEDIUM_THRESHOLD:
            category = "MEDIUM"
        elif density > DENSITY_SLOW_THRESHOLD:
            category = "SLOW"
        else:
            category = "STATIC"

        windows.append({
            "start": round(window_start, 2),
            "end": round(window_end, 2),
            "density": round(density, 3),
            "cuts_count": cuts_in_window,
            "category": category
        })

        window_start += window_size

    return windows


def find_auto_boundaries(
    windows: List[dict],
    total_duration: float,
    video_structure: str = None,
    transcript: str = None,
    scene_changes: List[float] = None
) -> List[float]:
    """
    Find section boundaries based on pacing changes AND content analysis.

    For talking head / vlog content, we're more conservative:
    - Jump cuts don't create new sections
    - Only significant pacing shifts matter (e.g., STATIC → MONTAGE)

    For scenic / travel / cinematic content with uniform pacing:
    - Pacing-based detection fails (all windows are SLOW/STATIC)
    - Instead, suggest boundaries evenly distributed across detected cuts
    - GPT-4o will refine these based on visual content similarity

    For montage / mixed content:
    - Pacing transitions create boundaries

    Args:
        windows: List of density windows with categories
        total_duration: Total video duration
        video_structure: Detected video type (e.g., "Vlog", "Talking Head")
        transcript: Clean transcript for topic detection
        scene_changes: All detected cut timestamps (for scenic content boundary hints)

    Returns:
        List of boundary timestamps (excluding 0 and total_duration)
    """
    from config import (
        MIN_SECTION_DURATION,
        MIN_VIDEO_DURATION_FOR_SPLIT,
        MAX_AUTO_BOUNDARIES,
        SCENIC_VIDEO_TYPES
    )

    # Skip very short videos
    if total_duration < MIN_VIDEO_DURATION_FOR_SPLIT:
        logger.info(f"[BOUNDARIES] Video too short ({total_duration:.1f}s < {MIN_VIDEO_DURATION_FOR_SPLIT}s), skipping auto-split")
        return []

    if len(windows) < 2:
        return []

    # Determine if this is talking head content (not Vlog - too generic, may be scenic)
    is_talking_head = video_structure in ("Talking Head", "Interview", "Tutorial")
    is_scenic = video_structure in SCENIC_VIDEO_TYPES

    # Calculate dominant pacing
    dominant_categories = {}
    for w in windows:
        cat = w["category"]
        dominant_categories[cat] = dominant_categories.get(cat, 0) + 1

    total_windows = len(windows)
    dominant_pacing = max(dominant_categories, key=dominant_categories.get)
    dominant_percent = dominant_categories[dominant_pacing] / total_windows

    # For talking head content with mostly uniform pacing (>70%), skip auto-splitting
    # Jump cuts in talking head videos shouldn't create new sections
    if is_talking_head and dominant_percent > 0.7:
        logger.info(f"[BOUNDARIES] Talking head content with uniform pacing ({dominant_percent:.0%} {dominant_pacing}), skipping auto-split")
        return []

    # Find category transition points (pacing-based boundaries)
    raw_boundaries = []

    for i in range(1, len(windows)):
        prev = windows[i - 1]
        curr = windows[i]

        if prev["category"] != curr["category"]:
            # For talking head content, only significant transitions count
            if is_talking_head:
                # Define significant transitions (skip minor ones like SLOW ↔ MEDIUM)
                significant = is_significant_pacing_change(prev["category"], curr["category"])
                if not significant:
                    continue

            raw_boundaries.append(curr["start"])

    # For scenic content: if pacing-based detection found nothing,
    # use cut-based boundary suggestions instead.
    # Scenic videos have uniform pacing but visually distinct shots -
    # we suggest boundaries by distributing evenly across cuts and snapping
    # to the nearest actual cut point. GPT-4o will refine based on visual similarity.
    if not raw_boundaries and is_scenic and scene_changes:
        # Filter cuts that are within the video bounds (exclude 0 and total_duration)
        interior_cuts = [c for c in scene_changes if MIN_SECTION_DURATION < c < (total_duration - MIN_SECTION_DURATION)]

        if len(interior_cuts) >= 2:
            # Aim for 3-5 sections depending on video length and number of cuts
            target_sections = min(5, max(3, len(interior_cuts) // 3))
            target_boundaries = target_sections - 1

            # Distribute boundaries evenly across the timeline, snap to nearest cut
            raw_boundaries = _distribute_boundaries_at_cuts(
                interior_cuts, total_duration, target_boundaries
            )
            logger.info(f"[BOUNDARIES] Scenic content: suggested {len(raw_boundaries)} cut-based boundaries from {len(interior_cuts)} cuts")

    if not raw_boundaries:
        logger.info("[BOUNDARIES] No significant pacing changes detected")
        return []

    # Apply guardrails
    boundaries = _apply_boundary_guardrails(raw_boundaries, total_duration)

    logger.info(f"[BOUNDARIES] Found {len(boundaries)} auto-boundaries from {len(raw_boundaries)} raw transitions (structure={video_structure})")
    return boundaries


def _distribute_boundaries_at_cuts(
    cuts: List[float],
    total_duration: float,
    target_count: int
) -> List[float]:
    """
    Distribute boundary suggestions evenly across the timeline,
    snapping each to the nearest actual cut point.

    This provides reasonable default boundaries for scenic content
    where pacing is uniform. GPT-4o will refine based on visual content.
    """
    if not cuts or target_count <= 0:
        return []

    boundaries = []
    for i in range(1, target_count + 1):
        # Target position: evenly divide the timeline
        target_time = (i / (target_count + 1)) * total_duration

        # Find nearest cut to this target
        nearest_cut = min(cuts, key=lambda c: abs(c - target_time))
        if nearest_cut not in boundaries:
            boundaries.append(nearest_cut)

    return sorted(boundaries)


def is_significant_pacing_change(prev_category: str, curr_category: str) -> bool:
    """
    Determine if a pacing change is significant enough to warrant a section break.

    Significant changes:
    - STATIC ↔ MONTAGE (huge shift)
    - STATIC ↔ MEDIUM (major shift)
    - SLOW ↔ MONTAGE (major shift)

    NOT significant (just editing style):
    - SLOW ↔ MEDIUM (minor adjustment)
    - STATIC ↔ SLOW (very minor)
    """
    # Define significance levels
    LEVELS = {
        "STATIC": 0,
        "SLOW": 1,
        "MEDIUM": 2,
        "MONTAGE": 3
    }

    prev_level = LEVELS.get(prev_category, 1)
    curr_level = LEVELS.get(curr_category, 1)

    # Need at least 2 levels of change to be significant
    return abs(prev_level - curr_level) >= 2


def _apply_boundary_guardrails(boundaries: List[float], total_duration: float) -> List[float]:
    """
    Apply guardrails to boundary list:
    - Enforce minimum section duration
    - Limit total boundaries
    - Keep most significant boundaries if over limit
    """
    from config import MIN_SECTION_DURATION, MAX_AUTO_BOUNDARIES

    if not boundaries:
        return []

    # Filter boundaries that are too close together (min section duration)
    filtered = []
    prev_boundary = 0.0

    for boundary in sorted(boundaries):
        # Check distance from previous boundary (or start)
        if boundary - prev_boundary >= MIN_SECTION_DURATION:
            # Also check distance to end
            if total_duration - boundary >= MIN_SECTION_DURATION:
                filtered.append(boundary)
                prev_boundary = boundary

    # Limit to max boundaries
    if len(filtered) > MAX_AUTO_BOUNDARIES:
        # Keep boundaries that create most evenly-sized sections
        filtered = _keep_most_significant_boundaries(filtered, total_duration, MAX_AUTO_BOUNDARIES)

    return filtered


def _keep_most_significant_boundaries(
    boundaries: List[float],
    total_duration: float,
    max_count: int
) -> List[float]:
    """
    Keep the most significant boundaries that create balanced sections.
    Uses a scoring system based on how well boundaries divide the video.
    """
    if len(boundaries) <= max_count:
        return boundaries

    # Score each boundary by how much "imbalance" it would create if removed
    # Higher score = more important to keep
    def score_boundary(b, all_bounds):
        all_points = [0.0] + sorted(all_bounds) + [total_duration]
        idx = all_points.index(b)
        left_section = all_points[idx] - all_points[idx - 1]
        right_section = all_points[idx + 1] - all_points[idx]
        # Score is the minimum section size this boundary creates
        # We want to keep boundaries that create reasonably-sized sections
        return min(left_section, right_section)

    # Sort by score (descending) and keep top max_count
    scored = [(b, score_boundary(b, boundaries)) for b in boundaries]
    scored.sort(key=lambda x: x[1], reverse=True)

    return sorted([b for b, _ in scored[:max_count]])


# ============================================================================
# VIDEO STRUCTURE AND MUSIC STYLE DETECTION
# ============================================================================

def clean_transcript_timestamps(transcript: str) -> str:
    """
    Remove timestamps and clip markers from transcript.

    ElevenLabs STT returns text like "[0.6s] Welcome [0.9s] to [1.0s]..."
    This cleans it to just "Welcome to..."

    Args:
        transcript: Raw transcript with timestamps

    Returns:
        Clean transcript text
    """
    if not transcript:
        return ""

    # Remove [X.Xs] timestamp patterns
    cleaned = re.sub(r'\[\d+\.?\d*s?\]', '', transcript)
    # Remove [Clip at X.Xs]: markers
    cleaned = re.sub(r'\[Clip at \d+\.?\d*s?\]:?\s*', '', cleaned)
    # Clean up multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned.strip()


def detect_video_structure_fast(
    transcript: str,
    density_windows: List[dict]
) -> dict:
    """
    Fast video structure detection using heuristics (no GPT-4o call).

    Uses transcript keywords and pacing to classify video type.

    Args:
        transcript: Merged transcript text
        density_windows: Cut density analysis

    Returns:
        dict with video_structure, theme_summary
    """
    from config import VIDEO_STRUCTURE_TYPES, DENSITY_WINDOW_SIZE

    # Clean transcript of timestamps before analysis
    clean_transcript = clean_transcript_timestamps(transcript)
    transcript_lower = (clean_transcript or "").lower()

    # Calculate dominant pacing and shot pattern metrics
    dominant_pacing = "MEDIUM"
    total_cuts = 0
    total_video_duration = 0.0

    if density_windows:
        dominant_categories = {}
        for w in density_windows:
            cat = w["category"]
            dominant_categories[cat] = dominant_categories.get(cat, 0) + 1
            total_cuts += w.get("cuts_count", 0)
        dominant_pacing = max(dominant_categories, key=dominant_categories.get)
        total_video_duration = density_windows[-1].get("end", 0) if density_windows else 0

    # Average shot duration: total_duration / (total_cuts + 1)
    # Many short shots (avg < 5s) = scenic or montage, NOT talking head
    avg_shot_duration = total_video_duration / (total_cuts + 1) if total_cuts > 0 else total_video_duration
    has_many_short_shots = total_cuts >= 5 and avg_shot_duration < 5.0

    # Transcript density: chars per second of video
    transcript_chars = len(transcript_lower.strip())
    transcript_density = transcript_chars / total_video_duration if total_video_duration > 0 else 0

    logger.debug(f"[STRUCTURE] Metrics: cuts={total_cuts}, avg_shot={avg_shot_duration:.1f}s, "
                 f"transcript={transcript_chars} chars ({transcript_density:.1f} chars/s), pacing={dominant_pacing}")

    # Heuristic detection based on keywords, pacing, and shot patterns
    video_structure = "Vlog"  # Default
    theme_summary = None  # Will be set based on detection

    # Detect SFX-heavy transcripts: (waves crashing) (seagulls calling) etc.
    # These indicate nature/scenic content with environmental sounds, not speech
    sfx_markers = re.findall(r'\([^)]+\)', clean_transcript or "")
    sfx_chars = sum(len(m) for m in sfx_markers)
    speech_text = re.sub(r'\([^)]+\)', '', clean_transcript or "").strip()
    speech_chars = len(speech_text)
    is_sfx_heavy = sfx_chars > 0 and (sfx_chars > speech_chars or speech_chars < 30)

    # Use speech-only text for transcript density to avoid SFX inflating the count
    speech_density = speech_chars / total_video_duration if total_video_duration > 0 else 0

    # FIRST: Check shot patterns - many short shots at non-montage pacing = Scenic
    # This is the strongest signal and takes priority over keyword detection
    # because scenic videos may have light narration mentioning travel, etc.
    if has_many_short_shots and dominant_pacing in ("SLOW", "MEDIUM", "STATIC"):
        video_structure = "Scenic"
        theme_summary = "Scenic or visual content"
    # SFX-heavy transcripts = nature/scenic (waves, birds, water sounds)
    elif is_sfx_heavy:
        video_structure = "Scenic"
        # Build theme from SFX content
        sfx_words = [m.strip("()").lower() for m in sfx_markers[:3]]
        if sfx_words:
            theme_summary = f"Scenic video with {', '.join(sfx_words)}"
        else:
            theme_summary = "Scenic or nature content"
    # Check for nature/outdoor keywords
    elif any(word in transcript_lower for word in ["ocean", "waves", "beach", "seagull", "nature", "sunset", "mountain", "forest", "lake", "waterfall"]):
        video_structure = "Scenic"
        theme_summary = "Nature or outdoor scenery"
    # Check for specific keywords
    elif any(word in transcript_lower for word in ["tutorial", "how to", "step by step", "let me show you"]):
        video_structure = "Tutorial"
        theme_summary = "Tutorial or how-to guide"
    elif any(word in transcript_lower for word in ["interview", "tell me about", "what do you think"]):
        video_structure = "Interview"
        theme_summary = "Interview or conversation"
    elif any(word in transcript_lower for word in ["travel", "vacation", "trip", "visiting", "arrived"]):
        video_structure = "Travel"
        theme_summary = "Travel or adventure"
    elif any(word in transcript_lower for word in ["product", "review", "unbox", "bought", "purchase"]):
        video_structure = "Product Review"
        theme_summary = "Product review or unboxing"
    elif any(word in transcript_lower for word in ["game", "playing", "level", "score"]):
        video_structure = "Gaming"
        theme_summary = "Gaming content"
    elif any(word in transcript_lower for word in ["workout", "exercise", "fitness", "gym"]):
        video_structure = "Fitness"
        theme_summary = "Fitness or workout"
    elif any(word in transcript_lower for word in ["recipe", "cooking", "cook", "ingredients"]):
        video_structure = "Cooking"
        theme_summary = "Cooking or recipe"
    elif any(word in transcript_lower for word in ["day in", "morning", "routine", "daily"]):
        video_structure = "Vlog"
        theme_summary = "Day in the life vlog"
    elif dominant_pacing == "MONTAGE":
        video_structure = "Montage"
        theme_summary = "Fast-paced montage"
    elif dominant_pacing in ("SLOW", "STATIC"):
        # Slow/static pacing without many short shots
        # Use speech_density (not transcript_density) to avoid SFX inflation
        if speech_density < 15:
            video_structure = "Scenic"
            theme_summary = "Scenic or visual content"
        elif dominant_pacing == "STATIC":
            video_structure = "Talking Head"
            theme_summary = "Talking head or presentation"

    # If no specific theme detected, create a summary from speech text (not raw transcript with SFX)
    if theme_summary is None and speech_text and len(speech_text) > 20:
        summary = speech_text[:60]
        if len(speech_text) > 60:
            last_space = summary.rfind(' ')
            if last_space > 30:
                summary = summary[:last_space]
            summary += "..."
        theme_summary = summary
    elif theme_summary is None:
        theme_summary = "Video content"

    logger.info(f"[STRUCTURE] Fast detection: {video_structure} (pacing={dominant_pacing})")
    return {
        "video_structure": video_structure,
        "theme_summary": theme_summary
    }


def suggest_music_style(vibe: str, video_structure: str, theme_summary: str = None) -> str:
    """
    Suggest a music style based on user's vibe selection and detected video structure.

    Args:
        vibe: User-selected vibe (e.g., "Energetic", "Chill")
        video_structure: Detected video type (e.g., "Vlog", "Tutorial")
        theme_summary: Optional theme description for context

    Returns:
        Suggested music style string (e.g., "Upbeat Lofi Hip-Hop")
    """
    from config import MUSIC_STYLE_SUGGESTIONS, VIBE_OPTIONS

    # Get base suggestions for vibe
    vibe_normalized = vibe.strip().title()
    if vibe_normalized not in VIBE_OPTIONS:
        vibe_normalized = "Energetic"  # Default

    suggestions = MUSIC_STYLE_SUGGESTIONS.get(vibe_normalized, ["Background Music"])

    # Adjust based on video structure
    structure_adjustments = {
        "Vlog": 0,  # Use first suggestion (default)
        "Tutorial": 1,  # Use second (usually more neutral)
        "Interview": 1,
        "Travel": 0,  # Usually energetic/ambient works
        "Product Review": 1,
        "Gaming": 0,  # Usually energetic
        "Music Video": 3,  # Most genre-specific
        "Documentary": 2,
        "Podcast": 1,
        "Event": 0,
        "Fitness": 0,  # Usually high energy
        "Cooking": 1,
        "News": 1,
        "Presentation": 2,
        "Behind the Scenes": 0,
        "Montage": 0,
        "Short Form": 0,
        "Cinematic": 2,  # Usually orchestral
        "Scenic": 2,  # Usually ambient/orchestral
        "Talking Head": 1,
        "Mixed": 0
    }

    # Get adjustment index (clamped to suggestions list length)
    adj = structure_adjustments.get(video_structure, 0)
    adj = min(adj, len(suggestions) - 1)

    suggested_style = suggestions[adj]

    logger.info(f"[STYLE] Suggested '{suggested_style}' for vibe='{vibe}', structure='{video_structure}'")
    return suggested_style


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
    if not clips:
        return []

    # Calculate total duration and clip boundaries
    total_duration = max(c.get("end_time", 0) for c in clips)
    clip_boundaries = sorted(set(
        [c.get("start_time", 0) for c in clips] +
        [c.get("end_time", 0) for c in clips]
    ))

    # Target 4 sections
    fallback_types = ["Hook", "Build", "Climax", "Outro"]
    num_sections = min(4, len(clip_boundaries) - 1)  # Can't have more sections than clip gaps

    if num_sections < 1:
        # Single section fallback
        return [SectionAnalysis(
            start_time=0.0,
            end_time=total_duration,
            section_type="Build",
            scene_type="Vlog/Casual",
            emotional_tone="Energetic",
            pacing="Medium",
            energy_level="Medium",
            cuts_per_second=0.5,
            detected_theme="Video content",
            dominant_visual="Video frames",
            suggested_music_style="Background music matching overall energy"
        )]

    # Divide boundaries into roughly equal groups
    section_size = total_duration / num_sections
    sections = []

    for i in range(num_sections):
        target_start = i * section_size
        target_end = (i + 1) * section_size

        # Snap to nearest clip boundaries
        start_time = _find_nearest_boundary(target_start, clip_boundaries)
        end_time = _find_nearest_boundary(target_end, clip_boundaries)

        # Ensure end > start
        if end_time <= start_time:
            for boundary in clip_boundaries:
                if boundary > start_time:
                    end_time = boundary
                    break

        section_type = fallback_types[i] if i < len(fallback_types) else "Build"

        sections.append(SectionAnalysis(
            start_time=start_time,
            end_time=end_time,
            section_type=section_type,
            scene_type="Vlog/Casual",
            emotional_tone="Energetic",
            pacing="Medium",
            energy_level="Medium",
            cuts_per_second=0.5,
            detected_theme="Scene analysis unavailable",
            dominant_visual="Video content",
            suggested_music_style="Background music matching video energy"
        ))

    logger.info(f"[ANALYSIS] Created {len(sections)} fallback sections")
    return sections
