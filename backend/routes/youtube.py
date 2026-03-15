"""YouTube URL import route — self-contained, no edits to existing routes."""

import os
import uuid
import subprocess
import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import supabase
from config import UPLOAD_DIR, THUMBNAILS_DIR, FFMPEG_PATH, MAX_TOTAL_DURATION_SECONDS
from services.youtube_service import validate_url, get_video_info, download_video

logger = logging.getLogger("scoreflow.youtube")

router = APIRouter()


class UrlImportRequest(BaseModel):
    url: str


# ── Local helpers (duplicated from clips.py for full isolation) ──────────────


def _get_video_duration(filepath: str) -> float:
    """Get video duration using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return float(data["format"]["duration"])
    except Exception as e:
        logger.warning(f"[YOUTUBE] ffprobe failed: {e}")

    # Fallback: ffmpeg -i
    try:
        result = subprocess.run(
            [FFMPEG_PATH, "-i", filepath],
            capture_output=True, text=True, timeout=30,
        )
        for line in result.stderr.split("\n"):
            if "Duration:" in line:
                time_str = line.split("Duration:")[1].split(",")[0].strip()
                parts = time_str.split(":")
                return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    except Exception as e:
        logger.warning(f"[YOUTUBE] ffmpeg duration fallback failed: {e}")

    # File size estimate
    try:
        file_size = os.path.getsize(filepath)
        return min(max(10.0, file_size / (1024 * 1024) * 10), 600.0)
    except Exception:
        return 30.0


def _generate_thumbnails(filepath: str, clip_id: str) -> list:
    """Generate and upload thumbnail strip frames."""
    thumb_dir = os.path.join(THUMBNAILS_DIR, clip_id)
    os.makedirs(thumb_dir, exist_ok=True)

    try:
        result = subprocess.run(
            [FFMPEG_PATH, "-i", filepath, "-vf", "fps=0.4,scale=128:72", "-q:v", "10",
             os.path.join(thumb_dir, "thumb_%04d.jpg")],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            logger.warning(f"[YOUTUBE] Thumbnail generation failed: {result.stderr[:200]}")
    except FileNotFoundError:
        logger.warning("[YOUTUBE] ffmpeg not found — skipping thumbnails")
        return []
    except Exception as e:
        logger.warning(f"[YOUTUBE] Thumbnail generation error: {e}")
        return []

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
                            file_options={"content-type": "image/jpeg"},
                        )
                    url = supabase.storage.from_("media").get_public_url(storage_path)
                    thumbnail_urls.append(url)
                except Exception as e:
                    logger.warning(f"[YOUTUBE] Thumbnail upload failed for {fname}: {e}")

    logger.info(f"[YOUTUBE] Uploaded {len(thumbnail_urls)} thumbnails")
    return thumbnail_urls


# ── Endpoint ─────────────────────────────────────────────────────────────────


@router.post("/projects/{project_id}/clips/from-url")
async def import_from_url(project_id: str, body: UrlImportRequest):
    """Import a video clip from a YouTube URL."""
    logger.info(f"[YOUTUBE] ========== URL import for project {project_id[:8]} ==========")
    logger.info(f"[YOUTUBE] URL: {body.url}")

    # 1. Validate URL
    try:
        platform = validate_url(body.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    logger.info(f"[YOUTUBE] Platform: {platform}")

    # 2. Verify project exists
    project = supabase.table("projects").select("*").eq("id", project_id).execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # 3. Pre-flight: check duration before downloading
    try:
        info = get_video_info(body.url)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if info["duration"] and info["duration"] > MAX_TOTAL_DURATION_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=f"Video is {info['duration']:.0f}s — exceeds {MAX_TOTAL_DURATION_SECONDS}s limit",
        )

    # 4. Download video
    clip_id = str(uuid.uuid4())
    try:
        dl_result = download_video(body.url, clip_id)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    local_path = dl_result["local_path"]

    try:
        # 5. Get exact duration via ffprobe
        duration = _get_video_duration(local_path)
        logger.info(f"[YOUTUBE] Duration (ffprobe): {duration:.2f}s")

        if duration <= 0:
            raise HTTPException(status_code=400, detail="Could not determine video duration")

        # 6. Check total duration with existing clips
        existing = supabase.table("clips").select("*").eq(
            "project_id", project_id
        ).order("clip_order").execute()

        current_end = 0.0
        clip_order = len(existing.data)
        if existing.data:
            current_end = max(c["end_time"] for c in existing.data)

        if current_end + duration > MAX_TOTAL_DURATION_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Total duration would exceed {MAX_TOTAL_DURATION_SECONDS}s limit",
            )

        # 7. Upload to Supabase Storage
        ext = dl_result["ext"]
        storage_path = f"clips/{clip_id}{ext}"
        logger.info(f"[YOUTUBE] Uploading to Supabase Storage: {storage_path}")

        with open(local_path, "rb") as f:
            supabase.storage.from_("media").upload(
                storage_path, f.read(),
                file_options={"content-type": "video/mp4"},
            )
        logger.info(f"[YOUTUBE] Storage upload complete")

        # 8. Generate thumbnails
        thumbnail_urls = _generate_thumbnails(local_path, clip_id)

        # 9. Insert clip record
        start_time = current_end
        end_time = current_end + duration
        title = dl_result["title"]
        # Use video title as filename (sanitized)
        filename = f"{title[:60]}{ext}"

        clip_data = {
            "id": clip_id,
            "project_id": project_id,
            "filename": filename,
            "storage_path": storage_path,
            "start_time": start_time,
            "end_time": end_time,
            "duration": duration,
            "clip_order": clip_order,
            "thumbnail_urls": thumbnail_urls,
        }

        result = supabase.table("clips").insert(clip_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to save clip to database")

        clip = result.data[0]
        logger.info(f"[YOUTUBE] Clip inserted: {title} ({duration:.2f}s)")

        # 10. Update project total duration
        supabase.table("projects").update({
            "total_duration": end_time,
        }).eq("id", project_id).execute()

        # 11. Extend last section if exists
        sections_result = supabase.table("sections").select("*").eq(
            "project_id", project_id
        ).order("section_order", desc=True).limit(1).execute()

        if sections_result.data:
            last_section = sections_result.data[0]
            if end_time > last_section["end_time"]:
                new_clip_ids = last_section.get("clip_ids", []) or []
                if clip_id not in new_clip_ids:
                    new_clip_ids.append(clip_id)
                supabase.table("sections").update({
                    "end_time": end_time,
                    "duration": end_time - last_section["start_time"],
                    "clip_ids": new_clip_ids,
                    "music_status": "PENDING",
                }).eq("id", last_section["id"]).execute()
                logger.info(f"[YOUTUBE] Extended last section to {end_time:.2f}s")

        logger.info(f"[YOUTUBE] ========== Import complete: {title} ==========")
        return clip

    finally:
        # Cleanup local file
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
                logger.debug(f"[YOUTUBE] Cleaned up: {local_path}")
        except Exception:
            pass
