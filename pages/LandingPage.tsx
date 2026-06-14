import React, { useState } from 'react';
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
  Moon
} from 'lucide-react';

export default function LandingPage() {
  const { darkMode, toggleDarkMode } = useTheme();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Redirige al panel si ya está autenticado
  React.useEffect(() => {
    if (session) {
      navigate('/dashboard');
    }
  }, [session, navigate]);

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const integrations = [
    { name: 'Shopify', logo: '/assets/shopify-bag.webp' },
    { name: 'Tiendanube', logo: '/assets/tiendanubeoscuro.png', darkLogo: '/assets/tiendanube.webp' },
    { name: 'WooCommerce', logo: '/assets/logowordpress.webp' },
    { name: 'Mercado Libre', logo: '/assets/logomercadolibre.png' },
    { name: 'Meta Ads', logo: '/assets/meta (1).webp' },
    { name: 'TikTok Ads', logo: '/assets/logotiktok.png' },
    { name: 'Klaviyo', logo: '/assets/Klaviyo-Logo-Photoroom.webp' }
  ];

  const features = [
    {
      icon: MessageSquare,
      title: 'Inbox Omnicanal Integrado',
      description: 'Centralizá todas tus conversaciones de WhatsApp Business, Instagram DM y Facebook Messenger en una única bandeja de entrada colaborativa.',
      image: '/assets/messaging_showcase.png'
    },
    {
      icon: ShoppingBag,
      title: 'Sincronización Multitienda',
      description: 'Conectá Shopify, Tiendanube y WooCommerce. Sincronizá stocks, controlá pedidos y unificá tus bases de clientes en tiempo real.',
      image: '/assets/catalog_showcase.png'
    }
  ];

  const valueProps = [
    {
      icon: Sparkles,
      title: 'Respuestas Asistidas por IA',
      description: 'El Cerebro de IA aprende de tu negocio para sugerir y automatizar respuestas instantáneas de ventas y soporte.'
    },
    {
      icon: TrendingUp,
      title: 'Monitoreo de Pauta y Retorno',
      description: 'Conectá Meta y TikTok Ads para correlacionar en tiempo real tu presupuesto de pauta digital con tus pedidos reales.'
    },
    {
      icon: Mail,
      title: 'Retención y Automatización',
      description: 'Integra Klaviyo para disparar flujos transaccionales y de marketing basados en el comportamiento unificado de tus clientes.'
    },
    {
      icon: Workflow,
      title: 'Monitoreo de Operación',
      description: 'Auditoría completa de la actividad de tus agentes de soporte y métricas clave de tiempo de respuesta.'
    }
  ];

  const faqs = [
    {
      q: '¿Cómo funciona la integración de Tiendanube, Shopify y WooCommerce?',
      a: 'La conexión se realiza mediante protocolo OAuth oficial o claves API. En menos de un minuto, sincronizamos todo tu catálogo, stock de variantes históricos y órdenes entrantes de manera automática y transparente.'
    },
    {
      q: '¿Es necesario instalar servidores o software adicional?',
      a: 'No. Algoritmia es un SaaS 100% en la nube y basado en web. Funciona directamente en cualquier navegador de PC, tablet o celular sin necesidad de descargas.'
    },
    {
      q: '¿Cómo ayuda el Cerebro de IA en la atención al cliente?',
      a: 'Nuestra inteligencia artificial se entrena leyendo la descripción de tu negocio, tu sitio web y tus preguntas frecuentes cargadas. Luego, asiste a tus agentes sugiriendo borradores perfectos o respondiendo automáticamente en los canales seleccionados.'
    },
    {
      q: '¿Puedo conectar múltiples páginas de Facebook o cuentas publicitarias?',
      a: 'Sí. Nuestra arquitectura mult Negocio te permite tener cuentas vinculadas para diferentes unidades de negocio o marcas de manera completamente aislada y segura.'
    }
  ];

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 selection:bg-violet-500 selection:text-white ${darkMode ? 'bg-[#030303] text-zinc-100' : 'bg-[#fafafc] text-zinc-900'}`}>
      
      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-md border-b transition-all duration-300 ${darkMode ? 'bg-[#030303]/70 border-white/[0.06]' : 'bg-[#fafafc]/70 border-zinc-200/50'}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={darkMode ? '/assets/logoSinFondo.png' : '/assets/logoAlgoritmia1.webp'}
              alt="Algoritmia"
              className="w-7 h-7 object-contain"
            />
            <div>
              <span className="text-[13px] font-black tracking-tighter leading-none uppercase block">
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
      <section className="relative pt-20 pb-24 overflow-hidden">
        {/* Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-500/10 dark:bg-violet-600/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-cyan-500/10 dark:bg-cyan-600/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <Sparkles className="w-3 h-3" /> Ecosistema de Comercio Unificado
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight max-w-4xl mx-auto leading-[1.08] mb-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            Controlá tus ventas, stock y mensajes en un solo lugar.
          </h1>
          
          <p className={`text-base sm:text-lg md:text-[20px] max-w-2xl mx-auto leading-relaxed mb-10 font-medium animate-in fade-in slide-in-from-bottom-6 duration-700 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Conectá tus tiendas online, marketplaces y canales de chat. Dejá que nuestra IA automatice tu operación mientras monitoreás el ROAS real de tu pauta.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-in fade-in slide-in-from-bottom-7 duration-1000">
            <Link
              to="/login"
              className="w-full sm:w-auto h-12 px-8 bg-violet-600 hover:bg-violet-500 text-white font-extrabold rounded-2xl text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 active:scale-[0.98] transition-all"
            >
              Comenzar gratis <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className={`w-full sm:w-auto h-12 px-8 border font-extrabold rounded-2xl text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                darkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm'
              }`}
            >
              Conocer funciones
            </a>
          </div>

          {/* Hero Image */}
          <div className="relative max-w-5xl mx-auto rounded-3xl border p-2 bg-zinc-900/5 dark:bg-white/[0.02] border-zinc-200/80 dark:border-white/[0.06] shadow-2xl shadow-zinc-900/5 dark:shadow-black/40 overflow-hidden animate-in fade-in zoom-in-95 duration-1000">
            <img
              src="/assets/dashboard_showcase.png"
              alt="Dashboard de Algoritmia"
              className="w-full rounded-2xl object-cover shadow-lg"
            />
          </div>
        </div>
      </section>

      {/* Integrations Grid */}
      <section className={`py-12 border-t border-b ${darkMode ? 'bg-zinc-950/40 border-white/[0.04]' : 'bg-zinc-50/50 border-zinc-200/50'}`}>
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-8">
            VINCULACIÓN NATIVA Y AUTOMÁTICA EN UN CLIC
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 lg:gap-16">
            {integrations.map((item) => (
              <div key={item.name} className="flex items-center gap-2 grayscale opacity-45 hover:grayscale-0 hover:opacity-100 transition-all duration-300 cursor-pointer">
                <img
                  src={darkMode && item.darkLogo ? item.darkLogo : item.logo}
                  alt={item.name}
                  className="h-7 object-contain max-w-[100px]"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem vs Solution Section */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-[10px] font-extrabold text-violet-500 uppercase tracking-widest block mb-3">EL DESAFÍO OPERATIVO</span>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">El caos de operar en 5 pestañas distintas</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Problem Card */}
          <div className={`p-8 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-[#0f0f0f]/40 border-red-500/10' : 'bg-white border-zinc-200/60 shadow-sm'}`}>
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mb-6">
              <span className="text-red-500 font-extrabold text-lg">✕</span>
            </div>
            <h3 className="text-xl font-bold mb-4">La realidad actual de tu negocio</h3>
            <ul className="space-y-3.5 text-[14px] font-semibold text-zinc-500 dark:text-zinc-400">
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 mt-0.5">•</span> Clientes que esperan horas por respuestas de stock en Instagram.
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 mt-0.5">•</span> Ventas canceladas porque vendiste un producto sin stock real.
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 mt-0.5">•</span> Imposibilidad de saber cuál anuncio de Meta realmente generó pedidos.
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 mt-0.5">•</span> Información del cliente fragmentada en múltiples planillas y sistemas.
              </li>
            </ul>
          </div>

          {/* Solution Card */}
          <div className={`p-8 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-violet-950/10 border-violet-500/20' : 'bg-violet-500/[0.02] border-violet-200/50 shadow-sm'}`}>
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center mb-6">
              <Check className="w-5 h-5 text-violet-500" />
            </div>
            <h3 className="text-xl font-bold mb-4">El ecosistema unificado de Algoritmia</h3>
            <ul className="space-y-3.5 text-[14px] font-semibold text-zinc-700 dark:text-zinc-300">
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

      {/* Main Features / Showcase */}
      <section id="features" className="py-16 max-w-7xl mx-auto px-6 space-y-24">
        {features.map((feat, idx) => {
          const Icon = feat.icon;
          return (
            <div key={feat.title} className={`flex flex-col lg:flex-row items-center gap-12 ${idx % 2 !== 0 ? 'lg:flex-row-reverse' : ''}`}>
              <div className="flex-1 space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-violet-500" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight">{feat.title}</h3>
                <p className={`text-[15px] sm:text-base leading-relaxed font-semibold ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>{feat.description}</p>
                <div className="flex items-center gap-2 text-violet-500 font-extrabold text-[13px] hover:translate-x-1 transition-transform cursor-pointer">
                  Ver cómo funciona <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="flex-1 w-full rounded-2xl border p-1.5 bg-zinc-900/5 dark:bg-white/[0.02] border-zinc-200/80 dark:border-white/[0.06] shadow-xl">
                <img
                  src={feat.image}
                  alt={feat.title}
                  className="w-full rounded-xl object-cover"
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Grid Features */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-[10px] font-extrabold text-violet-500 uppercase tracking-widest block mb-3">TECNOLOGÍA INTEGRADA</span>
          <h2 className="text-3xl font-black tracking-tight">Potenciado con herramientas nativas de control</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {valueProps.map((prop) => {
            const Icon = prop.icon;
            return (
              <div key={prop.title} className={`p-6 rounded-3xl border transition-all duration-300 hover:scale-[1.02] ${darkMode ? 'bg-[#0a0a0a] border-white/[0.06]' : 'bg-white border-zinc-200/60 shadow-sm'}`}>
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-5">
                  <Icon className="w-4 h-4 text-violet-500" />
                </div>
                <h4 className="text-[15px] font-extrabold mb-2.5">{prop.title}</h4>
                <p className={`text-[12.5px] leading-relaxed font-semibold ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{prop.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Corporate Pricing Card */}
      <section className="py-20 max-w-3xl mx-auto px-6 text-center">
        <div className="mb-12">
          <span className="text-[10px] font-extrabold text-violet-500 uppercase tracking-widest block mb-3">PRECIOS SIMPLES</span>
          <h2 className="text-3xl font-black tracking-tight mb-4">Todo el poder, un único plan corporativo</h2>
          <p className={`text-[14px] font-semibold ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Integración completa y asistencia sin límites para tu equipo de trabajo.</p>
        </div>

        <div className={`rounded-3xl border p-8 relative overflow-hidden text-left ${
          darkMode ? 'bg-[#0a0a0a] border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'bg-white border-zinc-200 shadow-xl shadow-zinc-200/20'
        }`}>
          <div className="absolute top-0 right-0 bg-violet-600 text-white font-extrabold text-[9px] uppercase tracking-wider px-3.5 py-1 rounded-bl-xl">POPULAR</div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-white/[0.06] pb-6 mb-6">
            <div>
              <h3 className="text-xl font-bold">Plan Corporativo</h3>
              <p className="text-[12.5px] text-zinc-400 font-semibold mt-1">Sincronización total multitienda e IA.</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-black">$ 49</span>
              <span className="text-zinc-400 font-semibold text-[13px]">/ mes</span>
            </div>
          </div>

          <div className="space-y-3.5 mb-8">
            {[
              'Sincronización en tiempo real de Shopify, Tiendanube y WooCommerce',
              'Conversaciones unificadas (WhatsApp, Instagram y Messenger)',
              'Entrenamiento de Cerebro de IA ilimitado para respuestas sugeridas',
              'Estadísticas completas de pauta y ROAS real',
              'Agentes y colaboradores sin costos adicionales',
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
            className="w-full h-11 bg-violet-600 hover:bg-violet-500 text-white font-extrabold rounded-2xl text-[13px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md shadow-violet-600/10"
          >
            Comenzar mi prueba gratuita
          </Link>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 max-w-3xl mx-auto px-6">
        <h2 className="text-3xl font-black tracking-tight text-center mb-12">Preguntas frecuentes</h2>
        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={faq.q}
                className={`rounded-2xl border transition-all duration-200 ${
                  darkMode ? 'bg-[#0a0a0a] border-white/[0.06]' : 'bg-white border-zinc-200/60 shadow-sm'
                }`}
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-6 py-4.5 flex items-center justify-between gap-4 text-left"
                >
                  <span className="text-[14px] font-extrabold">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className={`px-6 pb-4.5 text-[13px] leading-relaxed font-semibold border-t pt-3.5 ${
                    darkMode ? 'text-zinc-400 border-white/[0.04]' : 'text-zinc-500 border-zinc-100'
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
      <section className={`py-20 text-center relative overflow-hidden ${darkMode ? 'bg-zinc-950/40 border-t border-white/[0.04]' : 'bg-zinc-50 border-t border-zinc-200/50'}`}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-violet-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 relative z-10 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">¿Listo para unificar tu operación comercial?</h2>
          <p className={`text-[15px] font-semibold max-w-md mx-auto ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Conectá tu primera integración hoy. Te asistimos en la configuración inicial sin cargo.</p>
          <div className="flex justify-center pt-2">
            <Link
              to="/login"
              className="h-12 px-8 bg-violet-600 hover:bg-violet-500 text-white font-extrabold rounded-2xl text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-violet-600/15 active:scale-[0.98] transition-all"
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
