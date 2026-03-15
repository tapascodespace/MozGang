-- Migration: Auto Section Detection
-- Run this in Supabase SQL Editor for existing databases

-- Scene detection and auto-boundary detection
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pre_analysis_scene_changes jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pre_analysis_auto_boundaries jsonb;

-- Video structure and theme detection
ALTER TABLE projects ADD COLUMN IF NOT EXISTS detected_video_structure text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS detected_theme_summary text;

-- Music style recommendation (gold standard)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS recommended_music_style text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS confirmed_music_style text;

-- User's selected vibe (simplified onboarding)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS selected_vibe text;
