import React, { useEffect, useState } from 'react';

interface Props {
  isLoading: boolean;
  children: React.ReactNode;
}

const MESSAGES = [
  'Conectando con tu cuenta...',
  'Cargando datos del cliente...',
  'Sincronizando campañas...',
  'Preparando todo para vos...',
  'Casi listo...',
  'Un segundo más...',
  'Optimizando la vista...',
  'Traemos la info más fresca...',
];

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

export const CenteredPageLoader: React.FC<Props> = ({ isLoading, children }) => {
  const [phase, setPhase] = useState<'loading' | 'fading' | 'done'>(() => isLoading ? 'loading' : 'done');
  
  const [progress, setProgress] = useState(() => {
    if (!isLoading) return 0;
    const startTime = (window as any).__loadingStartTime || 0;
    if (Date.now() - startTime < 5000 && startTime > 0) {
      return getProgressForTime(startTime).startVal;
    }
    return 0;
  });

  const [transitionStyle, setTransitionStyle] = useState('none');
  const [msgIdx, setMsgIdx] = useState(0);
  const [msgVisible, setMsgVisible] = useState(true);

  useEffect(() => {
    let t1: any;
    let t2: any;
    let t3: any;

    if (isLoading) {
      setPhase('loading');

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

    } else {
      // Finished loading
      setTransitionStyle('width 0.25s ease-out');
      setProgress(100);
      setPhase('fading');

      // Transition to done after the progress bar finishes and fade out completes
      t3 = setTimeout(() => {
        setPhase('done');
        delete (window as any).__loadingStartTime;
      }, 400);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isLoading]);

  // Rotating messages with fade animation
  useEffect(() => {
    if (phase !== 'loading') return;
    const cycle = () => {
      setMsgVisible(false);
      setTimeout(() => {
        setMsgIdx((i: number) => (i + 1) % MESSAGES.length);
        setMsgVisible(true);
      }, 350);
    };
    const interval = setInterval(cycle, 2200);
    return () => clearInterval(interval);
  }, [phase]);

  if (phase === 'done') return <>{children}</>;

  return (
    <div className="relative w-full min-h-screen">
      {/* The actual page content is rendered underneath, so it's ready when the loader fades out */}
      <div className={phase === 'fading' ? 'opacity-100' : 'opacity-0 pointer-events-none'}>
        {children}
      </div>

      {/* The loader overlay */}
      <div
        className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#f5f5f7] dark:bg-[#0a0a0a] transition-opacity duration-300 ${
          phase === 'fading' ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {/* Logo con bounce */}
        <div className="mb-10 flex flex-col items-center gap-5">
          <img
            src="/assets/logoSinFondo.png"
            alt="Algoritmia"
            className="w-14 h-14 object-contain"
            style={{
              animation: 'alg-bounce 0.85s ease-in-out infinite',
              filter: 'drop-shadow(0 0 18px rgba(139,92,246,0.55))',
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
            {MESSAGES[msgIdx]}
          </p>
        </div>
      </div>

      {/* Keyframes inyectados inline */}
      <style>{`
        @keyframes alg-bounce {
          0%, 100% { transform: translateY(0px); }
          45%       { transform: translateY(-18px); }
          65%       { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};
