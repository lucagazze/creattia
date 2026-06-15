import React, { useState, useEffect } from 'react';

interface Props {
  loading: boolean;
  color?: string;
  inline?: boolean; // true = inside a section (absolute), false = top of page (fixed)
  namespace?: string;
}

const getProgressForTime = (startTime: number) => {
  const elapsed = Date.now() - startTime;
  const fastPhaseDuration = 700; // 700ms for constant-speed progress 0% -> 75%
  
  if (elapsed < fastPhaseDuration) {
    const currentProgress = Math.round((elapsed / fastPhaseDuration) * 75);
    const remainingTime = fastPhaseDuration - elapsed;
    return {
      startVal: currentProgress,
      targetVal: 75,
      transition: `width ${remainingTime}ms linear`,
      remainingTime,
    };
  } else {
    const elapsedSince75 = elapsed - fastPhaseDuration;
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

export const TopLoadingBar: React.FC<Props> = ({ loading, color = '#8b5cf6', inline = false, namespace }) => {
  const [visible, setVisible] = useState(() => loading);
  
  const startTimeKey = namespace ? `__loadingStartTime_${namespace}` : '__loadingStartTime';

  const [progress, setProgress] = useState(() => {
    if (!loading) return 0;
    const startTime = (window as any)[startTimeKey] || 0;
    if (Date.now() - startTime < 5000 && startTime > 0) {
      return getProgressForTime(startTime).startVal;
    }
    return 0;
  });

  const [transitionStyle, setTransitionStyle] = useState('none');
  const timeoutsRef = React.useRef<{ t1?: any; t2?: any; t3?: any }>({});

  useEffect(() => {
    return () => {
      clearTimeout(timeoutsRef.current.t1);
      clearTimeout(timeoutsRef.current.t2);
      clearTimeout(timeoutsRef.current.t3);
    };
  }, []);

  useEffect(() => {
    if (loading) {
      clearTimeout(timeoutsRef.current.t1);
      clearTimeout(timeoutsRef.current.t2);
      clearTimeout(timeoutsRef.current.t3);

      setVisible(true);

      // Initialize or get start time
      let startTime = (window as any)[startTimeKey] || 0;
      if (Date.now() - startTime >= 5000 || startTime === 0) {
        startTime = Date.now();
        (window as any)[startTimeKey] = startTime;
      }

      const { startVal, targetVal, transition, remainingTime } = getProgressForTime(startTime);
      setProgress(startVal);
      setTransitionStyle('none');

      // Next frame to trigger transition
      timeoutsRef.current.t1 = setTimeout(() => {
        setTransitionStyle(transition);
        setProgress(targetVal);
      }, 30);

      // If we are in the fast linear phase, schedule the slow creep phase
      if (targetVal === 75) {
        timeoutsRef.current.t2 = setTimeout(() => {
          setTransitionStyle('width 15s cubic-bezier(0.1, 0.6, 0.1, 1)');
          setProgress(95);
        }, remainingTime + 30);
      }

    } else if (visible) {
      // Finished loading
      const startTime = (window as any)[startTimeKey] || 0;
      const elapsed = startTime > 0 ? Date.now() - startTime : 9999;
      const fastPhaseDuration = 700;

      clearTimeout(timeoutsRef.current.t2);

      if (elapsed < fastPhaseDuration) {
        // Enforce the 1.5s constant progress before zooming to 100%
        const delay = fastPhaseDuration - elapsed;
        clearTimeout(timeoutsRef.current.t3);
        timeoutsRef.current.t3 = setTimeout(() => {
          setTransitionStyle('width 0.25s ease-out');
          setProgress(100);
          timeoutsRef.current.t2 = setTimeout(() => {
            setVisible(false);
            setProgress(0);
            setTransitionStyle('none');
            delete (window as any)[startTimeKey];
          }, 300);
        }, delay);
      } else {
        setTransitionStyle('width 0.25s ease-out');
        setProgress(100);
        clearTimeout(timeoutsRef.current.t3);
        timeoutsRef.current.t3 = setTimeout(() => {
          setVisible(false);
          setProgress(0);
          setTransitionStyle('none');
          delete (window as any)[startTimeKey];
        }, 300);
      }
    }
  }, [loading, visible, startTimeKey]);

  if (!visible) return null;

  const positionClass = inline
    ? 'absolute top-0 left-0 right-0 z-10'
    : 'fixed top-0 left-0 right-0 z-[9999]';

  return (
    <div className={`${positionClass} h-[3.5px] bg-transparent pointer-events-none overflow-hidden`}>
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
