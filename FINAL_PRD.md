# ScoreFlow — PRD v3.1
**Status:** Final for Vibe Coding | **Date:** 14 March 2026 | **Scope:** 24-hour hackathon MVP | **Platform:** Desktop web only

---

## 1. One-Liner
Drop your video clips. The AI reads the story. The music writes itself — per section, not per video.

---

## 2. Tech Stack

| Decision | Answer |
|---|---|
| Backend | Python + FastAPI |
| Frontend | React (desktop web only) |
| Database | Supabase (Postgres + Storage) |
| Music generation | ElevenLabs `/v1/sound-generation` |
| Transcription | ElevenLabs `/v1/speech-to-text` |
| Vision | OpenAI GPT-4o |
| Video processing | FFmpeg (server-side only) |
| Realtime | Supabase Realtime |
| Export | MP4 (H.264 + AAC) |
| Preview | Server-rendered preview MP4 |
| Queuing | `asyncio.Semaphore` + exponential backoff |

---

## 3. Config (`config.py`)

```python
import os

PRODUCT_NAME = os.getenv("PRODUCT_NAME", "ScoreFlow")

ELEVENLABS_API_KEY = "sk-elevenlabs-PASTE_KEY_HERE"
OPENAI_API_KEY    = "sk-openai-PASTE_KEY_HERE"

SUPABASE_URL      = "https://bznswadiiqulyzpkajqp.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bnN3YWRpaXF1bHl6cGthanFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NjQzMjQsImV4cCI6MjA3NzM0MDMyNH0.AkVhwJUNM1NKGjR4b5qjEjAfNkszVpqE4TYK7qwxmVM"

ELEVENLABS_BASE_URL = "https://api.elevenlabs.io"
OPENAI_BASE_URL     = "https://api.openai.com/v1"

FFMPEG_PATH      = "ffmpeg"
UPLOAD_DIR       = "./uploads"
FRAMES_DIR       = "./frames"
THUMBNAILS_DIR   = "./thumbnails"
AUDIO_DIR        = "./audio"
EXPORT_DIR       = "./exports"
PREVIEW_DIR      = "./previews"

MAX_CLIP_ANALYSIS_SECONDS = 240
MAX_SECTIONS              = 5
MIN_SECTIONS              = 3
MUSIC_QUEUE_CONCURRENCY   = 2
MUSIC_RETRY_MAX           = 3
MUSIC_RETRY_BASE_DELAY_MS = 1000
MAX_ANALYSIS_FRAMES       = 120

PORT = 8000
```

`PRODUCT_NAME` must be used everywhere the product name appears. Never hardcode the string.

---

## 4. Database Schema (Supabase)

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  total_duration float default 0,
  overall_energy text,
  music_style_direction text,
  references_text text,
  analysis_mode text default 'AI'  -- 'AI' | 'FALLBACK'
);

create table clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  filename text,
  storage_path text,
  start_time float,
  end_time float,
  duration float,
  clip_order int,
  thumbnail_urls jsonb
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  start_time float,
  end_time float,
  duration float,
  clip_ids jsonb,
  section_type text,
  scene_type text,
  emotional_tone text,
  pacing text,
  energy_level text,
  cuts_per_second float,
  detected_theme text,
  dominant_visual text,
  suggested_music_style text,
  music_status text default 'PENDING',  -- PENDING | GENERATING | READY | FAILED
  feedback_history jsonb default '[]',
  section_order int
);

create table tracks (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references sections(id) on delete cascade,
  storage_path text,
  stream_url text,
  duration float,
  generation_prompt text,
  trimmed_to_fit boolean default false
);
```

---

## 5. Enums

```python
SECTION_TYPES  = ["Hook","Intro","Setup","Build","Anticipation","Reveal",
                  "Reaction","Demonstration","Montage","Transition","Recap",
                  "Climax","Cooldown","Testimonial","CTA","Outro"]

SCENE_TYPES    = ["Talking Head","Walk and Talk","Travel Montage","Product Showcase",
                  "Tutorial","Action Moment","Crowd/Event","Reaction Shot",
                  "Environment B-roll","Cinematic Shot","Interview","Screen Recording",
                  "Timelapse","Food/Cooking","Before/After","Aerial/Drone",
                  "Close-up Detail","Text/Graphics","Vlog/Casual","Performance",
                  "Unboxing","Split Screen","POV/First Person","Slow Motion",
                  "Night/Low Light","Nature/Wildlife","Workout/Fitness","Behind the Scenes"]

