import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { createProject, uploadClips, startPreAnalysis, setVibe } from '../services/api';

const ACCEPTED_TYPES = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
};

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const formatSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ImportScreen({ onComplete }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      toast.error('Only MP4, MOV, and WebM files are accepted.');
    }
    if (acceptedFiles.length > 0) {
      // Filter out files that exceed size limit
      const validFiles = [];
      const oversizedFiles = [];

      acceptedFiles.forEach((file) => {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          oversizedFiles.push(file.name);
        } else {
          validFiles.push(file);
        }
      });

      if (oversizedFiles.length > 0) {
        toast.error(`Files exceed ${MAX_FILE_SIZE_MB}MB limit: ${oversizedFiles.join(', ')}`);
      }

      if (validFiles.length > 0) {
        setFiles((prev) => [...prev, ...validFiles]);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    multiple: true,
  });

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getFileDuration = (file) => new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please add at least one video clip.');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      toast.loading('Creating project...', { id: 'upload' });
      const { data: project } = await createProject();
      const projectId = project.id;

      toast.loading('Preparing clips...', { id: 'upload' });

      const durations = await Promise.all(files.map(getFileDuration));
      const hasAnyDuration = durations.some((d) => d > 0);
      if (!hasAnyDuration) {
        console.warn('Could not read any clip durations on client; server will estimate.');
      }

      toast.loading('Uploading clips...', { id: 'upload' });

      // Simulate progress while uploading
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 400);

      const { data: clips } = await uploadClips(projectId, files, durations);

      clearInterval(progressInterval);
      setProgress(100);

      toast.success('Upload complete!', { id: 'upload' });

      // Fire-and-forget: Start pre-analysis in background while user fills out brief
      // This extracts frames, transcribes audio, and computes cut density
      startPreAnalysis(projectId).catch((err) => {
        console.warn('Pre-analysis failed to start:', err);
        // Don't show error to user - this is optional optimization
      });

      setTimeout(() => {
        onComplete(project, clips);
      }, 500);
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error(err?.response?.data?.detail || 'Upload failed. Please try again.', {
        id: 'upload',
      });
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>ScoreFlow</h1>
        <p style={styles.subtitle}>AI-powered music scoring for your video</p>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          style={{
            ...styles.dropzone,
            borderColor: isDragActive ? '#45f5c5' : 'rgba(255,255,255,0.08)',
            background: isDragActive ? 'rgba(69,245,197,0.06)' : '#13151a',
          }}
        >
          <input {...getInputProps()} />
          <div style={styles.dropContent}>
            <div style={styles.dropIcon}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path
                  d="M24 32V16M24 16L18 22M24 16L30 22"
                  stroke={isDragActive ? '#45f5c5' : 'rgba(255,255,255,0.4)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 33V36C8 38.2091 9.79086 40 12 40H36C38.2091 40 40 38.2091 40 36V33"
                  stroke={isDragActive ? '#45f5c5' : 'rgba(255,255,255,0.4)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p style={styles.dropText}>
              {isDragActive ? 'Drop your clips here' : 'Drop your video clips here'}
            </p>
            <p style={styles.dropHint}>MP4, MOV, WebM accepted • Max {MAX_FILE_SIZE_MB}MB per file</p>
          </div>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div style={styles.fileList}>
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} style={styles.fileItem}>
                <div style={styles.fileInfo}>
                  <span style={styles.fileName}>{file.name}</span>
                  <span style={styles.fileSize}>{formatSize(file.size)}</span>
                </div>
                {!uploading && (
                  <button
                    style={styles.removeBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div style={styles.progressWrapper}>
            <div style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressBar,
                  width: `${progress}%`,
                }}
              />
            </div>
            <span style={styles.progressLabel}>{progress}%</span>
          </div>
        )}

        {/* Upload button */}
        {files.length > 0 && !uploading && (
          <button style={styles.uploadBtn} onClick={handleUpload}>
            Upload & Continue
          </button>
        )}

        {/* URL paste field (disabled) */}
        <div style={styles.urlSection}>
          <div style={styles.dividerRow}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <div style={styles.dividerLine} />
          </div>
          <div style={styles.urlFieldWrapper} title="Coming soon">
            <input
              type="text"
              placeholder="Paste YouTube / TikTok URL"
              disabled
              style={styles.urlInput}
            />
            <span style={styles.comingSoonBadge}>Coming soon</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0b0c10',
    fontFamily: "'DM Sans', sans-serif",
    overflowY: 'auto',
  },
  container: {
    width: '100%',
    maxWidth: 520,
    padding: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    animation: 'fadeIn 0.4s ease-out',
  },
  title: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 40,
    fontWeight: 400,
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 36,
    fontWeight: 400,
  },
  dropzone: {
    width: '100%',
    minHeight: 220,
    borderRadius: 16,
    border: '2px dashed rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
  },
  dropContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  dropIcon: {
    marginBottom: 4,
  },
  dropText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 500,
  },
  dropHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  fileList: {
    width: '100%',
    marginTop: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 240,
    overflowY: 'auto',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: '#13151a',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileSize: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: "'IBM Plex Mono', monospace",
    flexShrink: 0,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 16,
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: 4,
    lineHeight: 1,
    transition: 'color 0.2s',
  },
  progressWrapper: {
    width: '100%',
    marginTop: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: '#45f5c5',
    borderRadius: 3,
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: "'IBM Plex Mono', monospace",
    minWidth: 36,
    textAlign: 'right',
  },
  uploadBtn: {
    marginTop: 24,
    padding: '14px 36px',
    background: '#45f5c5',
    color: '#0b0c10',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 0.2s, transform 0.15s',
    fontFamily: "'DM Sans', sans-serif",
  },
  urlSection: {
    width: '100%',
    marginTop: 32,
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'rgba(255,255,255,0.08)',
  },
  dividerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'lowercase',
  },
  urlFieldWrapper: {
    position: 'relative',
    width: '100%',
  },
  urlInput: {
    width: '100%',
    padding: '12px 14px',
    paddingRight: 110,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    color: 'rgba(255,255,255,0.2)',
    fontSize: 14,
    cursor: 'not-allowed',
    fontFamily: "'DM Sans', sans-serif",
  },
  comingSoonBadge: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.06)',
    padding: '4px 10px',
    borderRadius: 6,
    fontWeight: 500,
    letterSpacing: '0.02em',
  },
};
