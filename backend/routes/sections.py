from fastapi import APIRouter, HTTPException
from database import supabase
from models import SectionUpdate, MergeRequest, ResizeRequest, SplitRequest, RegenerateRequest
from config import SECTION_TYPES

router = APIRouter()


@router.get("/projects/{project_id}/sections")
async def get_sections(project_id: str):
    result = supabase.table("sections").select("*").eq(
        "project_id", project_id
    ).order("section_order").execute()
    return result.data


@router.put("/projects/{project_id}/sections/{section_id}")
async def update_section(project_id: str, section_id: str, body: SectionUpdate):
    update_data = {}
    if body.section_type is not None:
        update_data["section_type"] = body.section_type
    if body.emotional_tone is not None:
        update_data["emotional_tone"] = body.emotional_tone

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("sections").update(update_data).eq("id", section_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Section not found")
    return result.data[0]


@router.post("/projects/{project_id}/sections/{section_id}/generate")
async def generate_music(project_id: str, section_id: str):
    """Trigger music generation for a section. Phase 1: returns mock response."""
    # Phase 1: just return a toast message
    section = supabase.table("sections").select("*").eq("id", section_id).execute()
    if not section.data:
        raise HTTPException(status_code=404, detail="Section not found")

    return {"status": "pending", "message": "AI generation available in Phase 2"}


@router.post("/projects/{project_id}/sections/{section_id}/regenerate")
async def regenerate_music(project_id: str, section_id: str, body: RegenerateRequest):
    """Regenerate music with feedback. Phase 1: stores feedback only."""
    section = supabase.table("sections").select("*").eq("id", section_id).execute()
    if not section.data:
        raise HTTPException(status_code=404, detail="Section not found")

    s = section.data[0]
    feedback_history = s.get("feedback_history") or []
    feedback_history.append(body.feedback)

    supabase.table("sections").update({
        "feedback_history": feedback_history
    }).eq("id", section_id).execute()

    return {"status": "pending", "message": "AI regeneration available in Phase 2"}


@router.post("/projects/{project_id}/sections/merge")
async def merge_sections(project_id: str, body: MergeRequest):
    """Merge two adjacent sections."""
    if len(body.section_ids) != 2:
        raise HTTPException(status_code=400, detail="Exactly 2 section IDs required")

    sections = []
    for sid in body.section_ids:
        result = supabase.table("sections").select("*").eq("id", sid).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail=f"Section {sid} not found")
        sections.append(result.data[0])

    # Sort by section_order
    sections.sort(key=lambda s: s["section_order"])
    s1, s2 = sections

    # Check adjacency
    if abs(s1["section_order"] - s2["section_order"]) != 1:
        raise HTTPException(status_code=400, detail="Sections must be adjacent")

    # Check if any have READY tracks - return confirmation flag
    has_ready = s1["music_status"] == "READY" or s2["music_status"] == "READY"

    # Larger section wins attributes
    winner = s1 if s1["duration"] >= s2["duration"] else s2
    clip_ids = (s1.get("clip_ids") or []) + (s2.get("clip_ids") or [])

    merged = {
        "project_id": project_id,
        "start_time": s1["start_time"],
        "end_time": s2["end_time"],
        "duration": s2["end_time"] - s1["start_time"],
        "clip_ids": clip_ids,
        "section_type": winner["section_type"],
        "scene_type": winner["scene_type"],
        "emotional_tone": winner["emotional_tone"],
        "pacing": winner["pacing"],
        "energy_level": winner["energy_level"],
        "cuts_per_second": winner.get("cuts_per_second", 0.5),
        "detected_theme": winner["detected_theme"],
        "dominant_visual": winner["dominant_visual"],
        "suggested_music_style": winner["suggested_music_style"],
        "music_status": "PENDING",
        "feedback_history": [],
        "section_order": s1["section_order"],
    }

    # Delete old sections
    supabase.table("sections").delete().eq("id", s1["id"]).execute()
    supabase.table("sections").delete().eq("id", s2["id"]).execute()

    # Insert merged
    result = supabase.table("sections").insert(merged).execute()

    # Re-order remaining sections
    _reorder_sections(project_id)

    return result.data[0]


@router.put("/projects/{project_id}/sections/{section_id}/resize")
async def resize_section(project_id: str, section_id: str, body: ResizeRequest):
    """Resize a section (must align to clip boundary)."""
    section = supabase.table("sections").select("*").eq("id", section_id).execute()
    if not section.data:
        raise HTTPException(status_code=404, detail="Section not found")

    s = section.data[0]
    update_data = {}

    if body.new_start_time is not None:
        update_data["start_time"] = body.new_start_time
    if body.new_end_time is not None:
        update_data["end_time"] = body.new_end_time

    new_start = update_data.get("start_time", s["start_time"])
    new_end = update_data.get("end_time", s["end_time"])
    update_data["duration"] = new_end - new_start
    update_data["music_status"] = "PENDING"

    # Get clips that fall in new range
    clips = supabase.table("clips").select("*").eq(
        "project_id", project_id
    ).order("clip_order").execute()

    new_clip_ids = [
        c["id"] for c in clips.data
        if c["start_time"] >= new_start and c["end_time"] <= new_end
    ]
    update_data["clip_ids"] = new_clip_ids

    result = supabase.table("sections").update(update_data).eq("id", section_id).execute()

    # Update adjacent section
    _update_adjacent_sections(project_id, section_id, s, new_start, new_end)

    return result.data[0]


