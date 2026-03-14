from fastapi import APIRouter, HTTPException
from database import supabase

router = APIRouter()


@router.post("/projects/{project_id}/export")
async def trigger_export(project_id: str):
    """Trigger export. Phase 1: returns disabled message."""
    return {"status": "disabled", "message": "Export available in Phase 2"}


@router.get("/projects/{project_id}/export/download")
async def download_export(project_id: str):
    """Download exported MP4. Phase 1: not available."""
    raise HTTPException(status_code=404, detail="Export not available in Phase 1")
