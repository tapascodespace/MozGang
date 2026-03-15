import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { uploadClips } from '../services/api';

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

export default function AddClipsModal({ projectId, onClose, onComplete }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      toast.error('Only MP4, MOV, and WebM files are accepted.');
    }
    if (acceptedFiles.length > 0) {
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
      toast.loading('Preparing clips...', { id: 'add-clips' });

      const durations = await Promise.all(files.map(getFileDuration));

      toast.loading('Uploading clips...', { id: 'add-clips' });

      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 400);

      const { data: newClips } = await uploadClips(projectId, files, durations);

      clearInterval(progressInterval);
      setProgress(100);

      toast.success(`Added ${newClips.length} clip${newClips.length > 1 ? 's' : ''}!`, { id: 'add-clips' });

      setTimeout(() => {
        onComplete(newClips);
      }, 300);
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error(err?.response?.data?.detail || 'Upload failed. Please try again.', {
        id: 'add-clips',
      });
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Add More Clips</h2>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          style={{
            ...styles.dropzone,
            borderColor: isDragActive ? '#45f5c5' : 'rgba(255,255,255,0.08)',
            background: isDragActive ? 'rgba(69,245,197,0.06)' : '#0b0c10',
          }}
        >
          <input {...getInputProps()} />
          <div style={styles.dropContent}>
            <div style={styles.dropIcon}>
              <svg width="36" height="36" viewBox="0 0 48 48" fill="none">
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
              {isDragActive ? 'Drop your clips here' : 'Drop video clips here'}
            </p>
            <p style={styles.dropHint}>MP4, MOV, WebM accepted</p>
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
                    onClick={() => removeFile(index)}
                  >
                    &times;
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

        {/* Actions */}
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button
            style={{
              ...styles.uploadBtn,
              opacity: files.length === 0 || uploading ? 0.5 : 1,
              cursor: files.length === 0 || uploading ? 'not-allowed' : 'pointer',
            }}
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
          >
            {uploading ? 'Uploading...' : `Add ${files.length || ''} Clip${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: "'DM Sans', sans-serif",
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    background: '#13151a',
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: 24,
    animation: 'fadeIn 0.2s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    color: '#ffffff',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 24,
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  dropzone: {
    minHeight: 140,
    borderRadius: 12,
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
    gap: 8,
  },
  dropIcon: {
    marginBottom: 4,
  },
  dropText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 500,
    margin: 0,
  },
  dropHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    margin: 0,
  },
  fileList: {
    marginTop: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 150,
    overflowY: 'auto',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: '#0b0c10',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: 1,
  },
  fileName: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileSize: {
    fontSize: 11,
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
    padding: '2px 6px',
    lineHeight: 1,
  },
  progressWrapper: {
    marginTop: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 5,
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
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: "'IBM Plex Mono', monospace",
    minWidth: 32,
    textAlign: 'right',
  },
  actions: {
    marginTop: 20,
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  uploadBtn: {
    padding: '10px 24px',
    background: '#45f5c5',
    color: '#0b0c10',
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
};
