import logging
from fastapi import APIRouter, HTTPException
from database import supabase
from models import CreativeBrief

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
    """Submit creative brief and trigger analysis pipeline."""
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

    # Phase 1: Auto-divide into 3-5 equal sections at clip boundaries
    total_duration = sum(c["duration"] for c in clips)
    logger.info(f"[BRIEF] Total duration: {total_duration:.2f}s")

    supabase.table("projects").update({
        "total_duration": total_duration
    }).eq("id", project_id).execute()

    sections = _create_mock_sections(project_id, clips, total_duration, brief)
    logger.info(f"[BRIEF] ========== Brief complete: {len(sections)} sections created ==========")
    return {"sections": sections, "total_duration": total_duration}


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


def _create_mock_sections(project_id: str, clips: list, total_duration: float, brief: CreativeBrief):
    """Phase 1: Auto-divide clips into 3-5 equal sections at clip boundaries."""
    from config import SECTION_TYPES, MIN_SECTIONS, MAX_SECTIONS

    logger.info(f"[SECTIONS] Creating mock sections for {len(clips)} clips ({total_duration:.2f}s total)")

    # Delete existing sections for this project
    supabase.table("sections").delete().eq("project_id", project_id).execute()
    logger.info(f"[SECTIONS] Cleared existing sections")

    num_clips = len(clips)
    num_sections = min(max(MIN_SECTIONS, num_clips), MAX_SECTIONS)
    num_sections = min(num_sections, num_clips)
    logger.info(f"[SECTIONS] Target: {num_sections} sections for {num_clips} clips")

    # Distribute clips across sections as evenly as possible
    clips_per_section = []
    base = num_clips // num_sections
    remainder = num_clips % num_sections
    for i in range(num_sections):
        clips_per_section.append(base + (1 if i < remainder else 0))

    # Default section types sequence
    default_types = ["Hook", "Intro", "Build", "Reveal", "Outro"]
    if num_sections <= len(default_types):
        section_types = default_types[:num_sections]
    else:
        section_types = default_types

    sections = []
    clip_idx = 0
    for i in range(num_sections):
        section_clips = clips[clip_idx:clip_idx + clips_per_section[i]]
        clip_ids = [c["id"] for c in section_clips]
        start_time = section_clips[0]["start_time"]
        end_time = section_clips[-1]["end_time"]
        duration = end_time - start_time
        s_type = section_types[i] if i < len(section_types) else "Build"

        section_data = {
            "project_id": project_id,
            "start_time": start_time,
            "end_time": end_time,
            "duration": duration,
            "clip_ids": clip_ids,
            "section_type": s_type,
            "scene_type": "Vlog/Casual",
            "emotional_tone": "Energetic",
            "pacing": "Medium",
            "energy_level": 0.5,
            "cuts_per_second": 0.5,
            "detected_theme": "Scene analysis pending",
            "dominant_visual": "Pending",
            "suggested_music_style": "Style pending — connect AI",
            "music_status": "PENDING",
            "feedback_history": [],
            "section_order": i,
        }

        result = supabase.table("sections").insert(section_data).execute()
        sections.append(result.data[0])
        logger.info(f"[SECTIONS] ✓ Section {i}: {s_type} | {start_time:.2f}s-{end_time:.2f}s ({duration:.2f}s) | {len(clip_ids)} clips")
        clip_idx += clips_per_section[i]

    return sections
