import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { Clip, Section, Track } from "@/types";

interface DerivedClip extends Clip {
  __start: number;
  __end: number;
  __duration: number;
}

interface UseVideoPlayerProps {
  clips: Clip[];
  sections: Section[];
  tracks: Track[];
}

const SUPABASE_STORAGE_BASE = "https://bznswadiiqulyzpkajqp.supabase.co/storage/v1/object/public/media/";

// Logging helper - always shows in devtools
function log(tag: string, msg: string, data: Record<string, unknown> = {}) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`%c[${ts}] [VideoPlayer] ${tag}`, "color: #45f5c5; font-weight: bold", msg, data);
}

export function useVideoPlayer({ clips, sections, tracks }: UseVideoPlayerProps) {
  // ── Dual video element refs ──
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const activeSlotRef = useRef(0); // 0 = A active, 1 = B active
  const [displaySlot, setDisplaySlot] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const preloadedClipIdx = useRef(-1);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [clipUrls, setClipUrls] = useState<string[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  const [clipActualDurations, setClipActualDurations] = useState<number[]>([]);
  const [currentTrackUrl, setCurrentTrackUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const seekingUntil = useRef(0);
  const pendingSeekRef = useRef<{
    targetIdx: number;
    offsetInClip: number;
    safeSeekTime: number;
    nominalClipDuration: number;
    actualClipDuration: number | undefined;
    scale: number;
  } | null>(null);
  const pendingPlayRef = useRef(false);
  const currentClipIndexRef = useRef(0);

  // ── Helpers ──
  const getPreloadVideo = useCallback(() => {
    return activeSlotRef.current === 0 ? videoBRef.current : videoARef.current;
  }, []);

  /** Sync videoRef to whichever physical element is active.
   *  Handles the race where the hook mounts before VideoPreview renders. */
  const syncVideoRef = useCallback(() => {
    const el = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    if (el) videoRef.current = el;
    return videoRef.current;
  }, []);

  const derivedClips = useMemo((): DerivedClip[] => {
    if (!clips || clips.length === 0) return [];
    let cursor = 0;
    return clips.map((clip) => {
      const duration = Number.isFinite(clip.duration) ? clip.duration : 0;
      const start = cursor;
      const end = cursor + duration;
      cursor = end;
      return { ...clip, __start: start, __end: end, __duration: duration };
    });
  }, [clips]);

  const totalDuration = useMemo(() => {
    if (derivedClips.length === 0) return 0;
    return derivedClips[derivedClips.length - 1].__end || 0;
  }, [derivedClips]);

  // ── Sync currentClipIndex to ref ──
  useEffect(() => {
    currentClipIndexRef.current = currentClipIndex;
  }, [currentClipIndex]);

  /** Full soft-reset: nuke all player state and let the effect chain rebuild from scratch.
   *  Call this after clips change (add/reorder) instead of trying to patch in-place. */
  const resetPlayer = useCallback(() => {
    log("RESET", "Full player reset requested");

    // 1. Pause everything
    if (videoARef.current) videoARef.current.pause();
    if (videoBRef.current) videoBRef.current.pause();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    isPlayingRef.current = false;
    setIsPlaying(false);

    // 2. Reset to slot A
    activeSlotRef.current = 0;
    videoRef.current = videoARef.current;
    setDisplaySlot(0);

    // 3. Reset all refs
    currentClipIndexRef.current = 0;
    preloadedClipIdx.current = -1;
    pendingSeekRef.current = null;
    pendingPlayRef.current = false;
    seekingUntil.current = 0;

    // 4. Reset all state
    setCurrentClipIndex(0);
    setLocalTime(0);
    setVideoError(null);
    setClipActualDurations([]);
    setCurrentTrackUrl(null);

    // 5. Clear both video element sources so effects re-load from scratch
    if (videoARef.current) {
      videoARef.current.removeAttribute("src");
      videoARef.current.load();
    }
    if (videoBRef.current) {
      videoBRef.current.removeAttribute("src");
      videoBRef.current.load();
    }

    // 6. Force clipUrls to empty so the rebuild effect re-triggers the load chain
    setClipUrls([]);

    log("RESET", "Player state cleared — effects will rebuild");
  }, []);

  // ── Build clip URLs ──
  useEffect(() => {
    if (!clips || clips.length === 0) {
      log("URLS", "No clips provided");
      return;
    }
    const urls = clips
      .map((clip, i) => {
        if (clip.storage_path) {
          const url = `${SUPABASE_STORAGE_BASE}${clip.storage_path}`;
          log("URLS", `Clip ${i}: ${clip.filename} -> ${url.slice(-40)}`);
          return url;
        }
        log("URLS", `Clip ${i}: ${clip.filename} has NO storage_path!`, { clip: clip as unknown as Record<string, unknown> });
        return null;
      })
      .filter((u): u is string => !!u);
    log("URLS", `Built ${urls.length} clip URLs from ${clips.length} clips`);
    setClipUrls(urls);
  }, [clips]);

  // ── Initialize active element on mount ──
  useEffect(() => {
    if (videoARef.current) {
      videoRef.current = videoARef.current;
      activeSlotRef.current = 0;
      log("INIT", "Set videoRef to element A");
    } else {
      log("INIT", "WARNING: videoARef is null on mount!");
    }
  }, []);

  // ── Load first clip when URLs are ready ──
  useEffect(() => {
    if (clipUrls.length === 0) {
      log("LOAD", "No clip URLs available yet");
      return;
    }

    // Sync videoRef — handles the case where init useEffect ran before VideoPreview rendered
    syncVideoRef();

    if (!videoRef.current) {
      log("LOAD", "videoRef still null — VideoPreview may not have rendered yet, retrying in 100ms");
      const timer = setTimeout(() => {
        syncVideoRef();
        if (videoRef.current) {
          const currentSrc = videoRef.current.getAttribute("src");
          if (!currentSrc) {
            log("LOAD", `[retry] Setting first clip src: ${clipUrls[0].slice(-40)}`);
            videoRef.current.src = clipUrls[0];
            videoRef.current.load();
            setVideoError(null);
          }
        } else {
          log("LOAD", "WARNING: videoRef still null after retry");
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    const currentSrc = videoRef.current.getAttribute("src");
    if (!currentSrc) {
      log("LOAD", `Setting first clip src: ${clipUrls[0].slice(-40)}`);
      videoRef.current.src = clipUrls[0];
      videoRef.current.load();
      setVideoError(null);
    } else {
      log("LOAD", `First clip already loaded: ${currentSrc.slice(-40)}`);
    }
  }, [clipUrls, syncVideoRef]);

  // ── Preload next clip ──
  useEffect(() => {
    const nextIdx = currentClipIndex + 1;
    if (nextIdx < clipUrls.length) {
      const preloadEl = getPreloadVideo();
      if (preloadEl) {
        preloadEl.src = clipUrls[nextIdx];
        preloadEl.load();
        preloadedClipIdx.current = nextIdx;
        log("PRELOAD", `Preloading clip ${nextIdx}`, { url: clipUrls[nextIdx]?.slice(-40) });
      }
    } else {
      preloadedClipIdx.current = -1;
    }
  }, [currentClipIndex, clipUrls, getPreloadVideo]);

  // ── Audio track sync ──
  useEffect(() => {
    if (!sections.length || !tracks.length) {
      setCurrentTrackUrl(null);
      return;
    }
    const currentSection = sections.find((s) => localTime >= s.start_time && localTime < s.end_time);
    if (!currentSection) {
      setCurrentTrackUrl(null);
      return;
    }
    const track = tracks.find((t) => t.section_id === currentSection.id && !t.is_discarded && t.stream_url);
    if (track?.stream_url !== currentTrackUrl) {
      log("AUDIO", `Track change for section ${currentSection.section_type}`, {
        trackUrl: track?.stream_url?.slice(-30) || "none",
      });
      setCurrentTrackUrl(track?.stream_url || null);
    }
  }, [localTime, sections, tracks, currentTrackUrl]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (!currentTrackUrl) {
      audioRef.current.pause();
      audioRef.current.src = "";
      return;
    }
    if (audioRef.current.src !== currentTrackUrl) {
      log("AUDIO", `Loading track: ${currentTrackUrl.slice(-40)}`);
      audioRef.current.src = currentTrackUrl;
      audioRef.current.load();
    }
    const currentSection = sections.find((s) => localTime >= s.start_time && localTime < s.end_time);
    if (currentSection && audioRef.current.readyState >= 1) {
      const offsetInSection = localTime - currentSection.start_time;
      const audioDelta = Math.abs(audioRef.current.currentTime - offsetInSection);
      if (audioDelta > 0.3) {
        audioRef.current.currentTime = offsetInSection;
      }
    }
    if (isPlaying && audioRef.current.paused) {
      audioRef.current.play().catch((err) => {
        log("AUDIO", `Audio play failed: ${err.message}`);
      });
    } else if (!isPlaying && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [currentTrackUrl, isPlaying, localTime, sections]);

  // ── Video error handler ──
  const handleVideoError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.target as HTMLVideoElement;
    const error = video.error;
    const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    const isActive = video === activeVideo;
    const slot = video === videoARef.current ? "A" : "B";

    const errorMessages: Record<number, string> = {
      1: "MEDIA_ERR_ABORTED - Fetching was aborted",
      2: "MEDIA_ERR_NETWORK - Network error while downloading",
      3: "MEDIA_ERR_DECODE - Error decoding the media",
      4: "MEDIA_ERR_SRC_NOT_SUPPORTED - Media format not supported",
    };

    const errorMsg = error
      ? `${errorMessages[error.code] || `Unknown error code ${error.code}`}: ${error.message || "no details"}`
      : "Unknown video error";

    log("ERROR", `Video ${slot} error (${isActive ? "ACTIVE" : "preload"}): ${errorMsg}`, {
      src: video.src?.slice(-50),
      networkState: video.networkState,
      readyState: video.readyState,
    });

    if (isActive) {
      setVideoError(`Video error: ${errorMsg}`);
    }
  }, []);

  // ── Core seek ──
  const performSeek = useCallback((seekTime: number) => {
    // Ensure videoRef is synced (handles late init)
    syncVideoRef();

    if (!derivedClips || derivedClips.length === 0 || totalDuration <= 0) {
      log("SEEK", "Cannot seek - no clips or zero duration", { derivedClips: derivedClips?.length, totalDuration });
      return;
    }
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
      Number.isFinite(actualClipDuration) && actualClipDuration! > 0 && nominalClipDuration > 0
        ? actualClipDuration! / nominalClipDuration
        : 1;
    const rawOffset = safeSeekTime - derivedClips[targetIdx].__start;
    const scaledOffset = rawOffset * scale;
    const maxOffset =
      Number.isFinite(actualClipDuration) && actualClipDuration! > 0
        ? Math.max(0, actualClipDuration! - 0.01)
        : Infinity;
    const offsetInClip = Math.max(0, Math.min(scaledOffset, maxOffset));

    pendingSeekRef.current = {
      targetIdx,
      offsetInClip,
      safeSeekTime,
      nominalClipDuration,
      actualClipDuration,
      scale,
    };

    const playing = isPlayingRef.current;

    if (targetIdx !== currentClipIndexRef.current) {
      log("SEEK", `Switching clip ${currentClipIndexRef.current} -> ${targetIdx}`, { offsetInClip: offsetInClip.toFixed(2) });
      currentClipIndexRef.current = targetIdx;
      setCurrentClipIndex(targetIdx);

      if (preloadedClipIdx.current === targetIdx) {
        const oldActive = videoRef.current;
        if (oldActive) oldActive.pause();
        activeSlotRef.current = activeSlotRef.current === 0 ? 1 : 0;
        syncVideoRef();
        setDisplaySlot(activeSlotRef.current);
        if (videoRef.current) {
          videoRef.current.currentTime = offsetInClip;
          if (playing) {
            videoRef.current.play().catch((err) => {
              log("ERROR", `Play failed after seek-swap: ${err.message}`, { name: err.name });
            });
          }
        }
        preloadedClipIdx.current = -1;
        seekingUntil.current = Date.now() + 150;
        log("SEEK", "Swapped to preloaded element", { targetIdx, offsetInClip: offsetInClip.toFixed(2) });
      } else {
        if (videoRef.current && clipUrls[targetIdx]) {
          log("SEEK", "Fallback src switch", { targetIdx, url: clipUrls[targetIdx]?.slice(-40) });
          videoRef.current.src = clipUrls[targetIdx];
          videoRef.current.onloadedmetadata = () => {
            if (!videoRef.current) return;
            videoRef.current.currentTime = offsetInClip;
            if (pendingSeekRef.current?.targetIdx === targetIdx) {
              pendingSeekRef.current = null;
            }
            log("SEEK", "Applied after metadata", { targetIdx, offsetInClip: offsetInClip.toFixed(2) });
            if (playing) {
              videoRef.current.play().catch((err) => {
                log("ERROR", `Play failed after metadata: ${err.message}`, { name: err.name });
              });
            }
            seekingUntil.current = Date.now() + 200;
          };
        }
      }
    } else {
      const canSeekNow =
        videoRef.current &&
        videoRef.current.readyState >= 1 &&
        Number.isFinite(videoRef.current.duration) &&
        videoRef.current.duration > 0;
      if (videoRef.current && canSeekNow) {
        videoRef.current.currentTime = offsetInClip;
        log("SEEK", "Applied (same clip)", { targetIdx, offsetInClip: offsetInClip.toFixed(2) });
      } else {
        log("SEEK", "Queued (same clip, not ready)", { targetIdx, offsetInClip: offsetInClip.toFixed(2), readyState: videoRef.current?.readyState });
      }
    }
  }, [derivedClips, totalDuration, clipActualDurations, clipUrls, syncVideoRef]);

  // ── Re-sync videoRef when loading finishes (video elements appear in DOM) ──
  useEffect(() => {
    // This effect fires whenever videoARef/videoBRef become available
    // (i.e., after loading spinner goes away and VideoPreview renders)
    const check = () => {
      if (!videoRef.current && videoARef.current) {
        videoRef.current = videoARef.current;
        activeSlotRef.current = 0;
        log("INIT", "Late-sync: videoRef set to element A (loading finished)");

        // Also load first clip if URLs are ready
        if (clipUrls.length > 0 && !videoRef.current.getAttribute("src")) {
          log("LOAD", `Late-sync: loading first clip: ${clipUrls[0].slice(-40)}`);
          videoRef.current.src = clipUrls[0];
          videoRef.current.load();
          setVideoError(null);
        }
      }
    };
    // Check immediately and also after a short delay for mount timing
    check();
    const timer = setTimeout(check, 50);
    return () => clearTimeout(timer);
  });

  // ── Event handlers ──
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
      if (e.target !== activeVideo) return;
      // Use ref (sync) instead of state (async) to avoid stale index after clip swap
      const idx = currentClipIndexRef.current;
      if (!activeVideo || !derivedClips[idx]) return;
      if (Date.now() < seekingUntil.current) return;

      const clip = derivedClips[idx];
      const nominalDuration = clip.__duration || 0;
      const actualDuration = clipActualDurations[idx];
      const videoTime = activeVideo.currentTime;
      const scale =
        Number.isFinite(actualDuration) && actualDuration > 0 && nominalDuration > 0
          ? nominalDuration / actualDuration
          : 1;
      const scaledVideoTime = videoTime * scale;
      const absoluteTime = Math.min(clip.__start + scaledVideoTime, clip.__end);

      setLocalTime(absoluteTime);
    },
    [derivedClips, clipActualDurations]
  );

  const handleEnded = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
      if (e.target !== activeVideo) return;

      const nextIdx = currentClipIndex + 1;
      log("PLAY", `Clip ${currentClipIndex} ended, next: ${nextIdx}/${clipUrls.length}`);

      if (nextIdx < clipUrls.length && derivedClips[nextIdx]) {
        currentClipIndexRef.current = nextIdx;
        setLocalTime(derivedClips[nextIdx].__start);
        setCurrentClipIndex(nextIdx);

        if (preloadedClipIdx.current === nextIdx) {
          const oldActive = activeVideo;
          if (oldActive) oldActive.pause();
          activeSlotRef.current = activeSlotRef.current === 0 ? 1 : 0;
          syncVideoRef();
          setDisplaySlot(activeSlotRef.current);
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch((err) => {
              log("ERROR", `Play failed on seamless swap: ${err.message}`, { name: err.name });
            });
          }
          preloadedClipIdx.current = -1;
          seekingUntil.current = Date.now() + 100;
          log("PLAY", `Seamless swap to clip ${nextIdx}`);
        } else {
          seekingUntil.current = Date.now() + 300;
          if (videoRef.current) {
            videoRef.current.src = clipUrls[nextIdx];
            videoRef.current.play().catch((err) => {
              log("ERROR", `Play failed on fallback switch: ${err.message}`, { name: err.name });
            });
          }
          log("PLAY", `Fallback src switch to clip ${nextIdx}`);
        }
      } else {
        log("PLAY", "All clips finished, stopping");
        isPlayingRef.current = false;
        setIsPlaying(false);
        if (audioRef.current) audioRef.current.pause();
      }
    },
    [currentClipIndex, clipUrls, derivedClips, syncVideoRef]
  );

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const target = e.target as HTMLVideoElement;
    const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    const duration = target.duration;
    const slot = target === videoARef.current ? "A" : "B";

    if (target === activeVideo) {
      const idx = currentClipIndexRef.current;
      setClipActualDurations((prev) => {
        const next = [...prev];
        next[idx] = duration;
        return next;
      });
      setVideoError(null);
      log("META", `Video ${slot} loaded metadata (active clip ${idx}): duration=${duration.toFixed(2)}s`, {
        src: target.src?.slice(-40),
        readyState: target.readyState,
        videoWidth: target.videoWidth,
        videoHeight: target.videoHeight,
      });
    } else {
      const idx = preloadedClipIdx.current;
      if (idx >= 0) {
        setClipActualDurations((prev) => {
          const next = [...prev];
          next[idx] = duration;
          return next;
        });
        log("META", `Video ${slot} loaded metadata (preload clip ${idx}): duration=${duration.toFixed(2)}s`);
      }
    }

    // Handle pending seek after metadata loads
    const pending = pendingSeekRef.current;
    if (pending && target === activeVideo) {
      log("META", "Applying pending seek after metadata", { offsetInClip: pending.offsetInClip });
      target.currentTime = pending.offsetInClip;
    }
  }, []);

  const handleSeeked = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    if (e.target !== activeVideo || !activeVideo) return;

    const pending = pendingSeekRef.current;
    log("SEEK", "Seeked event", { currentTime: activeVideo.currentTime?.toFixed(2), hasPending: !!pending });
    if (pending) {
      const delta = Math.abs(activeVideo.currentTime - pending.offsetInClip);
      if (delta <= 0.5) {
        pendingSeekRef.current = null;
        log("SEEK", "Seek confirmed", { delta: delta.toFixed(3) });
      }
    }
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      log("PLAY", "Executing pending play after seek");
      activeVideo.play()
        .then(() => {
          log("PLAY", "Pending play succeeded");
        })
        .catch((err) => {
          log("ERROR", `Pending play failed: ${err.message}`);
        });
      isPlayingRef.current = true;
      setIsPlaying(true);
    }
  }, []);

  const togglePlay = useCallback(() => {
    // Ensure videoRef is synced (handles late init)
    syncVideoRef();

    if (!videoRef.current || clipUrls.length === 0) {
      log("PLAY", "Cannot play", { hasVideoRef: !!videoRef.current, clipUrlCount: clipUrls.length });
      return;
    }

    const v = videoRef.current;
    log("PLAY", `Toggle play. Currently ${isPlaying ? "playing" : "paused"}`, {
      src: v.src?.slice(-40),
      readyState: v.readyState,
      networkState: v.networkState,
      currentTime: v.currentTime?.toFixed(2),
      duration: v.duration,
      paused: v.paused,
      ended: v.ended,
      error: v.error ? `code=${v.error.code}` : "none",
    });

    if (isPlaying) {
      v.pause();
      if (audioRef.current) audioRef.current.pause();
      isPlayingRef.current = false;
      pendingPlayRef.current = false;
      setIsPlaying(false);
    } else {
      setVideoError(null);
      pendingPlayRef.current = true;

      // If there's a pending seek and video is ready, apply it first
      if (pendingSeekRef.current && v.readyState >= 1) {
        const pending = pendingSeekRef.current;
        v.currentTime = pending.offsetInClip;
        log("PLAY", "Applied pending seek before play", { offsetInClip: pending.offsetInClip });
      }

      // If video has no src or readyState is 0, try loading first
      if (v.readyState === 0 && clipUrls[currentClipIndexRef.current]) {
        log("PLAY", "Video not ready (readyState=0), loading src first");
        v.src = clipUrls[currentClipIndexRef.current];
        v.load();
        // Play will happen in handleSeeked -> pendingPlayRef
        return;
      }

      log("PLAY", "Calling video.play()");
      v.play()
        .then(() => {
          log("PLAY", "Play started successfully");
        })
        .catch((err) => {
          log("ERROR", `Play failed: ${err.name}: ${err.message}`);
          setVideoError(`Play failed: ${err.message}`);
          // Try with muted if autoplay policy blocks
          if (err.name === "NotAllowedError") {
            log("PLAY", "Retrying with muted=true (autoplay policy)");
            v.muted = true;
            v.play()
              .then(() => {
                log("PLAY", "Play succeeded with muted=true");
                setVideoError("Playing muted (click to unmute)");
              })
              .catch((err2) => {
                log("ERROR", `Play failed even muted: ${err2.message}`);
              });
          }
        });

      if (audioRef.current && currentTrackUrl) {
        audioRef.current.play().catch((err) => {
          log("AUDIO", `Audio play failed: ${err.message}`);
        });
      }
      isPlayingRef.current = true;
      setIsPlaying(true);
    }
  }, [isPlaying, clipUrls, currentTrackUrl, syncVideoRef]);

  // Log state changes
  useEffect(() => {
    log("STATE", `Clips: ${clips?.length || 0}, URLs: ${clipUrls.length}, Sections: ${sections.length}, Tracks: ${tracks.length}`);
  }, [clips?.length, clipUrls.length, sections.length, tracks.length]);

  const progress = totalDuration > 0 ? (localTime / totalDuration) * 100 : 0;

  return {
    videoARef,
    videoBRef,
    audioRef,
    displaySlot,
    localTime,
    isPlaying,
    totalDuration,
    togglePlay,
    performSeek,
    handleTimeUpdate,
    handleEnded,
    handleLoadedMetadata,
    handleSeeked,
    handleVideoError,
    videoError,
    progress,
    derivedClips,
    resetPlayer,
  };
}
