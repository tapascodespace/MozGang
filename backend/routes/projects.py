import logging
from fastapi import APIRouter, HTTPException
from database import supabase
from models import CreativeBrief
from services.analysis_service import analyze_video

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


@router.post("/projects/{project_id}/brief")
async def submit_brief(project_id: str, brief: CreativeBrief):
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

    analysis_result = await analyze_video(clips, brief_dict, project_id)
    logger.info(f"[BRIEF] Analysis complete: {len(analysis_result.sections)} sections, mode={analysis_result.analysis_mode}")

    # Store sections in database
    sections = _store_analysis_sections(project_id, clips, analysis_result)

    logger.info(f"[BRIEF] ========== Brief complete: {len(sections)} sections created ({analysis_result.analysis_mode} mode) ==========")
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
