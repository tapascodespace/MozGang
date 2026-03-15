# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
ScoreFlow is an AI-powered tool that analyzes video clips and generates section-appropriate background music. Users drop video clips, describe the energy/style they want, and the AI reads the story to compose music per narrative section.

## Tech Stack
- **Backend**: Python 3.11+ / FastAPI (in `/backend/`)
- **Frontend (active)**: React 18 + TypeScript + Vite + Tailwind + Radix UI (in `/frontend_new/`, port 8080)
- **Frontend (legacy)**: React 18 + Vite JSX (in `/frontend/`, port 5173) — still works but not actively developed
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

/frontend_new/           ← ACTIVE FRONTEND (always edit this one)
  src/
    components/editor/   - Workspace components (Timeline, MediaBrowser, SectionPanel, etc.)
    components/intake/   - Upload + onboarding components
    components/ui/       - Radix UI primitives (shadcn/ui)
    hooks/               - useProjectState, useVideoPlayer, useClipUpload
    services/            - API client (api.ts), Supabase client (supabase.ts)
    pages/               - IntakePage, WorkspacePage
    types/               - TypeScript types + enum constants
    index.css            - Global styles, CSS variables, design tokens

/frontend/               ← LEGACY (do not edit unless specifically asked)
  src/
    components/    - React JSX components
    hooks/         - Custom hooks
    services/      - API client, Supabase client
    App.jsx        - Main app component
```

**IMPORTANT**: Always edit `/frontend_new/`, never `/frontend/` unless explicitly asked.

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

# Frontend (active — TypeScript)
cd frontend_new && npm install && npm run dev   # port 8080
npm run lint     # ESLint
npm run build    # Production build

# Frontend (legacy — JSX, do not use unless asked)
cd frontend && npm install && npm run dev       # port 5173
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
- Transition-aware prompts: neighbor section mood/energy/pacing included for smooth transitions
- Auto-generation: all sections generate automatically after brief submission
- Frontend audio playback synced with video preview

**Entry point:** `generate_music_for_section(section, brief, project_id, prev_section=None, next_section=None) -> GeneratedTrack`

---

## Shared Types (PRD Section 5)

Located in `backend/services/analysis_types.py`:

```python
SECTION_TYPES = ["Hook","Intro","Setup","Build","Anticipation","Reveal",
                 "Reaction","Demonstration","Montage","Transition","Recap",
                 "Climax","Cooldown","Testimonial","CTA","Outro","Scenic"]

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
def build_music_prompt(section, brief, prev_section=None, next_section=None):
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
    # Transition context
    if prev_section:
        parts.append(f"Transition from previous section: {prev_section.emotional_tone} mood, "
                      f"{prev_section.energy_level} energy, {prev_section.pacing} pacing. "
                      f"Begin smoothly continuing from that feel.")
    else:
        parts.append("This is the opening section. Start with a natural musical intro.")
    if next_section:
        parts.append(f"Transition toward next section: {next_section.emotional_tone} mood, "
                      f"{next_section.energy_level} energy, {next_section.pacing} pacing. "
                      f"End by gradually shifting toward that feel.")
    else:
        parts.append("This is the final section. End with a natural musical outro or gentle fade.")
    return " ".join(parts)
```

---

## API Endpoints

All endpoints prefixed with `/api/`:

```
# Projects
POST   /projects                           Create project
GET    /projects/{id}                      Get project details
POST   /projects/{id}/pre-analyze          Start pre-analysis (frame extraction, transcription)

# Clips
POST   /projects/{id}/clips                Upload clips (multipart) - extends last section if needed
GET    /projects/{id}/clips                Get all clips
PUT    /projects/{id}/clips/reorder        Reorder clips
GET    /projects/{id}/clips/{cid}/stream   Stream clip URL

# Brief
POST   /projects/{id}/brief                Submit brief + trigger analysis + auto-generate all music
PUT    /projects/{id}/brief                Update brief (no auto-regen)

# Sections
GET    /projects/{id}/sections             Get sections
PUT    /projects/{id}/sections/{sid}       Update section_type / emotional_tone
POST   /projects/{id}/sections/{sid}/generate    Trigger music generation
POST   /projects/{id}/sections/{sid}/regenerate  Regenerate with feedback
POST   /projects/{id}/sections/{sid}/reanalyze   Re-analyze section with AI (after merge/split)
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