EMOTIONAL_TONES = ["Energetic","Playful","Suspenseful","Inspirational","Dramatic",
                   "Emotional","Calm","Informative","Nostalgic","Mysterious",
                   "Triumphant","Melancholic","Romantic","Epic","Quirky",
                   "Aggressive","Dreamy","Dark","Confident","Humorous",
                   "Uplifting","Tense","Bittersweet","Rebellious","Serene",
                   "Whimsical","Gritty","Hopeful","Eerie","Empowering"]

PACING         = ["Very Slow","Slow","Medium","Fast","Very Fast"]
ENERGY_LEVELS  = ["Very Low","Low","Medium Low","Medium","Medium High","High","Very High"]
MUSIC_STATUS   = ["PENDING","GENERATING","READY","FAILED"]
```

AI must return values from these exact lists. No other values are valid.

---

## 6. UI

### 6.1 Design Tokens

```css
:root {
  --bg:         #0b0c10;
  --bg-card:    #13151a;
  --stroke:     rgba(255,255,255,0.08);
  --ink:        #ffffff;
  --muted:      rgba(255,255,255,0.6);
  --accent:     #45f5c5;
  --accent-dim: rgba(69,245,197,0.12);
  --danger:     #f87171;
  --amber:      #F5A623;
}
```

Font: `DM Serif Display` for headings, `IBM Plex Mono` for labels. Never Inter/Roboto/Arial.

### 6.2 Import Screen

Full-screen drop zone. Header = `PRODUCT_NAME`. Accept MP4/MOV/WebM. On drop → upload to Supabase Storage → ffprobe metadata → return Clips → show Creative Brief modal.

"Paste YouTube/TikTok URL" field is disabled with tooltip "Coming soon."

### 6.3 Creative Brief Modal

Shown after upload. Questions 1 and 2 are required.

1. "What energy should the video have overall?" → `overall_energy` (required)
2. "What music style do you want?" → `music_style_direction` (required)
3. "Any references or inspiration?" → `references_text` (optional)

Submit: **"Score My Video →"** triggers the analysis pipeline.

### 6.4 Workspace Layout

```
┌─────────────────────────────────────────────────────────┐
│ TOP BAR: [ScoreFlow]    [How It Works]    [Export]       │
├───────────────────────────────┬─────────────────────────┤
│ PREVIEW PLAYER (<video>)      │ SECTION PANEL           │
│ play/pause, scrub, time       │ (right sidebar)         │
│ Plays server preview MP4      │ visible when section    │
├───────────────────────────────┤ is selected             │
│ TIMELINE                      │                         │
│  VIDEO    [thumbnail strips]  │                         │
│  SECTIONS [colour blocks]     │                         │
│  MUSIC    [track blocks]      │                         │
│  [+ Add Clips]   [Zoom +/-]   │                         │
└───────────────────────────────┴─────────────────────────┘
```

### 6.5 Timeline Layers

**Video layer:** thumbnail strip per clip (`thumbnail_urls`), proportional width. Clips separated by 1px divider.

**Sections layer:** colour-coded blocks. Click to select. Context menu: merge adjacent, split at clip boundary.
```
Hook=#FF6B6B  Intro=#4A90D9   Setup=#8B9DC3   Build=#F5A623
Reveal=#D0021B Reaction=#FF85A2 Demonstration=#50C878 Montage=#9B59B6
Recap=#3498DB  Climax=#C0392B  Cooldown=#1ABC9C CTA=#E74C3C  Outro=#9013FE
```

**Music layer:** one block per section, same width as section.
- `PENDING` → grey `#2a2a2a`, dashed, "Waiting..."
- `GENERATING` → amber `#F5A623`, CSS pulse 1.5s, "Generating..."
- `READY` → section colour, mini waveform, play icon
- `FAILED` → red `#D0021B`, retry icon

Each section block has a **"Generate ▶"** button.

**Playhead:** red `#FF0000`, 2px, spans all layers. Draggable. Syncs to `<video>.currentTime`.

**Zoom:** default 10px/sec, min 2, max 100. Clamp always.

