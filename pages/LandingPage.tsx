import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageSquare,
  ShoppingBag,
  TrendingUp,
  Mail,
  Zap,
  Check,
  ChevronDown,
  ArrowRight,
  Shield,
  MessageCircle,
  Activity,
  Workflow,
  Sparkles,
  Sun,
  Moon,
  Plus,
  Minus,
  RefreshCw,
  Clock,
  ArrowUpRight
} from 'lucide-react';

export default function LandingPage() {
  const { darkMode, toggleDarkMode } = useTheme();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Redirige al panel si ya está autenticado
  useEffect(() => {
    if (session) {
      navigate('/dashboard');
    }
  }, [session, navigate]);

  // --- Estados de las Simulaciones Interactivas ---
  
  // 1. Simulación de Inbox Omnicanal
  const [chatStatus, setChatStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [chatMessages, setChatMessages] = useState([
    { id: 1, sender: 'user', text: 'Hola! Vi el tapado de cuero en Instagram. ¿Tienen en talle S?', time: '12:04' },
    { id: 2, sender: 'user', text: '¿Y hacen envíos a Córdoba?', time: '12:04' }
  ]);

  const handleSendAiResponse = () => {
    if (chatStatus !== 'idle') return;
    setChatStatus('sending');
    
    setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        {
          id: 3,
          sender: 'ai',
          text: '¡Hola Sofía! Sí, nos queda la última unidad en talle S de ese tapado. Hacemos envíos rápidos a Córdoba a través de Correo Argentino. ¿Te reservo la unidad?',
          time: '12:05'
        }
      ]);
      setChatStatus('sent');
    }, 1200);
  };

  const handleResetChat = () => {
    setChatMessages([
      { id: 1, sender: 'user', text: 'Hola! Vi el tapado de cuero en Instagram. ¿Tienen en talle S?', time: '12:04' },
      { id: 2, sender: 'user', text: '¿Y hacen envíos a Córdoba?', time: '12:04' }
    ]);
    setChatStatus('idle');
  };

  // 2. Simulación de Sincronización de Stock
  const [stock, setStock] = useState(8);
  const [syncPulse, setSyncPulse] = useState(false);

  const handleUpdateStock = (change: number) => {
    const newVal = Math.max(0, stock + change);
    if (newVal === stock) return;
    setStock(newVal);
    setSyncPulse(true);
    setTimeout(() => setSyncPulse(false), 800);
  };

  // Tabbed high-fidelity screenshots switcher
  const [activeTabShowcase, setActiveTabShowcase] = useState<'resumen' | 'comentarios' | 'pedidos' | 'tienda' | 'publicidad' | 'analisis'>('resumen');

  const showcaseTabs = [
    { id: 'resumen', label: 'Resumen General', img: '/assets/landing_dashboard.png', desc: 'Panel unificado con ingresos acumulados, métricas clave y rendimiento multicanal.' },
    { id: 'comentarios', label: 'Inbox & Comentarios', img: '/assets/landing_comments.png', desc: 'Bandeja omnicanal para moderar comentarios y chatear con asistencia de inteligencia artificial.' },
    { id: 'pedidos', label: 'Gestión de Pedidos', img: '/assets/landing_orders.png', desc: 'Monitoreo consolidado de compras, estado de pago y órdenes de envío pendientes.' },
    { id: 'tienda', label: 'Rendimiento Tienda', img: '/assets/landing_shopify.png', desc: 'Métricas de evolución de ingresos, tasa de recompra y comportamiento del cliente.' },
    { id: 'publicidad', label: 'Meta & Google Ads', img: '/assets/landing_meta.png', desc: 'Atribución publicitaria real de pauta digital y ROAS por plataforma y región.' },
    { id: 'analisis', label: 'Análisis de Productos', img: '/assets/landing_product_analysis.png', desc: 'Identificación de productos estrella, tasas de recompra y comportamiento de retorno de clientes.' }
  ];

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  // Logos de Integraciones con el nuevo Google Ads
  const integrations = [
    { name: 'Shopify', logo: '/assets/shopify-bag.webp' },
    { name: 'Tiendanube', logo: '/assets/tiendanubeoscuro.png', darkLogo: '/assets/tiendanube.webp' },
    { name: 'WooCommerce', logo: '/assets/logowordpress.webp' },
    { name: 'Mercado Libre', logo: '/assets/logomercadolibre.png' },
    { name: 'Google Ads', logo: '/assets/GADS.webp' },
    { name: 'Meta Ads', logo: '/assets/meta (1).webp' },
    { name: 'TikTok Ads', logo: '/assets/logotiktok.png' },
    { name: 'Klaviyo', logo: '/assets/Klaviyo-Logo-Photoroom.webp' }
  ];

  const valueProps = [
    {
      icon: Sparkles,
      title: 'Bandeja con Asistente de IA',
      description: 'El Cerebro de IA analiza tu negocio y te ayuda a redactar borradores perfectos al instante.'
    },
    {
      icon: TrendingUp,
      title: 'Monitoreo de ROAS en un clic',
      description: 'Centralizá el presupuesto publicitario de Meta, TikTok y Google Ads contrastándolo con ventas reales.'
    },
    {
      icon: ShoppingBag,
      title: 'Sincronizador Automático',
      description: 'Modificá tu stock o catálogo y mirá cómo se propaga a todas tus tiendas en tiempo real.'
    },
    {
      icon: Mail,
      title: 'Retención de Clientes',
      description: 'Enlazá herramientas como Klaviyo para reactivar carritos y fidelizar compradores sin esfuerzo.'
    }
  ];

  const faqs = [
    {
      q: '¿Qué integraciones puedo conectar y cuánto tiempo toma?',
      a: 'Podés conectar Shopify, Tiendanube, WooCommerce, Mercado Libre, Google Ads, Meta Ads, TikTok Ads y Klaviyo en menos de 5 minutos. La integración se realiza mediante protocolos OAuth oficiales y seguros con un par de clics, sin requerir conocimientos técnicos ni programación.'
    },
    {
      q: '¿Puedo cancelar mi suscripción en cualquier momento?',
      a: 'Sí, absolutamente. No hay contratos de permanencia ni cláusulas ocultas. Podés dar de baja o pausar tu plan corporativo con un solo clic desde tu panel de facturación en el momento que quieras, sin ningún tipo de cargo adicional por cancelación.'
    },
    {
      q: '¿Cómo ayuda el Cerebro de IA a automatizar mi soporte?',
      a: 'La inteligencia artificial analiza el contenido de tu web, tus políticas y las preguntas frecuentes cargadas. A partir de allí, asiste a tus agentes de atención sugiriendo borradores de respuestas perfectas con stock y precios en tiempo real para despachar con un solo clic.'
    },
    {
      q: '¿Tienen soporte técnico durante la configuración inicial?',
      a: 'Sí. Nuestro equipo técnico de soporte te guiará de forma personalizada y sin costo a través de videollamada para conectar todas tus tiendas y cuentas publicitarias paso a paso, asegurando que tu stock y campañas queden perfectamente integrados.'
    },
    {
      q: '¿Cuántos agentes de atención o tiendas puedo configurar?',
      a: 'Todos los que necesites. Nuestro plan de tarifa plana corporativo incluye agentes, sucursales y tiendas conectadas ilimitadas. No cobramos cargos sorpresa ni costos adicionales por usuario colaborador registrado.'
    }
  ];

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 selection:bg-violet-500 selection:text-white overflow-x-hidden ${darkMode ? 'bg-[#000000] text-zinc-100' : 'bg-[#fafafc] text-zinc-900'}`}>
      
      {/* Estilos CSS Embebidos para Animaciones Marquee e Interactivas */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: flex;
          width: max-content;
          animation: marquee 28s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
        .glow-hover:hover {
          box-shadow: 0 0 30px rgba(139, 92, 246, 0.25);
        }
        .pulse-sync {
          animation: pulseGlow 0.8s ease-out;
        }
        @keyframes pulseGlow {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
          70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(139, 92, 246, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
        }
      `}} />

      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-md border-b transition-all duration-300 ${darkMode ? 'bg-black/85 border-white/[0.06]' : 'bg-[#fafafc]/85 border-zinc-200/50'}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-7 h-7 object-contain"
            />
            <div>
              <span className="text-[13px] font-black tracking-tight uppercase leading-none block">
                ALGORITMIA
              </span>
              <span className="text-[8.5px] font-bold text-violet-500 tracking-[0.25em] uppercase">Gestión</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleDarkMode}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
                darkMode ? 'bg-white/5 border-white/8 text-zinc-400 hover:bg-white/10 hover:text-white' : 'bg-white border-zinc-200/80 text-zinc-500 hover:bg-zinc-50 shadow-sm'
              }`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
            </button>
            <Link
              to="/login"
              className={`h-9 px-4 rounded-xl text-[12px] font-extrabold flex items-center transition-all duration-200 ${
                darkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-md shadow-zinc-900/10'
              }`}
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-20 overflow-hidden">
        {/* Glows de fondo */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/5 dark:bg-violet-600/5 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <Sparkles className="w-3.5 h-3.5" /> Ecosistema Multitienda y Omnicanal
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight max-w-4xl mx-auto leading-[1.05] mb-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            Tu operación comercial en una sola pantalla.
          </h1>
          
          <p className={`text-base sm:text-lg md:text-[21px] max-w-2xl mx-auto leading-relaxed mb-10 font-medium animate-in fade-in slide-in-from-bottom-6 duration-700 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Conectá tus tiendas online, marketplaces y canales de chat. Simplificá tu control de inventario y optimizá tu pauta publicitaria desde una interfaz profesional.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-in fade-in slide-in-from-bottom-7 duration-1000">
            <Link
              to="/login"
              className="w-full sm:w-auto h-12 px-8 bg-violet-600 hover:bg-violet-500 text-white font-extrabold rounded-2xl text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 active:scale-[0.98] transition-all glow-hover"
            >
              Comenzar prueba gratis <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#interactive-demo"
              className={`w-full sm:w-auto h-12 px-8 border font-extrabold rounded-2xl text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                darkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm'
              }`}
            >
              Ver maquetas interactivas
            </a>
          </div>

          {/* High-Fidelity Showcase Gallery Selector */}
          <div id="platform-showcase" className="relative max-w-5xl mx-auto rounded-3xl border p-2 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/80 dark:border-white/[0.06] shadow-2xl shadow-zinc-950/5 dark:shadow-black/40 overflow-hidden animate-in fade-in zoom-in-95 duration-1000">
            <div className={`w-full rounded-2xl border ${darkMode ? 'bg-[#0a0a0c] border-white/[0.05]' : 'bg-white border-zinc-200'} overflow-hidden`}>
              
              {/* Tab Selector Header */}
              <div className="flex border-b border-zinc-200/50 dark:border-white/[0.05] overflow-x-auto scrollbar-none bg-zinc-50/50 dark:bg-zinc-950/20 p-2 md:p-3 gap-1">
                {showcaseTabs.map((tab) => {
                  const isActive = activeTabShowcase === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTabShowcase(tab.id as any)}
                      className={`h-9 px-4 rounded-xl text-[12px] font-black transition-all flex items-center justify-center shrink-0 border ${
                        isActive
                          ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/10'
                          : 'border-transparent text-zinc-550 dark:text-zinc-400 hover:bg-zinc-200/40 dark:hover:bg-white/5'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Showcase Content Container */}
              <div className="p-4 md:p-6 text-left space-y-4">
                <p className={`text-[12.5px] font-semibold leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {showcaseTabs.find(t => t.id === activeTabShowcase)?.desc}
                </p>
                <div className="relative rounded-xl border border-zinc-200/80 dark:border-white/[0.05] overflow-hidden bg-zinc-950 shadow-inner">
                  <img
                    src={showcaseTabs.find(t => t.id === activeTabShowcase)?.img}
                    alt={showcaseTabs.find(t => t.id === activeTabShowcase)?.label}
                    className="w-full object-cover transition-opacity duration-300 animate-in fade-in"
                    style={{ minHeight: '300px' }}
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Infinite Logo Marquee (Slider / Carousel) */}
      <section className={`py-10 border-t border-b overflow-hidden ${darkMode ? 'bg-zinc-950/40 border-white/[0.04]' : 'bg-zinc-50/50 border-zinc-200/50'}`}>
        <div className="max-w-7xl mx-auto px-6 mb-6">
          <p className="text-center text-[10px] font-extrabold text-zinc-400 dark:text-zinc-550 uppercase tracking-[0.25em]">
            CONEXIÓN DIRECTA CON TUS PLATAFORMAS PUBLICITARIAS Y DE E-COMMERCE
          </p>
        </div>
        
        {/* Infinite Scrolling Row */}
        <div className="relative w-full flex overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#fafafc] dark:from-[#000] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#fafafc] dark:from-[#000] to-transparent z-10 pointer-events-none" />
          
          <div className="animate-marquee py-2 gap-12 md:gap-16">
            {/* Primero renderizamos la lista completa */}
            {integrations.concat(integrations).map((item, idx) => (
              <div 
                key={`${item.name}-${idx}`} 
                className="flex items-center gap-3 opacity-90 hover:opacity-100 transition-all duration-300 cursor-pointer h-12 px-6 rounded-2xl bg-zinc-200/10 dark:bg-white/[0.02] border border-transparent hover:border-violet-500/20"
              >
                <img
                  src={darkMode && item.darkLogo ? item.darkLogo : item.logo}
                  alt={item.name}
                  className="h-7 md:h-8 object-contain max-w-[120px]"
                />
                <span className="text-[13px] font-extrabold tracking-tight">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Secciones Interactivas de Demostración del Producto */}
      <section id="interactive-demo" className="py-24 max-w-7xl mx-auto px-6 space-y-32">
        
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-[10px] font-extrabold text-violet-500 uppercase tracking-widest block mb-3">DEMO EN VIVO</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-none">Interactúa con nuestras soluciones</h2>
          <p className={`text-base font-semibold mt-3 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Probá el comportamiento de la plataforma en tiempo real con estas maquetas interactivas.</p>
        </div>

        {/* 1. MAQUETA INTERACTIVA DE INBOX OMNICANAL */}
        <div className="flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-violet-500" />
            </div>
            <h3 className="text-2xl sm:text-4xl font-black tracking-tight">Inbox Unificado asistido por IA</h3>
            <p className={`text-[15px] sm:text-base leading-relaxed font-semibold ${darkMode ? 'text-zinc-450' : 'text-zinc-500'}`}>
              Centralizá las consultas de Instagram, Facebook y WhatsApp. Nuestro Cerebro de IA lee la consulta y sugiere borradores exactos basados en tu stock e historial para responder con un solo clic.
            </p>
            
            <div className="pt-2">
              <button 
                onClick={handleSendAiResponse}
                disabled={chatStatus !== 'idle'}
                className={`h-11 px-6 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-extrabold rounded-2xl text-[12px] flex items-center gap-2 transition-all active:scale-[0.98] shadow-md shadow-violet-600/10`}
              >
                {chatStatus === 'idle' && (
                  <>Simular respuesta sugerida por IA <ArrowRight className="w-4 h-4" /></>
                )}
                {chatStatus === 'sending' && (
                  <>IA redactando borrador... <RefreshCw className="w-3.5 h-3.5 animate-spin" /></>
                )}
                {chatStatus === 'sent' && (
                  <>¡Respuesta enviada! 🎉</>
                )}
              </button>
              {chatStatus === 'sent' && (
                <button 
                  onClick={handleResetChat}
                  className="mt-3 text-[11px] font-bold text-violet-500 hover:underline block"
                >
                  Reiniciar simulación
                </button>
              )}
            </div>
          </div>

          {/* Caja Interactiva de Chat */}
          <div className="flex-1 w-full rounded-3xl border p-2 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/80 dark:border-white/[0.06] shadow-xl">
            <div className={`rounded-2xl border ${darkMode ? 'bg-[#0b0b0d]/90 border-white/[0.05]' : 'bg-white border-zinc-250/50'} overflow-hidden h-[380px] flex flex-col justify-between`}>
              
              {/* Encabezado del Chat */}
              <div className="flex items-center justify-between p-4 border-b border-zinc-200/50 dark:border-white/[0.05] bg-zinc-100/30 dark:bg-zinc-950/40">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-pink-500 flex items-center justify-center text-white text-xs font-bold font-mono">SR</div>
                  <div>
                    <p className="text-[12px] font-bold">Sofía Rodríguez</p>
                    <p className="text-[9px] text-zinc-450 flex items-center gap-1 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-500" /> Instagram DM
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${chatStatus === 'sent' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                  {chatStatus === 'sent' ? 'Respondido' : 'Pendiente'}
                </span>
              </div>

              {/* Mensajes */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                {chatMessages.map(msg => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col max-w-[80%] ${msg.sender === 'ai' ? 'ml-auto items-end animate-in slide-in-from-bottom-2 duration-300' : 'items-start'}`}
                  >
                    <div className={`p-3 rounded-2xl text-[12px] font-medium leading-relaxed ${
                      msg.sender === 'ai' 
                        ? 'bg-violet-600 text-white rounded-tr-none' 
                        : (darkMode ? 'bg-zinc-900 text-zinc-250 rounded-tl-none' : 'bg-zinc-100 text-zinc-800 rounded-tl-none')
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[8.5px] text-zinc-500 font-semibold mt-1 px-1">{msg.time}</span>
                  </div>
                ))}

                {chatStatus === 'sending' && (
                  <div className="flex items-center gap-1 p-3 rounded-2xl bg-zinc-900/50 max-w-[80px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>

              {/* Caja de Entrada + Sugerencia de IA */}
              <div className="p-4 border-t border-zinc-200/50 dark:border-white/[0.05] bg-zinc-100/30 dark:bg-zinc-950/40">
                {chatStatus === 'idle' && (
                  <div className={`p-3 rounded-xl border mb-3 flex flex-col gap-1.5 text-left transition-all ${
                    darkMode ? 'bg-violet-950/10 border-violet-500/20' : 'bg-violet-50 border-violet-200'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-[10px] font-black uppercase text-violet-600 dark:text-violet-400 tracking-wider">Cerebro de IA — Respuesta Sugerida</span>
                    </div>
                    <p className={`text-[11px] leading-relaxed font-semibold ${darkMode ? 'text-zinc-300' : 'text-zinc-650'}`}>
                      "¡Hola Sofía! Sí, nos queda la última unidad en talle S de ese tapado..."
                    </p>
                    <button 
                      onClick={handleSendAiResponse}
                      className="mt-1 self-start text-[10px] font-black text-violet-600 dark:text-violet-400 hover:underline uppercase flex items-center gap-0.5"
                    >
                      Aprobar y enviar <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Escribí una respuesta..." 
                    readOnly
                    className={`flex-1 h-9 px-3 rounded-xl text-xs outline-none border ${
                      darkMode ? 'bg-zinc-900 border-white/[0.05] text-zinc-400' : 'bg-zinc-50 border-zinc-250/50 text-zinc-500'
                    }`}
                  />
                  <button className="h-9 w-9 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* 2. MAQUETA INTERACTIVA DE SINCRONIZACIÓN DE STOCK */}
        <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
          <div className="flex-1 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-cyan-400" />
            </div>
            <h3 className="text-2xl sm:text-4xl font-black tracking-tight">Sincronización Multitienda en Vivo</h3>
            <p className={`text-[15px] sm:text-base leading-relaxed font-semibold ${darkMode ? 'text-zinc-455' : 'text-zinc-500'}`}>
              Evitá la sobreventa. Cuando vendés en un local físico o actualizás el stock manualmente desde el panel de Algoritmia, el inventario se ajusta instantáneamente en Mercado Libre, Shopify, Tiendanube y WooCommerce.
            </p>

            {/* Selector Interactivo de Demo */}
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-white/[0.05] bg-zinc-100/30 dark:bg-zinc-950/20 max-w-sm flex items-center justify-between">
              <div>
                <p className="text-[12px] font-black uppercase text-zinc-400 tracking-wider">Modificar Inventario</p>
                <p className="text-[10px] text-zinc-450 font-semibold mt-0.5">Simulá un ajuste de stock</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleUpdateStock(-1)}
                  className="w-8 h-8 rounded-xl border border-zinc-250 dark:border-white/10 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-white/5 transition-all text-zinc-400 active:scale-90"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-lg font-black w-6 text-center">{stock}</span>
                <button 
                  onClick={() => handleUpdateStock(1)}
                  className="w-8 h-8 rounded-xl border border-zinc-250 dark:border-white/10 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-white/5 transition-all text-zinc-400 active:scale-90"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Representación Visual de Sincronización */}
          <div className="flex-1 w-full rounded-3xl border p-2 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/80 dark:border-white/[0.06] shadow-xl">
            <div className={`p-6 rounded-2xl border ${darkMode ? 'bg-[#0b0b0d]/90 border-white/[0.05]' : 'bg-white border-zinc-250/50'} space-y-6 text-left`}>
              
              {/* Product Info */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-250/50 dark:border-white/[0.05] flex items-center justify-center text-2xl">🧥</div>
                <div>
                  <h4 className="text-[14px] font-black">Tapado de Cuero Premium</h4>
                  <p className="text-[10px] text-zinc-450 font-semibold mt-0.5">SKU: TAP-CL-01 · $89,900</p>
                  <span className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black text-emerald-500 bg-emerald-550/10">
                    <span className="w-1 h-1 rounded-full bg-emerald-500" /> Stock Unificado: {stock} unidades
                  </span>
                </div>
              </div>

              {/* Stores Grid Sincronizados */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: 'Shopify', logo: '/assets/shopify-bag.webp', label: 'tienda-online' },
                  { name: 'Tiendanube', logo: '/assets/tiendanubeoscuro.png', darkLogo: '/assets/tiendanube.webp', label: 'Zane Labs' },
                  { name: 'WooCommerce', logo: '/assets/logowordpress.webp', label: 'wordpress-site' },
                  { name: 'Mercado Libre', logo: '/assets/logomercadolibre.png', label: 'LUCAGAZZE10' }
                ].map((store) => (
                  <div 
                    key={store.name}
                    className={`p-3.5 rounded-xl border transition-all duration-300 flex items-center justify-between ${
                      syncPulse 
                        ? 'pulse-sync border-violet-500 bg-violet-500/[0.02]' 
                        : (darkMode ? 'bg-zinc-900/30 border-white/[0.04]' : 'bg-zinc-50/60 border-zinc-200')
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img 
                        src={darkMode && store.darkLogo ? store.darkLogo : store.logo} 
                        alt={store.name} 
                        className="w-8 h-8 object-contain flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] font-black leading-none">{store.name}</p>
                        <p className="text-[8.5px] text-zinc-450 truncate mt-0.5">{store.label}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[13px] font-black text-violet-500">{stock}</span>
                      <span className="text-[7.5px] font-extrabold text-zinc-500 tracking-wider">UNIDADES</span>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>

      </section>

      {/* Problem vs Solution Section (Ultra-Minimalist) */}
      <section className="py-24 max-w-7xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.04]">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-[10px] font-extrabold text-violet-500 uppercase tracking-widest block mb-3">EL DESAFÍO</span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight leading-none">Menos fricción, más ventas</h2>
          <p className="text-[13.5px] font-bold text-zinc-450 mt-2">Cómo Algoritmia reemplaza el desorden operativo tradicional.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Problem Card */}
          <div className={`p-8 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-zinc-950/40 border-red-500/10' : 'bg-white border-zinc-200/60 shadow-sm'}`}>
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-6">
              <span className="text-red-500 font-extrabold text-[15px]">✕</span>
            </div>
            <h3 className="text-[17px] font-black mb-4">El caos operativo tradicional</h3>
            <ul className="space-y-4 text-[13.5px] font-semibold text-zinc-500 dark:text-zinc-450">
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 mt-0.5">•</span> Clientes que esperan horas por respuestas de stock en Instagram.
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 mt-0.5">•</span> Ventas canceladas porque vendiste un producto sin stock real.
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 mt-0.5">•</span> Imposibilidad de saber cuál anuncio de Meta Ads realmente generó pedidos.
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 mt-0.5">•</span> Información del cliente fragmentada en múltiples planillas y sistemas.
              </li>
            </ul>
          </div>

          {/* Solution Card */}
          <div className={`p-8 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-violet-950/5 border-violet-500/15' : 'bg-violet-500/[0.01] border-violet-200/50 shadow-sm'}`}>
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-6">
              <Check className="w-4.5 h-4.5 text-violet-500" />
            </div>
            <h3 className="text-[17px] font-black mb-4">La solución unificada de Algoritmia</h3>
            <ul className="space-y-4 text-[13.5px] font-semibold text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Respuestas inmediatas unificando WhatsApp e Instagram DM.
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Sincronización en tiempo real de variantes y catálogo completo.
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Atribución real de pauta Meta/TikTok para entender tu ROAS real.
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> Ficha de cliente integrada con pedidos, chats e historial de notas.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Grid Features (Value Props) */}
      <section className="py-20 max-w-7xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.04]">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-[10px] font-extrabold text-violet-500 uppercase tracking-widest block mb-3">TECNOLOGÍA</span>
          <h2 className="text-3xl font-black tracking-tight leading-none">Diseñado para la eficiencia operativa</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {valueProps.map((prop) => {
            const Icon = prop.icon;
            return (
              <div key={prop.title} className={`p-6 rounded-3xl border transition-all duration-300 hover:scale-[1.01] ${darkMode ? 'bg-zinc-900/20 border-white/[0.05]' : 'bg-white border-zinc-200/60 shadow-sm'}`}>
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-5">
                  <Icon className="w-4.5 h-4.5 text-violet-500" />
                </div>
                <h4 className="text-[15px] font-extrabold mb-2.5">{prop.title}</h4>
                <p className={`text-[12.5px] leading-relaxed font-semibold ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{prop.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Corporate Pricing Card (Minimalist Apple style) */}
      <section className="py-24 max-w-3xl mx-auto px-6 text-center border-t border-zinc-200/40 dark:border-white/[0.04]">
        <div className="mb-12">
          <span className="text-[10px] font-extrabold text-violet-500 uppercase tracking-widest block mb-3">PRECIO SIMPLE</span>
          <h2 className="text-3xl font-black tracking-tight mb-4">Todo el poder, un único plan corporativo</h2>
          <p className={`text-[14px] font-semibold ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Integración completa y asistencia sin límites para tu equipo de trabajo.</p>
        </div>

        <div className={`rounded-3xl border p-8 relative overflow-hidden text-left transition-all duration-300 ${
          darkMode ? 'bg-zinc-950/60 border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'bg-white border-zinc-200 shadow-xl shadow-zinc-200/10'
        }`}>
          <div className="absolute top-0 right-0 bg-violet-600 text-white font-extrabold text-[9px] uppercase tracking-wider px-3.5 py-1 rounded-bl-xl">POPULAR</div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-white/[0.06] pb-6 mb-6">
            <div>
              <h3 className="text-lg font-black">Plan Corporativo</h3>
              <p className="text-[12.5px] text-zinc-400 font-semibold mt-1">Sincronización total multitienda e IA.</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-black">$ 49</span>
              <span className="text-zinc-450 font-semibold text-[13px]">/ mes</span>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            {[
              'Sincronización en tiempo real de Shopify, Tiendanube, WooCommerce y ML',
              'Bandeja omnicanal de mensajes (WhatsApp, Instagram y Facebook)',
              'Sugerencias inteligentes basadas en Cerebro de IA ilimitadas',
              'Monitoreo integral de pauta publicitaria (Meta, TikTok y Google Ads)',
              'Agentes y colaboradores de soporte sin costos adicionales',
              'Soporte corporativo y prioritario 24/7'
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-3 text-[13px] font-semibold">
                <Check className="w-4.5 h-4.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <Link
            to="/login"
            className="w-full h-11 bg-violet-600 hover:bg-violet-500 text-white font-extrabold rounded-2xl text-[13px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md shadow-violet-600/10 glow-hover"
          >
            Comenzar mi prueba gratuita
          </Link>
        </div>
      </section>

      {/* FAQ Section (Accordion) */}
      <section className="py-24 max-w-4xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.04]">
        <div className="text-center mb-12">
          <span className="text-[10px] font-extrabold text-violet-500 uppercase tracking-widest block mb-2">RESPUESTAS RÁPIDAS</span>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-center">Preguntas frecuentes</h2>
        </div>
        <div className="space-y-3.5">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={faq.q}
                className={`rounded-2xl border transition-all duration-300 ${
                  isOpen 
                    ? (darkMode ? 'bg-zinc-900/35 border-violet-500/20 shadow-md' : 'bg-violet-500/[0.01] border-violet-500/20 shadow-sm')
                    : (darkMode ? 'bg-[#060608]/40 border-white/[0.04] hover:bg-zinc-900/20 hover:border-white/[0.08]' : 'bg-white border-zinc-200/60 hover:bg-zinc-50/50')
                }`}
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-6 py-4.5 flex items-center justify-between gap-4 text-left"
                >
                  <span className={`text-[14.0px] sm:text-[14.5px] font-bold tracking-tight transition-colors duration-250 ${isOpen ? 'text-violet-500 dark:text-violet-400' : 'text-zinc-800 dark:text-zinc-250'}`}>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-violet-500' : ''}`} />
                </button>
                {isOpen && (
                  <div className={`px-6 pb-5 text-[13px] leading-relaxed font-medium border-t pt-3.5 animate-in fade-in duration-300 ${
                    darkMode ? 'text-zinc-400 border-white/[0.04]' : 'text-zinc-550 border-zinc-100'
                  }`}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Call to Action Final */}
      <section className={`py-20 text-center relative overflow-hidden ${darkMode ? 'bg-zinc-950/20 border-t border-white/[0.04]' : 'bg-zinc-50 border-t border-zinc-200/50'}`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 relative z-10 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Optimiza tu gestión comercial hoy</h2>
          <p className={`text-[14px] font-semibold max-w-md mx-auto ${darkMode ? 'text-zinc-500' : 'text-zinc-450'}`}>
            Conectá tus canales de venta y automatizá tu soporte técnico de manera inmediata.
          </p>
          <div className="flex justify-center pt-2">
            <Link
              to="/login"
              className="h-12 px-8 bg-violet-600 hover:bg-violet-500 text-white font-extrabold rounded-2xl text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-violet-600/15 active:scale-[0.98] transition-all glow-hover"
            >
              Crear mi cuenta <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`py-12 border-t text-center ${darkMode ? 'bg-black border-white/[0.06] text-zinc-650' : 'bg-white border-zinc-200/50 text-zinc-400'}`}>
        <div className="max-w-7xl mx-auto px-6 space-y-6">
          <div className="flex items-center justify-center gap-2">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-5 h-5 object-contain"
            />
            <span className="text-[11px] font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">ALGORITMIA</span>
          </div>
          <p className="text-[11.5px] font-semibold max-w-sm mx-auto leading-relaxed">
            Ecosistema de control y automatización omnicanal para e-commerce. Diseñado por Algoritmia Desarrollos.
          </p>
          <div className="flex justify-center gap-6 text-[11px] font-extrabold">
            <Link to="/privacidad" className="hover:underline">Políticas de Privacidad</Link>
            <Link to="/soporte" className="hover:underline">Soporte Técnico</Link>
          </div>
          <p className="text-[10px] font-medium text-zinc-500 pt-2">
            &copy; {new Date().getFullYear()} Algoritmia Desarrollos. Todos los derechos reservados.
          </p>
        </div>
      </footer>

    </div>
  );
}