@router.post("/projects/{project_id}/sections/{section_id}/split")
async def split_section(project_id: str, section_id: str, body: SplitRequest):
    """Split a section at a clip boundary."""
    section = supabase.table("sections").select("*").eq("id", section_id).execute()
    if not section.data:
        raise HTTPException(status_code=404, detail="Section not found")

    s = section.data[0]
    clip_ids = s.get("clip_ids") or []

    if body.split_at_clip_id not in clip_ids:
        raise HTTPException(status_code=400, detail="Clip not in this section")

    split_idx = clip_ids.index(body.split_at_clip_id)
    if split_idx == 0:
        raise HTTPException(status_code=400, detail="Cannot split at first clip")

    # Get clip details for timing
    clips = supabase.table("clips").select("*").in_("id", clip_ids).order("clip_order").execute()
    clip_map = {c["id"]: c for c in clips.data}

    first_clip_ids = clip_ids[:split_idx]
    second_clip_ids = clip_ids[split_idx:]

    split_clip = clip_map[body.split_at_clip_id]
    split_time = split_clip["start_time"]

    # Get next section type
    current_type = s["section_type"]
    type_idx = SECTION_TYPES.index(current_type) if current_type in SECTION_TYPES else 0
    next_type = SECTION_TYPES[min(type_idx + 1, len(SECTION_TYPES) - 1)]

    section1 = {
        "project_id": project_id,
        "start_time": s["start_time"],
        "end_time": split_time,
        "duration": split_time - s["start_time"],
        "clip_ids": first_clip_ids,
        "section_type": s["section_type"],
        "scene_type": s["scene_type"],
        "emotional_tone": s["emotional_tone"],
        "pacing": s["pacing"],
        "energy_level": s["energy_level"],
        "cuts_per_second": s.get("cuts_per_second", 0.5),
        "detected_theme": s["detected_theme"],
        "dominant_visual": s["dominant_visual"],
        "suggested_music_style": s["suggested_music_style"],
        "music_status": "PENDING",
        "feedback_history": [],
        "section_order": s["section_order"],
    }

    section2 = {
        "project_id": project_id,
        "start_time": split_time,
        "end_time": s["end_time"],
        "duration": s["end_time"] - split_time,
        "clip_ids": second_clip_ids,
        "section_type": next_type,
        "scene_type": s["scene_type"],
        "emotional_tone": s["emotional_tone"],
        "pacing": s["pacing"],
        "energy_level": s["energy_level"],
        "cuts_per_second": s.get("cuts_per_second", 0.5),
        "detected_theme": s["detected_theme"],
        "dominant_visual": s["dominant_visual"],
        "suggested_music_style": s["suggested_music_style"],
        "music_status": "PENDING",
        "feedback_history": [],
        "section_order": s["section_order"] + 1,
    }

    # Delete original
    supabase.table("sections").delete().eq("id", section_id).execute()

    # Insert new sections
    r1 = supabase.table("sections").insert(section1).execute()
    r2 = supabase.table("sections").insert(section2).execute()

    _reorder_sections(project_id)

    return [r1.data[0], r2.data[0]]


@router.post("/projects/{project_id}/sections/{section_id}/undo")
async def undo_section(project_id: str, section_id: str):
    """Restore the most recent discarded track."""
    tracks = supabase.table("tracks").select("*").eq(
        "section_id", section_id
    ).eq("is_discarded", True).order("id", desc=True).limit(1).execute()

    if not tracks.data:
        raise HTTPException(status_code=404, detail="No discarded track to restore")

    track = tracks.data[0]
    supabase.table("tracks").update({"is_discarded": False}).eq("id", track["id"]).execute()
    supabase.table("sections").update({"music_status": "READY"}).eq("id", section_id).execute()

    return {"status": "restored", "track": track}


def _reorder_sections(project_id: str):
    """Re-order section_order values sequentially."""
    sections = supabase.table("sections").select("*").eq(
        "project_id", project_id
    ).order("start_time").execute()

    for i, s in enumerate(sections.data):
        if s["section_order"] != i:
            supabase.table("sections").update({"section_order": i}).eq("id", s["id"]).execute()


def _update_adjacent_sections(project_id: str, section_id: str, original: dict,
                               new_start: float, new_end: float):
    """Update adjacent sections when one is resized."""
    sections = supabase.table("sections").select("*").eq(
        "project_id", project_id
    ).order("section_order").execute()

    for s in sections.data:
        if s["id"] == section_id:
            continue
        # If this section was adjacent and needs updating
        if s["end_time"] == original["start_time"] and new_start != original["start_time"]:
            supabase.table("sections").update({
                "end_time": new_start,
                "duration": new_start - s["start_time"],
                "music_status": "PENDING",
            }).eq("id", s["id"]).execute()
        elif s["start_time"] == original["end_time"] and new_end != original["end_time"]:
            supabase.table("sections").update({
                "start_time": new_end,
                "duration": s["end_time"] - new_end,
                "music_status": "PENDING",
            }).eq("id", s["id"]).execute()
