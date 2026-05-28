import React, { useState, useRef, useEffect } from 'react';
import { Mic, ChevronUp, CornerDownLeft, X, Loader2, RotateCcw, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useTheme } from '../contexts/ThemeContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ── Markdown Renderer Component ───────────────────────────────────────────────
const MarkdownRenderer = ({ content, onLinkClick }: { content: string; onLinkClick?: () => void }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let listKey = 0;
  let tableRows: string[][] = [];
  let isTable = false;

  const parseInline = (text: string) => {
    const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
    const linkRegex = /\[(.*?)\]\((.*?)\)/g;
    const boldRegex = /\*\*(.*?)\*\*/g;

    let parts: React.ReactNode[] = [text];

    // Parse images
    let hasImages = true;
    while (hasImages) {
      hasImages = false;
      const nextParts: React.ReactNode[] = [];
      for (const part of parts) {
        if (typeof part !== 'string') {
          nextParts.push(part);
          continue;
        }
        const match = imgRegex.exec(part);
        if (match) {
          hasImages = true;
          const [fullMatch, alt, url] = match;
          const index = part.indexOf(fullMatch);
          if (index > 0) nextParts.push(part.substring(0, index));
          nextParts.push(
            <div key={url + index} className="my-2.5 max-w-[320px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-md bg-white dark:bg-zinc-900">
              <img 
                src={url} 
                alt={alt} 
                className="max-h-48 object-cover w-full hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/assets/logoSinFondo.png';
                }}
              />
              {alt && (
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold p-2.5 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 text-center truncate">
                  {alt}
                </div>
              )}
            </div>
          );
          if (index + fullMatch.length < part.length) nextParts.push(part.substring(index + fullMatch.length));
          break;
        } else {
          nextParts.push(part);
        }
      }
      if (hasImages) parts = nextParts;
      imgRegex.lastIndex = 0;
    }

    // Parse links
    let hasLinks = true;
    while (hasLinks) {
      hasLinks = false;
      const nextParts: React.ReactNode[] = [];
      for (const part of parts) {
        if (typeof part !== 'string') {
          nextParts.push(part);
          continue;
        }
        const match = linkRegex.exec(part);
        if (match) {
          hasLinks = true;
          const [fullMatch, linkText, url] = match;
          const index = part.indexOf(fullMatch);
          if (index > 0) nextParts.push(part.substring(0, index));
          
          const isInternal = url.startsWith('/#') || url.startsWith('#') || url.startsWith('/');
          const targetUrl = url.startsWith('/') && !url.startsWith('/#') ? `/#${url}` : url;

          nextParts.push(
            <a
              key={url + index}
              href={targetUrl}
              target={isInternal ? '_self' : '_blank'}
              rel="noopener noreferrer"
              onClick={onLinkClick}
              className="text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 underline font-bold inline-flex items-center gap-0.5"
            >
              {linkText}
            </a>
          );
          if (index + fullMatch.length < part.length) nextParts.push(part.substring(index + fullMatch.length));
          break;
        } else {
          nextParts.push(part);
        }
      }
      if (hasLinks) parts = nextParts;
      linkRegex.lastIndex = 0;
    }

    // Parse bold
    let hasBold = true;
    while (hasBold) {
      hasBold = false;
      const nextParts: React.ReactNode[] = [];
      for (const part of parts) {
        if (typeof part !== 'string') {
          nextParts.push(part);
          continue;
        }
        const match = boldRegex.exec(part);
        if (match) {
          hasBold = true;
          const [fullMatch, boldText] = match;
          const index = part.indexOf(fullMatch);
          if (index > 0) nextParts.push(part.substring(0, index));
          nextParts.push(<strong key={boldText + index} className="font-bold text-zinc-900 dark:text-zinc-100">{boldText}</strong>);
          if (index + fullMatch.length < part.length) nextParts.push(part.substring(index + fullMatch.length));
          break;
        } else {
          nextParts.push(part);
        }
      }
      if (hasBold) parts = nextParts;
      boldRegex.lastIndex = 0;
    }

    return parts;
  };

  const renderTable = (rows: string[][], key: number) => {
    if (rows.length === 0) return null;
    const headers = rows[0];
    const dataRows = rows.slice(2);
    return (
      <div key={key} className="my-3.5 overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-[12px] md:text-[13px]">
          <thead className="bg-zinc-50 dark:bg-zinc-900/50">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-3.5 py-2.5 text-left font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  {h.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-zinc-950 divide-y divide-zinc-100 dark:divide-zinc-900">
            {dataRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3.5 py-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                    {parseInline(cell ? cell.trim() : '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect if line is ONLY a markdown link -> render as beautiful CTA Button
    if (line.trim().startsWith('[') && line.trim().endsWith(')')) {
      const match = /^\s*\[(.*?)\]\((.*?)\)\s*$/.exec(line);
      if (match) {
        const [_, linkText, url] = match;
        const isInternal = url.startsWith('/#') || url.startsWith('#') || url.startsWith('/');
        const targetUrl = url.startsWith('/') && !url.startsWith('/#') ? `/#${url}` : url;
        elements.push(
          <div key={i} className="my-3">
            <a
              href={targetUrl}
              target={isInternal ? '_self' : '_blank'}
              rel="noopener noreferrer"
              onClick={onLinkClick}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full bg-violet-600 dark:bg-violet-500 hover:bg-violet-700 dark:hover:bg-violet-600 text-white font-bold text-[12px] md:text-[12.5px] shadow-md shadow-violet-500/15 hover:scale-[1.01] active:scale-[0.98] transition-all text-center"
            >
              {linkText}
            </a>
          </div>
        );
        continue;
      }
    }

    if (line.trim().startsWith('|')) {
      const cols = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (!isTable) {
        isTable = true;
        tableRows = [cols];
      } else {
        tableRows.push(cols);
      }
      continue;
    } else if (isTable) {
      elements.push(renderTable(tableRows, i));
      tableRows = [];
      isTable = false;
    }

    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const contentStr = line.trim().substring(2);
      currentList.push(
        <li key={currentList.length} className="ml-4 list-disc text-zinc-700 dark:text-zinc-300 my-0.5">
          {parseInline(contentStr)}
        </li>
      );
    } else {
      if (currentList.length > 0) {
        elements.push(<ul key={`list-${listKey++}`} className="my-2 space-y-0.5">{currentList}</ul>);
        currentList = [];
      }

      if (line.trim()) {
        elements.push(
          <p key={i} className="my-1.5 text-zinc-700 dark:text-zinc-300 leading-relaxed">
            {parseInline(line)}
          </p>
        );
      }
    }
  }

  if (isTable) {
    elements.push(renderTable(tableRows, lines.length));
  }
  if (currentList.length > 0) {
    elements.push(<ul key={`list-${listKey++}`} className="my-2 space-y-0.5">{currentList}</ul>);
  }

  return <div className="space-y-1">{elements}</div>;
};

// ── Main Floating Chat Component ──────────────────────────────────────────────
export const AIChatFloat = () => {
  const { profile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const { darkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const activeClientId = isViewingAs ? viewAsProfile?.id : profile?.id;
  const activeBusinessName = isViewingAs ? viewAsProfile?.business_name : profile?.business_name;

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isThinking]);

  // Reset chat when active client changes
  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [activeClientId]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (isOpen && !isRecording && !isTranscribing) setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, isRecording, isTranscribing]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) setIsOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || isThinking) return;

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsThinking(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          profile,
          activeClientId,
          activeBusinessName
        }),
      });

      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Hubo un problema técnico. Intentá de nuevo.',
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  // ── Voice ──────────────────────────────────────────────────────────────────

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const base64 = await blobToBase64(audioBlob);
          const r = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64, mimeType }),
          });
          if (r.ok) {
            const { text } = await r.json();
            if (text) { setInput(text.trim()); setTimeout(() => inputRef.current?.focus(), 100); }
          }
        } catch (e) { console.error('Transcription error:', e); }
        finally { setIsTranscribing(false); }
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setIsOpen(true);
    } catch { alert('No se pudo acceder al micrófono.'); }
  };

  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) mediaRecorderRef.current.stop(); };

  const handleMicClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRecording) stopRecording();
    else if (input.trim()) handleSend();
    else startRecording();
  };

  const clearChat = () => { setMessages([]); setInput(''); };

  const quickPrompts = [
    '¿Qué mails están programados?',
    '¿Cómo me fue este mes en facturación?',
    '¿Qué creativos están activos?',
    '¿Cómo viene el ROAS y gasto en Meta Ads?',
    '¿Cuáles son los flows activos?',
  ];

  return (
    <div
      ref={containerRef}
      className="fixed left-1/2 -translate-x-1/2 z-50 transition-all duration-500 w-[95%] md:w-[840px] bottom-6 print:hidden"
    >
      {/* ── Chat panel ── */}
      <div className={`absolute bottom-full mb-3 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-3xl overflow-hidden transition-all duration-300 origin-bottom flex flex-col ${
        isOpen ? 'opacity-100 scale-100 h-[80vh] md:h-[580px]' : 'opacity-0 scale-95 h-0 pointer-events-none'
      }`}>

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-md overflow-hidden">
              <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="Algoritmia" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <p className="text-[14.5px] font-black text-zinc-800 dark:text-zinc-200 leading-none">Algo IA</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button onClick={clearChat} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-xl text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors" title="Limpiar chat">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-xl text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-zinc-50/50 dark:bg-zinc-950">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 pb-4">
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 shadow-md flex items-center justify-center">
                <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="Algoritmia" className="w-11 h-11 object-contain" />
              </div>
              <div className="text-center">
                <p className="text-[15px] font-black text-zinc-700 dark:text-zinc-200">Hola 👋 Soy Algo</p>
                <p className="text-[12.5px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-[320px] px-4 leading-relaxed">
                  Tengo acceso a tus campañas, creativos de Meta Ads, correos programados en Klaviyo y ventas de e-commerce.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5 shadow-sm overflow-hidden">
                  <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="" className="w-5 h-5 object-contain" />
                </div>
              )}
              <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[14px] md:text-[15px] leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-black dark:bg-zinc-100 text-white dark:text-zinc-950 rounded-br-sm whitespace-pre-wrap font-bold'
                  : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm'
              }`}>
                {msg.role === 'user' ? (
                  msg.content
                ) : (
                  <MarkdownRenderer content={msg.content} onLinkClick={() => setIsOpen(false)} />
                )}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5 overflow-hidden">
                <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="" className="w-5 h-5 object-contain" />
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/50 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5 shadow-sm">
                <div className="w-2 h-2 bg-violet-400 dark:bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-violet-400 dark:bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-violet-400 dark:bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {isRecording && (
            <div className="flex justify-end">
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 px-3.5 py-2.5 rounded-2xl rounded-br-sm flex items-center gap-2 animate-pulse text-[12.5px] text-red-600 dark:text-red-400 font-black">
                <div className="w-2 h-2 rounded-full bg-red-500" /> Escuchando...
              </div>
            </div>
          )}
          {isTranscribing && (
            <div className="flex justify-end">
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 px-3.5 py-2.5 rounded-2xl rounded-br-sm flex items-center gap-2 text-[12.5px] text-blue-600 dark:text-blue-400 font-black">
                <Loader2 className="w-4 h-4 animate-spin" /> Transcribiendo...
              </div>
            </div>
          )}
        </div>

        {/* ── Always-visible Quick Prompts Bar (Minimal wrapped tag chips) ── */}
        <div className="flex flex-wrap gap-1.5 px-5 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0">
          {quickPrompts.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              className="text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 bg-zinc-50 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-800 px-2.5 py-1 rounded-full transition-all active:scale-95 shadow-none"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pill input bar ── */}
      <div
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className={`relative group bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 shadow-xl rounded-full transition-all duration-300 cursor-text flex items-center px-2 py-2 md:px-3 ${
          isOpen ? 'ring-2 ring-violet-500/30' : 'hover:scale-105 hover:bg-white dark:hover:bg-zinc-700'
        }`}
      >
        <div
          onClick={handleMicClick}
          className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-500 cursor-pointer flex-shrink-0 ${
            isThinking || isTranscribing
              ? 'bg-indigo-500 animate-pulse'
              : isRecording
              ? 'bg-red-500 scale-110 shadow-red-500/50'
              : input.trim()
              ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600'
              : 'bg-black hover:bg-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900'
          }`}
        >
          {isThinking || isTranscribing
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : isRecording
            ? <div className="w-3 h-3 rounded-sm bg-white" />
            : input.trim()
            ? <CornerDownLeft className="w-5 h-5" />
            : <Mic className="w-5 h-5" />
          }
        </div>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !isThinking && !isTranscribing && handleSend()}
          placeholder={
            isRecording ? 'Escuchando...'
            : isTranscribing ? 'Transcribiendo...'
            : activeBusinessName ? `¿Qué querés saber de ${activeBusinessName}?`
            : '¿En qué te ayudo hoy?'
          }
          disabled={isRecording || isTranscribing || isThinking}
          className="flex-1 bg-transparent border-none outline-none text-[14px] md:text-[15.5px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 font-bold px-2.5 md:px-4 h-full min-w-0"
          autoComplete="off"
        />

        <div className="flex items-center gap-2 pr-2 flex-shrink-0">
          <div className="hidden md:flex items-center gap-1.5 text-[10.5px] text-emerald-600 dark:text-emerald-500 font-black mr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>IA CONECTADA</span>
          </div>
          <button
            onClick={e => { e.stopPropagation(); setIsOpen(o => !o); }}
            className="hidden md:flex text-zinc-350 hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400 transition-colors"
          >
            <ChevronUp className={`w-5.5 h-5.5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
