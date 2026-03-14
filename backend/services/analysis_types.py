"""
Shared types and interfaces for video analysis and music generation.

This module defines the contract between:
- Video Analysis (sentiment-analysis branch): Analyzes video clips and produces SectionAnalysis
- Music Generation (music-generation branch): Consumes SectionAnalysis to generate music

Types match exactly with PRD Section 5 (Enums) and Section 8.4 (GPT-4o output).
"""

from pydantic import BaseModel
from typing import Optional, List, Union

# ============================================================================
# ENUMS FROM PRD SECTION 5 - USE THESE EXACT VALUES
# ============================================================================

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


# ============================================================================
# SECTION ANALYSIS - OUTPUT OF GPT-4o VISION (PRD Section 8.4)
# ============================================================================

class SectionAnalysis(BaseModel):
    """
    Analysis results for a single video section.
    Matches the GPT-4o output format from PRD Section 8.4.
    """
    # Timing
    start_time: float
    end_time: float

    # Section classification
    section_type: str  # Must be from SECTION_TYPES
    scene_type: str    # Must be from SCENE_TYPES

    # Emotional analysis
    emotional_tone: str   # Must be from EMOTIONAL_TONES
    pacing: str           # Must be from PACING
    energy_level: str     # Must be from ENERGY_LEVELS

    # Motion analysis
    cuts_per_second: float

    # Detected content
    detected_theme: str        # max 12 words
    dominant_visual: str       # max 8 words
    suggested_music_style: str # max 30 words, must use creator's style direction


class FullAnalysisResult(BaseModel):
    """
    Complete analysis result from GPT-4o Vision.
    Contains list of SectionAnalysis for the whole video.
    """
    sections: List[SectionAnalysis]
    analysis_mode: str = "AI"  # "AI" or "FALLBACK"


# ============================================================================
# CREATIVE BRIEF - USER INPUT (PRD Section 6.3)
# ============================================================================

class CreativeBrief(BaseModel):
    """User's creative direction for the video."""
    overall_energy: str          # Required - "What energy should the video have overall?"
    music_style_direction: str   # Required - "What music style do you want?"
    references_text: Optional[str] = ""  # Optional - "Any references or inspiration?"


# ============================================================================
# MUSIC GENERATION (PRD Section 8.6)
# ============================================================================

def _float_to_energy_level(energy: Union[float, str]) -> str:
    """Convert energy level float back to string for prompts."""
    if isinstance(energy, str):
        return energy
    if energy <= 0.15:
        return "Very Low"
    elif energy <= 0.3:
        return "Low"
    elif energy <= 0.45:
        return "Medium Low"
    elif energy <= 0.55:
        return "Medium"
    elif energy <= 0.7:
        return "Medium High"
    elif energy <= 0.85:
        return "High"
    else:
        return "Very High"


def build_music_prompt(section: dict, brief: dict) -> str:
    """
    Build music generation prompt from section analysis and user brief.
    Matches exactly PRD Section 8.6.
    """
    energy_level = _float_to_energy_level(section.get('energy_level', 0.5))

    parts = [
        brief.get("music_style_direction", ""),
        brief.get("overall_energy", ""),
        f"Section: {section.get('section_type', 'Build')}. Scene: {section.get('scene_type', 'Vlog/Casual')}.",
        f"Mood: {section.get('emotional_tone', 'Energetic')}. Energy: {energy_level}. Pacing: {section.get('pacing', 'Medium')}.",
        f"Style: {section.get('suggested_music_style', '')}.",
    ]
    if brief.get("references_text"):
        parts.append(f"References: {brief['references_text']}")

    feedback_history = section.get("feedback_history") or []
    if feedback_history:
        parts.append("User direction: " + ". ".join(feedback_history))

    return " ".join(filter(None, parts))


class GeneratedTrack(BaseModel):
    """
    Result of music generation.
    Matches tracks table from PRD Section 4.
    """
    section_id: str
    storage_path: str
    stream_url: Optional[str] = None
    duration: float
    generation_prompt: str
    trimmed_to_fit: bool = False
