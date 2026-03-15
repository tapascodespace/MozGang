import { useRef } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight, Upload, MessageSquareText, Music, Sparkles, ChevronDown,
  Layers, RefreshCw, Headphones, SlidersHorizontal, Video,
  Brain, AudioWaveform, Film, Scissors
} from 'lucide-react';
import { Spotlight } from '@/components/ui/spotlight';
import { Boxes } from '@/components/ui/background-boxes';
import { TextShimmer } from '@/components/ui/text-shimmer';

// --- Scroll-reveal wrapper ---
function Reveal({ children, style, className = '', delay = 0 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={{ opacity: 0, y: 32 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.4, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

// --- Waveform logo (high-res) ---
function AmadeusLogo({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="38" width="18" height="72" rx="9" fill="#b87aff" />
      <rect x="38" y="10" width="18" height="100" rx="9" fill="#b87aff" />
      <rect x="66" y="28" width="18" height="82" rx="9" fill="#b87aff" />
      <circle cx="100" cy="38" r="11" fill="#b87aff" />
    </svg>
  );
}

// Centered container
const container = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '0 40px',
  width: '100%',
};

// Section label style
const sectionLabel = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: '#b87aff',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  marginBottom: 16,
};

// Section heading style
const sectionHeading = {
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  color: '#fff',
  fontSize: 'clamp(2rem, 5vw, 3.5rem)',
  fontWeight: 800,
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
  marginBottom: 20,
};


// ════════════════════════════════════════════════════════
// HERO
// ════════════════════════════════════════════════════════
function HeroSection({ onEnter }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      ref={ref}
      style={{
        position: 'relative',
        height: '100vh',
        minHeight: 700,
        width: '100%',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {/* Spotlight */}
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="#b87aff" />

      {/* Subtle boxes grid */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.06, zIndex: 0 }}>
        <Boxes />
      </div>

      {/* Grid pattern overlay */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(rgba(184,122,255,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at 50% 0%, black 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 30%, transparent 70%)',
        }}
      />

      {/* Content */}
      <motion.div
        style={{
          ...container,
          position: 'relative', zIndex: 10,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          height: '100%', textAlign: 'center',
          opacity,
        }}
      >
        {/* Orbital logo emblem */}
        <motion.div
          style={{ position: 'relative', width: 160, height: 160, marginBottom: 32 }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: [0.25, 0.4, 0.25, 1] }}
        >
          {/* Outer orbiting ring */}
          <motion.div
            style={{
              position: 'absolute', inset: -12, borderRadius: '50%',
              border: '1px solid rgba(184,122,255,0.12)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          >
            <div style={{
              position: 'absolute', top: -3, left: '50%', marginLeft: -3,
              width: 6, height: 6, borderRadius: '50%',
              background: '#b87aff', boxShadow: '0 0 12px #b87aff',
            }} />
          </motion.div>

          {/* Middle pulsing ring */}
          <motion.div
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '1.5px solid rgba(184,122,255,0.25)',
            }}
            animate={{
              scale: [1, 1.06, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Inner ring */}
          <motion.div
            style={{
              position: 'absolute', inset: 16, borderRadius: '50%',
              border: '1px solid rgba(184,122,255,0.15)',
            }}
            animate={{ rotate: -360 }}
            transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          >
            <div style={{
              position: 'absolute', bottom: -2, left: '50%', marginLeft: -2,
              width: 4, height: 4, borderRadius: '50%',
              background: 'rgba(184,122,255,0.6)', boxShadow: '0 0 8px rgba(184,122,255,0.4)',
            }} />
          </motion.div>

          {/* Center glow */}
          <motion.div
            style={{
              position: 'absolute', inset: 30, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(184,122,255,0.08) 0%, transparent 70%)',
            }}
            animate={{
              boxShadow: [
                '0 0 30px rgba(184,122,255,0.1)',
                '0 0 60px rgba(184,122,255,0.25)',
                '0 0 30px rgba(184,122,255,0.1)',
              ],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Logo centered */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AmadeusLogo size={52} />
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 'clamp(3.5rem, 10vw, 9rem)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 0.95,
            color: '#b87aff',
            textShadow: '0 0 100px rgba(184,122,255,0.3)',
            marginBottom: 20,
          }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          Amadeus
        </motion.h1>

        {/* Tagline */}
        <motion.div
          style={{ marginBottom: 48 }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <TextShimmer
            as="p"
            duration={3}
            spread={3}
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)',
              maxWidth: 460,
              lineHeight: 1.5,
            }}
          >
            Your video deserves a soundtrack
          </TextShimmer>
        </motion.div>

        {/* CTA */}
        <motion.button
          onClick={onEnter}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '14px 36px', borderRadius: 999, fontSize: 15, fontWeight: 600,
            background: 'linear-gradient(135deg, #b87aff, #9333ea)',
            color: '#fff', border: 'none', cursor: 'pointer',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            boxShadow: '0 0 40px rgba(184,122,255,0.3)',
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          whileHover={{ scale: 1.05, boxShadow: '0 0 60px rgba(184,122,255,0.5)' }}
          whileTap={{ scale: 0.97 }}
        >
          Get Started
          <motion.span
            style={{ display: 'inline-flex' }}
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ArrowRight size={16} />
          </motion.span>
        </motion.button>

        {/* Scroll hint */}
        <motion.div
          style={{
            position: 'absolute', bottom: 32, display: 'flex',
            flexDirection: 'column', alignItems: 'center', gap: 8,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.35 }}
          transition={{ delay: 1.8 }}
        >
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Scroll to explore
          </span>
          <motion.div
            animate={{ y: [0, 5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown size={14} color="rgba(255,255,255,0.25)" />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}

// ════════════════════════════════════════════════════════
// HOW IT WORKS
// ════════════════════════════════════════════════════════
const steps = [
  { num: '01', icon: Upload, title: 'Import', desc: 'Drop your video clips onto the canvas. We support MP4, MOV, and WebM up to 50 MB each.' },
  { num: '02', icon: MessageSquareText, title: 'Describe', desc: 'Tell us the energy and vibe you want. Our AI analyzes scenes, pacing, and emotional tone.' },
  { num: '03', icon: Music, title: 'Score', desc: 'Unique music is generated for each section. Refine with natural language feedback until perfect.' },
];

function HowItWorks() {
  return (
    <section style={{ background: '#050507', padding: '140px 0' }}>
      <div style={container}>
        <div style={{ textAlign: 'center', marginBottom: 80 }}>
          <Reveal><p style={sectionLabel}>How it works</p></Reveal>
          <Reveal delay={0.1}>
            <h2 style={sectionHeading}>
              Three steps to your<br />
              <span style={{ color: '#b87aff' }}>perfect soundtrack</span>
            </h2>
          </Reveal>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 48 }}>
          {steps.map((step, i) => (
            <Reveal key={step.num} delay={0.1 + i * 0.12}>
              <div style={{ textAlign: 'center' }}>
                {/* Large faded number */}
                <div style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 72, fontWeight: 700,
                  color: 'rgba(184,122,255,0.08)',
                  lineHeight: 1, marginBottom: -8,
                }}>
                  {step.num}
                </div>

                {/* Icon */}
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'rgba(184,122,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px',
                }}>
                  <step.icon size={22} color="#b87aff" />
                </div>

                {/* Title */}
                <h3 style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 20, fontWeight: 600, color: '#fff', marginBottom: 10,
                }}>
                  {step.title}
                </h3>

                {/* Desc */}
                <p style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 14, color: 'rgba(255,255,255,0.4)',
                  lineHeight: 1.7, maxWidth: 300, margin: '0 auto',
                }}>
                  {step.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════
// FEATURES — Bento grid
// ════════════════════════════════════════════════════════
const features = [
  { icon: Brain, title: 'Vision Analysis', desc: 'AI reads every frame for tone, pacing, and story.' },
  { icon: AudioWaveform, title: 'Music Generation', desc: 'Unique tracks shaped to each section\'s energy.' },
  { icon: Scissors, title: 'Section Editing', desc: 'Merge, split, resize with millisecond precision.' },
  { icon: RefreshCw, title: 'Refinement', desc: 'Describe changes in plain English. Regenerate.' },
  { icon: Layers, title: 'Multi-Section', desc: 'Hook, Build, Climax — each scored independently.' },
  { icon: Film, title: 'Synced Preview', desc: 'Watch video with generated music in real-time.' },
];

function Features() {
  return (
    <section style={{ background: '#000', padding: '120px 0' }}>
      <div style={container}>
        <Reveal>
          <h2 style={{
            ...sectionHeading,
            textAlign: 'center',
            marginBottom: 60,
          }}>
            Built for <span style={{ color: '#b87aff' }}>creators</span>
          </h2>
        </Reveal>

        {/* Top row: 3 columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 16,
          overflow: 'hidden',
          marginBottom: 1,
        }}>
          {features.slice(0, 3).map((feat, i) => (
            <Reveal key={feat.title} delay={0.06 * i}>
              <motion.div
                style={{
                  background: '#0a0a0a',
                  padding: '40px 32px',
                  cursor: 'default',
                  height: '100%',
                }}
                whileHover={{ background: 'rgba(184,122,255,0.04)' }}
              >
                <feat.icon size={22} color="#b87aff" style={{ marginBottom: 18 }} />
                <h3 style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 17, fontWeight: 700, color: '#fff',
                  letterSpacing: '-0.01em', marginBottom: 8,
                }}>
                  {feat.title}
                </h3>
                <p style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 14, color: 'rgba(255,255,255,0.4)',
                  lineHeight: 1.5,
                }}>
                  {feat.desc}
                </p>
              </motion.div>
            </Reveal>
          ))}
        </div>

        {/* Bottom row: 3 columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          {features.slice(3, 6).map((feat, i) => (
            <Reveal key={feat.title} delay={0.06 * (i + 3)}>
              <motion.div
                style={{
                  background: '#0a0a0a',
                  padding: '40px 32px',
                  cursor: 'default',
                  height: '100%',
                }}
                whileHover={{ background: 'rgba(184,122,255,0.04)' }}
              >
                <feat.icon size={22} color="#b87aff" style={{ marginBottom: 18 }} />
                <h3 style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 17, fontWeight: 700, color: '#fff',
                  letterSpacing: '-0.01em', marginBottom: 8,
                }}>
                  {feat.title}
                </h3>
                <p style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 14, color: 'rgba(255,255,255,0.4)',
                  lineHeight: 1.5,
                }}>
                  {feat.desc}
                </p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════
// PIPELINE
// ════════════════════════════════════════════════════════
const pipeline = [
  { icon: Video, label: 'Upload Video', sub: 'MP4 / MOV / WebM' },
  { icon: Brain, label: 'Frame Analysis', sub: 'FFmpeg + GPT-4o' },
  { icon: SlidersHorizontal, label: 'Section Detection', sub: 'Scene, mood, pacing' },
  { icon: AudioWaveform, label: 'Music Gen', sub: 'ElevenLabs API' },
  { icon: Headphones, label: 'Preview', sub: 'Real-time sync' },
  { icon: Sparkles, label: 'Export', sub: 'Final video' },
];

function Pipeline() {
  return (
    <section style={{ background: '#050507', padding: '140px 0', position: 'relative', overflow: 'hidden' }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 600, height: 600, pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(184,122,255,0.04) 0%, transparent 70%)',
      }} />

      <div style={{ ...container, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 80 }}>
          <Reveal><p style={sectionLabel}>The Pipeline</p></Reveal>
          <Reveal delay={0.1}>
            <h2 style={sectionHeading}>
              From raw footage to<br />
              <span style={{ color: '#b87aff' }}>finished score</span>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 16, color: 'rgba(255,255,255,0.35)',
              maxWidth: 480, margin: '0 auto', lineHeight: 1.7,
            }}>
              Our AI pipeline processes your video end-to-end, analyzing
              every frame to compose music that tells your story.
            </p>
          </Reveal>
        </div>

        {/* Pipeline steps */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 12,
          position: 'relative',
        }}>
          {pipeline.map((step, i) => (
            <Reveal key={step.label} delay={0.08 * i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <motion.div
                  style={{
                    width: 60, height: 60, borderRadius: 16,
                    background: 'rgba(184,122,255,0.07)',
                    border: '1px solid rgba(184,122,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14, position: 'relative',
                  }}
                  whileHover={{ background: 'rgba(184,122,255,0.14)', scale: 1.08 }}
                >
                  <step.icon size={22} color="#b87aff" />
                  <span style={{
                    position: 'absolute', top: -8, right: -8,
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#b87aff', color: '#000',
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    {i + 1}
                  </span>
                </motion.div>
                <h4 style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4,
                }}>
                  {step.label}
                </h4>
                <p style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 11, color: 'rgba(255,255,255,0.28)',
                }}>
                  {step.sub}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Connecting line */}
        <Reveal delay={0.5}>
          <div style={{
            marginTop: -52,
            marginLeft: 50, marginRight: 50,
            height: 1,
            background: 'linear-gradient(to right, transparent, rgba(184,122,255,0.15) 15%, rgba(184,122,255,0.15) 85%, transparent)',
          }} />
        </Reveal>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════
// SECTION TYPES
// ════════════════════════════════════════════════════════
const sectionTypes = [
  { name: 'Hook', color: '#FF6B6B', desc: 'Grab attention in the first seconds' },
  { name: 'Build', color: '#F5A623', desc: 'Rising tension and anticipation' },
  { name: 'Climax', color: '#C0392B', desc: 'Peak emotional intensity' },
  { name: 'Montage', color: '#9B59B6', desc: 'Rapid-fire visual sequences' },
  { name: 'Cooldown', color: '#1ABC9C', desc: 'Breathing room after intensity' },
  { name: 'Outro', color: '#9013FE', desc: 'Clean, satisfying close' },
];

const tones = ['Energetic', 'Suspenseful', 'Calm', 'Dramatic', 'Playful', 'Epic', 'Nostalgic', 'Mysterious'];

function SectionTypes() {
  return (
    <section style={{ background: '#000', padding: '140px 0' }}>
      <div style={container}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 80, alignItems: 'center',
        }}>
          {/* Left */}
          <div>
            <Reveal><p style={sectionLabel}>Intelligent Scoring</p></Reveal>
            <Reveal delay={0.1}>
              <h2 style={{ ...sectionHeading, fontSize: 'clamp(1.8rem, 4vw, 3rem)' }}>
                Music that matches<br />
                <span style={{ color: '#b87aff' }}>every moment</span>
              </h2>
            </Reveal>
            <Reveal delay={0.15}>
              <p style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 15, color: 'rgba(255,255,255,0.38)',
                lineHeight: 1.8, marginBottom: 28,
              }}>
                amadeus identifies 16 distinct section types and 30 emotional tones.
                Each section gets scored with music that matches its exact energy —
                from the adrenaline of a Hook to the calm resolution of an Outro.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tones.map((tone) => (
                  <span key={tone} style={{
                    fontSize: 12, padding: '5px 14px', borderRadius: 999,
                    background: 'rgba(184,122,255,0.07)',
                    color: 'rgba(184,122,255,0.65)',
                    border: '1px solid rgba(184,122,255,0.1)',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    {tone}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Right — cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {sectionTypes.map((sec, i) => (
              <Reveal key={sec.name} delay={0.06 * i}>
                <motion.div
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 16,
                    padding: 20,
                    transition: 'all 0.3s ease',
                  }}
                  whileHover={{
                    background: `rgba(${parseInt(sec.color.slice(1,3),16)},${parseInt(sec.color.slice(3,5),16)},${parseInt(sec.color.slice(5,7),16)},0.06)`,
                    borderColor: `${sec.color}30`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: sec.color,
                      boxShadow: `0 0 8px ${sec.color}40`,
                    }} />
                    <span style={{
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontSize: 14, fontWeight: 600, color: '#fff',
                    }}>
                      {sec.name}
                    </span>
                  </div>
                  <p style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 12, color: 'rgba(255,255,255,0.32)',
                    lineHeight: 1.5,
                  }}>
                    {sec.desc}
                  </p>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════
// CTA FOOTER
// ════════════════════════════════════════════════════════
function CTAFooter({ onEnter }) {
  return (
    <section style={{ background: '#050507', padding: '140px 0 80px', position: 'relative', overflow: 'hidden' }}>
      {/* Bottom glow */}
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: 800, height: 400, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 100%, rgba(184,122,255,0.06) 0%, transparent 70%)',
      }} />

      <div style={{ ...container, textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <Reveal>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <AmadeusLogo size={40} />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 style={{ ...sectionHeading, fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
            Ready to score<br />
            <span style={{ color: '#b87aff' }}>your video?</span>
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 16, color: 'rgba(255,255,255,0.35)',
            marginBottom: 36, maxWidth: 440, margin: '0 auto 36px',
            lineHeight: 1.7,
          }}>
            Upload your clips, describe your vision, and let amadeus
            compose the perfect soundtrack.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <motion.button
            onClick={onEnter}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '14px 40px', borderRadius: 999, fontSize: 15, fontWeight: 600,
              background: 'linear-gradient(135deg, #b87aff, #9333ea)',
              color: '#fff', border: 'none', cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              boxShadow: '0 0 40px rgba(184,122,255,0.25)',
            }}
            whileHover={{ scale: 1.05, boxShadow: '0 0 60px rgba(184,122,255,0.45)' }}
            whileTap={{ scale: 0.97 }}
          >
            Start Creating
            <ArrowRight size={16} />
          </motion.button>
        </Reveal>

        {/* Footer */}
        <Reveal delay={0.3}>
          <div style={{
            marginTop: 80, paddingTop: 32,
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 13, color: 'rgba(184,122,255,0.45)',
            }}>
              Team MozartWolfgang
            </p>
            <p style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 12, color: 'rgba(255,255,255,0.18)',
            }}>
              Built with GPT-4o Vision &middot; ElevenLabs &middot; FastAPI &middot; React
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════
export default function LandingPage({ onEnter }) {
  return (
    <div style={{ background: '#000' }}>
      <HeroSection onEnter={onEnter} />
      <HowItWorks />
      <Features />
      <Pipeline />
      <SectionTypes />
      <CTAFooter onEnter={onEnter} />
    </div>
  );
}
