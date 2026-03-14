# **ScoreFlow --- PRD v3.0**

**Status:** Final for Vibe Coding \| **Date:** 14 March 2026 \|
**Scope:** 24-hour hackathon MVP \| **Platform:** Desktop web only

## **1. One-Liner**

Drop your video clips. The AI reads the story. The music writes itself
--- per section, not per video.

## **2. Tech Stack**

  -----------------------------------------------------------------------
  **Decision**         **Answer**
  -------------------- --------------------------------------------------
  Backend              **Python + FastAPI**

  Frontend             **React** (desktop web only)

  Database             **Supabase** (Postgres + Storage)

  Music generation     ElevenLabs Sound Generation (POST
                       /v1/sound-generation)

  Transcription        ElevenLabs Speech to Text (POST
                       /v1/speech-to-text)

  Vision / analysis    OpenAI GPT-4o Vision

  Audio/video          FFmpeg (server-side only)
  processing           

  Realtime updates     Supabase Realtime (replaces WebSocket)

  Export format        MP4 (H.264 + AAC)

  Preview playback     Client-side audio sync (no server MP4 assembly for
                       preview)

  Queuing              asyncio.Semaphore + exponential backoff
  -----------------------------------------------------------------------

## **3. Config (config.py)**

Single file. All keys live here. Never hardcode strings elsewhere.

# config.py

import os

