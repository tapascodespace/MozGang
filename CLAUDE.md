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
  services/        - Business logic (pipeline, music gen, etc.)

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
- Client-side audio sync via Web Audio API (no server-side preview assembly)
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

## Build Phases
- **Phase 1**: Full UI with mocked AI (auto-segmentation, placeholder values)
- **Phase 2**: Wire up real AI (GPT-4o Vision, ElevenLabs music gen + STT)

## Current Product Limitations (UI)
- Merge/split is limited to section-level operations (no clip trimming UI).
