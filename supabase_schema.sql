-- ScoreFlow Supabase Schema
-- Run this in Supabase SQL Editor

-- projects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  total_duration float default 0,
  overall_energy text,
  music_style_direction text,
  references_text text
);

-- clips
create table if not exists clips (
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

-- sections
create table if not exists sections (
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
  energy_level float,
  cuts_per_second float,
  detected_theme text,
  dominant_visual text,
  suggested_music_style text,
  music_status text default 'PENDING',
  feedback_history jsonb default '[]',
  section_order int
);

-- tracks
create table if not exists tracks (
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
  is_discarded boolean default false
);

-- pipeline_events (for progress tracking)
create table if not exists pipeline_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  step text,
  status text,
  message text,
  created_at timestamptz default now()
);

-- Enable realtime on key tables
alter publication supabase_realtime add table sections;
alter publication supabase_realtime add table tracks;
alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table pipeline_events;

-- Enable RLS but allow all access (hackathon - no auth)
alter table projects enable row level security;
alter table clips enable row level security;
alter table sections enable row level security;
alter table tracks enable row level security;
alter table pipeline_events enable row level security;

create policy "Allow all on projects" on projects for all using (true) with check (true);
create policy "Allow all on clips" on clips for all using (true) with check (true);
create policy "Allow all on sections" on sections for all using (true) with check (true);
create policy "Allow all on tracks" on tracks for all using (true) with check (true);
create policy "Allow all on pipeline_events" on pipeline_events for all using (true) with check (true);
