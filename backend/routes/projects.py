import asyncio
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from database import supabase
from models import CreativeBrief
from services.analysis_service import (
    analyze_video,
    pre_analyze_video,
    analyze_video_with_preanalysis,
    suggest_music_style
)
from services.music_service import generate_music_for_section

logger = logging.getLogger("scoreflow.projects")

router = APIRouter()


@router.post("/projects")
async def create_project():
    logger.info("[PROJECT] ========== Creating new project ==========")
    result = supabase.table("projects").insert({}).execute()
    project = result.data[0]
    logger.info(f"[PROJECT] Created project: {project['id']}")
    return project


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    logger.info(f"[PROJECT] Fetching project {project_id[:8]}...")
    result = supabase.table("projects").select("*").eq("id", project_id).execute()
    if not result.data:
        logger.error(f"[PROJECT] Project {project_id} not found")
        raise HTTPException(status_code=404, detail="Project not found")
    logger.info(f"[PROJECT] Found project: duration={result.data[0].get('total_duration', 0)}s")
    return result.data[0]


class PreAnalyzeRequest(BaseModel):
    vibe: Optional[str] = None


@router.post("/projects/{project_id}/pre-analyze")
async def start_pre_analysis(
    project_id: str,
    background_tasks: BackgroundTasks,
    request: PreAnalyzeRequest = None
):
    """
    Start pre-analysis for a project.

    Enhanced pre-analysis includes:
    - Frame extraction
    - Audio transcription
    - Scene detection (internal cuts)
    - Auto-boundary detection (section suggestions)
    - Video structure detection
    - Music style recommendation (if vibe is provided)

    This runs while the user fills out the simplified brief.
    Fire-and-forget: returns immediately with status "started".

    Args:
        vibe: Optional user-selected vibe for music style recommendation
    """
    vibe = request.vibe if request else None
    logger.info(f"[PRE-ANALYSIS] ========== Starting pre-analysis for project {project_id[:8]}, vibe={vibe or '(none)'} ==========")

    # Get clips for this project
    clips_result = supabase.table("clips").select("*").eq(
        "project_id", project_id
    ).order("clip_order").execute()

    clips = clips_result.data

    if not clips:
        logger.warning(f"[PRE-ANALYSIS] No clips found for project {project_id[:8]}")
        return {"status": "skipped", "message": "No clips to analyze"}

    # Check if pre-analysis already started or completed
    project_result = supabase.table("projects").select(
        "pre_analysis_status, detected_video_structure, detected_theme_summary, recommended_music_style"
    ).eq("id", project_id).execute()

    if project_result.data:
        status = project_result.data[0].get("pre_analysis_status")
        if status == "COMPLETE":
            # If already complete, return the results
            logger.info(f"[PRE-ANALYSIS] Already COMPLETE for project {project_id[:8]}")
            return {
                "status": "complete",
                "video_structure": project_result.data[0].get("detected_video_structure"),
                "theme_summary": project_result.data[0].get("detected_theme_summary"),
                "recommended_music_style": project_result.data[0].get("recommended_music_style"),
            }
        elif status == "ANALYZING":
            logger.info(f"[PRE-ANALYSIS] Already ANALYZING for project {project_id[:8]}")
            return {"status": "analyzing"}

    # Queue background task
    background_tasks.add_task(
        _background_pre_analyze,
        clips=clips,
        project_id=project_id,
        vibe=vibe
    )

    return {"status": "started"}


