import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Download, AlertCircle } from 'lucide-react';

interface Props {
  src: string;
}

export const CustomAudioPlayer: React.FC<Props> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Reset state on source change
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadError(false);

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
    };

    const onError = (e: any) => {
      console.warn("Audio element failed to load source:", src, e);
      setLoadError(true);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // Some browsers don't fire loadedmetadata reliably for streaming sources (like rails blobs),
    // we can check if it already has duration
    if (audio.readyState >= 1 && audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [src]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(err => {
          console.warn("Playback error:", err);
          setLoadError(true);
        });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    const val = parseFloat(e.target.value);
    audio.currentTime = val;
    setCurrentTime(val);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loadError) {
    return (
      <div className="flex flex-col gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl max-w-xs sm:max-w-sm animate-in fade-in duration-200">
        <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400 font-semibold leading-relaxed">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Formato de audio no compatible</p>
            <p className="opacity-90 mt-0.5">Safari y iOS no reproducen audios .ogg nativos. Podés descargarlo con el botón de abajo.</p>
          </div>
        </div>
        <a 
          href={src} 
          download 
          target="_blank" 
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[11px] font-black transition-all shadow-sm shadow-amber-600/10 active:scale-[0.98] w-fit self-end"
          onClick={e => e.stopPropagation()}
        >
          <Download className="w-3.5 h-3.5" /> Descargar audio
        </a>
      </div>
    );
  }

  return (
    <div 
      className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl w-full max-w-xs sm:max-w-sm shadow-sm hover:shadow-md transition-shadow duration-200 animate-in fade-in duration-200"
      onClick={e => e.stopPropagation()}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
      
      {/* Play/Pause Button */}
      <button 
        type="button" 
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-violet-600 hover:bg-violet-750 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-500/10 active:scale-95 transition-all"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      {/* Progress & Time */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <input 
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full accent-violet-600 cursor-pointer h-1 rounded-full bg-zinc-200 dark:bg-zinc-800"
        />
        <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '—:—'}</span>
        </div>
      </div>
    </div>
  );
};