---

## Workspace Enhancement Features

### Feature 1: Two-Step Media Staging & Clip Addition
Users can add more clips after entering the workspace via a two-step drag-and-drop workflow:

**Step 1 — Stage:** Drop video files onto the MediaBrowser sidebar (left panel). Files are staged locally (File + objectURL) — no upload yet. Staged clips show with a dashed border and "Drag to timeline" badge.

**Step 2 — Place:** Drag a staged clip (or an existing clip from the gallery) onto a drop zone between sections on the timeline. This triggers upload to Supabase, reorder to the correct position, and a full page reload for clean state.

- Component: `frontend_new/src/components/editor/MediaBrowser.tsx`
- Drop zones: `SectionDropZone` in `frontend_new/src/components/editor/Timeline.tsx`
- Handlers: `handleStagedFileDrop` and `handleClipReAdd` in `frontend_new/src/pages/WorkspacePage.tsx`
- Existing clips can be duplicated by dragging from the gallery to a timeline drop zone (re-uploads as new clip with fresh UUID)
- After clip addition, `window.location.reload()` ensures clean player/timeline state (MVP approach)
- Insertion position computed by cumulative time: clips insert at the section boundary matching the drop zone position

### Feature 2: Pre-Analysis Before Brief
Frame extraction, transcription, and cut density run immediately after upload:
- Triggered by `POST /projects/{id}/pre-analyze` (fire-and-forget)
- Called automatically after upload in ImportScreen
- When brief is submitted, uses cached data if available (only GPT-4o needed)
- Reduces perceived wait time significantly
- Database columns: `pre_analysis_status`, `pre_analysis_frames`, `pre_analysis_transcript`, `pre_analysis_cut_density`

### Feature 3: Re-analyze Sections on Demand
After merge/split, users can refresh analysis for individual sections:
- "Re-analyze" button in SectionPanel
- Calls `POST /projects/{id}/sections/{sid}/reanalyze`
- Extracts frames and transcribes only for clips in that section
- Calls GPT-4o to analyze single section
- Updates section attributes, resets music_status to PENDING
- Database column: `analysis_status` (PENDING, ANALYZING, COMPLETE, FAILED)

### Database Migration
Run `migrations/001_workspace_enhancements.sql` to add new columns for existing databases.

---

## Auto Section Detection Feature

### Overview
Automatically detects scene changes WITHIN clips (not just at clip boundaries) and intelligently groups them into narrative sections based on pacing changes and visual content analysis.

### Scene Detection Algorithm
1. **FFmpeg Scene Detection**: `ffmpeg -filter:v "select='gt(scene,0.3)'"` detects visual scene changes
2. **Merge Cut Sources**: Combines clip boundaries + internal scene changes
3. **Rolling Density Calculation**: 5-second windows categorized as MONTAGE/MEDIUM/SLOW/STATIC
4. **Video Structure Detection**: Classifies video type using shot patterns, transcript density, and pacing
5. **Boundary Detection**: Section boundaries occur where pacing CHANGES (montage/mixed) or where visual content changes (scenic)
6. **Scenic Content Detection**: For scenic/travel/cinematic videos with uniform pacing, uses content-based boundaries instead of pacing-based
7. **Guardrails**: Min 10s sections, max 4 boundaries (5 sections), skip videos <30s

### Video Structure Detection
`detect_video_structure_fast()` classifies videos using three signals:

1. **Shot patterns** (strongest signal): Many short shots (>=5 cuts, avg <5s) + non-montage pacing → **"Scenic"**
2. **Transcript keywords**: "tutorial", "travel", "interview", etc. → matching type
3. **Pacing fallback**: MONTAGE → "Montage", SLOW/STATIC + low transcript density (<15 chars/s) → "Scenic", STATIC + speech → "Talking Head"

**Important**: "Vlog" is the default fallback type. It is NOT treated as talking head — only "Talking Head", "Interview", and "Tutorial" use the conservative transcript-based sectioning path.

### Scenic Video Handling
Scenic videos (travel, nature, cinematic) have uniform pacing but visually distinct shots.
The pacing-based boundary detection fails for these, so special handling is used:

