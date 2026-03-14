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

export default function PreviewPlayer({ clips, currentTime, onTimeUpdate, onPlayStateChange }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [clipUrls, setClipUrls] = useState([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  const [clipActualDurations, setClipActualDurations] = useState([]);
  // Use a timestamp-based guard instead of a simple boolean so we can
  // ignore onTimeUpdate events that arrive shortly after a seek.
  const seekingUntil = useRef(0);
  const lastPropSeek = useRef(0);
  const pendingSeekRef = useRef(null);
  const pendingPlayRef = useRef(false);

  const log = useCallback((msg, data = {}) => {
    if (typeof window === 'undefined') return;
    // Keep logs lightweight and easy to grep in console.
    console.debug('[PreviewPlayer]', msg, data);
  }, []);

  const derivedClips = useMemo(() => {
    if (!clips || clips.length === 0) return [];
    let cursor = 0;
    return clips.map((clip) => {
      const hasStart = Number.isFinite(clip.start_time);
      const hasEnd = Number.isFinite(clip.end_time);
      const hasDuration = Number.isFinite(clip.duration);
      const start = hasStart ? clip.start_time : cursor;
      const duration = hasDuration
        ? clip.duration
        : hasStart && hasEnd
          ? clip.end_time - clip.start_time
          : 0;
      const end = hasEnd ? clip.end_time : start + duration;
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

  // Load first clip
  useEffect(() => {
    if (clipUrls.length > 0 && videoRef.current && !videoRef.current.src) {
      videoRef.current.src = clipUrls[0];
    }
  }, [clipUrls]);

  // React to external currentTime prop changes (from Timeline clicks)
  useEffect(() => {
    if (!clips || clips.length === 0 || !clipUrls.length) return;
    // Only react if the prop differs significantly from our local time
    // (avoids infinite loop since we also call onTimeUpdate)
    if (Math.abs(currentTime - localTime) < 0.3) return;
    // Avoid re-seeking for the same prop value
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

    // Block onTimeUpdate for 500ms to let the video settle
    seekingUntil.current = Date.now() + 500;
    setLocalTime(safeSeekTime);

    // Find the correct clip for this time
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
      setCurrentClipIndex(targetIdx);
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
          // Extend the guard a bit more after metadata loads
          seekingUntil.current = Date.now() + 300;
        };
        log('seek-queued (new clip)', { targetIdx, offsetInClip, safeSeekTime });
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

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || !derivedClips[currentClipIndex]) return;
    // Ignore updates while seeking
    if (Date.now() < seekingUntil.current) return;
    const clipStart = derivedClips[currentClipIndex].__start;
    const absoluteTime = clipStart + videoRef.current.currentTime;
    setLocalTime(absoluteTime);
    onTimeUpdate?.(absoluteTime);
  }, [derivedClips, currentClipIndex, onTimeUpdate]);

  const handleEnded = useCallback(() => {
    const nextIdx = currentClipIndex + 1;
    if (nextIdx < clipUrls.length) {
      setCurrentClipIndex(nextIdx);
      if (videoRef.current) {
        videoRef.current.src = clipUrls[nextIdx];
        videoRef.current.play().catch(() => {});
      }
    } else {
      setIsPlaying(false);
      onPlayStateChange?.(false);
    }
  }, [currentClipIndex, clipUrls, onPlayStateChange]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current || clipUrls.length === 0) return;
    if (isPlaying) {
      videoRef.current.pause();
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
      setIsPlaying(true);
      onPlayStateChange?.(true);
    }
  }, [isPlaying, clipUrls, onPlayStateChange]);

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
      <video
        ref={videoRef}
        style={styles.video}
        onLoadedMetadata={() => {
          if (!videoRef.current) return;
          const duration = videoRef.current.duration;
          setClipActualDurations((prev) => {
            const next = [...prev];
            next[currentClipIndex] = duration;
            return next;
          });
          log('loadedmetadata', {
            duration,
            currentTime: videoRef.current.currentTime,
          });
        }}
        onPlay={() => {
          if (!videoRef.current) return;
          log('onplay', { currentTime: videoRef.current.currentTime });
        }}
        onSeeked={() => {
          if (!videoRef.current) return;
          const pending = pendingSeekRef.current;
          log('onseeked', { currentTime: videoRef.current.currentTime, pending });
          if (pending) {
            const delta = Math.abs(videoRef.current.currentTime - pending.offsetInClip);
            if (delta <= 0.5) {
              pendingSeekRef.current = null;
              log('seek-confirmed', { delta });
            } else {
              log('seek-mismatch', { delta, desired: pending.offsetInClip });
            }
          }
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false;
            videoRef.current.play().catch(() => {});
            setIsPlaying(true);
            onPlayStateChange?.(true);
          }
        }}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        playsInline
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
