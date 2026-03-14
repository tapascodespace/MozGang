from fastapi import APIRouter, HTTPException
from database import supabase
from models import CreativeBrief

router = APIRouter()


@router.post("/projects")
async def create_project():
    result = supabase.table("projects").insert({}).execute()
    return result.data[0]


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    result = supabase.table("projects").select("*").eq("id", project_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return result.data[0]


@router.post("/projects/{project_id}/brief")
async def submit_brief(project_id: str, brief: CreativeBrief):
    """Submit creative brief and trigger analysis pipeline."""
    # Update project with brief data
    supabase.table("projects").update({
        "overall_energy": brief.overall_energy,
        "music_style_direction": brief.music_style_direction,
        "references_text": brief.references_text or "",
    }).eq("id", project_id).execute()

    # Get clips for this project
    clips_result = supabase.table("clips").select("*").eq(
        "project_id", project_id
    ).order("clip_order").execute()

    clips = clips_result.data
    if not clips:
        raise HTTPException(status_code=400, detail="No clips uploaded")

    # Phase 1: Auto-divide into 3-5 equal sections at clip boundaries
    total_duration = sum(c["duration"] for c in clips)
    supabase.table("projects").update({
        "total_duration": total_duration
    }).eq("id", project_id).execute()

    sections = _create_mock_sections(project_id, clips, total_duration, brief)
    return {"sections": sections, "total_duration": total_duration}


@router.put("/projects/{project_id}/brief")
async def update_brief(project_id: str, brief: CreativeBrief):
    """Update brief without re-triggering analysis."""
    supabase.table("projects").update({
        "overall_energy": brief.overall_energy,
        "music_style_direction": brief.music_style_direction,
        "references_text": brief.references_text or "",
    }).eq("id", project_id).execute()
    return {"status": "updated"}


def _create_mock_sections(project_id: str, clips: list, total_duration: float, brief: CreativeBrief):
    """Phase 1: Auto-divide clips into 3-5 equal sections at clip boundaries."""
    from config import SECTION_TYPES, MIN_SECTIONS, MAX_SECTIONS

    # Delete existing sections for this project
    supabase.table("sections").delete().eq("project_id", project_id).execute()

    num_clips = len(clips)
    # Target 3-5 sections, but can't have more sections than clips
    num_sections = min(max(MIN_SECTIONS, num_clips), MAX_SECTIONS)
    num_sections = min(num_sections, num_clips)

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

        section_data = {
            "project_id": project_id,
            "start_time": start_time,
            "end_time": end_time,
            "duration": duration,
            "clip_ids": clip_ids,
            "section_type": section_types[i] if i < len(section_types) else "Build",
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
        clip_idx += clips_per_section[i]

    return sections
