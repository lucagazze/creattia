import React, { useState, useEffect } from 'react';

interface Props {
  loading: boolean;
  color?: string;
  inline?: boolean; // true = inside a section (absolute), false = top of page (fixed)
}

const getProgressForTime = (startTime: number) => {
  const elapsed = Date.now() - startTime;
  if (elapsed < 500) {
    const currentProgress = Math.round((elapsed / 500) * 75);
    const remainingTime = 500 - elapsed;
    return {
      startVal: currentProgress,
      targetVal: 75,
      transition: `width ${remainingTime}ms linear`,
      remainingTime,
    };
  } else {
    const elapsedSince75 = elapsed - 500;
    const currentProgress = Math.min(95, Math.round(75 + (elapsedSince75 / 15000) * 20));
    const remainingTime = Math.max(100, 15000 - elapsedSince75);
    return {
      startVal: currentProgress,
      targetVal: 95,
      transition: `width ${remainingTime}ms cubic-bezier(0.1, 0.6, 0.1, 1)`,
      remainingTime,
    };
  }
};

export const TopLoadingBar: React.FC<Props> = ({ loading, color = '#8b5cf6', inline = false }) => {
  const [visible, setVisible] = useState(() => loading);
  
  const [progress, setProgress] = useState(() => {
    if (!loading) return 0;
    const startTime = (window as any).__loadingStartTime || 0;
    if (Date.now() - startTime < 5000 && startTime > 0) {
      return getProgressForTime(startTime).startVal;
    }
    return 0;
  });

  const [transitionStyle, setTransitionStyle] = useState('none');

  useEffect(() => {
    let t1: any;
    let t2: any;
    let t3: any;

    if (loading) {
      setVisible(true);

      // Initialize or get start time
      let startTime = (window as any).__loadingStartTime || 0;
      if (Date.now() - startTime >= 5000 || startTime === 0) {
        startTime = Date.now();
        (window as any).__loadingStartTime = startTime;
      }

      const { startVal, targetVal, transition, remainingTime } = getProgressForTime(startTime);
      setProgress(startVal);
      setTransitionStyle('none');

      // Next frame to trigger transition
      t1 = setTimeout(() => {
        setTransitionStyle(transition);
        setProgress(targetVal);
      }, 30);

      // If we are in the fast linear phase, schedule the slow creep phase
      if (targetVal === 75) {
        t2 = setTimeout(() => {
          setTransitionStyle('width 15s cubic-bezier(0.1, 0.6, 0.1, 1)');
          setProgress(95);
        }, remainingTime + 30);
      }

    } else if (visible) {
      // Finished loading
      setTransitionStyle('width 0.25s ease-out');
      setProgress(100);

      t3 = setTimeout(() => {
        setVisible(false);
        setProgress(0);
        setTransitionStyle('none');
        delete (window as any).__loadingStartTime;
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
