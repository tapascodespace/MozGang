"""
ScoreFlow Services - Phase 2 AI Pipeline

Modules:
- analysis_types.py: Shared types and enums (PRD Section 5)
- mock_analysis.py: Hardcoded mock data for development
- analysis_service.py: Video analysis (feature/sentiment-analysis branch)
- music_service.py: Music generation (feature/music-generation branch)
"""

from .analysis_types import (
    SECTION_TYPES,
    SCENE_TYPES,
    EMOTIONAL_TONES,
    PACING,
    ENERGY_LEVELS,
    MUSIC_STATUS,
    SectionAnalysis,
    FullAnalysisResult,
    CreativeBrief,
    GeneratedTrack,
    build_music_prompt,
)

from .analysis_service import analyze_video
from .music_service import generate_music_for_section