@router.get("/projects/{project_id}/pre-analysis-status")
async def get_pre_analysis_status(project_id: str):
    """
    Get the current pre-analysis status and results for a project.

    Returns status and results if complete (video_structure, theme, music recommendation).
    """
    result = supabase.table("projects").select(
        "pre_analysis_status, selected_vibe, detected_video_structure, "
        "detected_theme_summary, recommended_music_style, pre_analysis_auto_boundaries"
    ).eq("id", project_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    project = result.data[0]
    status = project.get("pre_analysis_status", "PENDING")

    response = {
        "status": status.lower() if status else "pending",
        "vibe": project.get("selected_vibe"),
    }

    if status == "COMPLETE":
        response.update({
            "video_structure": project.get("detected_video_structure"),
            "theme_summary": project.get("detected_theme_summary"),
            "recommended_music_style": project.get("recommended_music_style"),
            "auto_boundaries": project.get("pre_analysis_auto_boundaries"),
        })

    return response


class UpdateVibeRequest(BaseModel):
    vibe: str


@router.post("/projects/{project_id}/vibe")
async def set_project_vibe(project_id: str, request: UpdateVibeRequest):
    """
    Set the user's selected vibe and get/update music style recommendation.

    This can be called after pre-analysis to get the recommended music style,
    or to update the vibe selection.
    """
    vibe = request.vibe
    logger.info(f"[VIBE] Setting vibe for project {project_id[:8]}: {vibe}")

    # Get current project data
    result = supabase.table("projects").select(
        "detected_video_structure, detected_theme_summary"
    ).eq("id", project_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    project = result.data[0]
    video_structure = project.get("detected_video_structure", "Mixed")
    theme_summary = project.get("detected_theme_summary")

    # Generate music style recommendation
    recommended_style = suggest_music_style(vibe, video_structure, theme_summary)

    # Update project
    supabase.table("projects").update({
        "selected_vibe": vibe,
        "recommended_music_style": recommended_style,
    }).eq("id", project_id).execute()

    return {
        "vibe": vibe,
        "video_structure": video_structure,
        "theme_summary": theme_summary,
        "recommended_music_style": recommended_style,
    }


class ConfirmStyleRequest(BaseModel):
    music_style: str


@router.post("/projects/{project_id}/confirm-style")
async def confirm_music_style(project_id: str, request: ConfirmStyleRequest):
    """
    Confirm the music style to use as the "gold standard" for all sections.

    This is the style that will be used as the default for all sections,
    with only dramatic deviations allowed.
    """
    music_style = request.music_style
    logger.info(f"[STYLE] Confirming music style for project {project_id[:8]}: {music_style}")

    supabase.table("projects").update({
        "confirmed_music_style": music_style,
    }).eq("id", project_id).execute()

    return {"confirmed_music_style": music_style}


async def _background_pre_analyze(clips: list, project_id: str, vibe: str = None):
    """Background task to run pre-analysis."""
    try:
        await pre_analyze_video(clips, project_id, vibe)
    except Exception as e:
        logger.error(f"[PRE-ANALYSIS] Background task failed: {e}")


@router.post("/projects/{project_id}/brief")
async def submit_brief(project_id: str, brief: CreativeBrief, background_tasks: BackgroundTasks):
    """Submit creative brief and trigger analysis pipeline (PRD Section 8)."""
    logger.info(f"[BRIEF] ========== Submitting brief for project {project_id[:8]}... ==========")
    logger.info(f"[BRIEF] Energy: {brief.overall_energy}")
    logger.info(f"[BRIEF] Style: {brief.music_style_direction}")
    logger.info(f"[BRIEF] References: {brief.references_text or '(none)'}")

    # Update project with brief data
    supabase.table("projects").update({
        "overall_energy": brief.overall_energy,
        "music_style_direction": brief.music_style_direction,
        "references_text": brief.references_text or "",
    }).eq("id", project_id).execute()
    logger.info(f"[BRIEF] Project brief data updated")

    # Get project to check pre-analysis status and gold standard style
    project_result = supabase.table("projects").select("*").eq("id", project_id).execute()
    project_data = project_result.data[0] if project_result.data else {}
    pre_analysis_status = project_data.get("pre_analysis_status")
    confirmed_style = project_data.get("confirmed_music_style")
    recommended_style = project_data.get("recommended_music_style")

    # Use confirmed style, or fall back to recommended, or brief.music_style_direction
    gold_standard_style = confirmed_style or recommended_style or brief.music_style_direction

    logger.info(f"[BRIEF] Pre-analysis status: {pre_analysis_status}")
    logger.info(f"[BRIEF] Gold standard music style: {gold_standard_style}")

    # Get clips for this project
    logger.info(f"[BRIEF] Querying clips for project {project_id[:8]}...")
    clips_result = supabase.table("clips").select("*").eq(
        "project_id", project_id
    ).order("clip_order").execute()

    clips = clips_result.data
    logger.info(f"[BRIEF] Found {len(clips)} clips")

    if not clips:
        logger.error(f"[BRIEF] ✗ No clips found for project {project_id} — cannot create sections")
        raise HTTPException(status_code=400, detail="No clips uploaded for this project. Upload clips first.")

    for c in clips:
        logger.info(f"[BRIEF]   Clip: {c['filename']} | order={c['clip_order']} | {c['start_time']:.2f}s-{c['end_time']:.2f}s ({c['duration']:.2f}s)")

    total_duration = sum(c["duration"] for c in clips)
    logger.info(f"[BRIEF] Total duration: {total_duration:.2f}s")

    supabase.table("projects").update({
        "total_duration": total_duration
    }).eq("id", project_id).execute()

    # Delete existing sections for this project
    supabase.table("sections").delete().eq("project_id", project_id).execute()
    logger.info(f"[BRIEF] Cleared existing sections")

    # Run the analysis pipeline (PRD Section 8.1-8.5)
    brief_dict = {
        "overall_energy": brief.overall_energy,
        "music_style_direction": brief.music_style_direction,
        "references_text": brief.references_text or "",
    }

    # Check if pre-analysis is complete - use cached data for faster processing
    if pre_analysis_status == "COMPLETE":
        logger.info("[BRIEF] Using pre-analysis data (faster path)")

        # Recalculate density windows from scene changes if available
        scene_changes = project_data.get("pre_analysis_scene_changes", [])
        if scene_changes:
            from services.analysis_service import calculate_density_windows
            density_windows = calculate_density_windows(scene_changes, total_duration)
            logger.info(f"[BRIEF] Recalculated {len(density_windows)} density windows from {len(scene_changes)} scene changes")
        else:
            density_windows = []

        pre_analysis = {
            "frames": project_data.get("pre_analysis_frames", []),
            "transcript": project_data.get("pre_analysis_transcript", ""),
            "cut_density": project_data.get("pre_analysis_cut_density", []),
            "auto_boundaries": project_data.get("pre_analysis_auto_boundaries", []),
            "density_windows": density_windows,
            "video_structure": project_data.get("detected_video_structure"),
            "scene_changes": project_data.get("pre_analysis_scene_changes", []),
        }
        analysis_result = await analyze_video_with_preanalysis(
            clips, brief_dict, project_id, pre_analysis, gold_standard_style
        )
    else:
        # Full pipeline (fallback)
        logger.info("[BRIEF] Running full analysis pipeline (pre-analysis not available)")
        analysis_result = await analyze_video(clips, brief_dict, project_id)

    logger.info(f"[BRIEF] Analysis complete: {len(analysis_result.sections)} sections, mode={analysis_result.analysis_mode}")

    # Store sections in database
    sections = _store_analysis_sections(project_id, clips, analysis_result)

    logger.info(f"[BRIEF] ========== Brief complete: {len(sections)} sections created ({analysis_result.analysis_mode} mode) ==========")

    # Auto-generate music for all sections in the background
    logger.info(f"[BRIEF] Auto-starting music generation for {len(sections)} sections")
    background_tasks.add_task(
        _background_generate_all_sections,
        sections=sections,
        brief=brief_dict,
        project_id=project_id,
    )

    return {"sections": sections, "total_duration": total_duration, "analysis_mode": analysis_result.analysis_mode}


@router.put("/projects/{project_id}/brief")
async def update_brief(project_id: str, brief: CreativeBrief):
    """Update brief without re-triggering analysis."""
    logger.info(f"[BRIEF] Updating brief for project {project_id[:8]} (no re-analysis)")
    supabase.table("projects").update({
        "overall_energy": brief.overall_energy,
        "music_style_direction": brief.music_style_direction,
        "references_text": brief.references_text or "",
    }).eq("id", project_id).execute()
    return {"status": "updated"}


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


def _store_analysis_sections(project_id: str, clips: list, analysis_result) -> list:
    """
    Store analysis sections in the database.
    Assigns clips to sections based on their center point relative to section boundaries.
    """
    sections = []

    for i, section_analysis in enumerate(analysis_result.sections):
        # Find clips that belong to this section (center point within section boundaries)
        section_clip_ids = []
        for clip in clips:
            clip_center = (clip["start_time"] + clip["end_time"]) / 2
            if section_analysis.start_time <= clip_center < section_analysis.end_time:
                section_clip_ids.append(clip["id"])

        # If no clips assigned by center point, assign clips that overlap
        if not section_clip_ids:
            for clip in clips:
                if clip["start_time"] < section_analysis.end_time and clip["end_time"] > section_analysis.start_time:
                    section_clip_ids.append(clip["id"])

        duration = section_analysis.end_time - section_analysis.start_time

        # Convert energy_level string to float for database
        energy_float = _energy_level_to_float(section_analysis.energy_level)

        section_data = {
            "project_id": project_id,
            "start_time": section_analysis.start_time,
            "end_time": section_analysis.end_time,
            "duration": duration,
            "clip_ids": section_clip_ids,
            "section_type": section_analysis.section_type,
            "scene_type": section_analysis.scene_type,
            "emotional_tone": section_analysis.emotional_tone,
            "pacing": section_analysis.pacing,
            "energy_level": energy_float,
            "cuts_per_second": section_analysis.cuts_per_second,
            "detected_theme": section_analysis.detected_theme,
            "dominant_visual": section_analysis.dominant_visual,
            "suggested_music_style": section_analysis.suggested_music_style,
            "music_status": "PENDING",
            "feedback_history": [],
            "section_order": i,
        }

        result = supabase.table("sections").insert(section_data).execute()
        sections.append(result.data[0])
        logger.info(
            f"[SECTIONS] ✓ Section {i}: {section_analysis.section_type} | "
            f"{section_analysis.start_time:.2f}s-{section_analysis.end_time:.2f}s ({duration:.2f}s) | "
            f"{len(section_clip_ids)} clips | {section_analysis.emotional_tone} | energy={energy_float}"
        )

    return sections


async def _background_generate_all_sections(
    sections: list,
    brief: dict,
    project_id: str,
):
    """
    Background task to auto-generate music for all sections after brief submission.
    Generates sequentially so each section's prompt can reference neighbors.
    """
    logger.info(f"[AUTO-GEN] ========== Starting auto-generation for {len(sections)} sections ==========")

    # Sort by section_order to process in order
    sorted_sections = sorted(sections, key=lambda s: s.get("section_order", 0))

    for i, section in enumerate(sorted_sections):
        section_id = section["id"]
        prev_section = sorted_sections[i - 1] if i > 0 else None
        next_section = sorted_sections[i + 1] if i < len(sorted_sections) - 1 else None

        try:
            # Mark as GENERATING
            supabase.table("sections").update({
                "music_status": "GENERATING"
            }).eq("id", section_id).execute()

            logger.info(
                f"[AUTO-GEN] Generating section {i + 1}/{len(sorted_sections)}: "
                f"{section.get('section_type', '?')} ({section.get('duration', 0):.1f}s)"
            )

            track = await generate_music_for_section(
                section, brief, project_id,
                prev_section=prev_section,
                next_section=next_section,
            )

            # Insert track record
            track_data = {
                "section_id": section_id,
                "storage_path": track.storage_path,
                "stream_url": track.stream_url,
                "duration": track.duration,
                "generation_prompt": track.generation_prompt,
                "trimmed_to_fit": track.trimmed_to_fit,
                "is_discarded": False,
            }
            supabase.table("tracks").insert(track_data).execute()

            # Mark as READY
            supabase.table("sections").update({
                "music_status": "READY"
            }).eq("id", section_id).execute()

            logger.info(f"[AUTO-GEN] ✓ Section {i + 1}/{len(sorted_sections)} complete")

        except Exception as e:
            logger.error(f"[AUTO-GEN] ✗ Section {section_id[:8]} failed: {e}")
            supabase.table("sections").update({
                "music_status": "FAILED"
            }).eq("id", section_id).execute()

    logger.info(f"[AUTO-GEN] ========== Auto-generation finished ==========")