### 6.6 Preview Player

Preview uses **server-rendered MP4 files**.

When at least one section track is READY, the backend builds a temporary preview MP4 using FFmpeg:
- Concatenate clips in order
- Mix READY tracks at their section offsets
- Silence where tracks are missing

The backend returns a preview URL. The frontend plays it in `<video>`. When a new track becomes READY, the frontend requests a fresh preview.

Sections without a READY track play silence in the preview — this is expected, not an error.

### 6.7 Section Panel (Right Sidebar)

- **No section selected:** "Select a section on the timeline."
- **During analysis:** skeleton placeholder blocks.
- **Section selected:**
  - Creative Brief summary (collapsible, editable — does NOT auto-regenerate)
  - `section_type` dropdown (user-editable)
  - `scene_type` badge (read-only)
  - `emotional_tone` dropdown (user-editable)
  - `detected_theme`, `dominant_visual`, `suggested_music_style` (read-only)
  - `energy_level`, `pacing` badges (read-only)
  - **Generate Music** button (disabled while GENERATING)
  - **Regenerate** button (visible when READY)
  - Feedback input → appended to `feedback_history` on regenerate
  - Track info when READY: duration, `trimmed_to_fit` indicator

### 6.8 Top Bar

- Left: `PRODUCT_NAME`
- Center: "How It Works" → 3-step modal (Import → Describe → Score)
- Right: "Export" — disabled until ≥1 section is READY

### 6.9 Progress Indicator

Modal overlay, 4 steps via Supabase Realtime:
1. "Uploading clips..."
2. "Extracting frames..." (parallel with 3)
3. "Transcribing audio..." (parallel with 2)
4. "Analysing video structure..."

If step 4 fails or times out → fallback (§8.3).

**Fallback notice:** show banner in workspace: `"Automatic segmentation used — AI analysis unavailable."`

---

## 7. Backend API

### 7.1 Endpoints

```
POST   /api/projects                                Create project
POST   /api/projects/{id}/clips                     Upload clips (multipart)
POST   /api/projects/{id}/brief                     Submit brief + trigger analysis
PUT    /api/projects/{id}/brief                     Update brief (no auto-regen)
GET    /api/projects/{id}/sections                  Get sections
PUT    /api/projects/{id}/sections/{sid}            Update section_type / emotional_tone
POST   /api/projects/{id}/sections/{sid}/generate   Trigger music generation
POST   /api/projects/{id}/sections/{sid}/regenerate Regenerate with feedback
POST   /api/projects/{id}/sections/merge            Merge two sections
POST   /api/projects/{id}/sections/{sid}/split      Split at clip boundary
GET    /api/projects/{id}/clips/{cid}/stream        Stream clip for preview
POST   /api/projects/{id}/preview                   Build preview MP4, return URL
POST   /api/projects/{id}/export                    Full export
GET    /api/projects/{id}/export/download           Download MP4
GET    /api/projects/{id}/tracks/{tid}/download     Download individual track
```

**Clip upload rules:** max 1 GB. Videos >4 min accepted; only first 240s used for analysis. Returns `id`, `duration`, `thumbnail_urls`, `start_time`, `end_time`.

### 7.2 Pydantic Models

```python
class CreativeBrief(BaseModel):
    overall_energy: str
    music_style_direction: str
    references_text: Optional[str] = ""

class SectionUpdate(BaseModel):
    section_type: Optional[str] = None
    emotional_tone: Optional[str] = None

class MergeRequest(BaseModel):
    section_ids: List[str]  # exactly 2, adjacent

class SplitRequest(BaseModel):
    split_at_clip_id: str

class RegenerateRequest(BaseModel):
    feedback: str
```

### 7.3 Realtime (Supabase)

Backend writes status to Supabase rows. Frontend subscribes via Supabase Realtime — no custom WebSocket.

| Table | Change | Frontend action |
|---|---|---|
| `sections` | `music_status` UPDATE | Update music block |
| `tracks` | INSERT | Show track, update section |
| `projects` | UPDATE | Sync state |
| `pipeline_events` | INSERT | Drive progress overlay |

---

## 8. AI Pipeline

### 8.1 Frame Extraction (FFmpeg, 2 passes, parallel)

