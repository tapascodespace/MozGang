import { useState, useCallback } from "react";
import * as api from "@/services/api";

function getFileDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function useClipUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const validateFiles = useCallback((files: File[]): string | null => {
    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return `Unsupported file type: ${file.name}. Use MP4, MOV, or WebM.`;
      }
      if (file.size > MAX_FILE_SIZE) {
        return `File too large: ${file.name}. Maximum 50MB.`;
      }
    }
    return null;
  }, []);

  const uploadFiles = useCallback(
    async (files: File[]): Promise<{ projectId: string; clips: unknown[] } | null> => {
      const validationError = validateFiles(files);
      if (validationError) {
        setError(validationError);
        return null;
      }

      setIsUploading(true);
      setError(null);
      setUploadProgress(10);

      try {
        // Extract durations
        const durations = await Promise.all(files.map(getFileDuration));
        setUploadProgress(25);

        // Create project
        const projectRes = await api.createProject();
        const projectId = projectRes.data.id;
        setUploadProgress(40);

        // Upload clips
        const clipsRes = await api.uploadClips(projectId, files, durations);
        setUploadProgress(80);

        // Fire pre-analysis (fire-and-forget)
        api.startPreAnalysis(projectId).catch(() => {});
        setUploadProgress(100);

        return { projectId, clips: clipsRes.data };
      } catch {
        setError("Upload failed. Please try again.");
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [validateFiles]
  );

  return { uploadFiles, isUploading, uploadProgress, error, validateFiles };
}
