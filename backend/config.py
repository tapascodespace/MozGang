import os

PRODUCT_NAME = os.getenv("PRODUCT_NAME", "ScoreFlow")

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

ELEVENLABS_BASE_URL = "https://api.elevenlabs.io"
OPENAI_BASE_URL = "https://api.openai.com/v1"

FFMPEG_PATH = "ffmpeg"
UPLOAD_DIR = "./uploads"
FRAMES_DIR = "./frames"
THUMBNAILS_DIR = "./thumbnails"
AUDIO_DIR = "./audio"
EXPORT_DIR = "./exports"
PREVIEW_DIR = "./previews"

MAX_CLIP_ANALYSIS_SECONDS = 240
MAX_TOTAL_DURATION_SECONDS = 600
MAX_SECTIONS = 5
MIN_SECTIONS = 3
MAX_ANALYSIS_FRAMES = 120

MUSIC_QUEUE_CONCURRENCY = 2
MUSIC_RETRY_MAX = 3
MUSIC_RETRY_BASE_DELAY_MS = 1000
MUSIC_DURATION_RETRY_PADDING_SECONDS = 2.0

PORT = int(os.getenv("PORT", "8000"))

# Enums
SECTION_TYPES = [
    "Hook", "Intro", "Setup", "Build", "Anticipation", "Reveal",
    "Reaction", "Demonstration", "Montage", "Transition", "Recap",
    "Climax", "Cooldown", "Testimonial", "CTA", "Outro"
]

SCENE_TYPES = [
    "Talking Head", "Walk and Talk", "Travel Montage", "Product Showcase",
    "Tutorial", "Action Moment", "Crowd/Event", "Reaction Shot",
    "Environment B-roll", "Cinematic Shot", "Interview", "Screen Recording",
    "Timelapse", "Food/Cooking", "Before/After", "Aerial/Drone",
    "Close-up Detail", "Text/Graphics", "Vlog/Casual", "Performance",
    "Unboxing", "Split Screen", "POV/First Person", "Slow Motion",
    "Night/Low Light", "Nature/Wildlife", "Workout/Fitness", "Behind the Scenes"
]

EMOTIONAL_TONES = [
    "Energetic", "Playful", "Suspenseful", "Inspirational", "Dramatic",
    "Emotional", "Calm", "Informative", "Nostalgic", "Mysterious",
    "Triumphant", "Melancholic", "Romantic", "Epic", "Quirky",
    "Aggressive", "Dreamy", "Dark", "Confident", "Humorous",
    "Uplifting", "Tense", "Bittersweet", "Rebellious", "Serene",
    "Whimsical", "Gritty", "Hopeful", "Eerie", "Empowering"
]

PACING = ["Very Slow", "Slow", "Medium", "Fast", "Very Fast"]

ENERGY_LEVELS = ["Very Low", "Low", "Medium Low", "Medium", "Medium High", "High", "Very High"]

MUSIC_STATUS = ["PENDING", "GENERATING", "READY", "FAILED"]

# Auto Section Detection (Scene Change Detection)
SCENE_DETECTION_THRESHOLD = 0.3  # FFmpeg scene detection sensitivity (0.2-0.4)
MIN_SECTION_DURATION = 10  # Minimum section duration in seconds
MIN_VIDEO_DURATION_FOR_SPLIT = 30  # Don't auto-split videos shorter than this
DENSITY_WINDOW_SIZE = 5  # Rolling window size in seconds for density calculation
MAX_AUTO_BOUNDARIES = 4  # Maximum auto-detected boundaries (results in up to 5 sections)

# Density thresholds for categorization
DENSITY_MONTAGE_THRESHOLD = 1.5  # cuts/sec - Fast-paced, many cuts
DENSITY_MEDIUM_THRESHOLD = 0.5   # cuts/sec - Active but not frantic
DENSITY_SLOW_THRESHOLD = 0.1     # cuts/sec - Few cuts, deliberate pacing
# Below SLOW_THRESHOLD = STATIC - Continuous shot

# Video structure types for detection
VIDEO_STRUCTURE_TYPES = [
    "Vlog", "Tutorial", "Interview", "Travel", "Product Review",
    "Gaming", "Music Video", "Documentary", "Podcast", "Event",
    "Fitness", "Cooking", "News", "Presentation", "Behind the Scenes",
    "Montage", "Short Form", "Cinematic", "Talking Head", "Scenic", "Mixed"
]

# Video structure types that are "scenic" - uniform pacing but visually diverse shots
# These need content-based boundary detection rather than pacing-based
SCENIC_VIDEO_TYPES = ("Scenic", "Travel", "Cinematic")

# Vibe options for simplified onboarding
VIBE_OPTIONS = [
    "Energetic", "Chill", "Dramatic", "Playful", "Inspirational",
    "Mysterious", "Romantic", "Epic", "Nostalgic", "Confident"
]

# Music style recommendations based on vibe + video structure
MUSIC_STYLE_SUGGESTIONS = {
    "Energetic": ["Upbeat Electronic", "Pop Rock", "EDM", "Hip-Hop Beats"],
    "Chill": ["Lofi Hip-Hop", "Ambient", "Acoustic", "Jazz"],
    "Dramatic": ["Cinematic Orchestral", "Epic Trailer Music", "Tense Strings"],
    "Playful": ["Quirky Indie", "Bouncy Pop", "Ukulele Folk"],
    "Inspirational": ["Uplifting Corporate", "Motivational Piano", "Anthemic Rock"],
    "Mysterious": ["Dark Ambient", "Suspenseful Synth", "Ethereal"],
    "Romantic": ["Soft Piano", "Acoustic Love Songs", "String Quartet"],
    "Epic": ["Hans Zimmer Style", "Orchestral Action", "Power Metal"],
    "Nostalgic": ["Retro Synthwave", "80s Pop", "Vintage Jazz"],
    "Confident": ["Modern Hip-Hop", "Bold Brass", "Power Pop"]
}

# Section type colors for frontend reference
SECTION_COLORS = {
    "Hook": "#FF6B6B", "Intro": "#4A90D9", "Setup": "#8B9DC3",
    "Build": "#F5A623", "Anticipation": "#E8871E", "Reveal": "#D0021B",
    "Reaction": "#FF85A2", "Demonstration": "#50C878", "Montage": "#9B59B6",
    "Transition": "#95A5A6", "Recap": "#3498DB", "Climax": "#C0392B",
    "Cooldown": "#1ABC9C", "Testimonial": "#F39C12", "CTA": "#E74C3C",
    "Outro": "#9013FE"
}
