import os
import logging
import sys
import subprocess
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import time

load_dotenv()

# ── Logging Setup ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("scoreflow")

from config import PRODUCT_NAME, PORT, UPLOAD_DIR, FRAMES_DIR, THUMBNAILS_DIR, AUDIO_DIR, EXPORT_DIR
from routes.projects import router as projects_router
from routes.clips import router as clips_router
from routes.sections import router as sections_router
from routes.tracks import router as tracks_router
from routes.export import router as export_router
from routes.youtube import router as youtube_router

# Create required directories
for d in [UPLOAD_DIR, FRAMES_DIR, THUMBNAILS_DIR, AUDIO_DIR, EXPORT_DIR]:
    os.makedirs(d, exist_ok=True)

app = FastAPI(title=PRODUCT_NAME, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request Logging Middleware ───────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    logger.info(f"→ {request.method} {request.url.path}")

    response = await call_next(request)

    duration_ms = (time.time() - start) * 1000
    status_emoji = "✓" if response.status_code < 400 else "✗"
    logger.info(f"← {status_emoji} {request.method} {request.url.path} → {response.status_code} ({duration_ms:.0f}ms)")

    return response


app.include_router(projects_router, prefix="/api")
app.include_router(clips_router, prefix="/api")
app.include_router(sections_router, prefix="/api")
app.include_router(tracks_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(youtube_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "product": PRODUCT_NAME}


@app.on_event("startup")
async def startup():
    logger.info("=" * 60)
    logger.info(f"  {PRODUCT_NAME} API starting up")
    logger.info("=" * 60)

    # Check FFmpeg
    try:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=5)
        version = result.stdout.split("\n")[0] if result.stdout else "unknown"
        logger.info(f"  ✓ FFmpeg: {version}")
    except FileNotFoundError:
        logger.warning("  ✗ FFmpeg NOT FOUND — video processing will use fallbacks")
    except Exception as e:
        logger.warning(f"  ✗ FFmpeg check failed: {e}")

    # Check ffprobe
    try:
        subprocess.run(["ffprobe", "-version"], capture_output=True, text=True, timeout=5)
        logger.info(f"  ✓ ffprobe: available")
    except FileNotFoundError:
        logger.warning("  ✗ ffprobe NOT FOUND — duration detection will use fallbacks")

    # Check Supabase
    try:
        from database import supabase
        result = supabase.table("projects").select("id").limit(1).execute()
        logger.info(f"  ✓ Supabase: connected (projects table accessible)")
    except Exception as e:
        logger.error(f"  ✗ Supabase: connection failed — {e}")

    # Check storage bucket
    try:
        from database import supabase
        buckets = supabase.storage.list_buckets()
        media = [b for b in buckets if b.name == "media"]
        if media:
            logger.info(f"  ✓ Supabase Storage: 'media' bucket exists")
        else:
            logger.warning(f"  ✗ Supabase Storage: 'media' bucket NOT FOUND — create it in dashboard")
    except Exception as e:
        logger.warning(f"  ✗ Supabase Storage check failed: {e}")

    logger.info(f"  Port: {PORT}")
    logger.info(f"  Dirs: uploads={UPLOAD_DIR}, frames={FRAMES_DIR}")
    logger.info("=" * 60)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
