import React, { useState, useRef, useEffect } from 'react';
import { Mic, ChevronUp, CornerDownLeft, X, Loader2, RotateCcw, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useTheme } from '../contexts/ThemeContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ThinkingStep {
  tool: string;
  label: string;
  icon: string;
  done: boolean;
}

const TOOL_META: Record<string, { label: string; icon: string }> = {
  'get_meta_ads_live_data':  { label: 'Consultando Meta Ads', icon: '📊' },
  'get_meta_ads_creatives':  { label: 'Buscando creativos activos', icon: '🎨' },
  'get_klaviyo_data':        { label: 'Revisando Email Marketing', icon: '📧' },
  'get_ecommerce_data':      { label: 'Consultando la tienda', icon: '🛒' },
  'get_instagram_posts':     { label: 'Cargando Instagram', icon: '📸' },
  'list_clients':            { label: 'Buscando clientes', icon: '👥' },
  'get_client_metrics':      { label: 'Analizando métricas', icon: '📈' },
};

// ── Markdown Renderer Component ───────────────────────────────────────────────
const MarkdownRenderer = ({ content, onSend, onNavigate }: { content: string; onSend?: (text: string) => void; onNavigate?: (path: string) => void }) => {
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
                onError={(e: any) => {
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
              href={isInternal ? undefined : targetUrl}
              target={isInternal ? undefined : '_blank'}
              rel="noopener noreferrer"
              onClick={isInternal && onNavigate ? (e: React.MouseEvent<HTMLAnchorElement>) => { e.preventDefault(); onNavigate(targetUrl); } : undefined}
              className="text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 underline font-bold inline-flex items-center gap-0.5 cursor-pointer"
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

  // Pre-process: extract [[FOLLOWUP]] block from end of content
  let followupQuestion = '';
  const followupOptions: string[] = [];
  const cleanLines: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('[[FOLLOWUP]]')) {
      followupQuestion = t.replace('[[FOLLOWUP]]', '').trim();
    } else if (t.startsWith('[[OPT]]')) {
      followupOptions.push(t.replace('[[OPT]]', '').trim());
    } else {
      cleanLines.push(line);
    }
  }
  // Remove trailing blank lines after stripping followup block
  while (cleanLines.length > 0 && !cleanLines[cleanLines.length - 1].trim()) cleanLines.pop();
  const processLines = followupQuestion ? cleanLines : lines;

  for (let i = 0; i < processLines.length; i++) {
    const line = processLines[i];

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
              href={isInternal ? undefined : targetUrl}
              target={isInternal ? undefined : '_blank'}
              rel="noopener noreferrer"
              onClick={isInternal && onNavigate ? (e: React.MouseEvent<HTMLAnchorElement>) => { e.preventDefault(); onNavigate(targetUrl); } : undefined}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full bg-violet-600 dark:bg-violet-500 hover:bg-violet-700 dark:hover:bg-violet-600 text-white font-bold text-[12px] md:text-[12.5px] shadow-md shadow-violet-500/15 hover:scale-[1.01] active:scale-[0.98] transition-all text-center cursor-pointer"
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

    const trimmed = line.trim();
    const h3match = /^###\s+(.+)$/.exec(trimmed);
    const h2match = /^##\s+(.+)$/.exec(trimmed);
    const h1match = /^#\s+(.+)$/.exec(trimmed);

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const contentStr = trimmed.substring(2);
      currentList.push(
        <li key={currentList.length} className="ml-3.5 list-disc text-zinc-700 dark:text-zinc-300 my-0.5 leading-snug">
          {parseInline(contentStr)}
        </li>
      );
    } else {
      if (currentList.length > 0) {
        elements.push(<ul key={`list-${listKey++}`} className="my-1.5 space-y-0.5">{currentList}</ul>);
        currentList = [];
      }

      if (h3match) {
        elements.push(
          <p key={i} className="mt-2.5 mb-0.5 text-[10.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
            {parseInline(h3match[1])}
          </p>
        );
      } else if (h2match) {
        elements.push(
          <p key={i} className="mt-2.5 mb-0.5 text-[12px] font-black text-zinc-700 dark:text-zinc-200 tracking-tight">
            {parseInline(h2match[1])}
          </p>
        );
      } else if (h1match) {
        elements.push(
          <p key={i} className="mt-2.5 mb-0.5 text-[13px] font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
            {parseInline(h1match[1])}
          </p>
        );
      } else if (trimmed) {
        elements.push(
          <p key={i} className="my-1 text-zinc-700 dark:text-zinc-300 leading-snug">
            {parseInline(line)}
          </p>
        );
      }
    }
  }

  if (isTable) {
    elements.push(renderTable(tableRows, processLines.length));
  }
  if (currentList.length > 0) {
    elements.push(<ul key={`list-${listKey++}`} className="my-2 space-y-0.5">{currentList}</ul>);
  }

  return (
    <div className="space-y-1">
      {elements}
      {/* Follow-up question block */}
      {followupQuestion && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 space-y-2">
          <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 leading-snug">{followupQuestion}</p>
          {followupOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {followupOptions.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSend?.(opt)}
                  className="inline-flex items-center px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:border-violet-300 dark:hover:border-violet-500/40 hover:text-violet-700 dark:hover:text-violet-300 active:scale-95 transition-all duration-150"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Floating Chat Component ──────────────────────────────────────────────
export const AIChatFloat = () => {
  const { profile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const { darkMode } = useTheme();
  const navigate = useNavigate();

  const handleNavigate = (url: string) => {
    const path = url.startsWith('/#') ? url.slice(2) : url.startsWith('#/') ? url.slice(1) : url;
    navigate(path);
    setIsOpen(false); // Close chat so user can see the destination page
  };
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const activeClientId = isViewingAs ? viewAsProfile?.id : profile?.id;
  const activeBusinessName = isViewingAs ? viewAsProfile?.business_name : profile?.business_name;
  const activeKlaviyoKey = isViewingAs ? (viewAsProfile as any)?.klaviyo_api_key : profile?.klaviyo_api_key;
  const activeMetaAccountId = isViewingAs ? (viewAsProfile as any)?.meta_account_id : profile?.meta_account_id;

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

    // Voice navigation routing command parser
    const lowerText = text.toLowerCase();
    if (lowerText.includes('llevame a') || lowerText.includes('ir a') || lowerText.includes('abrir') || lowerText.includes('ver') || lowerText.includes('navegar a')) {
      if (lowerText.includes('captación') || lowerText.includes('captacion')) handleNavigate('/captacion');
      else if (lowerText.includes('tienda')) handleNavigate('/tienda');
      else if (lowerText.includes('atención') || lowerText.includes('atencion')) handleNavigate('/atencion');
      else if (lowerText.includes('retención') || lowerText.includes('retencion')) handleNavigate('/retencion');
      else if (lowerText.includes('reportes')) handleNavigate('/reportes');
      else if (lowerText.includes('links') || lowerText.includes('mis accesos') || lowerText.includes('acceso')) handleNavigate('/links');
      else if (lowerText.includes('email marketing')) handleNavigate('/email-marketing');
      else if (lowerText.includes('inicio') || lowerText.includes('dashboard') || lowerText.includes('principal')) handleNavigate('/');
    }

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsThinking(true);
    setThinkingSteps([]);

    let receivedFinalMessage = false;

    const processEvent = (raw: string) => {
      const dataLine = raw.split('\n').find(l => l.startsWith('data: '));
      if (!dataLine) return;
      try {
        const data = JSON.parse(dataLine.slice(6));
        if (data.type === 'thinking') {
          const steps: ThinkingStep[] = (data.steps || []).map((s: any) => ({
            tool: s.tool,
            label: s.label || TOOL_META[s.tool]?.label || s.tool,
            icon: s.icon || TOOL_META[s.tool]?.icon || '⚙️',
            done: false,
          }));
          setThinkingSteps(steps);
        } else if (data.type === 'tool_done') {
          setThinkingSteps((prev: ThinkingStep[]) => prev.map((s: ThinkingStep) => s.tool === data.tool ? { ...s, done: true } : s));
        } else if (data.type === 'done') {
          receivedFinalMessage = true;
          setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: data.reply }]);
          setThinkingSteps([]);
        } else if (data.type === 'error') {
          receivedFinalMessage = true;
          setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: '❌ Hubo un problema técnico. Intentá de nuevo.' }]);
          setThinkingSteps([]);
        }
      } catch { /* ignore parse errors */ }
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, profile, activeClientId, activeBusinessName, klaviyoApiKey: activeKlaviyoKey, metaAccountId: activeMetaAccountId }),
      });

      if (!res.ok) throw new Error('API error');

      // SSE streaming path
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const event of events) processEvent(event);
        }
        // Process any remaining buffer that didn't end with \n\n
        if (buffer.trim()) processEvent(buffer);
      } else {
        // Fallback: JSON response
        const data = await res.json();
        if (data.reply) {
          receivedFinalMessage = true;
          setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: data.reply }]);
        }
      }
    } catch {
      setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: '❌ Hubo un problema técnico. Intentá de nuevo.' }]);
      receivedFinalMessage = true;
    } finally {
      // Safety net: if done event never arrived, show error
      if (!receivedFinalMessage) {
        setMessages((prev: Message[]) => [...prev, { role: 'assistant', content: '❌ No pude obtener respuesta. Intentá de nuevo.' }]);
      }
      setIsThinking(false);
      setThinkingSteps([]);
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
            if (text && text.trim()) {
              handleSend(text.trim());
            }
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

  const clearChat = () => { setMessages([]); setInput(''); setThinkingSteps([]); };

  const quickPrompts = [
    '¿Qué mails están programados?',
    '¿Cómo viene el ROAS en Meta?',
  ];

  const initialPrompts = [
    { icon: '🎨', text: '¿Qué creativos están activos?' },
    { icon: '📊', text: '¿Cómo viene el ROAS en Meta?' },
    { icon: '📧', text: '¿Qué mails están programados?' },
    { icon: '🛒', text: '¿Cuánto vendimos este mes?' },
    { icon: '⚡', text: '¿Cómo están los flujos activos?' },
    { icon: '🏆', text: '¿Cuál es mi campaña con más gasto?' },
  ];

  return (
    <div
      ref={containerRef}
      className="fixed z-[250] bottom-2 md:bottom-6 print:hidden w-[96%] left-1/2 -translate-x-1/2 md:w-[820px] md:left-[calc(50%+120px)]"
    >
      {/* ── Chat panel ── */}
      <div className={`absolute bottom-full mb-2 md:mb-3 w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-3xl overflow-hidden spring-transition origin-bottom flex flex-col ${
        isOpen ? 'opacity-100 scale-100 h-[calc(100svh-9rem)] md:h-[640px]' : 'opacity-0 scale-95 h-0 pointer-events-none'
      } ${isThinking ? 'siri-glow border-violet-500/50' : ''}`}>

        {/* Header */}
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-md overflow-hidden">
              <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="Algoritmia" className="w-7 h-7 object-contain" />
            </div>
            <div>
              <p className="text-[14.5px] font-black text-zinc-800 dark:text-zinc-200 leading-none">Algor IA</p>
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
            <div className="flex flex-col items-center justify-center h-full gap-3 px-4 pb-2">
              <div className="flex flex-col items-center gap-2 mb-1">
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-md flex items-center justify-center">
                  <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="Algoritmia" className="w-8 h-8 object-contain" />
                </div>
                <p className="text-[14px] font-black text-zinc-700 dark:text-zinc-200">Hola 👋 Soy Algor</p>
                <p className="text-[11.5px] text-zinc-400 dark:text-zinc-500 text-center max-w-[280px] leading-relaxed">
                  Preguntame sobre tus campañas, creativos, emails o ventas.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 w-full max-w-[420px]">
                {initialPrompts.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(p.text)}
                    className="flex items-center gap-2.5 px-4 py-3.5 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50 dark:hover:bg-violet-500/5 active:scale-[0.97] transition-all text-left"
                  >
                    <span className="text-[18px] flex-shrink-0">{p.icon}</span>
                    <span className="text-[12.5px] font-semibold text-zinc-600 dark:text-zinc-400 leading-snug">{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg: Message, i: number) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5 shadow-sm overflow-hidden">
                  <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="" className="w-5 h-5 object-contain" />
                </div>
              )}
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] md:text-[13.5px] leading-[1.55] shadow-sm ${
                msg.role === 'user'
                  ? 'bg-black dark:bg-zinc-100 text-white dark:text-zinc-950 rounded-br-sm whitespace-pre-wrap font-semibold'
                  : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm'
              }`}>
                {msg.role === 'user' ? (
                  msg.content
                ) : (
                  <MarkdownRenderer content={msg.content} onSend={(text) => handleSend(text)} onNavigate={handleNavigate} />
                )}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 flex items-center justify-center flex-shrink-0 mr-2.5 mt-0.5 overflow-hidden shadow-sm">
                <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="" className="w-5 h-5 object-contain" />
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm min-w-[180px] max-w-[85%]">
                {thinkingSteps.length === 0 ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-violet-400 dark:bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-violet-400 dark:bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-violet-400 dark:bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.15em] mb-2.5">Analizando...</p>
                    {thinkingSteps.map((step: ThinkingStep, i: number) => (
                      <div
                        key={step.tool + i}
                        className="flex items-center gap-2.5 animate-in fade-in slide-in-from-left-2 duration-300"
                        style={{ animationDelay: `${i * 60}ms` }}
                      >
                        {step.done ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-500/30">
                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border-[2px] border-violet-500 border-t-transparent animate-spin flex-shrink-0" />
                        )}
                        <span className={`text-[12px] font-semibold leading-tight transition-colors duration-300 ${step.done ? 'text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-600' : 'text-zinc-700 dark:text-zinc-300'}`}>
                          {step.icon} {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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

      </div>

      {/* ── Pill input bar ── */}
      <div
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className={`relative group bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 shadow-xl rounded-full spring-transition cursor-text flex items-center px-2 py-2 md:px-3 ${
          isOpen ? 'ring-2 ring-violet-500/30' : 'hover:scale-105 hover:bg-white dark:hover:bg-zinc-700'
        } ${isThinking ? 'siri-glow border-violet-500/50' : ''}`}
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && !isThinking && !isTranscribing && handleSend()}
          placeholder={
            isRecording ? 'Escuchando...'
            : isTranscribing ? 'Transcribiendo...'
            : activeBusinessName ? `¿Qué querés saber de ${activeBusinessName}?`
            : '¿En qué te ayudo hoy?'
          }
          disabled={isRecording || isTranscribing || isThinking}
          className="flex-1 bg-transparent border-none outline-none text-[13px] md:text-[14px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 font-semibold px-2.5 md:px-4 h-full min-w-0"
          autoComplete="off"
        />

        <div className="flex items-center gap-2 pr-2 flex-shrink-0">
          <div className="hidden md:flex items-center gap-1.5 text-[10.5px] text-emerald-600 dark:text-emerald-500 font-black mr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>IA CONECTADA</span>
          </div>
          <button
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setIsOpen((o: boolean) => !o); }}
            className="hidden md:flex text-zinc-350 hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400 transition-colors"
          >
            <ChevronUp className={`w-5.5 h-5.5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};
