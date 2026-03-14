import React, { useRef, useCallback, useMemo, useState } from 'react';

// ── Design Tokens ──────────────────────────────────────────────────────────────
const TOKEN = {
  bg: '#0b0c10',
  bgCard: '#13151a',
  stroke: 'rgba(255,255,255,0.08)',
  accent: '#45f5c5',
  text: 'rgba(255,255,255,0.5)',
  textBright: 'rgba(255,255,255,0.85)',
  playhead: '#FF0000',
};

// ── Section‑type colour map ────────────────────────────────────────────────────
const SECTION_COLORS = {
  Hook: '#FF6B6B',
  Intro: '#4A90D9',
  Setup: '#8B9DC3',
  Build: '#F5A623',
  Anticipation: '#E8871E',
  Reveal: '#D0021B',
  Reaction: '#FF85A2',
  Demonstration: '#50C878',
  Montage: '#9B59B6',
  Transition: '#95A5A6',
  Recap: '#3498DB',
  Climax: '#C0392B',
  Cooldown: '#1ABC9C',
  Testimonial: '#F39C12',
  CTA: '#E74C3C',
  Outro: '#9013FE',
};

// ── Music‑status rendering config ──────────────────────────────────────────────
const MUSIC_STATUS = {
  PENDING: {
    bg: '#2a2a2a',
    border: '1px dashed rgba(255,255,255,0.2)',
    label: 'Waiting...',
  },
  GENERATING: {
    bg: '#F5A623',
    border: '1px solid #F5A623',
    label: 'Generating...',
    pulse: true,
  },
  READY: {
    border: 'none',
    label: '\u266A Ready',
  },
  FAILED: {
    bg: '#D0021B',
    border: '1px solid #D0021B',
    label: 'Failed \u2014 retry',
  },
};

// ── Pulse keyframes injected once ──────────────────────────────────────────────
const PULSE_KEYFRAMES_ID = 'scoreflow-timeline-pulse';

function ensureTimelineStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PULSE_KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = PULSE_KEYFRAMES_ID;
  style.textContent = `
    @keyframes scoreflow-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.55; }
    }
    .section-merge-boundary:hover .merge-btn {
      opacity: 1 !important;
      background: rgba(255,255,255,0.25) !important;
    }
    .section-merge-boundary .merge-btn:hover {
      background: rgba(69,245,197,0.4) !important;
      border-color: #45f5c5 !important;
    }
  `;
  document.head.appendChild(style);
}

