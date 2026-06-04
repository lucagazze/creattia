import React, { useState, useEffect } from 'react';

interface Props {
  loading: boolean;
  color?: string;
  inline?: boolean; // true = inside a section (absolute), false = top of page (fixed)
}

export const TopLoadingBar: React.FC<Props> = ({ loading, color = '#8b5cf6', inline = false }) => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [transitionStyle, setTransitionStyle] = useState('none');

  useEffect(() => {
    let t1: any;
    let t2: any;
    let t3: any;

    if (loading) {
      setVisible(true);
      setProgress(0);
      setTransitionStyle('none');

      // Next frame to trigger transition from 0 to 75
      t1 = setTimeout(() => {
        setTransitionStyle('width 0.5s linear');
        setProgress(75);
      }, 30);

      // After 530ms (30ms delay + 500ms transition), if still loading, slow down progress to 95%
      t2 = setTimeout(() => {
        setTransitionStyle('width 15s cubic-bezier(0.1, 0.6, 0.1, 1)');
        setProgress(95);
      }, 530);

    } else if (visible) {
      // Finished loading
      setTransitionStyle('width 0.25s ease-out');
      setProgress(100);

      t3 = setTimeout(() => {
        setVisible(false);
        setProgress(0);
        setTransitionStyle('none');
      }, 300);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [loading, visible]);

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
          transition: transitionStyle === 'none' ? 'none' : `${transitionStyle}, opacity 0.25s ease-out 0.05s`,
        }}
      />
    </div>
  );
};