PRODUCT_NAME = os.getenv(\"PRODUCT_NAME\", \"ScoreFlow\")

ELEVENLABS_API_KEY = \"sk-elevenlabs-PASTE_KEY_HERE\"

OPENAI_API_KEY = \"sk-openai-PASTE_KEY_HERE\"

SUPABASE_URL = \"https://bznswadiiqulyzpkajqp.supabase.co\"

SUPABASE_ANON_KEY =
\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bnN3YWRpaXF1bHl6cGthanFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NjQzMjQsImV4cCI6MjA3NzM0MDMyNH0.AkVhwJUNM1NKGjR4b5qjEjAfNkszVpqE4TYK7qwxmVM\"

ELEVENLABS_BASE_URL = \"https://api.elevenlabs.io\"

OPENAI_BASE_URL = \"https://api.openai.com/v1\"

FFMPEG_PATH = \"ffmpeg\"

UPLOAD_DIR = \"./uploads\"

FRAMES_DIR = \"./frames\" \# analysis frames (1fps, 256x144)

THUMBNAILS_DIR = \"./thumbnails\" \# timeline strip frames (128x72)

AUDIO_DIR = \"./audio\"

EXPORT_DIR = \"./exports\"

MAX_CLIP_ANALYSIS_SECONDS = 240 \# first 4 min per clip used for
analysis

MAX_TOTAL_DURATION_SECONDS = 600

MAX_SECTIONS = 5

MIN_SECTIONS = 3

MUSIC_QUEUE_CONCURRENCY = 2

MUSIC_RETRY_MAX = 3

MUSIC_RETRY_BASE_DELAY_MS = 1000

MUSIC_DURATION_RETRY_PADDING_SECONDS = 2.0

MAX_ANALYSIS_FRAMES = 120 \# cap at 120 frames regardless of video
length

PORT = 8000

PRODUCT_NAME is used everywhere the product name appears: top bar,
import screen, page title, export metadata. **Never hardcode the string
--- always read from config.**

## **4. Data Model**

### **4.1 Supabase Schema**

****\-- projects

create table projects (

id uuid primary key default gen_random_uuid(),

created_at timestamptz default now(),

total_duration float default 0,

overall_energy text,

music_style_direction text,

references_text text

);

\-- clips

create table clips (

id uuid primary key default gen_random_uuid(),

project_id uuid references projects(id) on delete cascade,

filename text,

storage_path text, \-- Supabase Storage path

start_time float, \-- absolute position in assembled timeline (seconds)

end_time float,

duration float,

clip_order int, \-- 0-indexed

thumbnail_urls jsonb \-- array of thumbnail strip URLs from Supabase
Storage

);

\-- sections

create table sections (

id uuid primary key default gen_random_uuid(),

project_id uuid references projects(id) on delete cascade,

start_time float,

end_time float,

duration float,

clip_ids jsonb, \-- ordered array of clip UUIDs

section_type text,

scene_type text,

emotional_tone text,

pacing text,

energy_level float,

cuts_per_second float,

detected_theme text,

dominant_visual text,

suggested_music_style text,

music_status text default \'PENDING\', \-- PENDING \| GENERATING \|
READY \| FAILED

feedback_history jsonb default \'\[\]\',

section_order int

);

\-- tracks

create table tracks (

id uuid primary key default gen_random_uuid(),

section_id uuid references sections(id) on delete cascade,

storage_path text,

stream_url text,

duration float,

requested_duration float,

bpm float,

mood_tags jsonb,

generation_prompt text,

was_retried boolean default false,

trimmed_to_fit boolean default false,

is_discarded boolean default false \-- true = this is a discardedTrack

);

### **4.2 Section Attributes**

**User-editable:** section_type, emotional_tone\
**AI-detected (read-only in UI):** scene_type, pacing, energy_level,
detected_theme, dominant_visual, suggested_music_style\
**System-derived:** start_time, end_time, duration, cuts_per_second

### **4.3 Enums**

****\# These are the only valid values. AI must return from these sets.

SECTION_TYPES = \[

\"Hook\", \"Intro\", \"Setup\", \"Build\", \"Anticipation\", \"Reveal\",

\"Reaction\", \"Demonstration\", \"Montage\", \"Transition\", \"Recap\",

\"Climax\", \"Cooldown\", \"Testimonial\", \"CTA\", \"Outro\"

\]

SCENE_TYPES = \[

\"Talking Head\", \"Walk and Talk\", \"Travel Montage\", \"Product
Showcase\",

\"Tutorial\", \"Action Moment\", \"Crowd/Event\", \"Reaction Shot\",

\"Environment B-roll\", \"Cinematic Shot\", \"Interview\", \"Screen
Recording\",

\"Timelapse\", \"Food/Cooking\", \"Before/After\", \"Aerial/Drone\",

\"Close-up Detail\", \"Text/Graphics\", \"Vlog/Casual\",
\"Performance\",

\"Unboxing\", \"Split Screen\", \"POV/First Person\", \"Slow Motion\",

\"Night/Low Light\", \"Nature/Wildlife\", \"Workout/Fitness\", \"Behind
the Scenes\"

\]

EMOTIONAL_TONES = \[

\"Energetic\", \"Playful\", \"Suspenseful\", \"Inspirational\",
\"Dramatic\",

\"Emotional\", \"Calm\", \"Informative\", \"Nostalgic\", \"Mysterious\",

\"Triumphant\", \"Melancholic\", \"Romantic\", \"Epic\", \"Quirky\",

\"Aggressive\", \"Dreamy\", \"Dark\", \"Confident\", \"Humorous\",

\"Uplifting\", \"Tense\", \"Bittersweet\", \"Rebellious\", \"Serene\",

\"Whimsical\", \"Gritty\", \"Hopeful\", \"Eerie\", \"Empowering\"

\]

PACING = \[\"Very Slow\", \"Slow\", \"Medium\", \"Fast\", \"Very
Fast\"\]

ENERGY_LEVELS = \[\"Very Low\", \"Low\", \"Medium Low\", \"Medium\",
\"Medium High\", \"High\", \"Very High\"\]

MUSIC_STATUS = \[\"PENDING\", \"GENERATING\", \"READY\", \"FAILED\"\]



## **5. UI Layout & Design System**

### **5.1 Design Tokens (PAX-inspired, adapted for ScoreFlow)**

****:root {

\--bg: #0b0c10;

\--bg-card: #13151a;

\--stroke: rgba(255,255,255,0.08);

\--ink: #ffffff;

\--muted: rgba(255,255,255,0.6);

\--muted-2: rgba(255,255,255,0.4);

\--muted-3: rgba(255,255,255,0.25);

\--accent: #45f5c5; /\* green-cyan --- music/creative feel \*/

\--accent-dim: rgba(69,245,197,0.12);

\--danger: #f87171;

\--amber: #F5A623;

\--section-pending: #2a2a2a;

\--section-generating: #F5A623;

}

**Typography:** Display font --- DM Serif Display or Playfair Display.
Body --- IBM Plex Mono or DM Sans. Never Inter, Roboto, or Arial.

**Dark theme throughout.** All backgrounds var(\--bg) or
var(\--bg-card). Cards use border: 1px solid var(\--stroke) with
border-radius: 12px.

### **5.2 Import Screen**

-   Full-screen centered drop zone on var(\--bg)

-   Header: {PRODUCT_NAME} from config

-   Subtext: \"Drop your video clips here\"

-   Accepted: MP4, MOV, WebM --- up to 10 minutes total

-   Multi-file drop supported

-   \"Paste YouTube/TikTok URL\" field: **disabled, greyed out**,
    > tooltip \"Coming soon\"

-   On drop → validate → upload to Supabase Storage → server runs
    > ffprobe → return Clip objects → show Creative Brief modal

### **5.3 Creative Brief Modal (post-upload)**

Appears after clips upload. Cannot be skipped (questions 1 and 2
required).

  --------------------------------------------------------------------------------------
  **\#**   **Question**                           **Field**               **Required**
  -------- -------------------------------------- ----------------------- --------------
  1        \"What energy should the video have    overall_energy          Yes
           overall?\"                                                     

  2        \"What music style do you want?\"      music_style_direction   Yes

  3        \"Any references or inspiration?\"     references_text         No
  --------------------------------------------------------------------------------------

Submit button: **\"Score My Video →\"** --- triggers the analysis
pipeline.

### **5.4 Workspace Layout**

****┌─────────────────────────────────────────────────────────────────┐

│ TOP BAR │

│ \[ScoreFlow\] \[How It Works\] \[Export (video+audio)\] │

├───────────────────────────────────────────┬─────────────────────┤

│ PREVIEW PLAYER │ SECTION PANEL │

│ \<video\> element, plays clips in order │ right sidebar, │

│ Standard controls: play/pause, scrub │ visible when a │

│ Generates audio on client via Web Audio │ section is selected│

│ API layered over video │ │

├───────────────────────────────────────────┤ │

│ TIMELINE (3 layers) │ │

│ VIDEO \[thumbnail strip per clip\] │ │

│ SECTIONS \[colour-coded blocks\] │ │

│ MUSIC \[track blocks per section\] │ │

│ \[+ Add Clips\] \[Zoom +/-\] │ │

└───────────────────────────────────────────┴─────────────────────┘

### **5.5 Timeline --- Three Layers**

**Video Layer**

-   One thumbnail strip per clip from thumbnail_urls

-   Proportional width to duration

-   Clips separated by 1px divider at 50% opacity

-   Hover: show frame at cursor timestamp

-   Drag to reorder → PUT /api/projects/:id/clips/reorder

**Sections Layer**

-   Colour-coded blocks by section_type:

Hook=#FF6B6B, Intro=#4A90D9, Setup=#8B9DC3,
Build=#F5A623Anticipation=#E8871E, Reveal=#D0021B,
Reaction=#FF85A2Demonstration=#50C878, Montage=#9B59B6,
Transition=#95A5A6Recap=#3498DB, Climax=#C0392B,
Cooldown=#1ABC9CTestimonial=#F39C12, CTA=#E74C3C, Outro=#9013FE

-   Section boundaries snap to clip boundaries only

-   Click → selects, opens Section Panel

-   Drag boundary → resize (snaps to clip edges)

-   Context menu or UI button → merge adjacent sections

-   Context menu or UI button → split at clip boundary

**Music Layer**

-   One block per section, same width as section

-   States:

    -   PENDING: grey #2a2a2a, dashed border, \"Waiting\...\"

    -   GENERATING: amber #F5A623, CSS pulse animation 1.5s ease-in-out
        > infinite, \"Generating\...\"

    -   READY: section colour, mini waveform, play icon

    -   FAILED: red #D0021B, retry icon, \"Failed --- retry\"

-   Each section block has a **\"Generate ▶\"** button directly
    > below/inside it

**Playhead**

-   Red #FF0000, 2px vertical line spanning all layers

-   Draggable for scrubbing

-   Syncs to \<video\>.currentTime

**Zoom**

-   zoomLevel default: 10px/sec, min: 2, max: 100

-   Clamp on all zoom interactions

### **5.6 Preview Player --- Client-Side Audio Sync**

Preview is **not** server-assembled. The frontend handles it.

-   The \<video\> element plays the clips sequentially (or a
    > concatenated stream URL if backend provides one)

-   For each section with music_status === \'READY\': fetch the track\'s
    > stream_url and play it via the **Web Audio API** at the correct
    > startTime offset relative to \<video\>.currentTime

-   Sections without a READY track play silence --- **no \<audio\>
    > element is mounted for that range; this is expected, not an
    > error**

-   Playhead on timeline syncs to \<video\>.currentTime

-   Seeking on timeline → set \<video\>.currentTime

### **5.7 Section Panel (Right Sidebar)**

**When no section selected:** centered text \"Select a section on the
timeline.\"\
**During analysis (no sections yet):** skeleton placeholder blocks.\
**When section selected but AI fields not yet populated:** show
placeholder text per §8.

From top to bottom:

1.  **Creative Brief Summary** (collapsible)

    -   Truncated preview of 3 brief answers

    -   \"Edit Brief\" link → editable fields

    -   Editing brief does NOT auto-regenerate tracks

2.  **Section Details\
    > **

    -   section_type --- dropdown (all 16 values), user-editable

    -   scene_type --- read-only badge

    -   emotional_tone --- dropdown (all 30 values), user-editable

    -   detected_theme --- read-only

    -   dominant_visual --- read-only

    -   suggested_music_style --- read-only

    -   energy_level --- read-only badge

    -   pacing --- read-only badge

3.  **Generate Music** button --- disabled while music_status ===
    > \'GENERATING\'

4.  **Regenerate** button --- visible when music_status === \'READY\'

5.  **Feedback input** --- placeholder \"Make it more tense, add
    > strings\...\" --- appended to feedback_history on regenerate

6.  **Track info** (when READY) --- duration, bpm, mood tags as pills,
    > trimmedToFit indicator

### **5.8 Top Bar**

-   Left: {PRODUCT_NAME} from config

-   Center: \"How It Works\" → modal, 3 steps: Import → Describe → Score

-   Right: \"Export\" button --- disabled until ≥1 section has
    > music_status === \'READY\'

### **5.9 Progress Indicator (During Analysis)**

Modal overlay with 4 steps (driven by Supabase Realtime events):

1.  \"Uploading clips\...\"

2.  \"Extracting frames\...\" (parallel with step 3)

3.  \"Transcribing audio\...\" (parallel with step 2)

4.  \"Analysing video structure\...\"

If step 4 fails or times out at 35s → show \"Using automatic
segmentation\" → proceed with fallback (§7.3).

## **6. Backend API (FastAPI)**

### **6.1 Endpoints**

****POST /api/projects Create project

POST /api/projects/{id}/clips Upload clips (multipart)

PUT /api/projects/{id}/clips/reorder Reorder clips {clip_ids: \[\]}

POST /api/projects/{id}/brief Submit brief + trigger analysis

PUT /api/projects/{id}/brief Update brief (no auto-regen)

GET /api/projects/{id}/sections Get sections

PUT /api/projects/{id}/sections/{sid} Update section fields

POST /api/projects/{id}/sections/{sid}/generate Trigger music generation

POST /api/projects/{id}/sections/{sid}/regenerate Regenerate with
feedback

POST /api/projects/{id}/sections/merge Merge two sections

PUT /api/projects/{id}/sections/{sid}/resize Resize section

POST /api/projects/{id}/sections/{sid}/split Split section

POST /api/projects/{id}/sections/{sid}/undo Restore discarded track

GET /api/projects/{id}/clips/{cid}/stream Stream a clip for preview

POST /api/projects/{id}/export Trigger export

GET /api/projects/{id}/export/download Download MP4

GET /api/projects/{id}/tracks/{tid}/download Download individual track

**Clip upload rules:**

-   Max file size: 1 GB

-   Videos longer than 4 minutes accepted; only first 240s used for
    > analysis and preview

-   Returns Clip with id, duration, thumbnail_urls, start_time, end_time

### **6.2 Pydantic Models**

****class CreativeBrief(BaseModel):

overall_energy: str

music_style_direction: str

references_text: Optional\[str\] = \"\"

class SectionUpdate(BaseModel):

section_type: Optional\[str\]

emotional_tone: Optional\[str\]

class MergeRequest(BaseModel):

section_ids: List\[str\] \# exactly 2, must be adjacent

class ResizeRequest(BaseModel):

new_start_time: Optional\[float\]

new_end_time: Optional\[float\]

class SplitRequest(BaseModel):

split_at_clip_id: str

class RegenerateRequest(BaseModel):

feedback: str

### **6.3 Realtime Events (Supabase Realtime)**

The backend updates Supabase rows. The frontend subscribes to table
changes via Supabase Realtime. No custom WebSocket server needed.

  -----------------------------------------------------------------------
  **Table**   **Event**                 **Frontend action**
  ----------- ------------------------- ---------------------------------
  sections    UPDATE music_status       Update music layer block

  tracks      INSERT                    Show new track, update section

  projects    UPDATE                    Sync project state
  -----------------------------------------------------------------------

For pipeline progress (steps 1--4), backend writes to a pipeline_events
table; frontend subscribes.

## **7. AI Pipeline**

### **7.1 Trigger**

Fires after user submits the Creative Brief. Four parallel operations:

**7.1.1 Frame Extraction --- Two Passes (FFmpeg)**

Pass 1 --- Analysis frames (GPT-4o input):

ffmpeg -i clip.mp4 -vf \"fps=1,scale=256:144\" -q:v 8
frames/clip_N_frame\_%04d.jpg

-   1fps, 256×144, JPEG q60

-   Min 1 frame per clip

-   Frame count: min(MAX_ANALYSIS_FRAMES, max(1, floor(min(duration,
    > 240))))

-   Tag each frame with absolute timeline timestamp

-   Never sent to frontend

Pass 2 --- Thumbnail strip (timeline UI):

ffmpeg -i clip.mp4 -vf \"fps=0.4,scale=128:72\" -q:v 10
thumbnails/clip_N_thumb\_%04d.jpg

-   1 frame per \~2.5s, 128×72

-   Upload to Supabase Storage, return public URLs as thumbnail_urls

Both passes run in parallel across all clips.

**7.1.2 Cut Density Computation**

-   Computed from clip metadata (no FFmpeg)

-   Rolling 5-second windows across timeline

-   Output: CutDensityWindow\[\] with {window_start, window_end,
    > cuts_per_second}

**7.1.3 Audio Transcription (ElevenLabs STT)**

****POST https://api.elevenlabs.io/v1/speech-to-text

-   Extract assembled audio via FFmpeg: ffmpeg -i \"concat:\...\" -vn
    > -acodec pcm_s16le assembled.wav

-   Request word-level timestamps

-   ElevenLabs STT is the **sole** transcription provider. No Whisper.

### **7.2 GPT-4o Vision Call**

Runs after 7.1.1 (Pass 1), 7.1.2, 7.1.3 all complete. Single API call.

POST https://api.openai.com/v1/chat/completions

model: gpt-4o

**Prompt:**

****You are scoring a video for background music composition.

CREATIVE BRIEF:

Overall Energy: {overall_energy}

Music Style Direction: {music_style_direction}

References: {references_text}

Divide the video into 3 to 5 narrative sections suitable for independent
music scoring.

Section boundaries must align exactly with clip boundaries.

Cut density thresholds:

\> 2.0 cuts/sec = Very Fast. 1.0--2.0 = Fast. 0.3--1.0 = Medium.

0.1--0.3 = Slow. \< 0.1 = Very Slow.

Return ONLY a JSON array. No explanation, no markdown. Raw JSON only.

Schema:

\[{

\"start_time\": float,

\"end_time\": float,

\"section_type\": \<one of SECTION_TYPES\>,

\"scene_type\": \<one of SCENE_TYPES\>,

\"emotional_tone\": \<one of EMOTIONAL_TONES\>,

\"pacing\": \<one of PACING\>,

\"energy_level\": \<one of ENERGY_LEVELS\>,

\"cuts_per_second\": float,

\"detected_theme\": \"string max 12 words\",

\"dominant_visual\": \"string max 8 words\",

\"suggested_music_style\": \"string max 30 words --- must incorporate
creator\'s style direction\"

}\]

Timeout: 35 seconds. On failure → fallback (§7.3).

### **7.3 Fallback (Vision fails or \>35s)**

****def fallback_sections(clips, cut_density_windows, brief):

\# Group windows by density into 3--5 segments at clip boundaries

\# Assign section_types sequentially: Hook, Intro, Build, Reveal, Outro

\# scene_type = \"Vlog/Casual\" for all

\# emotional_tone from brief keyword match, default \"Energetic\"

\# pacing from cut density thresholds

\# energy_level mapped from pacing

\# suggested_music_style = brief.music_style_direction + per-type
default

### **7.4 Music Generation (ElevenLabs)**

****POST https://api.elevenlabs.io/v1/sound-generation

**Prompt construction:**

****def build_music_prompt(section, brief):

parts = \[

brief.music_style_direction,

brief.overall_energy,

f\"Section: {section.section_type}\",

f\"Scene: {section.scene_type}\",

f\"Mood: {section.emotional_tone}\",

f\"Energy: {section.energy_level}\",

f\"Pacing: {section.pacing}\",

f\"Style: {section.suggested_music_style}\",

\]

if brief.references_text:

parts.append(f\"References: {brief.references_text}\")

if section.feedback_history:

parts.append(\"User direction: \" + \".
\".join(section.feedback_history))

return \". \".join(parts)

**Request body:**

****{

\"text\": \"\<prompt\>\",

\"duration_seconds\": \<section.duration\>,

\"prompt_influence\": 0.7

}

**Long section handling:** If section.duration \> 30, split into chunks
of ≤30s, generate each chunk with the same prompt (parallel per-section,
sequential per-chunk), concatenate with FFmpeg, treat as one Track.

**Duration mismatch:**

1.  If returned audio \< section.duration: retry once with
    > duration_seconds + 2.0

2.  If retry ≥ target: trim with FFmpeg, set trimmed_to_fit = true

3.  If retry still short: use as-is, silence fills remainder. Set
    > trimmed_to_fit = true

4.  **Never stretch or time-scale audio.**

### **7.5 Queuing & Retry**

****import asyncio

semaphore = asyncio.Semaphore(MUSIC_QUEUE_CONCURRENCY) \# default 2

async def generate_with_retry(section):

async with semaphore:

for attempt in range(1, MUSIC_RETRY_MAX + 1):

try:

return await call_elevenlabs(section)

except Exception as e:

if attempt == MUSIC_RETRY_MAX:

raise

delay = MUSIC_RETRY_BASE_DELAY_MS \* (2 \*\* (attempt - 1)) / 1000

delay \*= (0.5 + random.random() \* 0.5) \# jitter

await asyncio.sleep(delay)

-   Per-section status updates written to Supabase
    > sections.music_status

-   Frontend sees updates via Realtime subscription

-   Tracks appear one-by-one as they complete

## **8. Section Editing Rules**

All edits go to the backend. Frontend never mutates section boundaries
directly.

### **8.0 UX Guard --- Confirmation on Destructive Edits**

When any resize/merge/split would affect a section with music_status ===
\'READY\':

-   Backend returns a requires_confirmation: true flag

-   Frontend shows inline warning **on the music block**: \"This will
    > clear the generated track. Continue?\"

-   Two buttons: **Continue** / **Cancel**

-   No modal --- warning appears directly on the music layer block

-   If no READY tracks affected, proceed immediately (no flag)

### **8.1 Merge (POST /api/projects/{id}/sections/merge)**

-   Body: { section_ids: \[id1, id2\] } --- must be adjacent

-   Larger section (by duration) wins section_type and emotional_tone

-   start_time = earlier\'s start, end_time = later\'s end

-   clip_ids = concatenated in order

-   cuts_per_second recomputed

-   Both musicTrack values discarded; reset to PENDING

-   Larger section\'s old track saved as is_discarded = true in tracks
    > table

-   feedback_history cleared

### **8.2 Resize (PUT /api/projects/{id}/sections/{sid}/resize)**

-   Body: { new_start_time?, new_end_time? } --- must align to clip
    > boundary

-   Recompute duration, clip_ids, cuts_per_second

-   Adjacent section updated accordingly

-   Resized section and adjacent section both reset to PENDING

-   Old tracks saved as is_discarded = true

-   section_type, emotional_tone, AI fields preserved

-   feedback_history preserved

### **8.3 Split (POST /api/projects/{id}/sections/{sid}/split)**

-   Body: { split_at_clip_id } --- clip boundary only

-   Two new sections created

-   Earlier half: keeps original section_type and emotional_tone

-   Later half: next section_type in sequence (Hook→Intro→...→Outro; if
    > Outro, stays Outro)

-   Both halves inherit scene_type, energy_level, pacing from original

-   Both reset to PENDING; original track saved as is_discarded = true
    > on earlier half

-   feedback_history cleared on both

### **8.4 Undo (POST /api/projects/{id}/sections/{sid}/undo)**

-   Restores the most recent is_discarded = true track for this section

-   Single-level undo only

-   Sets section back to READY, moves restored track to active

## **9. Export (POST /api/projects/{id}/export)**

**Server-side FFmpeg:**

1.  Concatenate all clips in order

2.  Mix each READY track at its start_time offset (silence for non-READY
    > sections)

3.  Output: MP4 (H.264, AAC)

4.  Upload to Supabase Storage, return download URL

**On failure --- frontend shows modal with two options:**

-   **Retry Export** --- re-triggers pipeline

-   **Export Manually** --- shows per-track download links with labels
    > (section type + time range), plus instructions for iMovie /
    > DaVinci / CapCut

## **10. Phase 1 --- Workspace Shell (Build First)**

Everything in §5 with these constraints. **Build the full UI first with
mocked AI. Everything should look and feel real.**

  ------------------------------------------------------------------------
  **Feature**   **Phase 1 behaviour**
  ------------- ----------------------------------------------------------
  Clip upload   Fully works --- drag-drop, Supabase Storage, thumbnails

  Creative      Form appears, answers stored --- no AI pipeline
  Brief         

  Section       Mocked: auto-divide into 3--5 equal sections at clip
  detection     boundaries

  Default       section_type sequential (Hook/Intro/Build/Reveal/Outro),
  values        scene_type = Vlog/Casual, emotional_tone = Energetic,
                pacing = Medium, energy_level = Medium

  Section panel Placeholder: detected_theme = \"Scene analysis pending\",
  AI fields     suggested_music_style = \"Style pending --- connect AI\",
                dominant_visual = \"Pending\"

  Music layer   All sections PENDING

  Generate      Shows toast: \"AI generation available in Phase 2\"
  button        

  Preview       Client plays clips directly; no audio overlay
  player        

  Export button Disabled

  Section       Fully works (merge/resize/split with UX guard)
  editing       

  Playhead      Fully works
  scrubbing     

  Zoom          Fully works
  ------------------------------------------------------------------------

## **11. Design Notes for Frontend**

-   Background: #0b0c10. Cards: #13151a with border: 1px solid
    > rgba(255,255,255,0.08).

-   Accent: #45f5c5 for CTAs, active states, section tag borders.

-   Topbar: background: rgba(11,12,16,0.85); backdrop-filter:
    > blur(16px); --- sticky.

-   Section tags above headings: font-size: 11px; letter-spacing:
    > 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.4).

-   Hover states: background: rgba(255,255,255,0.05) on interactive
    > rows.

-   Generating pulse: \@keyframes pulse { 0%,100%{opacity:1}
    > 50%{opacity:0.5} } on amber block.

-   Font pairing: Display (DM Serif Display) for headings, Mono (IBM
    > Plex Mono) for labels/metadata.

-   Dropdowns for section/tone: grouped by category with search filter
    > to handle large option counts.

## **12. Explicitly Cut**

  -----------------------------------------------------------------------
  **Feature**                       **Reason**
  --------------------------------- -------------------------------------
  Beat-level sync                   Too complex for 24h

  User accounts / saved projects    Post-hackathon

  DAW controls (stems, EQ, mix)     Different product

  YouTube/TikTok URL import         Stub UI only, disabled

  Mobile layout                     Desktop only

  Pre-loaded demo clips             Judges import live

  Canva/Premiere integration        Not in scope

  Audio stretching/time-scaling     Never --- silence fills gaps instead

  Reference file audio analysis     Phase 2 --- filenames in prompt text
                                    only

  Server-side preview MP4 assembly  Replaced by client-side Web Audio API
  -----------------------------------------------------------------------

## **13. Known Risks**

  ------------------------------------------------------------------------------
  **\#**   **Risk**                        **Mitigation**
  -------- ------------------------------- -------------------------------------
  1        ElevenLabs duration_seconds     Verify before build. If not: generate
           param may not be supported      without constraint, trim with FFmpeg.

  2        GPT-4o Vision context limit     Capped at 120 frames, evenly
           with 120 frames                 subsampled.

  3        Client-side audio sync drift on Resync AudioContext to
           long videos                     video.currentTime on every timeupdate
                                           event.

  4        Supabase Storage CDN latency    Pre-fetch track URLs when section
           for track playback              enters READY state.

  5        Large dropdown lists (30        Group by energy level; add search
           emotional tones)                filter.
  ------------------------------------------------------------------------------

## **14. Demo Script (90 seconds)**

1.  Judge drops 60--90s clips onto import screen

2.  Creative Brief modal → types energy and style direction

3.  \"Score My Video →\" → progress overlay: frames → transcription →
    > analysis

4.  Workspace: 3--5 sections auto-labelled on timeline

5.  Click section → panel shows theme, scene type, emotional tone

6.  Click \"Generate ▶\" on section → amber pulse → track appears

7.  Hit play → video plays, music layers underneath via Web Audio

8.  Type \"make it more energetic\" → Regenerate → new track

9.  Export → browser downloads merged MP4

## **15. Success Metric**

A judge uploads a clip. They hear music that fits each part of the
video. They say \"oh that\'s good\" out loud.
