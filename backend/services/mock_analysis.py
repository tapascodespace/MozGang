"""
Hardcoded mock analysis data for development.

The music generation team uses this while the analysis team builds the real implementation.
Uses exact values from PRD Section 5 (Enums).
"""

from typing import List
from .analysis_types import (
    SectionAnalysis,
    SECTION_TYPES,
    SCENE_TYPES,
    EMOTIONAL_TONES,
    PACING,
    ENERGY_LEVELS,
)


# Map section types to typical analysis values (using PRD enums)
SECTION_PROFILES = {
    "Hook": {
        "scene_type": "Action Moment",
        "pacing": "Fast",
        "emotional_tone": "Energetic",
        "energy_level": "High",
    },
    "Intro": {
        "scene_type": "Cinematic Shot",
        "pacing": "Slow",
        "emotional_tone": "Calm",
        "energy_level": "Low",
    },
    "Setup": {
        "scene_type": "Talking Head",
        "pacing": "Medium",
        "emotional_tone": "Informative",
        "energy_level": "Medium",
    },
    "Build": {
        "scene_type": "Vlog/Casual",
        "pacing": "Medium",
        "emotional_tone": "Energetic",
        "energy_level": "Medium High",
    },
    "Anticipation": {
        "scene_type": "Action Moment",
        "pacing": "Fast",
        "emotional_tone": "Tense",
        "energy_level": "High",
    },
    "Reveal": {
        "scene_type": "Product Showcase",
        "pacing": "Medium",
        "emotional_tone": "Triumphant",
        "energy_level": "High",
    },
    "Climax": {
        "scene_type": "Action Moment",
        "pacing": "Very Fast",
        "emotional_tone": "Epic",
        "energy_level": "Very High",
    },
    "Cooldown": {
        "scene_type": "Environment B-roll",
        "pacing": "Slow",
        "emotional_tone": "Calm",
        "energy_level": "Low",
    },
    "Outro": {
        "scene_type": "Text/Graphics",
        "pacing": "Slow",
        "emotional_tone": "Uplifting",
        "energy_level": "Medium Low",
    },
    "CTA": {
        "scene_type": "Talking Head",
        "pacing": "Medium",
        "emotional_tone": "Confident",
        "energy_level": "Medium High",
    },
    "Montage": {
        "scene_type": "Travel Montage",
        "pacing": "Fast",
        "emotional_tone": "Energetic",
        "energy_level": "High",
    },
    "Transition": {
        "scene_type": "Environment B-roll",
        "pacing": "Medium",
        "emotional_tone": "Calm",
        "energy_level": "Medium",
    },
}


def get_mock_analysis_for_section(section: dict) -> SectionAnalysis:
    """
    Generate mock analysis based on section metadata.
    Uses section_type to derive plausible analysis values.
    """
    section_type = section.get("section_type", "Build")

    # Get profile or default to Build
    profile = SECTION_PROFILES.get(section_type, SECTION_PROFILES["Build"])

    return SectionAnalysis(
        start_time=section.get("start_time", 0),
        end_time=section.get("end_time", 10),

        section_type=section_type,
        scene_type=profile["scene_type"],

        emotional_tone=profile["emotional_tone"],
        pacing=profile["pacing"],
        energy_level=profile["energy_level"],

        cuts_per_second=section.get("cuts_per_second", 0.5),

        detected_theme=section.get("detected_theme", "Scene analysis pending"),
        dominant_visual=section.get("dominant_visual", "Pending"),
        suggested_music_style=section.get("suggested_music_style", "Style pending"),
    )


def get_mock_analysis_for_project(sections: List[dict]) -> List[SectionAnalysis]:
    """
    Generate mock analysis for all sections in a project.
    """
    return [get_mock_analysis_for_section(s) for s in sections]
