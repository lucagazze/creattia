import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';

interface Props {
  src: string;
  mimeType?: string;
}

// Cached once per session — result never changes
let _canPlayOgg: boolean | null = null;
const browserCanPlayOgg = () => {
  if (_canPlayOgg === null) {
    const a = new Audio();
    _canPlayOgg = a.canPlayType('audio/ogg; codecs=opus') !== '' || a.canPlayType('audio/ogg') !== '';
  }
  return _canPlayOgg;
};

const isOggLike = (src: string, mimeType?: string) =>
  /\.(ogg|oga|opus)(\?|$)/i.test(src) ||
  !!(mimeType && (mimeType.includes('ogg') || mimeType.includes('opus')));

const toProxyUrl = (src: string) => `/api/audio-proxy?url=${encodeURIComponent(src)}`;

export const CustomAudioPlayer: React.FC<Props> = ({ src, mimeType }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [converting, setConverting] = useState(false);

  const needsProxy = isOggLike(src, mimeType) && !browserCanPlayOgg();
  const [activeSrc, setActiveSrc] = useState(() => needsProxy ? toProxyUrl(src) : src);

  useEffect(() => {
    const np = isOggLike(src, mimeType) && !browserCanPlayOgg();
    setActiveSrc(np ? toProxyUrl(src) : src);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadError(false);
    setConverting(np);
  }, [src, mimeType]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      setConverting(false);
      if (audio.duration && !isNaN(audio.duration)) setDuration(audio.duration);
    };
    const onCanPlay = () => setConverting(false);
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      // If we haven't tried the proxy yet, fall back to it
      if (activeSrc !== toProxyUrl(src)) {
        setActiveSrc(toProxyUrl(src));
        setConverting(true);
        setLoadError(false);
      } else {
        setConverting(false);
        setLoadError(true);
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    if (audio.readyState >= 1 && audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
      setConverting(false);
    }

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [src, activeSrc]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setLoadError(true));
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
      <div className="flex items-center gap-2 p-3 bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl max-w-xs sm:max-w-sm text-[11px] text-zinc-500 dark:text-zinc-400">
        Audio no disponible
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200/60 dark:border-zinc-800/80 rounded-2xl w-full max-w-xs sm:max-w-sm shadow-sm hover:shadow-md transition-shadow duration-200 animate-in fade-in duration-200"
      onClick={e => e.stopPropagation()}
    >
      <audio ref={audioRef} src={activeSrc} preload="metadata" />

      <button
        type="button"
        onClick={converting ? undefined : togglePlay}
        disabled={converting}
        className="w-9 h-9 rounded-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-500/10 active:scale-95 transition-all"
      >
        {converting
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : isPlaying
            ? <Pause className="w-4 h-4 fill-current" />
            : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          disabled={converting || duration === 0}
          className="w-full accent-violet-600 cursor-pointer h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 disabled:opacity-50"
        />
        <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
          <span>{converting ? 'Convirtiendo…' : formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '—:—'}</span>
        </div>
      </div>
    </div>
  );
};
