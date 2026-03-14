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
FRAMES_PER_GPT_REQUEST = 20  # Limit frames sent to avoid token overflow
MAX_TRANSCRIPT_CHARS = 3000  # Truncate transcript to avoid token overflow


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
    logger.info(f"[ANALYSIS] ========== Starting real analysis for project {project_id[:8]} ==========")
    logger.info(f"[ANALYSIS] Clips: {len(clips)}, Brief: energy={brief.get('overall_energy')}, style={brief.get('music_style_direction')}")

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
    """
    from config import FRAMES_DIR, UPLOAD_DIR

    all_frames = []
    total_duration = sum(c.get("duration", 0) for c in clips)

    # Calculate how many frames we can extract per clip while staying under cap
    # Use proportional allocation based on clip duration
    for clip in clips:
        clip_duration = clip.get("duration", 0)
        # Allocate frames proportionally
        clip_frame_budget = int((clip_duration / total_duration) * MAX_ANALYSIS_FRAMES)
        clip_frame_budget = max(1, min(clip_frame_budget, int(clip_duration)))  # At least 1, at most 1 per second

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

    # Subsample if we exceeded the cap
    if len(all_frames) > MAX_ANALYSIS_FRAMES:
        step = len(all_frames) / MAX_ANALYSIS_FRAMES
        all_frames = [all_frames[int(i * step)] for i in range(MAX_ANALYSIS_FRAMES)]
        logger.info(f"[ANALYSIS] Subsampled to {MAX_ANALYSIS_FRAMES} frames")

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


async def extract_analysis_frames(clip_path: str, max_frames: int = 30) -> List[str]:
    """
    Extract frames for GPT-4o analysis (PRD Section 8.1 Pass 1).

    Command:
        ffmpeg -i clip.mp4 -vf "fps=1,scale=256:144" -q:v 8 frames/clip_N_%04d.jpg

    Cap at max_frames for this clip.

    Returns:
        List of base64-encoded frame images
    """
    from config import FRAMES_DIR

    # Create unique temp directory for this extraction
    temp_dir = os.path.join(FRAMES_DIR, f"analysis_{uuid.uuid4().hex[:8]}")
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # Get video duration to calculate fps for target frame count
        duration = await _get_video_duration(clip_path)
        if duration <= 0:
            duration = 60  # Default fallback

        # Calculate fps to get roughly max_frames frames
        target_fps = min(1.0, max_frames / duration)  # At most 1 fps

        output_pattern = os.path.join(temp_dir, "frame_%04d.jpg")

        cmd = [
            "ffmpeg", "-i", clip_path,
            "-vf", f"fps={target_fps},scale=256:144",
            "-q:v", "8",
            "-y",  # Overwrite
            output_pattern
        ]

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

        logger.info(f"[ANALYSIS] Extracted {len(frames)} frames from {os.path.basename(clip_path)}")
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


async def call_gpt4o_vision(
    frames: List[str],
    transcript: str,
    cut_density: List[dict],
    brief: dict,
    clips: List[dict]
) -> List[SectionAnalysis]:
    """
    Call GPT-4o Vision API (PRD Section 8.4).

    POST https://api.openai.com/v1/chat/completions
    model: gpt-4o
    Timeout: 35 seconds

    Returns:
        List of SectionAnalysis parsed from GPT-4o response
    """
    from config import OPENAI_API_KEY, OPENAI_BASE_URL

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
        pacing = _cuts_to_pacing(window["cuts_per_second"])
        cut_density_summary.append(
            f"{window['window_start']:.1f}-{window['window_end']:.1f}s: {pacing} ({window['cuts_per_second']:.2f} cuts/s)"
        )

    # Build the prompt (PRD Section 8.4)
    system_prompt = f"""You are scoring a video for background music composition.

CREATIVE BRIEF:
Overall Energy: {brief.get('overall_energy', 'Not specified')}
Music Style: {brief.get('music_style_direction', 'Not specified')}
References: {brief.get('references_text', 'None')}

CLIP BOUNDARIES (section boundaries must align to these):
{json.dumps(clip_boundaries, indent=2)}

CUT DENSITY ANALYSIS:
{chr(10).join(cut_density_summary)}

Cut density interpretation:
- >2.0 = Very Fast
- 1.0-2.0 = Fast
- 0.3-1.0 = Medium
- 0.1-0.3 = Slow
- <0.1 = Very Slow

TRANSCRIPT:
{transcript if transcript else "(No speech detected)"}

INSTRUCTIONS:
Divide the video into 3-5 narrative sections. Section boundaries MUST align to clip boundaries.

VALID VALUES (use ONLY these exact strings):
- section_type: {json.dumps(SECTION_TYPES)}
- scene_type: {json.dumps(SCENE_TYPES)}
- emotional_tone: {json.dumps(EMOTIONAL_TONES)}
- pacing: {json.dumps(PACING)}
- energy_level: {json.dumps(ENERGY_LEVELS)}

Return ONLY a raw JSON array. No markdown, no explanation, no code blocks.

[{{
  "start_time": float,
  "end_time": float,
  "section_type": "<from SECTION_TYPES>",
  "scene_type": "<from SCENE_TYPES>",
  "emotional_tone": "<from EMOTIONAL_TONES>",
  "pacing": "<from PACING>",
  "energy_level": "<from ENERGY_LEVELS>",
  "cuts_per_second": float,
  "detected_theme": "max 12 words describing what happens",
  "dominant_visual": "max 8 words describing key visuals",
  "suggested_music_style": "max 30 words, incorporate creator's style direction"
}}]"""

    # Build messages with frames as images
    messages = [
        {"role": "system", "content": system_prompt}
    ]

    # Add frames as images (limit to avoid token overflow)
    frame_content = []
    frames_to_send = frames[:FRAMES_PER_GPT_REQUEST]  # Limit frames

    for i, frame_b64 in enumerate(frames_to_send):
        frame_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{frame_b64}",
                "detail": "low"  # Use low detail to reduce tokens
            }
        })

    frame_content.append({
        "type": "text",
        "text": f"These are {len(frames_to_send)} evenly sampled frames from the video. Analyze them along with the transcript and cut density to determine narrative sections."
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
        "max_tokens": 2000,
        "temperature": 0.3  # Lower temperature for more consistent JSON
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
    """
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

            section = SectionAnalysis(
                start_time=float(section_data.get("start_time", 0)),
                end_time=float(section_data.get("end_time", 0)),
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
    """
    if not clips or not sections:
        return sections

    # Get all clip boundaries
    clip_boundaries = sorted(set(
        [c.get("start_time", 0) for c in clips] +
        [c.get("end_time", 0) for c in clips]
    ))

    aligned_sections = []
    for section in sections:
        # Find nearest clip boundary for start_time
        start_time = _find_nearest_boundary(section.start_time, clip_boundaries)
        # Find nearest clip boundary for end_time
        end_time = _find_nearest_boundary(section.end_time, clip_boundaries)

        # Ensure end > start
        if end_time <= start_time:
            # Find next boundary after start_time
            for boundary in clip_boundaries:
                if boundary > start_time:
                    end_time = boundary
                    break

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

    return aligned_sections


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
