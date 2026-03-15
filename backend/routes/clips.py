import os
import uuid
import subprocess
import json
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List
from database import supabase
from config import UPLOAD_DIR, THUMBNAILS_DIR, FFMPEG_PATH, MAX_TOTAL_DURATION_SECONDS
from models import ReorderRequest

logger = logging.getLogger("scoreflow.clips")

router = APIRouter()


def get_video_duration(filepath: str) -> float:
    """Get video duration using ffprobe."""
    # Try ffprobe first
    try:
        logger.info(f"[FFPROBE] Running ffprobe on {os.path.basename(filepath)}")
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            logger.warning(f"[FFPROBE] Non-zero exit code: {result.returncode}, stderr: {result.stderr[:200]}")
        else:
            data = json.loads(result.stdout)
            duration = float(data["format"]["duration"])
            logger.info(f"[FFPROBE] Got duration: {duration:.2f}s")
            return duration
    except FileNotFoundError:
        logger.warning("[FFPROBE] ffprobe not found in PATH — trying ffmpeg fallback")
    except Exception as e:
        logger.warning(f"[FFPROBE] Failed: {e}")

    # Fallback: try ffmpeg -i which prints duration in stderr
    try:
        logger.info(f"[FFMPEG] Trying ffmpeg -i fallback for duration")
        result = subprocess.run(
            [FFMPEG_PATH, "-i", filepath],
            capture_output=True, text=True, timeout=30
        )
        # ffmpeg -i always returns non-zero, parse stderr for Duration
        for line in result.stderr.split("\n"):
            if "Duration:" in line:
                # Format: Duration: HH:MM:SS.ms
                time_str = line.split("Duration:")[1].split(",")[0].strip()
                parts = time_str.split(":")
                duration = float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
                logger.info(f"[FFMPEG] Got duration from ffmpeg: {duration:.2f}s")
                return duration
    except FileNotFoundError:
        logger.error("[FFMPEG] ffmpeg not found in PATH — cannot determine video duration")
    except Exception as e:
        logger.warning(f"[FFMPEG] Fallback failed: {e}")

    # Last resort: estimate from file size (rough: ~1MB per 10s for typical video)
    try:
        file_size = os.path.getsize(filepath)
        estimated = max(10.0, file_size / (1024 * 1024) * 10)
        estimated = min(estimated, 600.0)  # cap at 10 min
        logger.warning(f"[DURATION] No ffprobe/ffmpeg available. Estimating duration from file size: {estimated:.1f}s")
        return estimated
    except Exception:
        logger.error("[DURATION] Cannot determine duration at all, defaulting to 30s")
        return 30.0


