import { useRef, useEffect, useState, useCallback } from 'react';

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
  const [duration, setDuration] = useState(0);
  const [clipUrls, setClipUrls] = useState([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  // Use a timestamp-based guard instead of a simple boolean so we can
  // ignore onTimeUpdate events that arrive shortly after a seek.
  const seekingUntil = useRef(0);
  const lastPropSeek = useRef(0);

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
    setDuration(clips.reduce((sum, c) => sum + (c.duration || 0), 0));
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

  function performSeek(seekTime) {
    if (!clips || clips.length === 0) return;

    // Block onTimeUpdate for 500ms to let the video settle
    seekingUntil.current = Date.now() + 500;
    setLocalTime(seekTime);

    // Find the correct clip for this time
    let targetIdx = 0;
    for (let i = 0; i < clips.length; i++) {
      if (seekTime >= clips[i].start_time && seekTime < clips[i].end_time) {
        targetIdx = i;
        break;
      }
      if (i === clips.length - 1) targetIdx = i;
    }

    const offsetInClip = seekTime - clips[targetIdx].start_time;

    if (targetIdx !== currentClipIndex) {
      setCurrentClipIndex(targetIdx);
      if (videoRef.current && clipUrls[targetIdx]) {
        const wasPlaying = isPlaying;
        videoRef.current.src = clipUrls[targetIdx];
        videoRef.current.onloadedmetadata = () => {
          if (!videoRef.current) return;
          videoRef.current.currentTime = offsetInClip;
          if (wasPlaying) {
            videoRef.current.play().catch(() => {});
          }
          // Extend the guard a bit more after metadata loads
          seekingUntil.current = Date.now() + 300;
        };
      }
    } else {
      if (videoRef.current) {
        videoRef.current.currentTime = offsetInClip;
      }
    }
  }

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || !clips[currentClipIndex]) return;
    // Ignore updates while seeking
    if (Date.now() < seekingUntil.current) return;
    const clipStart = clips[currentClipIndex].start_time;
    const absoluteTime = clipStart + videoRef.current.currentTime;
    setLocalTime(absoluteTime);
    onTimeUpdate?.(absoluteTime);
  }, [clips, currentClipIndex, onTimeUpdate]);

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
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
      onPlayStateChange?.(true);
    }
  }, [isPlaying, clipUrls, onPlayStateChange]);

  const handleScrub = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = pct * duration;
    performSeek(seekTime);
    onTimeUpdate?.(seekTime);
  }, [duration, clips, clipUrls, currentClipIndex, isPlaying, onTimeUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = duration > 0 ? (localTime / duration) * 100 : 0;

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
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        playsInline
      />
      <div style={styles.controls}>
        <button style={styles.playBtn} onClick={togglePlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div style={styles.timeDisplay}>
          {formatTime(localTime)} / {formatTime(duration)}
        </div>
        <div style={styles.scrubber} onClick={handleScrub}>
          <div style={{ ...styles.scrubberFill, width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