**Pass 1 — Analysis frames:**
```bash
ffmpeg -i clip.mp4 -vf "fps=1,scale=256:144" -q:v 8 frames/clip_N_%04d.jpg
```
Cap at `MAX_ANALYSIS_FRAMES = 120` total, subsampled evenly. Never sent to frontend.

**Pass 2 — Thumbnail strip:**
```bash
ffmpeg -i clip.mp4 -vf "fps=0.4,scale=128:72" -q:v 10 thumbnails/clip_N_%04d.jpg
```
Upload to Supabase Storage. Return URLs as `thumbnail_urls`.

### 8.2 Cut Density Computation

From clip metadata only (no FFmpeg). Rolling 5-second windows. Output: `[{window_start, window_end, cuts_per_second}]`.

### 8.3 Audio Transcription (ElevenLabs STT)

Each clip is transcribed **individually**. Do not concatenate clips with FFmpeg.

```
POST https://api.elevenlabs.io/v1/speech-to-text
```

Request word-level timestamps. Merge transcripts in memory using clip offsets to produce a full timeline transcript. ElevenLabs STT is the sole provider — no Whisper.

### 8.4 GPT-4o Vision Call

Runs after 8.1, 8.2, 8.3 complete. Timeout: 35s. On failure → §8.5 fallback.

```
POST https://api.openai.com/v1/chat/completions
model: gpt-4o
```

**Prompt:**
```
You are scoring a video for background music composition.

CREATIVE BRIEF:
Overall Energy: {overall_energy}
Music Style: {music_style_direction}
References: {references_text}

Divide into 3–5 narrative sections aligned to clip boundaries.

Cut density: >2.0=Very Fast, 1.0–2.0=Fast, 0.3–1.0=Medium, 0.1–0.3=Slow, <0.1=Very Slow

Return ONLY a raw JSON array. No markdown, no explanation.

[{
  "start_time": float,
  "end_time": float,
  "section_type": <SECTION_TYPES>,
  "scene_type": <SCENE_TYPES>,
  "emotional_tone": <EMOTIONAL_TONES>,
  "pacing": <PACING>,
  "energy_level": <ENERGY_LEVELS>,
  "cuts_per_second": float,
  "detected_theme": "max 12 words",
  "dominant_visual": "max 8 words",
  "suggested_music_style": "max 30 words, must use creator's style direction"
}]
```

### 8.5 Fallback (GPT-4o fails or >35s)

Divide timeline into **4 equal sections** aligned to clip boundaries.

| Section | Type |
|---|---|
| 1 | Hook |
| 2 | Build |
| 3 | Climax |
| 4 | Outro |

All sections: `scene_type = "Vlog/Casual"`, `emotional_tone = "Energetic"`, `pacing = "Medium"`, `energy_level = "Medium"`.

Set `projects.analysis_mode = "FALLBACK"`. Frontend shows banner: **"Automatic segmentation used — AI analysis unavailable."**

### 8.6 Music Generation (ElevenLabs)

```
POST https://api.elevenlabs.io/v1/sound-generation
{
  "text": "<prompt>",
  "duration_seconds": <section.duration>,
  "prompt_influence": 0.7
}
```

**Prompt:**
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

**Long sections:** if `section.duration > 30`, split into ≤30s chunks, generate sequentially with the same prompt, concatenate with FFmpeg.

**After generation, always trim with FFmpeg to exactly `section.duration`:**
```bash
ffmpeg -i track.mp3 -t {section.duration} -c copy trimmed.mp3
```
If generated audio is shorter than `section.duration`, use as-is — silence fills the remainder during preview/export. Set `trimmed_to_fit = true`. **Never retry for duration mismatch. Never stretch audio.**

### 8.7 Queuing & Retry

```python
semaphore = asyncio.Semaphore(MUSIC_QUEUE_CONCURRENCY)

async def generate_with_retry(section):
    async with semaphore:
        for attempt in range(1, MUSIC_RETRY_MAX + 1):
            try:
                return await call_elevenlabs(section)
            except Exception:
                if attempt == MUSIC_RETRY_MAX:
                    raise
                delay = (MUSIC_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1)) / 1000)
                delay *= (0.5 + random.random() * 0.5)
                await asyncio.sleep(delay)
```

Status written to `sections.music_status`. Frontend updates via Realtime. Tracks appear one-by-one.

---

