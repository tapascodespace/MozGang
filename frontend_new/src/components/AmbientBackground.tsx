import { motion } from "framer-motion";
import { useMemo } from "react";

export default function AmbientBackground() {
  const bars = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      width: Math.random() * 2 + 0.5,
      height: Math.random() * 8 + 3,
      duration: Math.random() * 12 + 10,
      delay: Math.random() * -20,
      opacity: Math.random() * 0.04 + 0.01,
    }));
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {bars.map((bar) => (
        <motion.div
          key={bar.id}
          className="absolute rounded-full bg-primary"
          style={{
            left: `${bar.x}%`,
            top: `${bar.y}%`,
            width: `${bar.width}vw`,
            height: `${bar.height}vh`,
            opacity: bar.opacity,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, 15, 0],
            opacity: [bar.opacity, bar.opacity * 1.5, bar.opacity],
          }}
          transition={{
            duration: bar.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: bar.delay,
          }}
        />
      ))}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsl(271 70% 68% / 0.04) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