1. **Detection**: `detect_video_structure_fast()` identifies scenic content using shot patterns (many short shots + slow pacing) or low transcript density at slow pacing
2. **Per-Shot Frames**: `_extract_per_shot_frames()` extracts one representative frame per shot segment (between cuts), replacing evenly-spaced frames
3. **Cut-Based Boundaries**: `find_auto_boundaries()` distributes boundaries evenly across cuts, snapping to nearest cut point
4. **GPT-4o Prompt**: Enhanced to instruct grouping visually similar shots and splitting at location/subject changes
5. **Scene Change Context**: All cut timestamps are passed to GPT-4o so it knows where shots change
6. **More Frames**: Frame limit increased from 8 to 14 for scenic content to cover more shots

**Config**: `SCENIC_VIDEO_TYPES = ("Scenic", "Travel", "Cinematic")` in config.py

### Density Categories (config.py)
```python
DENSITY_MONTAGE_THRESHOLD = 1.5   # cuts/sec - Fast-paced, many cuts
DENSITY_MEDIUM_THRESHOLD = 0.5    # cuts/sec - Active but not frantic
DENSITY_SLOW_THRESHOLD = 0.1      # cuts/sec - Few cuts, deliberate pacing
# Below SLOW = STATIC - Continuous shot
```

### Simplified Onboarding Flow
```
BEFORE: Upload → Brief form (3 questions) → Wait → Workspace

AFTER:  Upload → Vibe selector (1 question) → AI Recommendation → Workspace
```

1. **VibeSelector**: Single question - "What vibe should your video have?"
   - Options: Energetic, Chill, Dramatic, Playful, Inspirational, etc.
   - Component: `frontend/src/components/VibeSelector.jsx`

2. **AIRecommendation**: Shows detected video type + recommended music style
   - User can edit the recommendation
   - Confirmed style becomes "gold standard" for all sections
   - Component: `frontend/src/components/AIRecommendation.jsx`

### Gold Standard Music Style
- The confirmed music style is used as the DEFAULT for all sections
- Individual sections only deviate if dramatically different (e.g., action moment in calm vlog)
- Ensures cohesive music across the video

### New API Endpoints
```
GET    /projects/{id}/pre-analysis-status  Get status + results (video_structure, theme, style)
POST   /projects/{id}/vibe                 Set vibe, get music style recommendation
POST   /projects/{id}/confirm-style        Confirm gold standard music style
```

### Pre-Analysis Enhanced
`pre_analyze_video()` now includes:
- Frame extraction
- Audio transcription
- Scene detection (FFmpeg)
- Auto-boundary detection
- Video structure detection (heuristic, no GPT-4o)
- Theme summary
- Music style recommendation

### Database Columns (projects table)
```sql
pre_analysis_scene_changes jsonb      -- Detected scene change timestamps
pre_analysis_auto_boundaries jsonb    -- Suggested section break points
detected_video_structure text         -- "Scenic", "Vlog", "Tutorial", etc.
detected_theme_summary text           -- AI-detected theme description
selected_vibe text                    -- User's selected vibe
recommended_music_style text          -- AI recommendation based on vibe + structure
confirmed_music_style text            -- "Gold standard" confirmed by user
```

### Migration
Run `migrations/002_auto_section_detection.sql` to add new columns.

---

## Seamless Clip Playback

### Problem
When playing through the timeline, transitioning between uploaded clips caused a ~500ms stutter because a single `<video>` element was switching `src` (requiring network fetch + decoder init).

### Solution: Dual Video Element Preloading
Component: `frontend_new/src/hooks/useVideoPlayer.ts` (hook) + `frontend_new/src/components/editor/VideoPreview.tsx` (UI)

**Architecture:**
- Two `<video>` elements (A and B) stacked on top of each other via `position: absolute`
- Only the active element has `opacity: 1`; the other is hidden
- While clip N plays on element A, clip N+1 is preloaded on element B (`src` + `load()`)
- When clip N ends (`handleEnded`), elements swap: B becomes visible and plays instantly, A becomes the preloader
- All existing code uses `videoRef.current` which is kept in sync with the active element

**Key details:**
- `activeSlotRef` (ref) tracks which element is active (synchronous, no render delay)
- `displaySlot` (state) triggers re-render for visual swap
- `preloadedClipIdx` (ref) tracks which clip is buffered on the inactive element
- Event handlers (`handleTimeUpdate`, `handleEnded`) check `e.target` against active element to ignore events from the preload element
- `handleLoadedMetadata` correctly stores clip duration for both active and preloaded clips
- Falls back to src-switch on seeks to non-preloaded clips (rare)
- **Important:** `handleTimeUpdate` must use `currentClipIndexRef.current` (sync ref), NOT `currentClipIndex` (async React state) — state hasn't flushed after slot swap, causing 100ms glitch at clip transitions

