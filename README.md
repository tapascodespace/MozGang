# ScoreFlow

AI-powered music scoring for video. Drop your clips, pick a vibe, and the AI composes section-appropriate background music that follows your video's narrative arc.

Built at the Mozart AI Hackathon 2026.

## How It Works

1. **Upload** video clips (MP4, MOV, WebM)
2. **Pick a vibe** — Energetic, Chill, Dramatic, Cinematic, etc.
3. **AI analyzes** your video — detects scenes, pacing, emotions, and narrative structure
4. **AI recommends** a music style based on your vibe + detected content
5. **Generate music** per section — each narrative section gets its own score
6. **Refine** — merge/split sections, give feedback, regenerate
7. **Export** as a single MP4 with music mixed in

## Features

- **Smart Scene Detection**: FFmpeg-based scene change detection + GPT-4o Vision analysis identifies narrative sections automatically
- **Scenic Video Support**: Per-shot frame extraction and content-based boundary detection for landscape/travel/cinematic content
- **Section-Level Music**: Each section gets individually generated music via ElevenLabs Sound Generation
- **Seamless Playback**: Dual video element preloading for stutter-free clip transitions
- **Merge & Split**: Adjust section boundaries with merge/split operations, re-analyze individual sections
- **Iterative Refinement**: Give natural language feedback to regenerate music per section
- **One-Click Export**: Full video + music export as MP4

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+ / FastAPI |
| Frontend | React 18 + Vite |
| Database | Supabase (Postgres + Storage + Realtime) |
| Music Generation | ElevenLabs Sound Generation API |
| Transcription | ElevenLabs Speech-to-Text |
| Video Analysis | OpenAI GPT-4o Vision |
| Video Processing | FFmpeg |

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- FFmpeg installed and on PATH
- Supabase project (or use the existing one)

### Environment Variables

Create a `.env` file or set these:

```
ELEVENLABS_API_KEY=sk-...
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Database

Run `python backend/setup_db.py` to verify Supabase tables. If tables are missing, run the SQL migrations:

```bash
# Initial schema
psql < supabase_schema.sql

# Workspace enhancements (pre-analysis, re-analyze)
psql < migrations/001_workspace_enhancements.sql

# Auto section detection (scene changes, vibe flow)
psql < migrations/002_auto_section_detection.sql
```

Or paste the SQL files into the Supabase SQL Editor.

## Architecture

```
User uploads clips
       |
       v
  Pre-Analysis (fire-and-forget after upload)
  - Frame extraction (FFmpeg)
  - Audio transcription (ElevenLabs STT)
  - Scene change detection (FFmpeg)
  - Cut density computation
       |
       v
  Vibe Selection + AI Recommendation
       |
       v
  GPT-4o Vision Analysis
  - Uses cached pre-analysis data
  - Scenic: per-shot frames + content-based boundaries
  - Standard: pacing-based boundaries
       |
       v
  3-5 Narrative Sections
       |
       v
  ElevenLabs Music Generation (per section)
       |
       v
  Preview (dual video + audio sync) → Export (FFmpeg mix)
```

## Project Structure

```
backend/
  main.py              FastAPI entry point
  config.py            Configuration + constants
  models.py            Pydantic models
  database.py          Supabase client
  routes/              API route handlers
  services/
    analysis_types.py  Shared types/enums
    analysis_service.py Video analysis pipeline
    music_service.py   Music generation pipeline

frontend/
  src/
    components/        React components
      PreviewPlayer    Dual video element player
      VibeSelector     Vibe selection screen
      AIRecommendation Style confirmation screen
      AddClipsModal    Add clips in workspace
    hooks/             Custom React hooks
    services/          API client + Supabase client
    stores/            State management
    App.jsx            Main app component
```

## License

Hackathon project. All rights reserved.
