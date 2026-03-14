import { useRef, useEffect, useState, useCallback } from 'react';

const styles = {
  container: {
    background: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    aspectRatio: '16/9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  const userSeeking = useRef(false);
  const pendingSeek = useRef(null);

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

  // Handle pending seek after video loads
  const handleLoadedMetadata = useCallback(() => {
    if (pendingSeek.current !== null && videoRef.current) {
      videoRef.current.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }
  }, []);

  const handleSeeked = useCallback(() => {
    userSeeking.current = false;
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || !clips[currentClipIndex] || userSeeking.current) return;
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

  const seekToTime = useCallback((seekTime) => {
    if (!clips || clips.length === 0) return;

    userSeeking.current = true;
    setLocalTime(seekTime);
    onTimeUpdate?.(seekTime);

    // Find the correct clip for this time
    let targetClipIndex = 0;
    for (let i = 0; i < clips.length; i++) {
      if (seekTime >= clips[i].start_time && seekTime < clips[i].end_time) {
        targetClipIndex = i;
        break;
      }
      if (i === clips.length - 1) targetClipIndex = i;
    }

    const offsetInClip = seekTime - clips[targetClipIndex].start_time;

    if (targetClipIndex !== currentClipIndex) {
      // Need to load a different clip
      setCurrentClipIndex(targetClipIndex);
      pendingSeek.current = offsetInClip;
      if (videoRef.current && clipUrls[targetClipIndex]) {
        const wasPlaying = isPlaying;
        videoRef.current.src = clipUrls[targetClipIndex];
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.currentTime = offsetInClip;
          if (wasPlaying) {
            videoRef.current.play().catch(() => {});
          }
          userSeeking.current = false;
        };
      }
    } else {
      // Same clip, just seek
      if (videoRef.current) {
        videoRef.current.currentTime = offsetInClip;
      }
    }
  }, [clips, clipUrls, currentClipIndex, isPlaying, onTimeUpdate]);

  const handleScrub = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = pct * duration;
    seekToTime(seekTime);
  }, [duration, seekToTime]);

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
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={handleSeeked}
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