---

## Transition-Aware Music Generation & Auto-Generation

### Transition-Aware Prompts
Music generation prompts now include context about neighboring sections for smooth transitions:

- **Previous section context**: Mood, energy, pacing of the previous section → prompt says "Begin smoothly continuing from that feel"
- **Next section context**: Mood, energy, pacing of the next section → prompt says "End by gradually shifting toward that feel"
- **First section**: "Start with a natural musical intro" (no previous)
- **Last section**: "End with a natural musical outro or gentle fade" (no next)

This applies to both initial generation and regeneration (with feedback).

### Auto-Generation After Brief Submission
When the brief is submitted (`POST /projects/{id}/brief`), music generation automatically starts for ALL sections:

- `_background_generate_all_sections()` runs as a background task after sections are stored
- Sections are processed sequentially (in `section_order`) so each gets proper neighbor context
- Each section transitions through: PENDING → GENERATING → READY/FAILED
- Frontend sees status updates via Supabase Realtime — tracks appear one-by-one
- No manual "Generate" click needed; users can still regenerate individual sections with feedback

### Music Prompt Truncation
ElevenLabs Sound Generation API has a **450 character limit** on prompts. `build_music_prompt()` truncates to 450 chars after assembly. Keep individual prompt parts concise.

### Auto-Regeneration Chains
The frontend automatically triggers reanalysis + music regeneration after structural changes:
- **Merge** → reanalyze merged section → generate music
- **Split** → reanalyze both new sections → generate music for each
- **Brief update** → regenerate all sections with `READY` or `FAILED` status
- **Clip addition** → page reload (reanalyze + generate handled by backend on next load)
- **Section attribute change** (type, tone, pacing, energy) → auto-regenerate that section's music

Implementation: `useProjectState.ts` hooks chain polling (`pollForAnalysis` → `pollForMusic`) to wait for async backend operations.

### Implementation Files
- `backend/services/analysis_types.py`: `build_music_prompt()` accepts `prev_section`/`next_section`
- `backend/services/music_service.py`: `generate_music_for_section()` passes neighbor context through
- `backend/routes/sections.py`: `_get_neighbor_sections()` fetches adjacent sections by `section_order`; generate/regenerate endpoints pass neighbors
- `backend/routes/projects.py`: `_background_generate_all_sections()` auto-generates all sections after brief

---

## Frontend Workspace Components (`frontend_new/`)

### Key Components
- **WorkspacePage** (`pages/WorkspacePage.tsx`): Main workspace orchestrator. Manages staged files state, volume controls, drop handlers.
- **MediaBrowser** (`components/editor/MediaBrowser.tsx`): Left sidebar. Displays uploaded clips + staged files. Drag source for timeline drops.
- **VideoPreview** (`components/editor/VideoPreview.tsx`): Dual video elements + audio element for seamless playback.
- **Timeline** (`components/editor/Timeline.tsx`): Video thumbnails, section blocks, music track blocks, playhead, zoom. Section drop zones between sections accept staged files and existing clips.
- **SectionPanel** (`components/editor/SectionPanel.tsx`): Right sidebar. Section details, dropdowns, generate/regenerate, volume controls, "Try:" contextual suggestions.
- **TopBar** (`components/editor/TopBar.tsx`): Project name, play/pause/skip, export, brief editing.

### Key Hooks
- **useProjectState** (`hooks/useProjectState.ts`): All project data loading, Supabase Realtime subscriptions, mutation handlers (merge, split, generate, reanalyze), polling helpers.
- **useVideoPlayer** (`hooks/useVideoPlayer.ts`): Dual video element management, clip-to-timeline time mapping, preloading, seek, play/pause.

### Timeline "Try:" Suggestions
The SectionPanel and Timeline popup show contextual "Try:" suggestions for music regeneration. The suggested style is based on the current `suggested_music_style` — e.g., if current style is "Upbeat pop", suggestion might be "Calm pop". Falls back to `Calm ${currentStyle}` if no specific mapping exists.
