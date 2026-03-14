import { useRef, useEffect, useState } from 'react';

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
    transition: 'width 0.1s linear',
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

  // Find which clip to play based on currentTime
  useEffect(() => {
    if (!clips || clips.length === 0) return;
    let idx = 0;
    for (let i = 0; i < clips.length; i++) {
      if (currentTime >= clips[i].start_time && currentTime < clips[i].end_time) {
        idx = i;
        break;
      }
      if (i === clips.length - 1) idx = i;
    }
    if (idx !== currentClipIndex && clipUrls[idx]) {
      setCurrentClipIndex(idx);
      if (videoRef.current) {
        videoRef.current.src = clipUrls[idx];
        const offset = currentTime - clips[idx].start_time;
        videoRef.current.currentTime = Math.max(0, offset);
        if (isPlaying) videoRef.current.play().catch(() => {});
      }
    }
  }, [currentTime, clips, clipUrls]);

  // Load first clip
  useEffect(() => {
    if (clipUrls.length > 0 && videoRef.current && !videoRef.current.src) {
      videoRef.current.src = clipUrls[0];
    }
  }, [clipUrls]);

  const handleTimeUpdate = () => {
    if (!videoRef.current || !clips[currentClipIndex]) return;
    const clipStart = clips[currentClipIndex].start_time;
    const absoluteTime = clipStart + videoRef.current.currentTime;
    onTimeUpdate?.(absoluteTime);
  };

  const handleEnded = () => {
    // Move to next clip
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
  };

  const togglePlay = () => {
    if (!videoRef.current || clipUrls.length === 0) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
    onPlayStateChange?.(!isPlaying);
  };

  const handleScrub = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const seekTime = pct * duration;
    onTimeUpdate?.(seekTime);

    // Find correct clip and set video time
    for (let i = 0; i < clips.length; i++) {
      if (seekTime >= clips[i].start_time && seekTime < clips[i].end_time) {
        if (i !== currentClipIndex && clipUrls[i]) {
          setCurrentClipIndex(i);
          if (videoRef.current) {
            videoRef.current.src = clipUrls[i];
          }
        }
        if (videoRef.current) {
          videoRef.current.currentTime = seekTime - clips[i].start_time;
        }
        break;
      }
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div style={styles.scrubber} onClick={handleScrub}>
          <div style={{ ...styles.scrubberFill, width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
