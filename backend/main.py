import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from config import PRODUCT_NAME, PORT, UPLOAD_DIR, FRAMES_DIR, THUMBNAILS_DIR, AUDIO_DIR, EXPORT_DIR
from routes.projects import router as projects_router
from routes.clips import router as clips_router
from routes.sections import router as sections_router
from routes.tracks import router as tracks_router
from routes.export import router as export_router

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

app.include_router(projects_router, prefix="/api")
app.include_router(clips_router, prefix="/api")
app.include_router(sections_router, prefix="/api")
app.include_router(tracks_router, prefix="/api")
app.include_router(export_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "product": PRODUCT_NAME}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
