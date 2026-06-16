import React, { useEffect, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface Props {
  isLoading: boolean;
  children: React.ReactNode;
  message?: string;
}

const MESSAGES = [
  'Conectando con tu cuenta...',
  'Cargando datos...',
  'Sincronizando campañas...',
  'Preparando todo para vos...',
  'Casi listo...',
  'Un segundo más...',
  'Optimizando la vista...',
  'Traemos la info más fresca...',
];

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

export const CenteredPageLoader: React.FC<Props> = ({ isLoading, children, message }) => {
  const { darkMode } = useTheme();
  const [phase, setPhase] = useState<'loading' | 'fading' | 'done'>(() => isLoading ? 'loading' : 'done');
  
  const [progress, setProgress] = useState(0);

  const [transitionStyle, setTransitionStyle] = useState('none');
  const [msgIdx, setMsgIdx] = useState(() => Math.floor(Math.random() * MESSAGES.length));
  const [msgVisible, setMsgVisible] = useState(true);
  const timeoutsRef = React.useRef<{ t1?: any; t2?: any; t3?: any }>({});

  useEffect(() => {
    return () => {
      clearTimeout(timeoutsRef.current.t1);
      clearTimeout(timeoutsRef.current.t2);
      clearTimeout(timeoutsRef.current.t3);
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      clearTimeout(timeoutsRef.current.t1);
      clearTimeout(timeoutsRef.current.t2);
      clearTimeout(timeoutsRef.current.t3);

      setPhase('loading');

      // Always start fresh — each new page load resets from 0
      const startTime = Date.now();
      (window as any).__loadingStartTime = startTime;

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

    } else {
      // Finished loading
      const startTime = (window as any).__loadingStartTime || 0;
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
          setPhase('fading');
          timeoutsRef.current.t2 = setTimeout(() => {
            setPhase('done');
            delete (window as any).__loadingStartTime;
          }, 300);
        }, delay);
      } else {
        setTransitionStyle('width 0.25s ease-out');
        setProgress(100);
        setPhase('fading');

        clearTimeout(timeoutsRef.current.t3);
        timeoutsRef.current.t3 = setTimeout(() => {
          setPhase('done');
          delete (window as any).__loadingStartTime;
        }, 300);
      }
    }
  }, [isLoading]);

  // Rotating messages with fade animation
  useEffect(() => {
    if (phase !== 'loading') return;
    const cycle = () => {
      setMsgVisible(false);
      setTimeout(() => {
        setMsgIdx((currentIdx: number) => {
          let nextIdx;
          do {
            nextIdx = Math.floor(Math.random() * MESSAGES.length);
          } while (nextIdx === currentIdx && MESSAGES.length > 1);
          return nextIdx;
        });
        setMsgVisible(true);
      }, 350);
    };
    const interval = setInterval(cycle, 2200);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <>
      {/* The actual page content is only mounted when it's fading or done, triggering entrance animations exactly once */}
      {(phase === 'fading' || phase === 'done') && children}

      {/* The loader overlay is rendered as long as phase is not done */}
      {phase !== 'done' && (
        <div
          className={`md:absolute fixed inset-x-0 bottom-0 top-14 md:inset-0 z-[150] md:z-[99] flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#0a0a0a] transition-opacity duration-300 ${
            phase === 'fading' ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {/* Logo con bounce */}
          <div className="mb-10 flex flex-col items-center gap-5">
            <img
              src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"}
              alt="Algoritmia"
              className="w-14 h-14 object-contain"
              style={{
                animation: 'alg-bounce 2s ease-in-out infinite',
                filter: 'drop-shadow(0 0 18px rgba(139, 92, 246, 0.55))',
                willChange: 'transform',
              }}
            />
            <span className="text-[11px] font-black text-zinc-550 dark:text-zinc-400 uppercase tracking-[0.22em]">
              C.A.R · Algoritmia
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-64 space-y-3">
            <div className="w-full h-[4px] bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                  boxShadow: '0 0 10px rgba(139,92,246,0.7)',
                  transition: transitionStyle === 'none' ? 'none' : `${transitionStyle}, opacity 0.25s ease-out 0.05s`,
                }}
              />
            </div>

            {/* Mensaje rotativo */}
            <p
              className="text-center text-[12px] text-zinc-450 dark:text-zinc-400 font-medium transition-all duration-300"
              style={{
                opacity: msgVisible ? 1 : 0,
                transform: msgVisible ? 'translateY(0)' : 'translateY(4px)',
              }}
            >
              {message || MESSAGES[msgIdx]}
            </p>
          </div>
        </div>
      )}

      {/* Keyframes inyectados inline */}
      <style>{`
        @keyframes alg-bounce {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-12px); }
        }
      `}</style>
    </>
  );
};
