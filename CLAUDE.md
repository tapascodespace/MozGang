# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
ScoreFlow is an AI-powered tool that analyzes video clips and generates section-appropriate background music. Users drop video clips, describe the energy/style they want, and the AI reads the story to compose music per narrative section.

## Tech Stack
- **Backend**: Python 3.11+ / FastAPI (in `/backend/`)
- **Frontend**: React 18 + Vite (in `/frontend/`)
- **Database**: Supabase (Postgres + Storage + Realtime)
- **AI Services**: ElevenLabs (music gen + STT), OpenAI GPT-4o Vision
- **Processing**: FFmpeg (server-side)
- **Deployment**: Backend on Render, Frontend on Vercel/local

## Project Structure
```
/backend/
  main.py          - FastAPI app entry point
  config.py        - All configuration (env vars, constants)
  models.py        - Pydantic models
  database.py      - Supabase client
  routes/          - API route modules
  services/        - Phase 2 AI services
    analysis_types.py   - Shared types/enums (PRD Section 5)
    mock_analysis.py    - Hardcoded mock data
    analysis_service.py - Video analysis (GPT-4o Vision)
    music_service.py    - Music generation (ElevenLabs)

/frontend/
  src/
    components/    - React components
    hooks/         - Custom hooks
    services/      - API client, Supabase client
    stores/        - State management
    styles/        - Global styles, design tokens
    App.jsx        - Main app component
```

## Key Conventions
- Product name from `PRODUCT_NAME` config - never hardcode "ScoreFlow"
- All API endpoints prefixed with `/api/`
- Section boundaries must snap to clip boundaries
- Music generation uses ElevenLabs Sound Generation API
- Dark theme throughout: bg=#0b0c10, cards=#13151a, accent=#45f5c5

## Environment Variables
```
ELEVENLABS_API_KEY=sk-elevenlabs-...
OPENAI_API_KEY=sk-openai-...
SUPABASE_URL=https://bznswadiiqulyzpkajqp.supabase.co
SUPABASE_ANON_KEY=...
```

## Development
```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev
npm run lint     # ESLint
npm run build    # Production build
```

## Database Setup
Run `python backend/setup_db.py` to check Supabase tables. If missing, paste `supabase_schema.sql` into Supabase SQL Editor and create a public "media" storage bucket.

---

## Build Phases

### Phase 1 (COMPLETE)
Full UI with mocked AI:
- Clip upload, thumbnails, ffprobe metadata
- Creative Brief form (stored but no AI pipeline)
- Mocked sections: 3-5 equal sections at clip boundaries
- Generate button shows toast: "AI generation available in Phase 2"
- Preview plays clips directly, no generated audio
- Merge/split fully working

### Phase 2 (COMPLETE)

#### Video Analysis (COMPLETE - merged to main)
Implemented in `backend/services/analysis_service.py`:
- Frame extraction with FFmpeg (PRD Section 8.1)
- Cut density computation (PRD Section 8.2)
- Audio transcription with ElevenLabs STT (PRD Section 8.3)
- GPT-4o Vision scene analysis (PRD Section 8.4)
- Fallback logic when AI fails (PRD Section 8.5)
- Transcript truncation (3000 chars) to prevent token overflow

**Entry point:** `analyze_video(clips, brief, project_id) -> FullAnalysisResult`

#### Music Generation (COMPLETE - merged to main)
Implemented in `backend/services/music_service.py`:
- ElevenLabs Sound Generation API (PRD Section 8.6)
- Queuing with semaphore + exponential backoff (PRD Section 8.7)
- FFmpeg trimming to exact section duration
- Long section handling (>30s split into chunks)
- Frontend audio playback synced with video preview

**Entry point:** `generate_music_for_section(section, brief, project_id) -> GeneratedTrack`

---

## Shared Types (PRD Section 5)

Located in `backend/services/analysis_types.py`:

```python
SECTION_TYPES = ["Hook","Intro","Setup","Build","Anticipation","Reveal",
                 "Reaction","Demonstration","Montage","Transition","Recap",
                 "Climax","Cooldown","Testimonial","CTA","Outro"]

SCENE_TYPES = ["Talking Head","Walk and Talk","Travel Montage","Product Showcase",
               "Tutorial","Action Moment","Crowd/Event","Reaction Shot",...]

EMOTIONAL_TONES = ["Energetic","Playful","Suspenseful","Inspirational","Dramatic",
                   "Emotional","Calm","Informative","Nostalgic","Mysterious",...]

PACING = ["Very Slow","Slow","Medium","Fast","Very Fast"]

ENERGY_LEVELS = ["Very Low","Low","Medium Low","Medium","Medium High","High","Very High"]
```

AI must return values from these exact lists. No other values are valid.

---

## Music Prompt Format (PRD Section 8.6)

```python
def build_music_prompt(section, brief):
    parts = [
        brief.music_style_direction,
        brief.overall_energy,
        f"Section: {section.section_type}. Scene: {section.scene_type}.",
        f"Mood: {section.emotional_tone}. Energy: {section.energy_level}. Pacing: {section.pacing}.",
        f"Style: {section.suggested_music_style}.",
    ]
    if brief.references_text:
        parts.append(f"References: {brief.references_text}")
    if section.feedback_history:
        parts.append("User direction: " + ". ".join(section.feedback_history))
    return " ".join(parts)
```

---

## API Endpoints

All endpoints prefixed with `/api/`:

```
# Projects
POST   /projects                           Create project
GET    /projects/{id}                      Get project details

# Clips
POST   /projects/{id}/clips                Upload clips (multipart)
GET    /projects/{id}/clips                Get all clips
PUT    /projects/{id}/clips/reorder        Reorder clips
GET    /projects/{id}/clips/{cid}/stream   Stream clip URL

# Brief
POST   /projects/{id}/brief                Submit brief + trigger analysis
PUT    /projects/{id}/brief                Update brief (no auto-regen)

# Sections
GET    /projects/{id}/sections             Get sections
PUT    /projects/{id}/sections/{sid}       Update section_type / emotional_tone
POST   /projects/{id}/sections/{sid}/generate    Trigger music generation
POST   /projects/{id}/sections/{sid}/regenerate  Regenerate with feedback
POST   /projects/{id}/sections/merge       Merge two adjacent sections
POST   /projects/{id}/sections/{sid}/split Split at time or clip boundary
POST   /projects/{id}/sections/{sid}/undo  Restore discarded track

# Tracks
GET    /projects/{id}/tracks               Get all non-discarded tracks
GET    /projects/{id}/tracks/{tid}/download  Download track audio

# Export
POST   /projects/{id}/export               Full export
GET    /projects/{id}/export/download      Download MP4
```

---

## Timeline Merge/Split UI
- **Merge**: Hover over section boundaries on the timeline to reveal merge button (⟷)
- **Split**: Right-click anywhere on the timeline to open context menu with "Split here" option
- Split operations work at exact timestamps (ms precise), not clip boundaries
- Clips are assigned to sections based on their center point relative to section boundaries

## Upload Limits
- Maximum file size: 50MB per video file