## 9. Section Editing

All edits sent to backend. Frontend never mutates boundaries directly.

### 9.0 UX Guard

If any affected section has `music_status === 'READY'`, backend returns `requires_confirmation: true`. Frontend shows inline warning **on the music block**: "This will clear the generated track. Continue?" with Continue / Cancel. No modal.

### 9.1 Merge (`POST /api/projects/{id}/sections/merge`)

Body: `{ section_ids: [id1, id2] }` — must be adjacent.

- Larger section (by duration) wins `section_type` and `emotional_tone`
- `start_time` = earlier's start, `end_time` = later's end
- `clip_ids` concatenated in order, `cuts_per_second` recomputed
- Both tracks discarded, reset to `PENDING`, `feedback_history` cleared

### 9.2 Split (`POST /api/projects/{id}/sections/{sid}/split`)

Body: `{ split_at_clip_id }` — clip boundary only.

- Earlier half: keeps original `section_type` and `emotional_tone`
- Later half: next `section_type` in sequence (if Outro → stays Outro)
- Both halves inherit `scene_type`, `energy_level`, `pacing`
- Both reset to `PENDING`, `feedback_history` cleared

---

## 10. Export (`POST /api/projects/{id}/export`)

Before mixing, each READY track is trimmed or padded with silence so its duration **exactly equals** the section duration.

Then:
1. Concatenate all section tracks in timeline order → single music track
2. Concatenate all clips in order → video
3. Mix music track with video via FFmpeg → MP4 (H.264, AAC)
4. Upload to Supabase Storage, return download URL

**On failure:** show modal with two options — **Retry Export** (re-triggers) or **Export Manually** (per-track download links + editor instructions).

---

## 11. Phase 1 — Workspace Shell (Build First)

Build the full UI with mocked AI. Everything must look and feel real.

| Feature | Phase 1 behaviour |
|---|---|
| Clip upload | Fully works — Supabase Storage, thumbnails, ffprobe |
| Creative Brief | Form appears, answers stored — no AI pipeline |
| Section detection | Mocked: 3–5 equal sections at clip boundaries |
| Default values | section_type sequential (Hook/Intro/Build/Reveal/Outro), scene_type=Vlog/Casual, emotional_tone=Energetic, pacing=Medium, energy_level=Medium |
| AI fields | detected_theme="Scene analysis pending", suggested_music_style="Style pending", dominant_visual="Pending" |
| Music layer | All PENDING |
| Generate button | Toast: "AI generation available in Phase 2" |
| Preview | `<video>` plays clips directly, no audio |
| Export | Disabled |
| Merge / Split | Fully works with UX guard |
| Playhead / Zoom | Fully works |

---

## 12. Cut Features

| Feature | Reason |
|---|---|
| Clip reorder | Cut — simplifies editing model |
| Section resize | Cut — merge/split is sufficient |
| Undo / discard track restore | Cut — complexity not worth it for MVP |
| Beat-level sync | Too complex for 24h |
| User accounts | Post-hackathon |
| DAW controls | Different product |
| YouTube/TikTok import | Stub only, disabled |
| Mobile layout | Desktop only |
| Audio stretching | Never — silence fills gaps |
| Reference file audio analysis | Phase 2 |

---

## 13. Known Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | ElevenLabs `duration_seconds` unreliable | Always trim output with FFmpeg regardless |
| 2 | GPT-4o 120-frame context limit | Evenly subsample to cap |
| 3 | Preview MP4 rebuild latency on every track change | Debounce 2s; show "Rebuilding preview..." |
| 4 | Supabase CDN latency for track playback | Pre-fetch stream URL when section hits READY |
| 5 | Large dropdowns (30 emotional tones) | Group by energy level, add search |

---

## 14. Demo Script (90 seconds)

1. Drop 60–90s clips onto import screen
2. Creative Brief modal → type energy and style
3. "Score My Video →" → progress overlay
4. Workspace: 3–5 labelled sections on timeline
5. Click section → panel shows theme, tone, style
6. Click "Generate ▶" → amber pulse → track appears
7. Play → preview MP4 with music streams
8. Type feedback → Regenerate → new track
9. Export → browser downloads MP4

---

## 15. Success Metric

A judge uploads a clip. They hear music that fits each part of the video. They say "oh that's good" out loud.
