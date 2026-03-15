import { useRef, useEffect, useState, useCallback, useMemo } from 'react';

const styles = {
  container: {
    background: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    height: '100%',
    maxHeight: '45vh',
    aspectRatio: '16/9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  videoHidden: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '12px 16px',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    zIndex: 2,
  },
  playBtn: {
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    width: 36,
    height: 36,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  timeDisplay: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  scrubber: {
    flex: 1,
    height: 4,
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    cursor: 'pointer',
    position: 'relative',
  },
  scrubberFill: {
    height: '100%',
    background: '#45f5c5',
    borderRadius: 2,
  },
  placeholder: {
    color: 'rgba(255,255,255,0.3)',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 14,
    textAlign: 'center',
  },
};

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PreviewPlayer({ clips, sections = [], tracks = [], currentTime, onTimeUpdate, onPlayStateChange }) {
  // ── Dual video element refs for seamless clip transitions ──
  const videoARef = useRef(null);
  const videoBRef = useRef(null);
  const activeSlotRef = useRef(0); // 0 = A is active, 1 = B is active
  const [displaySlot, setDisplaySlot] = useState(0); // triggers re-render for visibility
  // Logical videoRef that always points to the active element
  const videoRef = useRef(null);
  const preloadedClipIdx = useRef(-1); // which clip index is preloaded on the inactive element

  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clipUrls, setClipUrls] = useState([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  const [clipActualDurations, setClipActualDurations] = useState([]);
  const [currentTrackUrl, setCurrentTrackUrl] = useState(null);
  const seekingUntil = useRef(0);
  const lastPropSeek = useRef(0);
  const pendingSeekRef = useRef(null);
  const pendingPlayRef = useRef(false);
  const currentClipIndexRef = useRef(0);

  const log = useCallback((msg, data = {}) => {
    if (typeof window === 'undefined') return;
    console.debug('[PreviewPlayer]', msg, data);
  }, []);

  // Helper: get preload video element (the one NOT currently active)
  const getPreloadVideo = useCallback(() => {
    return activeSlotRef.current === 0 ? videoBRef.current : videoARef.current;
  }, []);

  // Sync videoRef.current to whichever physical element is active
  const syncVideoRef = useCallback(() => {
    videoRef.current = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
  }, []);

  const derivedClips = useMemo(() => {
    if (!clips || clips.length === 0) return [];
    let cursor = 0;
    return clips.map((clip) => {
      const duration = Number.isFinite(clip.duration) ? clip.duration : 0;
      const start = cursor;
      const end = cursor + duration;
      cursor = end;
      return {
        ...clip,
        __start: start,
        __end: end,
        __duration: duration,
      };
    });
  }, [clips]);

  const totalDuration = useMemo(() => {
    if (derivedClips.length === 0) return 0;
    return derivedClips[derivedClips.length - 1].__end || 0;
  }, [derivedClips]);

  useEffect(() => {
    currentClipIndexRef.current = currentClipIndex;
  }, [currentClipIndex]);

  // Build clip URLs from storage paths
  useEffect(() => {
    if (!clips || clips.length === 0) return;
    const urls = clips.map((clip) => {
      if (clip.storage_path) {
        return `https://bznswadiiqulyzpkajqp.supabase.co/storage/v1/object/public/media/${clip.storage_path}`;
      }
      return null;
    }).filter(Boolean);
    setClipUrls(urls);
  }, [clips]);

  // Initialize: set videoRef to element A and load first clip
  useEffect(() => {
    if (videoARef.current) {
      videoRef.current = videoARef.current;
      activeSlotRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (clipUrls.length > 0 && videoRef.current && !videoRef.current.src) {
      videoRef.current.src = clipUrls[0];
    }
  }, [clipUrls]);

  // ── Preload next clip on the inactive video element ──
  useEffect(() => {
    const nextIdx = currentClipIndex + 1;
    if (nextIdx < clipUrls.length) {
      const preloadEl = getPreloadVideo();
      if (preloadEl) {
        preloadEl.src = clipUrls[nextIdx];
        preloadEl.load();
        preloadedClipIdx.current = nextIdx;
        log('preload-next', { nextIdx, url: clipUrls[nextIdx]?.slice(-30) });
      }
    } else {
      preloadedClipIdx.current = -1;
    }
  }, [currentClipIndex, clipUrls, getPreloadVideo, log]);

  // Find and sync track audio based on current time
  useEffect(() => {
    if (!sections.length || !tracks.length) {
      setCurrentTrackUrl(null);
      return;
    }

    const currentSection = sections.find(
      (s) => localTime >= s.start_time && localTime < s.end_time
    );

    if (!currentSection) {
      setCurrentTrackUrl(null);
      return;
    }

    const track = tracks.find(
      (t) => t.section_id === currentSection.id && !t.is_discarded && t.stream_url
    );

    if (track?.stream_url !== currentTrackUrl) {
      setCurrentTrackUrl(track?.stream_url || null);
    }
  }, [localTime, sections, tracks, currentTrackUrl]);

  // Update audio source and sync playback
  useEffect(() => {
    if (!audioRef.current) return;

    if (!currentTrackUrl) {
      audioRef.current.pause();
      audioRef.current.src = '';
      return;
    }

    if (audioRef.current.src !== currentTrackUrl) {
      audioRef.current.src = currentTrackUrl;
      audioRef.current.load();
    }

    const currentSection = sections.find(
      (s) => localTime >= s.start_time && localTime < s.end_time
    );

    if (currentSection && audioRef.current.readyState >= 1) {
      const offsetInSection = localTime - currentSection.start_time;
      const audioDelta = Math.abs(audioRef.current.currentTime - offsetInSection);
      if (audioDelta > 0.3) {
        audioRef.current.currentTime = offsetInSection;
      }
    }

    if (isPlaying && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    } else if (!isPlaying && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [currentTrackUrl, isPlaying, localTime, sections]);

  // React to external currentTime prop changes (from Timeline clicks)
  useEffect(() => {
    if (!clips || clips.length === 0 || !clipUrls.length) return;
    if (Math.abs(currentTime - localTime) < 0.3) return;
    if (Math.abs(currentTime - lastPropSeek.current) < 0.1) return;
    lastPropSeek.current = currentTime;
    performSeek(currentTime);
  }, [currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  function logRanges(prefix) {
    if (!videoRef.current) return;
    const seekable = [];
    for (let i = 0; i < videoRef.current.seekable.length; i += 1) {
      seekable.push([videoRef.current.seekable.start(i), videoRef.current.seekable.end(i)]);
    }
    const buffered = [];
    for (let i = 0; i < videoRef.current.buffered.length; i += 1) {
      buffered.push([videoRef.current.buffered.start(i), videoRef.current.buffered.end(i)]);
    }
    log(prefix, { seekable, buffered });
  }

  function performSeek(seekTime) {
    if (!derivedClips || derivedClips.length === 0 || totalDuration <= 0) return;
    const safeSeekTime = Math.max(0, Math.min(seekTime, totalDuration));

    seekingUntil.current = Date.now() + 500;
    setLocalTime(safeSeekTime);

    let targetIdx = 0;
    for (let i = 0; i < derivedClips.length; i++) {
      if (safeSeekTime >= derivedClips[i].__start && safeSeekTime < derivedClips[i].__end) {
        targetIdx = i;
        break;
      }
      if (i === derivedClips.length - 1) targetIdx = i;
    }

    const nominalClipDuration = derivedClips[targetIdx].__duration || 0;
    const actualClipDuration = clipActualDurations[targetIdx];
    const scale =
      Number.isFinite(actualClipDuration) && actualClipDuration > 0 && nominalClipDuration > 0
        ? actualClipDuration / nominalClipDuration
        : 1;
    const rawOffset = safeSeekTime - derivedClips[targetIdx].__start;
    const scaledOffset = rawOffset * scale;
    const maxOffset = Number.isFinite(actualClipDuration) && actualClipDuration > 0
      ? Math.max(0, actualClipDuration - 0.01)
      : Infinity;
    const offsetInClip = Math.max(0, Math.min(scaledOffset, maxOffset));
    const canSeekNow =
      videoRef.current &&
      videoRef.current.readyState >= 1 &&
      Number.isFinite(videoRef.current.duration) &&
      videoRef.current.duration > 0;

    pendingSeekRef.current = {
      targetIdx,
      offsetInClip,
      safeSeekTime,
      nominalClipDuration,
      actualClipDuration,
      scale,
    };

    if (targetIdx !== currentClipIndex) {
      currentClipIndexRef.current = targetIdx;
      setCurrentClipIndex(targetIdx);

      // Check if the target clip is already preloaded on the inactive element
      if (preloadedClipIdx.current === targetIdx) {
        // Swap to the preloaded element — instant transition
        const preloadEl = getPreloadVideo();
        const oldActive = videoRef.current;

        if (oldActive) oldActive.pause();

        // Swap active slot
        activeSlotRef.current = activeSlotRef.current === 0 ? 1 : 0;
        syncVideoRef();
        setDisplaySlot(activeSlotRef.current);

        if (videoRef.current) {
          videoRef.current.currentTime = offsetInClip;
          if (isPlaying) {
            videoRef.current.play().catch(() => {});
          }
        }
        preloadedClipIdx.current = -1;
        seekingUntil.current = Date.now() + 150;
        log('seek-swap (preloaded)', { targetIdx, offsetInClip });
      } else {
        // Target clip not preloaded — fall back to src switch on active element
        if (videoRef.current && clipUrls[targetIdx]) {
          const wasPlaying = isPlaying;
          videoRef.current.src = clipUrls[targetIdx];
          videoRef.current.onloadedmetadata = () => {
            if (!videoRef.current) return;
            videoRef.current.currentTime = offsetInClip;
            logRanges('ranges-after-metadata');
            if (pendingSeekRef.current?.targetIdx === targetIdx) {
              pendingSeekRef.current = null;
            }
            log('seek-applied (metadata)', { targetIdx, offsetInClip, safeSeekTime });
            if (wasPlaying) {
              videoRef.current.play().catch(() => {});
            }
            seekingUntil.current = Date.now() + 200;
          };
          log('seek-queued (new clip, not preloaded)', { targetIdx, offsetInClip, safeSeekTime });
        }
      }
    } else {
      if (videoRef.current && canSeekNow) {
        videoRef.current.currentTime = offsetInClip;
        logRanges('ranges-after-seek');
        log('seek-applied (same clip)', { targetIdx, offsetInClip, safeSeekTime });
      } else {
        log('seek-queued (same clip, metadata not ready)', { targetIdx, offsetInClip, safeSeekTime });
      }
    }
  }

  const handleTimeUpdate = useCallback((e) => {
    // Only process events from the active video element
    const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    if (e.target !== activeVideo) return;
    if (!activeVideo || !derivedClips[currentClipIndex]) return;
    if (Date.now() < seekingUntil.current) return;

    const clip = derivedClips[currentClipIndex];
    const clipStart = clip.__start;
    const nominalDuration = clip.__duration || 0;
    const actualDuration = clipActualDurations[currentClipIndex];
    const videoTime = activeVideo.currentTime;

    const scale =
      Number.isFinite(actualDuration) && actualDuration > 0 && nominalDuration > 0
        ? nominalDuration / actualDuration
        : 1;

    const scaledVideoTime = videoTime * scale;
    const absoluteTime = Math.min(clipStart + scaledVideoTime, clip.__end);

    setLocalTime(absoluteTime);
    onTimeUpdate?.(absoluteTime);
  }, [derivedClips, currentClipIndex, clipActualDurations, onTimeUpdate]);

  const handleEnded = useCallback((e) => {
    // Only process events from the active video element
    const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    if (e.target !== activeVideo) return;

    const nextIdx = currentClipIndex + 1;
    if (nextIdx < clipUrls.length && derivedClips[nextIdx]) {
      currentClipIndexRef.current = nextIdx;
      setLocalTime(derivedClips[nextIdx].__start);
      setCurrentClipIndex(nextIdx);

      // Check if next clip is preloaded on the inactive element
      if (preloadedClipIdx.current === nextIdx) {
        // Seamless swap — the preloaded element already has data buffered
        const oldActive = activeVideo;
        oldActive.pause();

        activeSlotRef.current = activeSlotRef.current === 0 ? 1 : 0;
        syncVideoRef();
        setDisplaySlot(activeSlotRef.current);

        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
        }
        preloadedClipIdx.current = -1;
        seekingUntil.current = Date.now() + 100;
        log('clip-swap (seamless)', { nextIdx });
      } else {
        // Fallback: src switch on active element (shouldn't happen normally)
        seekingUntil.current = Date.now() + 300;
        if (videoRef.current) {
          videoRef.current.src = clipUrls[nextIdx];
          videoRef.current.play().catch(() => {});
        }
        log('clip-switch (fallback)', { nextIdx });
      }
    } else {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
      onPlayStateChange?.(false);
    }
  }, [currentClipIndex, clipUrls, derivedClips, onPlayStateChange, syncVideoRef, getPreloadVideo, log]);

  const handleLoadedMetadata = useCallback((e) => {
    const target = e.target;
    const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    const duration = target.duration;

    if (target === activeVideo) {
      // Active element loaded metadata — store for current clip
      const idx = currentClipIndexRef.current;
      setClipActualDurations((prev) => {
        const next = [...prev];
        next[idx] = duration;
        return next;
      });
      log('loadedmetadata (active)', { duration, clipIndex: idx });
    } else {
      // Preload element loaded metadata — store for preloaded clip
      const idx = preloadedClipIdx.current;
      if (idx >= 0) {
        setClipActualDurations((prev) => {
          const next = [...prev];
          next[idx] = duration;
          return next;
        });
        log('loadedmetadata (preload)', { duration, clipIndex: idx });
      }
    }
  }, [log]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current || clipUrls.length === 0) return;
    if (isPlaying) {
      videoRef.current.pause();
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
      onPlayStateChange?.(false);
    } else {
      pendingPlayRef.current = true;
      if (pendingSeekRef.current && videoRef.current.readyState >= 1) {
        const pending = pendingSeekRef.current;
        videoRef.current.currentTime = pending.offsetInClip;
        log('play-waiting-for-seeked', pending);
        return;
      }
      log('play', {
        currentTime: videoRef.current.currentTime,
        readyState: videoRef.current.readyState,
      });
      videoRef.current.play().catch(() => {});
      if (audioRef.current && currentTrackUrl) {
        audioRef.current.play().catch(() => {});
      }
      setIsPlaying(true);
      onPlayStateChange?.(true);
    }
  }, [isPlaying, clipUrls, onPlayStateChange, currentTrackUrl]);

  const handleSeeked = useCallback((e) => {
    // Only process events from the active video element
    const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    if (e.target !== activeVideo) return;
    if (!activeVideo) return;

    const pending = pendingSeekRef.current;
    log('onseeked', { currentTime: activeVideo.currentTime, pending });
    if (pending) {
      const delta = Math.abs(activeVideo.currentTime - pending.offsetInClip);
      if (delta <= 0.5) {
        pendingSeekRef.current = null;
        log('seek-confirmed', { delta });
      } else {
        log('seek-mismatch', { delta, desired: pending.offsetInClip });
      }
    }
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      activeVideo.play().catch(() => {});
      setIsPlaying(true);
      onPlayStateChange?.(true);
    }
  }, [onPlayStateChange, log]);

  const handleScrub = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = pct * totalDuration;
    performSeek(seekTime);
    onTimeUpdate?.(seekTime);
  }, [totalDuration, onTimeUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = totalDuration > 0 ? (localTime / totalDuration) * 100 : 0;

  if (!clips || clips.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.placeholder}>No clips loaded</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <audio ref={audioRef} style={{ display: 'none' }} />
      <video
        ref={videoARef}
        style={displaySlot === 0 ? styles.video : styles.videoHidden}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => log('onplay-A', { currentTime: videoARef.current?.currentTime })}
        onSeeked={handleSeeked}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        playsInline
        preload="auto"
      />
      <video
        ref={videoBRef}
        style={displaySlot === 1 ? styles.video : styles.videoHidden}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => log('onplay-B', { currentTime: videoBRef.current?.currentTime })}
        onSeeked={handleSeeked}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        playsInline
        preload="auto"
      />
      <div style={styles.controls}>
        <button style={styles.playBtn} onClick={togglePlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div style={styles.timeDisplay}>
          {formatTime(localTime)} / {formatTime(totalDuration)}
        </div>
        <div style={styles.scrubber} onClick={handleScrub}>
          <div style={{ ...styles.scrubberFill, width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
