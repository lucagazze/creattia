import React, { useState, useRef, useEffect } from 'react';
import { Mic, ChevronUp, CornerDownLeft, X, Loader2, RotateCcw, Database, Brain, ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../services/supabase';
import { AI_BRAIN_STEPS, isAIBrainReady } from '../utils/aiReadiness';

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

const getInitialMessage = (businessName?: string): Message => ({
  role: 'assistant',
  content: `¡Hola! Estoy aquí para ayudarte con datos y análisis sobre "${businessName || 'The Skirting Factory'}". Puedo proporcionarte información sobre:
Email Marketing: Campañas programadas, enviadas y flujos activos.
Meta Ads: Datos en vivo sobre campañas, gasto, resultados y creativos activos.
E-commerce: Ventas, ingresos y órdenes de tu tienda.
Instagram: Publicaciones recientes y su rendimiento.

Si tenés alguna consulta específica, ¡no dudes en preguntar!

[[FOLLOWUP]] ¿Qué información específica te gustaría saber?
[[OPT]] Revisar las campañas de email programadas.
[[OPT]] Ver el rendimiento de las campañas de Meta Ads.
[[OPT]] Decime las últimas cinco publicaciones de la cuenta.`
});

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

  const activeProfile = isViewingAs ? viewAsProfile : profile;
  const activeClientId = activeProfile?.id;
  const activeBusinessName = activeProfile?.business_name;
  const activeKlaviyoKey = (activeProfile as any)?.klaviyo_api_key;
  const activeMetaAccountId = (activeProfile as any)?.meta_account_id;
  const aiReady = isAIBrainReady(activeProfile);

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isThinking]);

  // Reset chat when active client changes
  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [activeClientId, activeBusinessName]);

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
    if (!aiReady) {
      setIsOpen(true);
      setMessages([]);
      setInput('');
      return;
    }

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
      else if (lowerText.includes('redes sociales') || lowerText.includes('facebook') || lowerText.includes('instagram')) handleNavigate('/redes-sociales');
      else if (lowerText.includes('inicio') || lowerText.includes('dashboard') || lowerText.includes('principal')) handleNavigate('/dashboard');
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: updatedMessages, activeClientId, activeBusinessName }),
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
    if (!aiReady) {
      setIsOpen(true);
      return;
    }
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
              setInput(text.trim());
              setTimeout(() => {
                inputRef.current?.focus();
              }, 100);
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
    if (!aiReady) {
      setIsOpen(true);
      return;
    }
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
    <div ref={containerRef} className="fixed print:hidden z-[300]">
      {/* ── Apple-style Floating Chat Window ── */}
      {isOpen && (
        <div className={`fixed z-[300] inset-0 w-full h-full bg-white dark:bg-zinc-950 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-250 md:inset-auto md:fixed md:bottom-6 md:right-6 md:w-[480px] md:h-[82vh] md:rounded-[24px] md:border md:border-zinc-200 md:dark:border-zinc-800 md:shadow-2xl ${
          isThinking ? 'siri-glow md:border-violet-500/50' : ''
        }`}>
          {/* Header */}
          <div className="flex justify-between items-center px-4 py-3.5 md:py-3 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/60 flex-shrink-0 select-none">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow overflow-hidden">
                <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="Algoritmia" className="w-6 h-6 object-contain" />
              </div>
              <div>
                <p className="text-[13.5px] md:text-[13px] font-black text-zinc-800 dark:text-zinc-200 leading-none">Algor IA</p>
                <p className={`text-[9.5px] md:text-[9px] font-bold mt-1 tracking-wider leading-none ${aiReady ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {aiReady ? 'LISTA' : 'PENDIENTE'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-1.5">
              {messages.length > 0 && (
                <button onClick={clearChat} className="p-2 md:p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors" title="Limpiar chat">
                  <RotateCcw className="w-4 h-4 md:w-3.5 md:h-3.5" />
                </button>
              )}
              <button 
                onClick={() => setIsOpen(false)} 
                className="w-9 h-9 md:w-7 md:h-7 rounded-xl md:rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-white transition-all flex items-center justify-center cursor-pointer flex-shrink-0"
                title="Cerrar chat"
              >
                <X className="w-5 h-5 md:w-4 md:h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-950">
            {messages.length === 0 && !aiReady && (
              <div className="flex flex-col justify-center h-full px-2 py-6 select-none">
                <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/80 dark:bg-amber-500/10 p-4 shadow-sm">
                  <div className="w-11 h-11 rounded-xl bg-white/80 dark:bg-zinc-950/60 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center mb-4">
                    <LockKeyhole className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-[15px] font-black text-zinc-900 dark:text-zinc-100">
                    Primero completá el análisis de IA
                  </p>
                  <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400 mt-2">
                    La IA necesita tener el Cerebro entrenado para responder con información real de este negocio. Completalo una vez y después vas a poder usar el chat y las respuestas con IA.
                  </p>

                  <div className="mt-4 space-y-2">
                    {AI_BRAIN_STEPS.map((step) => (
                      <div key={step} className="flex items-start gap-2 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleNavigate('/cerebro')}
                    className="mt-5 w-full h-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-[12px] font-black flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    <Brain className="w-3.5 h-3.5" />
                    Ir a Cerebro IA
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {messages.length === 0 && aiReady && (
              <div className="flex flex-col items-center justify-center h-full gap-4 px-3 py-6 select-none">
                <div className="text-center mb-2">
                  <p className="text-[15px] font-black text-zinc-800 dark:text-zinc-100">¿En qué puedo ayudarte hoy?</p>
                  <p className="text-[11.5px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-[280px]">
                    Preguntame sobre tus campañas, creativos, emails o ventas.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full max-w-[280px]">
                  {initialPrompts.slice(0, 4).map((p, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(p.text)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50 dark:hover:bg-violet-500/5 active:scale-[0.97] transition-all text-left"
                    >
                      <span className="text-[15px] flex-shrink-0">{p.icon}</span>
                      <span className="text-[11.5px] font-semibold text-zinc-700 dark:text-zinc-400 leading-snug truncate">{p.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg: Message, i: number) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5 shadow-sm overflow-hidden select-none">
                    <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="" className="w-4 h-4 object-contain" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[12.5px] leading-[1.5] shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 rounded-br-sm whitespace-pre-wrap font-semibold'
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
                <div className="w-6 h-6 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5 overflow-hidden shadow-sm">
                  <img src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} alt="" className="w-4 h-4 object-contain" />
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 px-3.5 py-2.5 rounded-2xl rounded-bl-sm shadow-sm min-w-[150px] max-w-[85%]">
                  {thinkingSteps.length === 0 ? (
                    <div className="flex items-center gap-1.5 py-1">
                      <div className="w-2 h-2 bg-violet-400 dark:bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-violet-400 dark:bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-violet-400 dark:bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.15em] mb-1.5">Analizando...</p>
                      {thinkingSteps.map((step: ThinkingStep, i: number) => (
                        <div
                          key={step.tool + i}
                          className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300"
                          style={{ animationDelay: `${i * 60}ms` }}
                        >
                          {step.done ? (
                            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-500/30">
                              <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth={4} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border-[2px] border-violet-500 border-t-transparent animate-spin flex-shrink-0" />
                          )}
                          <span className={`text-[11px] font-semibold leading-tight transition-colors duration-300 ${step.done ? 'text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-700' : 'text-zinc-700 dark:text-zinc-300'}`}>
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
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 px-3 py-2 rounded-2xl rounded-br-sm flex items-center gap-2 animate-pulse text-[11.5px] text-red-700 dark:text-red-400 font-bold select-none">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" /> Escuchando...
                </div>
              </div>
            )}
            {isTranscribing && (
              <div className="flex justify-end">
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 px-3 py-2 rounded-2xl rounded-br-sm flex items-center gap-2 text-[11.5px] text-blue-700 dark:text-blue-400 font-bold select-none">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Transcribiendo...
                </div>
              </div>
            )}
          </div>

          {/* Integrated Input Bar */}
          <div className="p-3 border-t border-zinc-100 dark:border-zinc-900 bg-white dark:bg-zinc-950 flex-shrink-0 flex items-center gap-2">
            <div
              onClick={handleMicClick}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-white shadow-md transition-all duration-300 cursor-pointer flex-shrink-0 ${
                isThinking || isTranscribing
                  ? 'bg-indigo-500 animate-pulse'
                  : isRecording
                  ? 'bg-red-500 scale-110 shadow-red-500/50'
                  : input.trim()
                  ? 'bg-violet-600 hover:bg-violet-700'
                  : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800'
              }`}
            >
              {isThinking || isTranscribing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isRecording
                ? <div className="w-2.5 h-2.5 rounded-sm bg-white" />
                : input.trim()
                ? <CornerDownLeft className="w-4 h-4" />
                : <Mic className="w-4 h-4" />
              }
            </div>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && !isThinking && !isTranscribing && handleSend()}
              placeholder={
                !aiReady ? 'Completá Cerebro IA para usar la IA'
                : isRecording ? 'Escuchando...'
                : isTranscribing ? 'Transcribiendo...'
                : 'Escribí tu mensaje...'
              }
              disabled={!aiReady || isRecording || isTranscribing || isThinking}
              className="flex-1 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 rounded-xl px-3.5 py-1.5 text-[12.5px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:border-violet-400/50 transition-all font-semibold min-w-0"
              autoComplete="off"
            />
          </div>
        </div>
      )}

      {/* ── Circular Floating Bubble Trigger Button (WhatsApp style) ── */}
      {!isOpen && (
        <div
          onClick={() => {
            setIsOpen(true);
            if (aiReady) setTimeout(() => inputRef.current?.focus(), 150);
          }}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center cursor-pointer transition-all duration-300 z-[310] select-none hover:scale-110 active:scale-95 bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-cyan-500 text-white shadow-violet-500/20 shadow-lg p-[2px]"
        >
          <div className="w-full h-full rounded-full bg-zinc-950 dark:bg-zinc-900 flex items-center justify-center p-2.5">
            <img 
              src="/assets/logoSinFondo.png" 
              alt="Algor" 
              className="w-7 h-7 object-contain" 
            />
          </div>
        </div>
      )}
    </div>
  );
};
