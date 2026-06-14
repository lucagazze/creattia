import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageSquare,
  TrendingUp,
  Mail,
  Check,
  ChevronDown,
  ArrowRight,
  Sparkles,
  Sun,
  Moon,
  RefreshCw,
  ArrowUpRight,
  Zap,
  ShoppingBag
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

  // Tabbed high-fidelity screenshots switcher
  const [activeTabShowcase, setActiveTabShowcase] = useState<'inicio' | 'mensajeria' | 'comentarios' | 'pedidos' | 'inventario' | 'analisis' | 'creativos' | 'meta_ads' | 'perfil_dark'>('inicio');
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const showcaseTabs = [
    { id: 'inicio', label: 'Inicio', img: '/assets/landing_inicio.jpg', desc: 'Panel principal unificado. Resumen ejecutivo de ingresos acumulados, pedidos totales, productos estrella analizados y métricas clave en tiempo real.' },
    { id: 'mensajeria', label: 'Mensajería Directa', img: '/assets/landing_mensajeria.jpg', desc: 'Chat inbox consolidado para Instagram Direct y Facebook Messenger. Leé mensajes y redactá borradores con sugerencias de Inteligencia Artificial.' },
    { id: 'comentarios', label: 'Moderación Comentarios', img: '/assets/landing_comentarios.jpg', desc: 'Bandeja omnicanal integrada. Respondé consultas en posts orgánicos y campañas pagas (Ads) con flujos automatizados de respuesta rápida.' },
    { id: 'pedidos', label: 'Control Pedidos', img: '/assets/landing_pedidos.jpg', desc: 'Visualización detallada de facturación, pasarelas de pago utilizadas, histórico de compras y estado logístico de las entregas.' },
    { id: 'inventario', label: 'Stock & Variaciones', img: '/assets/landing_inventario.jpg', desc: 'Monitoreo sincronizado de stock, precios y variantes de productos en múltiples plataformas de e-commerce en simultáneo.' },
    { id: 'analisis', label: 'Análisis de Productos', img: '/assets/landing_creativos.jpg', desc: 'Embudo inteligente de comportamiento. Tasas de primer pedido (Entry Point), retención, velocidad de retorno (LTV) y cross-sell sugerido por producto.' },
    { id: 'creativos', label: 'Creativos Ads', img: '/assets/landing_analisis.jpg', desc: 'Panel centralizado de anuncios activos en Meta Ads. Compará rendimiento de creativos, gasto, CTR y ROAS en un solo lugar para escalar lo que funciona.' },
    { id: 'meta_ads', label: 'Meta Ads Analytics', img: '/assets/landing_meta_ads.jpg', desc: 'Estadísticas unificadas de rendimiento de pauta. Control de gasto real, alcance total, clicks, conversiones, CTR, ROAS y CPA exactos.' },
    { id: 'perfil_dark', label: 'Diseño Premium', img: '/assets/landing_perfil_dark.jpg', desc: 'Experiencia visual inmersiva. Configuración y administración con tema noche oscuro (Dark Mode) adaptativo de alto contraste.' }
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
    <div className={`min-h-screen font-sans transition-colors duration-500 selection:bg-violet-500 selection:text-white overflow-x-hidden ${darkMode ? 'bg-[#030303] text-zinc-200' : 'bg-[#fafafc] text-zinc-800'}`}>
      
      {/* Estilos CSS Embebidos para Animaciones Marquee e Interactivas */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: flex;
          width: max-content;
          animation: marquee 32s linear infinite;
        }
        .glow-hover:hover {
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.15);
        }
        .pulse-sync {
          animation: pulseGlow 0.8s ease-out;
        }
        @keyframes pulseGlow {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.3); }
          70% { transform: scale(1.015); box-shadow: 0 0 0 6px rgba(139, 92, 246, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
        }
      `}} />
      <header className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b transition-all duration-300 ${darkMode ? 'bg-[#030303]/85 border-white/[0.04]' : 'bg-[#fafafc]/85 border-zinc-200/40'}`}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-[26px] h-[26px] object-contain"
            />
            <div>
              <span className="text-[11.5px] font-bold tracking-tight uppercase leading-none block font-display">
                ALGORITMIA
              </span>
              <span className="text-[7.5px] font-bold text-violet-500 tracking-[0.25em] uppercase block mt-0.5">Gestión</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
                darkMode ? 'bg-white/5 border-white/8 text-zinc-400 hover:bg-white/10 hover:text-white' : 'bg-white border-zinc-200/60 text-zinc-500 hover:bg-zinc-50 shadow-sm'
              }`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-zinc-500" />}
            </button>
            <Link
              to="/login"
              className={`h-8 px-3.5 rounded-lg text-[11px] font-bold flex items-center transition-all duration-200 ${
                darkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shadow-zinc-900/10'
              }`}
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 sm:pt-28 pb-16 overflow-hidden">
        {/* Glows de fondo */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-600/5 dark:bg-violet-600/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-6xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/15 mb-6 animate-in fade-in slide-in-from-top-4 duration-500 font-sans">
            <Sparkles className="w-3 h-3" /> Ecosistema Multitienda y Omnicanal
          </div>
          
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[52px] font-bold tracking-tight max-w-3xl mx-auto leading-[1.12] mb-5 font-display text-zinc-900 dark:text-zinc-50 animate-in fade-in slide-in-from-bottom-5 duration-700">
            La mejor plataforma para gestionar tu negocio online
          </h1>
          
          <p className={`text-[13.5px] sm:text-[14.5px] max-w-xl mx-auto leading-relaxed mb-8 font-medium animate-in fade-in slide-in-from-bottom-6 duration-700 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Conectá tus tiendas online, marketplaces y canales de chat. Simplificá tu control de inventario y optimizá tu pauta publicitaria desde una interfaz unificada y veloz.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-14 animate-in fade-in slide-in-from-bottom-7 duration-1000">
            <Link
              to="/login"
              className="w-full sm:w-auto h-9 px-5 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg text-[11.5px] flex items-center justify-center gap-1.5 shadow-sm shadow-violet-600/10 active:scale-[0.98] transition-all glow-hover"
            >
              Comenzar prueba gratis <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <a
              href="#interactive-demo"
              className={`w-full sm:w-auto h-9 px-5 border font-bold rounded-lg text-[11.5px] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
                darkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm'
              }`}
            >
              Ver maquetas interactivas
            </a>
          </div>

          {/* High-Fidelity Showcase Gallery Selector */}
          <div id="platform-showcase" className="relative max-w-4xl mx-auto rounded-2xl border p-1 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/50 dark:border-white/[0.04] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-1000">
            <div className={`w-full rounded-xl border ${darkMode ? 'bg-[#060608] border-white/[0.04]' : 'bg-white border-zinc-200/60'} overflow-hidden`}>
              
              {/* Tab Selector Header */}
              <div className="flex border-b border-zinc-200/40 dark:border-white/[0.04] overflow-x-auto scrollbar-none bg-zinc-50/30 dark:bg-zinc-950/20 p-2 gap-1">
                {showcaseTabs.map((tab) => {
                  const isActive = activeTabShowcase === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTabShowcase(tab.id as any)}
                      className={`h-7 px-3 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center shrink-0 border ${
                        isActive
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-600/10 font-display'
                          : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/40 dark:hover:bg-white/5'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Showcase Content Container */}
              <div className="p-4 md:p-5 text-left space-y-3">
                <p className={`text-[11.5px] font-medium leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {showcaseTabs.find(t => t.id === activeTabShowcase)?.desc}
                </p>
                <div 
                  className="relative rounded-lg border border-zinc-200/40 dark:border-white/[0.04] overflow-hidden bg-zinc-950/40 dark:bg-zinc-950/80 shadow-inner cursor-zoom-in group"
                  onClick={() => setZoomImage(showcaseTabs.find(t => t.id === activeTabShowcase)?.img || null)}
                >
                  <img
                    src={showcaseTabs.find(t => t.id === activeTabShowcase)?.img}
                    alt={showcaseTabs.find(t => t.id === activeTabShowcase)?.label}
                    className="w-full h-auto max-h-[500px] object-contain transition-all duration-300 animate-in fade-in block mx-auto group-hover:scale-[1.005]"
                  />
                  <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1 shadow border border-white/10 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
                    <Sparkles className="w-2.5 h-2.5 text-violet-400" /> Tocar para ampliar
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Infinite Logo Marquee (Slider / Carousel) */}
      <section className={`py-8 border-t border-b overflow-hidden ${darkMode ? 'bg-zinc-950/30 border-white/[0.03]' : 'bg-zinc-50/30 border-zinc-200/40'}`}>
        <div className="max-w-6xl mx-auto px-6 mb-4">
          <p className="text-center text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-sans">
            CONEXIÓN DIRECTA CON TUS PLATAFORMAS PUBLICITARIAS Y DE E-COMMERCE
          </p>
        </div>
        
        {/* Infinite Scrolling Row */}
        <div className="relative w-full flex overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#fafafc] dark:from-[#030303] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#fafafc] dark:from-[#030303] to-transparent z-10 pointer-events-none" />
          
          <div className="animate-marquee py-1 gap-8 md:gap-12">
            {integrations.concat(integrations).map((item, idx) => (
              <div 
                key={`${item.name}-${idx}`} 
                className="flex items-center gap-2.5 opacity-80 hover:opacity-100 transition-all duration-300 cursor-pointer h-9 px-4 rounded-xl bg-zinc-200/10 dark:bg-white/[0.01] border border-transparent hover:border-violet-500/10"
              >
                <img
                  src={darkMode && item.darkLogo ? item.darkLogo : item.logo}
                  alt={item.name}
                  className="h-5 object-contain max-w-[100px]"
                />
                <span className="text-[11px] font-bold tracking-tight">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Secciones Interactivas de Demostración del Producto */}
      <section id="interactive-demo" className="py-20 max-w-5xl mx-auto px-6 space-y-28">
        
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-[9px] font-bold text-violet-500 uppercase tracking-[0.2em] block mb-2">DEMO EN VIVO</span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display leading-tight text-zinc-900 dark:text-white">Interactúa con nuestras soluciones</h2>
          <p className={`text-[12.5px] mt-2 font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Probá el comportamiento de la plataforma en tiempo real con estas maquetas interactivas.</p>
        </div>

        {/* 1. MAQUETA INTERACTIVA DE INBOX OMNICANAL */}
        <div className="flex flex-col lg:flex-row items-center gap-10">
          <div className="flex-1 space-y-5">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-violet-500" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Inbox Unificado asistido por IA</h3>
            <p className={`text-[13px] leading-relaxed font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Centralizá las consultas de Instagram, Facebook y WhatsApp. Nuestro Cerebro de IA lee la consulta y sugiere borradores exactos basados en tu stock e historial para responder con un solo clic.
            </p>
            
            <div className="pt-1">
              <button 
                onClick={handleSendAiResponse}
                disabled={chatStatus !== 'idle'}
                className={`h-8 px-4 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold rounded-lg text-[11px] flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-sm shadow-violet-600/10`}
              >
                {chatStatus === 'idle' && (
                  <>Simular respuesta sugerida por IA <ArrowRight className="w-3.5 h-3.5" /></>
                )}
                {chatStatus === 'sending' && (
                  <>IA redactando borrador... <RefreshCw className="w-3 h-3 animate-spin" /></>
                )}
                {chatStatus === 'sent' && (
                  <>¡Respuesta enviada! 🎉</>
                )}
              </button>
              {chatStatus === 'sent' && (
                <button 
                  onClick={handleResetChat}
                  className="mt-2.5 text-[10px] font-semibold text-violet-500 hover:underline block"
                >
                  Reiniciar simulación
                </button>
              )}
            </div>
          </div>

          {/* Caja Interactiva de Chat */}
          <div className="flex-1 w-full rounded-2xl border p-1 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/50 dark:border-white/[0.04] shadow-lg">
            <div className={`rounded-xl border ${darkMode ? 'bg-[#060608]/90 border-white/[0.04]' : 'bg-white border-zinc-200/50'} overflow-hidden h-[330px] flex flex-col justify-between`}>
              
              {/* Encabezado del Chat */}
              <div className="flex items-center justify-between p-3 border-b border-zinc-200/40 dark:border-white/[0.04] bg-zinc-50/30 dark:bg-zinc-950/30">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-pink-500 flex items-center justify-center text-white text-[11px] font-bold font-mono">SR</div>
                  <div>
                    <p className="text-[11px] font-bold">Sofía Rodríguez</p>
                    <p className="text-[8.5px] text-zinc-500 flex items-center gap-1 font-semibold">
                      <span className="w-1 h-1 rounded-full bg-pink-500" /> Instagram DM
                    </p>
                  </div>
                </div>
                <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${chatStatus === 'sent' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                  {chatStatus === 'sent' ? 'Respondido' : 'Pendiente'}
                </span>
              </div>

              {/* Mensajes */}
              <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
                {chatMessages.map(msg => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col max-w-[80%] ${msg.sender === 'ai' ? 'ml-auto items-end animate-in slide-in-from-bottom-2 duration-300' : 'items-start'}`}
                  >
                    <div className={`p-2.5 rounded-xl text-[11px] font-medium leading-relaxed ${
                      msg.sender === 'ai' 
                        ? 'bg-violet-600 text-white rounded-tr-none' 
                        : (darkMode ? 'bg-zinc-900 text-zinc-300 rounded-tl-none' : 'bg-zinc-100 text-zinc-800 rounded-tl-none')
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[8px] text-zinc-500 font-semibold mt-0.5 px-1">{msg.time}</span>
                  </div>
                ))}

                {chatStatus === 'sending' && (
                  <div className="flex items-center gap-1 p-2.5 rounded-xl bg-zinc-900/40 max-w-[70px]">
                    <span className="w-1 h-1 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>

              {/* Caja de Entrada + Sugerencia de IA */}
              <div className="p-3 border-t border-zinc-200/40 dark:border-white/[0.04] bg-zinc-50/30 dark:bg-zinc-950/30">
                {chatStatus === 'idle' && (
                  <div className={`p-2.5 rounded-lg border mb-2.5 flex flex-col gap-1 text-left transition-all ${
                    darkMode ? 'bg-violet-950/10 border-violet-500/15' : 'bg-violet-50 border-violet-200/50'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-violet-500" />
                      <span className="text-[9px] font-bold uppercase text-violet-600 dark:text-violet-400 tracking-wider">Cerebro de IA — Respuesta Sugerida</span>
                    </div>
                    <p className={`text-[10.5px] leading-relaxed font-semibold ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                      "¡Hola Sofía! Sí, nos queda la última unidad en talle S de ese tapado..."
                    </p>
                    <button 
                      onClick={handleSendAiResponse}
                      className="mt-1 self-start text-[9px] font-bold text-violet-600 dark:text-violet-400 hover:underline uppercase flex items-center gap-0.5"
                    >
                      Aprobar y enviar <ArrowUpRight className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Escribí una respuesta..." 
                    readOnly
                    className={`flex-1 h-8 px-2.5 rounded-lg text-[11px] outline-none border ${
                      darkMode ? 'bg-zinc-900 border-white/[0.04] text-zinc-400' : 'bg-zinc-50 border-zinc-200/55 text-zinc-500'
                    }`}
                  />
                  <button className="h-8 w-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* 2. MÉTRICAS Y RENTABILIDAD DEL NEGOCIO */}
        <div className="flex flex-col lg:flex-row-reverse items-center gap-10">
          <div className="flex-1 space-y-5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Analizá si tu negocio es rentable, en un solo vistazo</h3>
            <p className={`text-[13px] leading-relaxed font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Desde el panel principal, accedés a un resumen ejecutivo de todo tu negocio: ingresos acumulados, ticket promedio, pedidos por canal, productos más vendidos y comparación de períodos. Sin planillas, sin armados manuales.
            </p>
            <div className="flex flex-col gap-2.5 pt-1">
              {[
                { label: 'Ingresos de la tienda online', value: '$ 937.790', color: 'text-emerald-500' },
                { label: 'Retorno de publicidad (ROAS)', value: '10.8×', color: 'text-violet-500' },
                { label: 'Ingresos de email marketing', value: '$ 91.249', color: 'text-cyan-500' },
              ].map((kpi) => (
                <div key={kpi.label} className={`flex items-center justify-between p-2.5 rounded-lg border ${
                  darkMode ? 'bg-zinc-900/30 border-white/[0.04]' : 'bg-zinc-50 border-zinc-200/60'
                }`}>
                  <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{kpi.label}</span>
                  <span className={`text-[13px] font-bold ${kpi.color}`}>{kpi.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Imagen del Dashboard */}
          <div className="flex-1 w-full rounded-2xl border p-1 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/50 dark:border-white/[0.04] shadow-lg">
            <div
              className="relative rounded-xl overflow-hidden cursor-zoom-in group"
              onClick={() => setZoomImage('/assets/landing_inicio.jpg')}
            >
              <img
                src="/assets/landing_inicio.jpg"
                alt="Panel de métricas del negocio"
                className="w-full h-auto max-h-[380px] object-cover object-top transition-all duration-300 group-hover:scale-[1.01]"
              />
              <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1 shadow border border-white/10 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
                <Sparkles className="w-2.5 h-2.5 text-violet-400" /> Tocar para ampliar
              </div>
            </div>
          </div>
        </div>

        {/* 3. CREATIVOS ACTIVOS */}
        <div className="flex flex-col lg:flex-row items-center gap-10 border-t border-zinc-200/40 dark:border-white/[0.03] pt-20">
          <div className="flex-1 space-y-5">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-pink-500" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Identificá qué creativos están funcionando y cuáles no</h3>
            <p className={`text-[13px] leading-relaxed font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Visualizá todos tus anuncios activos en Meta Ads desde un solo lugar. Comparás alcance, clicks, conversiones y gasto en segundos para decidir qué escalar y qué pausar, sin salir de la plataforma.
            </p>
            <div className="flex flex-col gap-2.5 pt-1">
              {[
                { label: 'ROAS promedio de campañas activas', value: '4.8×', color: 'text-emerald-500' },
                { label: 'Creativos con CTR > 2%', value: '7 de 12', color: 'text-violet-500' },
                { label: 'Inversión total activa', value: '$ 42.500', color: 'text-pink-500' },
              ].map((kpi) => (
                <div key={kpi.label} className={`flex items-center justify-between p-2.5 rounded-lg border ${
                  darkMode ? 'bg-zinc-900/30 border-white/[0.04]' : 'bg-zinc-50 border-zinc-200/60'
                }`}>
                  <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{kpi.label}</span>
                  <span className={`text-[13px] font-bold ${kpi.color}`}>{kpi.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Imagen de Creativos */}
          <div className="flex-1 w-full rounded-2xl border p-1 bg-zinc-950/20 dark:bg-white/[0.01] border-zinc-200/50 dark:border-white/[0.04] shadow-lg">
            <div
              className="relative rounded-xl overflow-hidden cursor-zoom-in group"
              onClick={() => setZoomImage('/assets/landing_analisis.jpg')}
            >
              <img
                src="/assets/landing_analisis.jpg"
                alt="Panel de creativos activos"
                className="w-full h-auto max-h-[380px] object-cover object-top transition-all duration-300 group-hover:scale-[1.01]"
              />
              <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1 shadow border border-white/10 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
                <Sparkles className="w-2.5 h-2.5 text-violet-400" /> Tocar para ampliar
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* Problem vs Solution Section (Ultra-Minimalist) */}
      <section className="py-20 max-w-4xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.03]">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-[9px] font-bold text-violet-500 uppercase tracking-[0.2em] block mb-2">EL DESAFÍO</span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display leading-tight text-zinc-900 dark:text-white">Menos fricción, más ventas</h2>
          <p className="text-[12.5px] font-medium text-zinc-500 dark:text-zinc-400 mt-1.5">Cómo Algoritmia reemplaza el desorden operativo tradicional.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Problem Card */}
          <div className={`p-6 rounded-2xl border transition-all duration-300 ${darkMode ? 'bg-zinc-950/30 border-red-500/10' : 'bg-white border-zinc-200/50 shadow-sm'}`}>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center mb-5">
              <span className="text-red-500 font-bold text-[13px]">✕</span>
            </div>
            <h3 className="text-[14.5px] font-bold font-display mb-3 text-zinc-850 dark:text-zinc-100">El caos operativo tradicional</h3>
            <ul className="space-y-3.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span> Clientes que esperan horas por respuestas de stock en Instagram.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span> Ventas canceladas porque vendiste un producto sin stock real.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span> Imposibilidad de saber cuál anuncio de Meta Ads realmente generó pedidos.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span> Información del cliente fragmentada en múltiples planillas y sistemas.
              </li>
            </ul>
          </div>

          {/* Solution Card */}
          <div className={`p-6 rounded-2xl border transition-all duration-300 ${darkMode ? 'bg-violet-950/5 border-violet-500/15' : 'bg-violet-500/[0.005] border-violet-200/40 shadow-sm'}`}>
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center mb-5">
              <Check className="w-4 h-4 text-violet-500" />
            </div>
            <h3 className="text-[14.5px] font-bold font-display mb-3 text-zinc-850 dark:text-zinc-100">La solución unificada de Algoritmia</h3>
            <ul className="space-y-3.5 text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Respuestas inmediatas unificando WhatsApp e Instagram DM.
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Sincronización en tiempo real de variantes y catálogo completo.
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Atribución real de pauta Meta/TikTok para entender tu ROAS real.
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> Ficha de cliente integrada con pedidos, chats e historial de notas.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Grid Features (Value Props) */}
      <section className="py-20 max-w-5xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.03]">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-[9px] font-bold text-violet-500 uppercase tracking-[0.2em] block mb-2">TECNOLOGÍA</span>
          <h2 className="text-2xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Diseñado para la eficiencia operativa</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {valueProps.map((prop) => {
            const Icon = prop.icon;
            return (
              <div key={prop.title} className={`p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.01] ${darkMode ? 'bg-zinc-900/10 border-white/[0.04]' : 'bg-white border-zinc-200/50 shadow-sm'}`}>
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center mb-4">
                  <Icon className="w-4 h-4 text-violet-500" />
                </div>
                <h4 className="text-[13.5px] font-bold font-display mb-1.5 text-zinc-900 dark:text-zinc-100">{prop.title}</h4>
                <p className={`text-[11.5px] leading-relaxed font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{prop.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Corporate Pricing Card (Minimalist Apple style) */}
      <section className="py-20 max-w-xl mx-auto px-6 text-center border-t border-zinc-200/40 dark:border-white/[0.03]">
        <div className="mb-10">
          <span className="text-[9px] font-bold text-violet-500 uppercase tracking-[0.2em] block mb-2">PRECIO SIMPLE</span>
          <h2 className="text-2xl font-bold tracking-tight font-display mb-2 text-zinc-900 dark:text-white">Todo el poder, un único plan corporativo</h2>
          <p className={`text-[12.5px] font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Integración completa y asistencia sin límites para tu equipo de trabajo.</p>
        </div>

        <div className={`rounded-2xl border p-6 relative overflow-hidden text-left transition-all duration-300 ${
          darkMode ? 'bg-zinc-950/50 border-white/[0.06] shadow-[0_15px_40px_rgba(0,0,0,0.4)]' : 'bg-white border-zinc-200 shadow-lg shadow-zinc-200/5'
        }`}>
          <div className="absolute top-0 right-0 bg-violet-600 text-white font-bold text-[8.5px] uppercase tracking-wider px-3 py-0.5 rounded-bl-lg font-display">POPULAR</div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/50 dark:border-white/[0.04] pb-5 mb-5">
            <div>
              <h3 className="text-[15px] font-bold font-display text-zinc-900 dark:text-zinc-250">Plan Corporativo</h3>
              <p className="text-[11.5px] text-zinc-400 font-semibold mt-0.5">Sincronización total multitienda e IA.</p>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-3xl font-bold font-display text-zinc-900 dark:text-white">$ 49</span>
              <span className="text-zinc-500 font-semibold text-[12px]">/ mes</span>
            </div>
          </div>

          <div className="space-y-3.5 mb-6">
            {[
              'Sincronización en tiempo real de Shopify, Tiendanube, WooCommerce y ML',
              'Bandeja omnicanal de mensajes (WhatsApp, Instagram y Facebook)',
              'Sugerencias inteligentes basadas en Cerebro de IA ilimitadas',
              'Monitoreo integral de pauta publicitaria (Meta, TikTok y Google Ads)',
              'Agentes y colaboradores de soporte sin costos adicionales',
              'Soporte corporativo y prioritario 24/7'
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-2.5 text-[12px] font-medium">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <Link
            to="/login"
            className="w-full h-9 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg text-[11.5px] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shadow-sm shadow-violet-600/10 glow-hover"
          >
            Comenzar mi prueba gratuita
          </Link>
        </div>
      </section>

      {/* FAQ Section (Accordion) */}
      <section className="py-20 max-w-3xl mx-auto px-6 border-t border-zinc-200/40 dark:border-white/[0.03]">
        <div className="text-center mb-10">
          <span className="text-[9px] font-bold text-violet-500 uppercase tracking-[0.2em] block mb-2">RESPUESTAS RÁPIDAS</span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight font-display text-center text-zinc-900 dark:text-white">Preguntas frecuentes</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={faq.q}
                className={`rounded-xl border transition-all duration-300 ${
                  isOpen 
                    ? (darkMode ? 'bg-zinc-900/20 border-violet-500/20 shadow' : 'bg-violet-500/[0.005] border-violet-500/15 shadow-sm')
                    : (darkMode ? 'bg-[#060608]/40 border-white/[0.03] hover:bg-zinc-900/10 hover:border-white/[0.06]' : 'bg-white border-zinc-200/50 hover:bg-zinc-50/50')
                }`}
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left"
                >
                  <span className={`text-[12.5px] sm:text-[13px] font-semibold tracking-tight transition-colors duration-250 ${isOpen ? 'text-violet-500 dark:text-violet-400 font-display' : 'text-zinc-800 dark:text-zinc-200'}`}>{faq.q}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-violet-500' : ''}`} />
                </button>
                {isOpen && (
                  <div className={`px-5 pb-4 text-[11.5px] sm:text-[12px] leading-relaxed font-medium border-t pt-3 animate-in fade-in duration-300 ${
                    darkMode ? 'text-zinc-400 border-white/[0.03]' : 'text-zinc-500 border-zinc-100'
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
      <section className={`py-16 text-center relative overflow-hidden ${darkMode ? 'bg-zinc-950/10 border-t border-white/[0.03]' : 'bg-zinc-50 border-t border-zinc-200/40'}`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="max-w-3xl mx-auto px-6 relative z-10 space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display text-zinc-900 dark:text-white">Optimiza tu gestión comercial hoy</h2>
          <p className={`text-[12.5px] font-medium max-w-sm mx-auto ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
            Conectá tus canales de venta y automatizá tu soporte técnico de manera inmediata.
          </p>
          <div className="flex justify-center pt-1">
            <Link
              to="/login"
              className="h-9 px-6 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg text-[11.5px] flex items-center justify-center gap-1.5 shadow-sm shadow-violet-600/10 active:scale-[0.98] transition-all glow-hover"
            >
              Crear mi cuenta <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={`py-10 border-t text-center ${darkMode ? 'bg-black border-white/[0.04] text-zinc-600' : 'bg-white border-zinc-200/40 text-zinc-400'}`}>
        <div className="max-w-6xl mx-auto px-6 space-y-5">
          <div className="flex items-center justify-center gap-2">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-4 h-4 object-contain"
            />
            <span className="text-[10px] font-bold font-display tracking-wider text-zinc-800 dark:text-zinc-300">ALGORITMIA</span>
          </div>
          <p className="text-[10.5px] font-medium max-w-xs mx-auto leading-relaxed">
            Ecosistema de control y automatización omnicanal para e-commerce. Diseñado por Algoritmia Desarrollos.
          </p>
          <div className="flex justify-center gap-5 text-[9.5px] font-semibold">
            <Link to="/privacidad" className="hover:underline">Políticas de Privacidad</Link>
            <Link to="/soporte" className="hover:underline">Soporte Técnico</Link>
          </div>
          <p className="text-[8.5px] font-medium text-zinc-500 pt-1.5">
            &copy; {new Date().getFullYear()} Algoritmia Desarrollos. Todos los derechos reservados.
          </p>
        </div>
      </footer>

      {zoomImage && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md transition-all duration-300 p-4 cursor-zoom-out"
          onClick={() => setZoomImage(null)}
        >
          <div className="absolute top-4 right-4 z-[101]">
            <button 
              onClick={() => setZoomImage(null)}
              className="w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all border border-white/10"
              aria-label="Cerrar vista"
            >
              <span className="text-lg font-bold">✕</span>
            </button>
          </div>
          <div className="max-w-4xl max-h-[85vh] w-full flex items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
            <img 
              src={zoomImage} 
              alt="Visualización ampliada" 
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-250 border border-white/10" 
            />
          </div>
        </div>
      )}

    </div>
  );
}
