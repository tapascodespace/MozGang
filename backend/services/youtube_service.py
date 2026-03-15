"""YouTube video download service using yt-dlp Python API."""

import os
import re
import logging

import yt_dlp

from config import UPLOAD_DIR

logger = logging.getLogger("scoreflow.youtube")

# Max duration in seconds (10 minutes)
MAX_DURATION_SECONDS = 600
# Max file size in bytes (50 MB)
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

YOUTUBE_REGEX = re.compile(
    r"(https?://)?(www\.)?(youtube\.com/(watch\?v=|shorts/)|youtu\.be/)[\w\-]+"
)


def validate_url(url: str) -> str:
    """Validate that the URL is a supported YouTube URL.
    Returns 'youtube' if valid, raises ValueError otherwise.
    """
    if YOUTUBE_REGEX.match(url):
        return "youtube"
    raise ValueError("Unsupported URL. Only YouTube links are supported.")


def get_video_info(url: str) -> dict:
    """Extract video metadata without downloading.
    Returns dict with title, duration, etc.
    """
    logger.info(f"[YOUTUBE] Fetching metadata for: {url}")
    try:
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        duration = info.get("duration", 0) or 0
        title = info.get("title", "Untitled")

        logger.info(f"[YOUTUBE] Metadata: title='{title}', duration={duration}s")
        return {
            "title": title,
            "duration": duration,
            "uploader": info.get("uploader", ""),
        }
    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e).split("\n")[-1]
        logger.error(f"[YOUTUBE] yt-dlp metadata failed: {error_msg}")
        raise RuntimeError(f"Could not fetch video info: {error_msg}")
    except Exception as e:
        logger.error(f"[YOUTUBE] Unexpected error fetching info: {e}")
        raise RuntimeError(f"Could not fetch video info: {e}")


def download_video(url: str, clip_id: str) -> dict:
    """Download video to local uploads directory.
    Returns dict with local_path, title, ext.
    """
    output_template = os.path.join(UPLOAD_DIR, f"{clip_id}.%(ext)s")
    expected_path = os.path.join(UPLOAD_DIR, f"{clip_id}.mp4")

    logger.info(f"[YOUTUBE] Starting download: {url} -> {clip_id}")

    downloaded_path = None

    def progress_hook(d):
        nonlocal downloaded_path
        if d["status"] == "finished":
            downloaded_path = d.get("filename")
            logger.info(f"[YOUTUBE] Download finished: {downloaded_path}")

    ydl_opts = {
        "format": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
        "merge_output_format": "mp4",
        "outtmpl": output_template,
        "noplaylist": True,
        "no_overwrites": True,
        "max_filesize": MAX_FILE_SIZE_BYTES,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [progress_hook],
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "YouTube Video")

        # Find the output file
        actual_path = downloaded_path
        if not actual_path or not os.path.exists(actual_path):
            # yt-dlp may have merged to .mp4
            if os.path.exists(expected_path):
                actual_path = expected_path
            else:
                # Search for any file with the clip_id prefix
                for f in os.listdir(UPLOAD_DIR):
                    if f.startswith(clip_id):
                        actual_path = os.path.join(UPLOAD_DIR, f)
                        break
                else:
                    raise RuntimeError("Download completed but output file not found")

        file_size = os.path.getsize(actual_path)
        ext = os.path.splitext(actual_path)[1] or ".mp4"

        logger.info(f"[YOUTUBE] Downloaded: {actual_path} ({file_size / (1024*1024):.1f} MB)")

        return {
            "local_path": actual_path,
            "title": title,
            "ext": ext,
        }

    except yt_dlp.utils.DownloadError as e:
        # Cleanup partial download
        for f in os.listdir(UPLOAD_DIR):
            if f.startswith(clip_id):
                try:
                    os.remove(os.path.join(UPLOAD_DIR, f))
                except OSError:
                    pass
        error_msg = str(e).split("\n")[-1]
        logger.error(f"[YOUTUBE] Download failed: {error_msg}")
        raise RuntimeError(f"Download failed: {error_msg}")