// Keep old function name for compatibility
function ensurePulseKeyframes() {
  ensureTimelineStyles();
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function truncate(str, maxLen = 18) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '\u2026' : str;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  wrapper: {
    background: TOKEN.bg,
    borderRadius: 8,
    border: `1px solid ${TOKEN.stroke}`,
    overflow: 'hidden',
    userSelect: 'none',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 11,
    color: TOKEN.textBright,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  scrollArea: {
    overflowX: 'auto',
    overflowY: 'hidden',
    position: 'relative',
    flex: 1,
  },
  layerRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottom: `1px solid ${TOKEN.stroke}`,
  },
  label: {
    width: 72,
    minWidth: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: TOKEN.text,
    background: TOKEN.bgCard,
    borderRight: `1px solid ${TOKEN.stroke}`,
    flexShrink: 0,
    zIndex: 2,
  },
  trackContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 40,
    position: 'relative',
  },
  clipBlock: {
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '0 6px',
    boxSizing: 'border-box',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
  },
  clipDivider: {
    width: 1,
    alignSelf: 'stretch',
    background: 'rgba(255,255,255,0.5)',
    flexShrink: 0,
  },
  sectionBlock: {
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '0 6px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    cursor: 'pointer',
    flexShrink: 0,
    borderRadius: 3,
    transition: 'border-color 0.15s',
  },
  musicBlock: {
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '0 6px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    flexShrink: 0,
    borderRadius: 3,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    background: TOKEN.playhead,
    zIndex: 10,
    pointerEvents: 'none',
  },
  zoomBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    padding: '6px 10px',
    background: TOKEN.bgCard,
    borderTop: `1px solid ${TOKEN.stroke}`,
  },
  zoomBtn: {
    width: 28,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${TOKEN.stroke}`,
    borderRadius: 4,
    color: TOKEN.textBright,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
  },
  blockLabel: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: 10,
    lineHeight: 1,
  },
  durationLabel: {
    fontSize: 9,
    opacity: 0.6,
    whiteSpace: 'nowrap',
  },
  sectionBoundary: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 5,
    transform: 'translateX(-50%)',
  },
  mergeBtn: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    opacity: 0,
    transition: 'opacity 0.15s, background 0.15s',
  },
  contextMenu: {
    position: 'fixed',
    background: TOKEN.bgCard,
    border: `1px solid ${TOKEN.stroke}`,
    borderRadius: 8,
    padding: '4px 0',
    minWidth: 160,
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    zIndex: 1000,
  },
  contextMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    color: TOKEN.textBright,
    fontSize: 12,
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    width: '100%',
    textAlign: 'left',
  },
  contextMenuDivider: {
    height: 1,
    background: TOKEN.stroke,
    margin: '4px 0',
  },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function Timeline({
  clips = [],
  sections = [],
  // eslint-disable-next-line no-unused-vars
  tracks = [],
  zoomLevel = 10,
  currentTime = 0,
  selectedSectionId = null,
  onSelectSection,
  onTimeSeek,
  onZoomChange,
  onMergeSections,
  onSplitAtCursor,
}) {
  ensurePulseKeyframes();

  const scrollRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, time }

  // Total timeline width (px) derived from clips
  const totalDuration = useMemo(
    () => clips.reduce((sum, c) => sum + (c.duration || 0), 0),
    [clips],
  );
  const timelineWidth = totalDuration * zoomLevel;

  // ── Calculate time from mouse position ───────────────────────────────────
  const getTimeFromMouseEvent = useCallback(
    (e) => {
      if (!scrollRef.current) return 0;
      const rect = scrollRef.current.getBoundingClientRect();
      const scrollLeft = scrollRef.current.scrollLeft;
      const labelWidth = 72;
      const xInTimeline = e.clientX - rect.left + scrollLeft - labelWidth;
      return Math.max(0, xInTimeline / zoomLevel);
    },
    [zoomLevel],
  );

  // ── Click → seek ──────────────────────────────────────────────────────────
  const handleTimelineClick = useCallback(
    (e) => {
      // Close context menu on any click
      setContextMenu(null);
      if (!onTimeSeek) return;
      const clickTime = getTimeFromMouseEvent(e);
      onTimeSeek(clickTime);
    },
    [onTimeSeek, getTimeFromMouseEvent],
  );

  // ── Right-click → context menu ────────────────────────────────────────────
  const handleContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      const time = getTimeFromMouseEvent(e);
      setContextMenu({ x: e.clientX, y: e.clientY, time });
    },
    [getTimeFromMouseEvent],
  );

  // Close context menu when clicking outside
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle split from context menu
  const handleSplitHere = useCallback(() => {
    if (contextMenu && onSplitAtCursor) {
      onSplitAtCursor(contextMenu.time);
    }
    setContextMenu(null);
  }, [contextMenu, onSplitAtCursor]);

  // ── Zoom handlers ─────────────────────────────────────────────────────────
  const handleZoom = useCallback(
    (delta) => {
      if (!onZoomChange) return;
      const next = Math.min(100, Math.max(2, zoomLevel + delta));
      onZoomChange(next);
    },
    [onZoomChange, zoomLevel],
  );

  // ── Playhead offset ───────────────────────────────────────────────────────
  const playheadLeft = 72 + currentTime * zoomLevel; // 72 = label width

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderVideoLayer = () => {
    const blocks = [];
    clips.forEach((clip, i) => {
      if (i > 0) {
        blocks.push(
          <div key={`div-${i}`} style={S.clipDivider} />,
        );
      }
      const w = (clip.duration || 0) * zoomLevel;
      const hasThumbnail =
        clip.thumbnail_urls && clip.thumbnail_urls.length > 0;
      const bgStyle = hasThumbnail
        ? {
            backgroundImage: `linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45)),url(${clip.thumbnail_urls[0]})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : { background: TOKEN.bgCard };

      blocks.push(
        <div
          key={clip.id ?? i}
          style={{ ...S.clipBlock, width: w, ...bgStyle }}
        >
          <span style={S.blockLabel}>{truncate(clip.filename)}</span>
          <span style={S.durationLabel}>{formatDuration(clip.duration)}</span>
        </div>,
      );
    });
    return blocks;
  };

  const renderSectionsLayer = () => {
    const orderedSections = [...sections].sort((a, b) => a.section_order - b.section_order);
    const elements = [];
    let cumulativeLeft = 0;

    orderedSections.forEach((sec, i) => {
      const w = (sec.duration || 0) * zoomLevel;
      const color = SECTION_COLORS[sec.section_type] || '#666';
      const isSelected = sec.id === selectedSectionId;

      // Add section block
      elements.push(
        <div
          key={sec.id ?? i}
          onClick={() => onSelectSection && onSelectSection(sec.id)}
          style={{
            ...S.sectionBlock,
            width: w,
            background: color + '33',
            border: isSelected
              ? '2px solid #ffffff'
              : `1px solid ${color}88`,
          }}
        >
          <span style={{ ...S.blockLabel, color }}>{sec.section_type}</span>
          <span style={S.durationLabel}>{formatDuration(sec.duration)}</span>
        </div>
      );

      // Add merge button between sections (after this section, before next)
      if (i < orderedSections.length - 1 && onMergeSections) {
        const nextSec = orderedSections[i + 1];
        const boundaryLeft = cumulativeLeft + w;
        elements.push(
          <div
            key={`merge-${sec.id}-${nextSec.id}`}
            className="section-merge-boundary"
            style={{
              ...S.sectionBoundary,
              left: boundaryLeft,
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Merge the next section into this one (merge next)
              onMergeSections(sec.id, 'next');
            }}
            title="Merge sections"
          >
            <div className="merge-btn" style={S.mergeBtn}>⟷</div>
          </div>
        );
      }

      cumulativeLeft += w;
    });

    return elements;
  };

  const renderMusicLayer = () =>
    sections.map((sec, i) => {
      const w = (sec.duration || 0) * zoomLevel;
      const status = sec.music_status || 'PENDING';
      const cfg = MUSIC_STATUS[status] || MUSIC_STATUS.PENDING;
      const sectionColor = SECTION_COLORS[sec.section_type] || '#666';

      const bg = status === 'READY' ? sectionColor + '33' : (cfg.bg || '#2a2a2a');
      const border = status === 'READY' ? `1px solid ${sectionColor}88` : cfg.border;
      const animation = cfg.pulse
        ? 'scoreflow-pulse 1.8s ease-in-out infinite'
        : 'none';

      return (
        <div
          key={sec.id ?? `m-${i}`}
          style={{
            ...S.musicBlock,
            width: w,
            background: bg,
            border,
            animation,
          }}
        >
          <span style={S.blockLabel}>{cfg.label}</span>
        </div>
      );
    });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.wrapper}>
      {/* Scrollable timeline area */}
      <div
        ref={scrollRef}
        style={S.scrollArea}
        onClick={handleTimelineClick}
        onContextMenu={handleContextMenu}
      >
        {/* Playhead */}
        <div style={{ ...S.playhead, left: playheadLeft }} />

        {/* Layer 1 — Video */}
        <div style={S.layerRow}>
          <div style={S.label}>Video</div>
          <div style={{ ...S.trackContainer, width: timelineWidth }}>
            {renderVideoLayer()}
          </div>
        </div>

        {/* Layer 2 — Sections */}
        <div style={S.layerRow}>
          <div style={S.label}>Sections</div>
          <div style={{ ...S.trackContainer, width: timelineWidth }}>
            {renderSectionsLayer()}
          </div>
        </div>

        {/* Layer 3 — Music */}
        <div style={S.layerRow}>
          <div style={S.label}>Music</div>
          <div style={{ ...S.trackContainer, width: timelineWidth }}>
            {renderMusicLayer()}
          </div>
        </div>
      </div>

      {/* Zoom controls */}
      <div style={S.zoomBar}>
        <span style={{ fontSize: 10, color: TOKEN.text, opacity: 0.6 }}>
          Right-click to split
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          style={S.zoomBtn}
          onClick={() => handleZoom(-2)}
          aria-label="Zoom out"
        >
          &minus;
        </button>
        <span style={{ fontSize: 10, color: TOKEN.text, minWidth: 42, textAlign: 'center' }}>
          Zoom {zoomLevel}x
        </span>
        <button
          type="button"
          style={S.zoomBtn}
          onClick={() => handleZoom(2)}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
            onClick={handleCloseContextMenu}
          />
          <div
            style={{
              ...S.contextMenu,
              left: contextMenu.x,
              top: contextMenu.y,
            }}
          >
            <button
              style={S.contextMenuItem}
              onClick={handleSplitHere}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              ✂️ Split here ({contextMenu.time.toFixed(2)}s)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
