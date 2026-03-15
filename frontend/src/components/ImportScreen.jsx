import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Film, Link } from 'lucide-react';
import toast from 'react-hot-toast';
import { createProject, uploadClips } from '../services/api';

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

// Stagger animation variants
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const fadeSlideUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

const fileCardVariants = {
  initial: { opacity: 0, x: -40 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    x: 60,
    transition: { duration: 0.25, ease: [0.55, 0, 1, 0.45] },
  },
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
      {/* Floating gradient orb */}
      <motion.div
        style={styles.gradientOrb}
        animate={{
          x: [0, 30, -20, 10, 0],
          y: [0, -25, 15, -10, 0],
          scale: [1, 1.1, 0.95, 1.05, 1],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        style={styles.gradientOrbSecondary}
        animate={{
          x: [0, -20, 25, -15, 0],
          y: [0, 20, -30, 10, 0],
          scale: [1, 0.95, 1.1, 1.0, 1],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        style={styles.container}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Title */}
        <motion.h1 style={styles.title} variants={fadeSlideUp}>
          amadeus
        </motion.h1>

        {/* Subtitle */}
        <motion.p style={styles.subtitle} variants={fadeSlideUp}>
          Import your video clips to get started
        </motion.p>

        {/* Drop zone */}
        <motion.div
          variants={fadeSlideUp}
          whileHover={{ scale: 1.015 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          style={{ width: '100%' }}
        >
          <motion.div
            {...getRootProps()}
            style={{
              ...styles.dropzone,
              borderColor: isDragActive ? '#b87aff' : 'rgba(255,255,255,0.08)',
              background: isDragActive ? 'rgba(184,122,255,0.06)' : '#13151a',
            }}
            animate={
              isDragActive
                ? {
                    boxShadow: [
                      '0 0 0px rgba(184,122,255,0)',
                      '0 0 30px rgba(184,122,255,0.25)',
                      '0 0 0px rgba(184,122,255,0)',
                    ],
                  }
                : { boxShadow: '0 0 0px rgba(184,122,255,0)' }
            }
            transition={
              isDragActive
                ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.3 }
            }
          >
            <input {...getInputProps()} />
            <div style={styles.dropContent}>
              <div style={styles.dropIcon}>
                <Upload
                  size={48}
                  strokeWidth={1.5}
                  color={isDragActive ? '#b87aff' : 'rgba(255,255,255,0.4)'}
                />
              </div>
              <p style={styles.dropText}>
                {isDragActive ? 'Drop your clips here' : 'Drop your video clips here'}
              </p>
              <p style={styles.dropHint}>MP4, MOV, WebM accepted &bull; Max {MAX_FILE_SIZE_MB}MB per file</p>
            </div>
          </motion.div>
        </motion.div>

        {/* File list */}
        <AnimatePresence mode="popLayout">
          {files.length > 0 && (
            <motion.div
              style={styles.fileList}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <AnimatePresence mode="popLayout">
                {files.map((file, index) => (
                  <motion.div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    layoutId={`${file.name}-${file.size}-${file.lastModified}`}
                    variants={fileCardVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    layout
                    style={styles.fileItem}
                  >
                    <div style={styles.fileInfo}>
                      <Film
                        size={16}
                        color="rgba(255,255,255,0.4)"
                        style={{ flexShrink: 0 }}
                      />
                      <span style={styles.fileName}>{file.name}</span>
                      <span style={styles.fileSize}>{formatSize(file.size)}</span>
                    </div>
                    {!uploading && (
                      <motion.button
                        style={styles.removeBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(index);
                        }}
                        whileHover={{ color: '#ff5f5f', scale: 1.15 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <X size={16} />
                      </motion.button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload progress */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              style={styles.progressWrapper}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div style={styles.progressTrack}>
                <motion.div
                  style={styles.progressBar}
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <span style={styles.progressLabel}>{progress}%</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload button */}
        <AnimatePresence>
          {files.length > 0 && !uploading && (
            <motion.button
              style={styles.uploadBtn}
              onClick={handleUpload}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              Upload &amp; Continue
            </motion.button>
          )}
        </AnimatePresence>

        {/* URL paste field (disabled) */}
        <motion.div style={styles.urlSection} variants={fadeSlideUp}>
          <div style={styles.dividerRow}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <div style={styles.dividerLine} />
          </div>
          <div style={styles.urlFieldWrapper} title="Coming soon">
            <Link
              size={16}
              color="rgba(255,255,255,0.2)"
              style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}
            />
            <input
              type="text"
              placeholder="Paste YouTube / TikTok URL"
              disabled
              style={styles.urlInput}
            />
            <span style={styles.comingSoonBadge}>Coming soon</span>
          </div>
        </motion.div>
      </motion.div>
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
    position: 'relative',
    overflow: 'hidden',
  },
  gradientOrb: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(184,122,255,0.08) 0%, rgba(184,122,255,0) 70%)',
    top: '-10%',
    left: '-5%',
    pointerEvents: 'none',
    filter: 'blur(40px)',
  },
  gradientOrbSecondary: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(147,51,234,0.06) 0%, rgba(147,51,234,0) 70%)',
    bottom: '-10%',
    right: '-5%',
    pointerEvents: 'none',
    filter: 'blur(40px)',
  },
  container: {
    width: '100%',
    maxWidth: 520,
    padding: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  title: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 44,
    fontWeight: 400,
    color: '#b87aff',
    marginBottom: 8,
    letterSpacing: '-0.03em',
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
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
    transition: 'border-color 0.25s ease, background 0.25s ease',
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
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: 4,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    background: 'linear-gradient(90deg, #b87aff, #9333ea)',
    borderRadius: 3,
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
    background: 'linear-gradient(135deg, #b87aff, #9333ea)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: '0 0 30px rgba(184,122,255,0.25)',
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
    paddingLeft: 40,
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
