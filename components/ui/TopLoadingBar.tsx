import React, { useState, useEffect } from 'react';

interface Props {
  loading: boolean;
  color?: string;
  inline?: boolean; // true = inside a section (absolute), false = top of page (fixed)
}

export const TopLoadingBar: React.FC<Props> = ({ loading, color = '#8b5cf6', inline = false }) => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      setProgress(0);
      const start = Date.now();
      const tick = setInterval(() => {
        const elapsed = Date.now() - start;
        const p = elapsed < 400 ? (elapsed / 400) * 30
          : elapsed < 1500 ? 30 + ((elapsed - 400) / 1100) * 30
          : Math.min(85, 60 + ((elapsed - 1500) / 10000) * 25);
        setProgress(p);
      }, 50);
      return () => clearInterval(tick);
    } else if (visible) {
      setProgress(100);
      const t = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [loading]);

  if (!visible) return null;

  const positionClass = inline
    ? 'absolute top-0 left-0 right-0 z-10'
    : 'fixed top-0 left-0 right-0 z-[9999]';

  return (
    <div className={`${positionClass} h-[2.5px] bg-transparent pointer-events-none overflow-hidden`}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${progress}%`,
          background: `linear-gradient(to right, ${color}cc, ${color})`,
          boxShadow: `0 0 6px ${color}60`,
          opacity: progress >= 100 ? 0 : 1,
          transition: progress >= 100
            ? 'width 0.1s ease, opacity 0.3s ease 0.05s'
            : 'width 0.18s ease',
        }}
      />
    </div>
  );
};
