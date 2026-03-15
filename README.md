# Amadeus

**Drop your footage. The AI reads the story. The music writes itself.**

Amadeus is an AI-powered video scoring workspace that automatically generates copyright-safe background music matched to each narrative section of your video — not just the overall mood.

---

## Inspiration

Every creator knows the pain: you spend hours editing a video, then spend just as long hunting for the right background music. Royalty-free libraries require endless browsing, tracks rarely fit the specific mood of each scene, and even "licensed" music can trigger copyright strikes.

But the real problem runs deeper. A video isn't one mood — it's a story. An intro needs different energy than a climax. A talking head section needs different music than a travel montage. Every existing tool treats a video as a single block and scores it with one flat track. That's not how professional composers work. They score scenes, not videos.

We built Amadeus to bring that scene-level intelligence to every creator.

## What it does

Amadeus is a video editor-style workspace where creators import their footage and receive AI-generated, copyright-safe background music for each narrative section of their video.

**How it works:**

1. **Import** — Drop your video clips into the workspace
2. **Describe** — Fill out a quick creative brief describing your desired energy, style, and references
3. **Analyse** — AI detects narrative structure, splitting your video into 3-5 sections (Hook, Intro, Build, Reveal, Outro) based on cut density, visual content, and audio transcript
4. **Score** — Each section gets its own generated music track, matched in length, energy, and mood
5. **Iterate** — Don't like a track? Type feedback like "make it more tense" and regenerate
6. **Export** — Download a merged MP4 with your video and all generated music baked in

The key insight: Amadeus treats your video as a narrative arc made of sections, not a single block. Each section has a detected scene type, emotional tone, energy level, and pacing — and its own independently generated soundtrack.

**The copyright differentiator:** Every track is generated from scratch for that specific section of your video. It's not sampled, not remixed, and doesn't exist anywhere else. Zero licensing fees, zero strikes — ever.

## How we built it

- **FastAPI (Python)** for the backend API and pipeline orchestration
- **React** for the desktop web frontend
- **OpenAI GPT-4o Vision** for video analysis — extracting frames at 1fps, analysing cut density, reading transcripts, and classifying each section's narrative role, scene type, and emotional tone
- **ElevenLabs Speech to Text** for audio transcription with word-level timestamps
- **ElevenLabs Sound Generation** for generating copyright-safe music per section, with prompt construction driven by the full section attribute model
- **FFmpeg** for all video/audio processing — frame extraction, thumbnail generation, audio assembly, and final MP4 export
- **Supabase** for data persistence

**Architecture:** The frontend is a thin client that uploads clips, displays state, and plays streamed previews. All heavy processing (FFmpeg, API calls, assembly) happens server-side. WebSocket events push real-time progress updates to the UI.

## Challenges we ran into

Building a video editor-style interface with a three-layer timeline (video, sections, music) in 24 hours was the biggest UI challenge. Getting the playhead, scrubbing, and section selection to feel responsive required constant iteration.

The section detection pipeline had to balance speed with accuracy. Extracting frames, running transcription, and calling GPT-4o Vision all in sequence meant a 20-40 second wait after import. We added parallel processing and a fallback segmentation system based on cut density alone in case the Vision call failed or timed out.

Music duration matching was trickier than expected. ElevenLabs doesn't always return audio that exactly matches the requested duration, so we built a retry-and-trim system that pads the request, retries once if short, and trims with FFmpeg to fit the section exactly.

Scoping was a constant battle. The PRD grew to startup-level detail and we had to repeatedly cut features (section merge/split/resize, YouTube import, reference file analysis) to focus on a working demo.

## Accomplishments that we're proud of

We built a fully functional video scoring workspace in under 24 hours — from clip import to AI analysis to per-section music generation to merged MP4 export.

The creative brief system means the AI doesn't just guess what music you want. It asks you first, then uses your direction as the primary creative constraint for every section. The generated music actually reflects the creator's intent, not just generic mood detection.

The section-aware approach is genuinely novel. No consumer tool we found treats a video as a sequence of scenes that each need independent scoring. That's how professional composers work, and we've automated it.

## What we learned

That the hardest part of AI-powered creative tools isn't the AI — it's the UX. The section detection, music generation, and video analysis all worked reasonably well out of the box. Making them feel integrated, responsive, and intuitive in a timeline interface was where we spent most of our time.

We also learned that creative direction matters more than technical sophistication. Adding the creative brief questionnaire — where the user describes their vision before the AI runs — dramatically improved the quality of generated music compared to pure auto-detection.

## What's next for Amadeus

- **Section merge, split, and resize** — let users manually adjust section boundaries for finer control
- **Reference track analysis** — analyse uploaded reference audio for tempo, key, and genre to further inform generation
- **YouTube/TikTok URL import** — paste a link and Amadeus pulls the video directly
- **Beat-level sync** — align music transitions to actual video cuts for tighter synchronisation
- **Canva and Premiere integration** — bring Amadeus's scoring engine into existing editing workflows
- **Mobile support** — score videos on the go from your phone

---

## Tech Stack

| Component | Technology |
|---|---|
| Backend | FastAPI (Python) |
| Frontend | React |
| Video Analysis | OpenAI GPT-4o Vision |
| Transcription | ElevenLabs Speech to Text |
| Music Generation | ElevenLabs Sound Generation |
| Video/Audio Processing | FFmpeg |
| Database | Supabase |

---

Built at the Mozart AI Hack 2026 with ElevenLabs and OpenAI.
