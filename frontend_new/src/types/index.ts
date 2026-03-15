// ── Intake types (from Lovable) ──

export interface VideoClip {
  id: string;
  file: File;
  name: string;
  duration: number;
  objectUrl: string;
  status: "uploading" | "ready" | "error";
  progress: number;
}

export interface CreativeBriefData {
  overall_energy: string;
  music_style_direction: string;
  references_text: string;
}

// ── Backend types ──

export interface Project {
  id: string;
  name: string;
  overall_energy?: string;
  music_style_direction?: string;
  references_text?: string;
  pre_analysis_status?: string;
  detected_video_structure?: string;
  detected_theme_summary?: string;
  selected_vibe?: string;
  recommended_music_style?: string;
  confirmed_music_style?: string;
  created_at?: string;
}

export interface Clip {
  id: string;
  project_id: string;
  filename: string;
  storage_path: string;
  duration: number;
  clip_order: number;
  thumbnail_url?: string;
  created_at?: string;
}

export interface Section {
  id: string;
  project_id: string;
  section_order: number;
  start_time: number;
  end_time: number;
  section_type: string;
  scene_type?: string;
  emotional_tone?: string;
  detected_theme?: string;
  dominant_visual?: string;
  suggested_music_style?: string;
  energy_level?: string;
  pacing?: string;
  music_status: "PENDING" | "GENERATING" | "READY" | "FAILED";
  analysis_status?: string;
  feedback_history?: string[];
}

export interface Track {
  id: string;
  section_id: string;
  project_id: string;
  storage_path?: string;
  stream_url?: string;
  is_discarded: boolean;
  created_at?: string;
}

// ── Staged file (local, not yet uploaded) ──

export interface StagedFile {
  file: File;
  objectUrl: string;
  duration: number;
  name: string;
}

// ── Enum constants (from CLAUDE.md / backend) ──

export const SECTION_TYPES = [
  "Hook", "Intro", "Setup", "Build", "Anticipation", "Reveal",
  "Reaction", "Demonstration", "Montage", "Transition", "Recap",
  "Climax", "Cooldown", "Testimonial", "CTA", "Outro", "Scenic",
] as const;

export const SCENE_TYPES = [
  "Talking Head", "Walk and Talk", "Travel Montage", "Product Showcase",
  "Tutorial", "Action Moment", "Crowd/Event", "Reaction Shot",
  "Environment B-roll", "Cinematic Shot", "Interview", "Screen Recording",
  "Timelapse", "Food/Cooking", "Before/After", "Aerial/Drone",
  "Close-up Detail", "Text/Graphics", "Vlog/Casual", "Performance",
  "Unboxing", "Split Screen", "POV/First Person", "Slow Motion",
  "Night/Low Light", "Nature/Wildlife", "Workout/Fitness", "Behind the Scenes",
] as const;

export const EMOTIONAL_TONES = [
  "Energetic", "Playful", "Suspenseful", "Inspirational", "Dramatic",
  "Emotional", "Calm", "Informative", "Nostalgic", "Mysterious",
  "Triumphant", "Melancholic", "Romantic", "Epic", "Quirky",
  "Aggressive", "Dreamy", "Dark", "Confident", "Humorous",
  "Uplifting", "Tense", "Bittersweet", "Rebellious", "Serene",
  "Whimsical", "Gritty", "Hopeful", "Eerie", "Empowering",
] as const;

export const PACING_OPTIONS = ["Very Slow", "Slow", "Medium", "Fast", "Very Fast"] as const;

export const ENERGY_LEVELS = [
  "Very Low", "Low", "Medium Low", "Medium", "Medium High", "High", "Very High",
] as const;

// ── Section color map ──

export const SECTION_COLORS: Record<string, string> = {
  Hook: "hsl(var(--section-hook))",
  Intro: "hsl(var(--section-intro))",
  Setup: "hsl(var(--section-setup))",
  Build: "hsl(var(--section-build))",
  Anticipation: "hsl(var(--section-anticipation))",
  Reveal: "hsl(var(--section-reveal))",
  Climax: "hsl(var(--section-climax))",
  Cooldown: "hsl(var(--section-cooldown))",
  Montage: "hsl(var(--section-montage))",
  Transition: "hsl(var(--section-transition))",
  Outro: "hsl(var(--section-outro))",
  CTA: "hsl(var(--section-cta))",
  Scenic: "hsl(var(--section-scenic))",
  Reaction: "hsl(var(--section-reaction))",
  Demonstration: "hsl(var(--section-demonstration))",
  Testimonial: "hsl(var(--section-testimonial))",
  Recap: "hsl(var(--section-recap))",
};