def generate_thumbnails(filepath: str, clip_id: str, duration: float) -> list:
    """Generate thumbnail strip frames for timeline UI."""
    thumb_dir = os.path.join(THUMBNAILS_DIR, clip_id)
    os.makedirs(thumb_dir, exist_ok=True)

    try:
        logger.info(f"[THUMBNAILS] Generating thumbnails for clip {clip_id[:8]}...")
        result = subprocess.run(
            [FFMPEG_PATH, "-i", filepath, "-vf", "fps=0.4,scale=128:72", "-q:v", "10",
             os.path.join(thumb_dir, "thumb_%04d.jpg")],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            logger.warning(f"[THUMBNAILS] FFmpeg returned {result.returncode}: {result.stderr[:200]}")
        else:
            count = len([f for f in os.listdir(thumb_dir) if f.endswith('.jpg')])
            logger.info(f"[THUMBNAILS] Generated {count} thumbnails for clip {clip_id[:8]}")
    except FileNotFoundError:
        logger.warning("[THUMBNAILS] ffmpeg not found — skipping thumbnail generation")
        return []
    except Exception as e:
        logger.warning(f"[THUMBNAILS] Failed: {e}")
        return []

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
                except Exception as e:
                    logger.warning(f"[THUMBNAILS] Upload failed for {fname}: {e}")

    logger.info(f"[THUMBNAILS] Uploaded {len(thumbnail_urls)} thumbnails to Supabase Storage")
    return thumbnail_urls


@router.post("/projects/{project_id}/clips")
async def upload_clips(
    project_id: str,
    files: List[UploadFile] = File(...),
    durations: List[float] = Form(None),
):
    """Upload video clips to project."""
    logger.info(f"[UPLOAD] ========== Starting clip upload for project {project_id[:8]}... ==========")
    logger.info(f"[UPLOAD] Received {len(files)} file(s): {[f.filename for f in files]}")

    # Verify project exists
    project = supabase.table("projects").select("*").eq("id", project_id).execute()
    if not project.data:
        logger.error(f"[UPLOAD] Project {project_id} not found in database")
        raise HTTPException(status_code=404, detail="Project not found")
    logger.info(f"[UPLOAD] Project verified: {project_id[:8]}")

    # Get existing clips to calculate start time
    existing = supabase.table("clips").select("*").eq(
        "project_id", project_id
    ).order("clip_order").execute()
    current_end = 0.0
    clip_order = len(existing.data)

    if existing.data:
        current_end = max(c["end_time"] for c in existing.data)
        logger.info(f"[UPLOAD] Found {len(existing.data)} existing clips, timeline at {current_end:.2f}s")
    else:
        logger.info(f"[UPLOAD] No existing clips, starting fresh")

    uploaded_clips = []

    for i, file in enumerate(files):
        clip_id = str(uuid.uuid4())
        ext = os.path.splitext(file.filename)[1] or ".mp4"
        local_path = os.path.join(UPLOAD_DIR, f"{clip_id}{ext}")

        logger.info(f"[UPLOAD] --- Processing file {i+1}/{len(files)}: {file.filename} ---")

        # Save locally
        content = await file.read()
        file_size_mb = len(content) / (1024 * 1024)
        with open(local_path, "wb") as f:
            f.write(content)
        logger.info(f"[UPLOAD] Saved locally: {local_path} ({file_size_mb:.1f} MB)")

        # Get duration (prefer client-provided when available)
        provided_duration = None
        if durations and i < len(durations):
            try:
                provided_duration = float(durations[i])
            except (TypeError, ValueError):
                provided_duration = None

        if provided_duration and provided_duration > 0:
            duration = provided_duration
            logger.info(f"[UPLOAD] Duration (client): {duration:.2f}s for {file.filename}")
        else:
            duration = get_video_duration(local_path)
            logger.info(f"[UPLOAD] Duration (server): {duration:.2f}s for {file.filename}")

        if duration <= 0:
            logger.error(f"[UPLOAD] Duration is 0 — SKIPPING clip {file.filename}")
            os.remove(local_path)
            continue

        # Check total duration limit
        if current_end + duration > MAX_TOTAL_DURATION_SECONDS:
            logger.error(f"[UPLOAD] Total duration {current_end + duration:.1f}s exceeds limit {MAX_TOTAL_DURATION_SECONDS}s")
            os.remove(local_path)
            raise HTTPException(
                status_code=400,
                detail=f"Total duration would exceed {MAX_TOTAL_DURATION_SECONDS}s limit"
            )

        # Upload to Supabase Storage
        storage_path = f"clips/{clip_id}{ext}"
        try:
            logger.info(f"[UPLOAD] Uploading to Supabase Storage: {storage_path}")
            with open(local_path, "rb") as f:
                supabase.storage.from_("media").upload(
                    storage_path, f.read(),
                    file_options={"content-type": file.content_type or "video/mp4"}
                )
            logger.info(f"[UPLOAD] Storage upload complete: {storage_path}")
        except Exception as e:
            logger.error(f"[UPLOAD] Storage upload FAILED: {e}")
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

        logger.info(f"[UPLOAD] Inserting clip into DB: id={clip_id[:8]}, order={clip_order}, start={start_time:.2f}, end={end_time:.2f}")
        result = supabase.table("clips").insert(clip_data).execute()

        if result.data:
            uploaded_clips.append(result.data[0])
            logger.info(f"[UPLOAD] ✓ Clip inserted: {file.filename} ({duration:.2f}s)")
        else:
            logger.error(f"[UPLOAD] ✗ DB insert returned no data for {file.filename}")

        current_end = end_time
        clip_order += 1

        # Clean up local file
        try:
            os.remove(local_path)
            logger.debug(f"[UPLOAD] Cleaned up local file: {local_path}")
        except Exception:
            pass

    # Update project total duration
    supabase.table("projects").update({
        "total_duration": current_end
    }).eq("id", project_id).execute()

    # Extend last section if new clips extend beyond existing sections
    sections_result = supabase.table("sections").select("*").eq(
        "project_id", project_id
    ).order("section_order", desc=True).limit(1).execute()

    if sections_result.data:
        last_section = sections_result.data[0]
        if current_end > last_section["end_time"]:
            # Extend last section to cover new clips
            new_duration = current_end - last_section["start_time"]
            new_clip_ids = last_section.get("clip_ids", []) or []
            # Add new clip IDs to the section
            for clip in uploaded_clips:
                if clip["id"] not in new_clip_ids:
                    new_clip_ids.append(clip["id"])

            supabase.table("sections").update({
                "end_time": current_end,
                "duration": new_duration,
                "clip_ids": new_clip_ids,
                "music_status": "PENDING",  # Reset music status since section changed
            }).eq("id", last_section["id"]).execute()
            logger.info(f"[UPLOAD] Extended last section to {current_end:.2f}s (added {len(uploaded_clips)} clip(s))")

    logger.info(f"[UPLOAD] ========== Upload complete: {len(uploaded_clips)}/{len(files)} clips, total duration {current_end:.2f}s ==========")

    if len(uploaded_clips) == 0:
        logger.error("[UPLOAD] No clips were successfully processed! Check ffprobe/ffmpeg installation.")

    return uploaded_clips


@router.get("/projects/{project_id}/clips")
async def get_clips(project_id: str):
    logger.info(f"[CLIPS] Fetching clips for project {project_id[:8]}")
    result = supabase.table("clips").select("*").eq(
        "project_id", project_id
    ).order("clip_order").execute()
    logger.info(f"[CLIPS] Found {len(result.data)} clips")
    return result.data


@router.put("/projects/{project_id}/clips/reorder")
async def reorder_clips(project_id: str, body: ReorderRequest):
    """Reorder clips and recalculate timings."""
    logger.info(f"[REORDER] Reordering {len(body.clip_ids)} clips for project {project_id[:8]}")
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

    logger.info(f"[REORDER] Reorder complete, total duration: {current_time:.2f}s")
    return {"status": "reordered"}


@router.get("/projects/{project_id}/clips/{clip_id}/stream")
async def stream_clip(project_id: str, clip_id: str):
    """Get streaming URL for a clip."""
    logger.info(f"[STREAM] Getting stream URL for clip {clip_id[:8]}")
    result = supabase.table("clips").select("storage_path").eq("id", clip_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Clip not found")

    storage_path = result.data[0]["storage_path"]
    url = supabase.storage.from_("media").get_public_url(storage_path)
    logger.info(f"[STREAM] Returning URL for {storage_path}")
    return {"stream_url": url}
