-- Migration: Workspace Enhancement Features
-- Run this in Supabase SQL Editor for existing databases

-- Feature 2: Pre-Analysis columns for projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pre_analysis_status text DEFAULT 'PENDING';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pre_analysis_frames jsonb;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pre_analysis_transcript text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pre_analysis_cut_density jsonb;

-- Feature 3: Analysis status for sections table (for on-demand re-analysis)
ALTER TABLE sections ADD COLUMN IF NOT EXISTS analysis_status text DEFAULT 'COMPLETE';
