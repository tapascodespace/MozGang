import os
import uuid
import subprocess
import json
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List
from database import supabase
from config import UPLOAD_DIR, THUMBNAILS_DIR, FFMPEG_PATH, MAX_TOTAL_DURATION_SECONDS
from models import ReorderRequest

router = APIRouter()


def get_video_duration(filepath: str) -> float:
    """Get video duration using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True, text=True, timeout=30
        )
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except Exception:
        return 0.0


def generate_thumbnails(filepath: str, clip_id: str, duration: float) -> list:
    """Generate thumbnail strip frames for timeline UI."""
    thumb_dir = os.path.join(THUMBNAILS_DIR, clip_id)
    os.makedirs(thumb_dir, exist_ok=True)

    try:
        subprocess.run(
            [FFMPEG_PATH, "-i", filepath, "-vf", "fps=0.4,scale=128:72", "-q:v", "10",
             os.path.join(thumb_dir, "thumb_%04d.jpg")],
            capture_output=True, timeout=120
        )
    except Exception:
        pass

    # Upload thumbnails to Supabase Storage
    thumbnail_urls = []
    if os.path.exists(thumb_dir):
        for fname in sorted(os.listdir(thumb_dir)):
            if fname.endswith(".jpg"):
                fpath = os.path.join(thumb_dir, fname)
                storage_path = f"thumbnails/{clip_id}/{fname}"
                try:
                    with open(fpath, "rb") as f:
                        supabase.storage.from_("media").upload(
                            storage_path, f.read(),
                            file_options={"content-type": "image/jpeg"}
                        )
                    url = supabase.storage.from_("media").get_public_url(storage_path)
                    thumbnail_urls.append(url)
                except Exception:
                    pass

    return thumbnail_urls


@router.post("/projects/{project_id}/clips")
async def upload_clips(project_id: str, files: List[UploadFile] = File(...)):
    """Upload video clips to project."""
    # Verify project exists
    project = supabase.table("projects").select("*").eq("id", project_id).execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get existing clips to calculate start time
    existing = supabase.table("clips").select("*").eq(
        "project_id", project_id
    ).order("clip_order").execute()
    current_end = 0.0
    clip_order = len(existing.data)

    if existing.data:
        current_end = max(c["end_time"] for c in existing.data)

    uploaded_clips = []

    for file in files:
        clip_id = str(uuid.uuid4())
        ext = os.path.splitext(file.filename)[1] or ".mp4"
        local_path = os.path.join(UPLOAD_DIR, f"{clip_id}{ext}")

        # Save locally
        content = await file.read()
        with open(local_path, "wb") as f:
            f.write(content)

        # Get duration
        duration = get_video_duration(local_path)
        if duration <= 0:
            os.remove(local_path)
            continue

        # Check total duration limit
        if current_end + duration > MAX_TOTAL_DURATION_SECONDS:
            os.remove(local_path)
            raise HTTPException(
                status_code=400,
                detail=f"Total duration would exceed {MAX_TOTAL_DURATION_SECONDS}s limit"
            )

        # Upload to Supabase Storage
        storage_path = f"clips/{clip_id}{ext}"
        try:
            with open(local_path, "rb") as f:
                supabase.storage.from_("media").upload(
                    storage_path, f.read(),
                    file_options={"content-type": file.content_type or "video/mp4"}
                )
        except Exception as e:
            os.remove(local_path)
            raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

        # Generate thumbnails
        thumbnail_urls = generate_thumbnails(local_path, clip_id, duration)

        start_time = current_end
        end_time = current_end + duration

        clip_data = {
            "id": clip_id,
            "project_id": project_id,
            "filename": file.filename,
            "storage_path": storage_path,
            "start_time": start_time,
            "end_time": end_time,
            "duration": duration,
            "clip_order": clip_order,
            "thumbnail_urls": thumbnail_urls,
        }

        result = supabase.table("clips").insert(clip_data).execute()
        uploaded_clips.append(result.data[0])

        current_end = end_time
        clip_order += 1

        # Clean up local file
        try:
            os.remove(local_path)
        except Exception:
            pass

    # Update project total duration
    supabase.table("projects").update({
        "total_duration": current_end
    }).eq("id", project_id).execute()

    return uploaded_clips


@router.get("/projects/{project_id}/clips")
async def get_clips(project_id: str):
    result = supabase.table("clips").select("*").eq(
        "project_id", project_id
    ).order("clip_order").execute()
    return result.data


@router.put("/projects/{project_id}/clips/reorder")
async def reorder_clips(project_id: str, body: ReorderRequest):
    """Reorder clips and recalculate timings."""
    clips = supabase.table("clips").select("*").eq(
        "project_id", project_id
    ).execute()

    clip_map = {c["id"]: c for c in clips.data}
    current_time = 0.0

    for i, clip_id in enumerate(body.clip_ids):
        if clip_id not in clip_map:
            raise HTTPException(status_code=400, detail=f"Clip {clip_id} not found")
        clip = clip_map[clip_id]
        duration = clip["duration"]
        supabase.table("clips").update({
            "clip_order": i,
            "start_time": current_time,
            "end_time": current_time + duration,
        }).eq("id", clip_id).execute()
        current_time += duration

    return {"status": "reordered"}


@router.get("/projects/{project_id}/clips/{clip_id}/stream")
async def stream_clip(project_id: str, clip_id: str):
    """Get streaming URL for a clip."""
    result = supabase.table("clips").select("storage_path").eq("id", clip_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Clip not found")

    storage_path = result.data[0]["storage_path"]
    url = supabase.storage.from_("media").get_public_url(storage_path)
    return {"stream_url": url}
