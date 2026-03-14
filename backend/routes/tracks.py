from fastapi import APIRouter, HTTPException
from database import supabase

router = APIRouter()


@router.get("/projects/{project_id}/tracks")
async def get_tracks(project_id: str):
    """Get all non-discarded tracks for a project's sections."""
    sections = supabase.table("sections").select("id").eq(
        "project_id", project_id
    ).execute()
    section_ids = [s["id"] for s in sections.data]

    if not section_ids:
        return []

    tracks = supabase.table("tracks").select("*").in_(
        "section_id", section_ids
    ).eq("is_discarded", False).execute()

    return tracks.data


@router.get("/projects/{project_id}/tracks/{track_id}/download")
async def download_track(project_id: str, track_id: str):
    """Get download URL for a track."""
    result = supabase.table("tracks").select("*").eq("id", track_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Track not found")

    track = result.data[0]
    if not track.get("storage_path"):
        raise HTTPException(status_code=404, detail="Track has no audio file")

    url = supabase.storage.from_("media").get_public_url(track["storage_path"])
    return {"download_url": url}
