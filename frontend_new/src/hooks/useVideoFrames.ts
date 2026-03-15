import { useState, useEffect } from "react";

export function useVideoFrames(videoSrc: string, frameCount: number) {
  const [frames, setFrames] = useState<string[]>([]);

  useEffect(() => {
    if (!videoSrc || frameCount <= 0) return;

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.src = videoSrc;

    // Target: wide timeline thumbnail
    const TARGET_W = 160;
    const TARGET_H = 48;

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const extractedFrames: string[] = [];
    let currentFrame = 0;

    video.addEventListener("loadedmetadata", () => {
      const duration = video.duration;
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Center-crop: scale to cover target, then crop center
      const targetAspect = TARGET_W / TARGET_H;
      const videoAspect = vw / vh;

      let sx: number, sy: number, sw: number, sh: number;

      if (videoAspect > targetAspect) {
        // Video is wider than target — crop sides
        sh = vh;
        sw = vh * targetAspect;
        sx = (vw - sw) / 2;
        sy = 0;
      } else {
        // Video is taller than target (vertical) — crop top/bottom
        sw = vw;
        sh = vw / targetAspect;
        sx = 0;
        sy = (vh - sh) / 2;
      }

      const seekToNextFrame = () => {
        if (currentFrame >= frameCount) {
          setFrames(extractedFrames);
          return;
        }
        const time = (currentFrame / frameCount) * duration;
        video.currentTime = time;
      };

      video.addEventListener("seeked", () => {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);
        extractedFrames.push(canvas.toDataURL("image/jpeg", 0.7));
        currentFrame++;
        seekToNextFrame();
      });

      seekToNextFrame();
    });
  }, [videoSrc, frameCount]);

  return frames;
}
