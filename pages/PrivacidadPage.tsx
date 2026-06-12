import React from "react";
import { Shield, Lock, Eye, Database, Mail, Globe, ChevronRight } from "lucide-react";

export default function PrivacidadPage() {
  const lastUpdated = "11 de junio de 2025";

  const sections = [
    {
      icon: Database,
      title: "Información que recopilamos",
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      content: [
        "Datos de tu cuenta de tienda (nombre, email, identificadores de tienda).",
        "Órdenes de venta, productos e inventario de tus plataformas conectadas (Tiendanube, Shopify, WooCommerce).",
        "Métricas de campañas publicitarias de Meta Ads, Google Ads y TikTok Ads.",
        "Datos de interacciones de clientes de Klaviyo (listas, métricas de email).",
        "Tokens de acceso OAuth necesarios para mantener las conexiones activas.",
      ],
    },
    {
      icon: Eye,
      title: "Cómo usamos tu información",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      content: [
        "Generar reportes y dashboards de rendimiento de tu negocio.",
        "Sincronizar datos entre tus plataformas de forma automática.",
        "Entrenar y personalizar el asistente de inteligencia artificial de Algoritmia.",
        "Enviarte alertas y notificaciones relevantes sobre tu negocio.",
        "Mejorar nuestros algoritmos de análisis y recomendación.",
      ],
    },
    {
      icon: Lock,
      title: "Almacenamiento y seguridad",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      content: [
        "Todos los datos se almacenan en servidores seguros de Supabase (PostgreSQL) con cifrado en reposo.",
        "Las comunicaciones entre tu navegador y nuestros servidores utilizan TLS/HTTPS.",
        "Los tokens de acceso OAuth se almacenan de forma encriptada y nunca se exponen al frontend.",
        "Aplicamos control de acceso por fila (RLS) en la base de datos para que cada usuario solo acceda a sus propios datos.",
        "No vendemos, alquilamos ni compartimos tu información con terceros sin tu consentimiento explícito.",
      ],
    },
    {
      icon: Globe,
      title: "Servicios de terceros",
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      content: [
        "Meta (Facebook/Instagram): Accedemos a tus cuentas publicitarias y páginas mediante OAuth oficial.",
        "Tiendanube: Utilizamos la API oficial de Tiendanube para sincronizar órdenes y productos.",
        "Shopify: Accedemos mediante OAuth Partners a tu tienda Shopify.",
        "Google Ads / TikTok Ads: Conexión mediante credenciales OAuth de cada plataforma.",
        "Klaviyo: Conexión mediante API Key privada de tu cuenta.",
        "Vercel: Nuestros servidores y funciones serverless se alojan en Vercel (EE.UU.).",
      ],
    },
    {
      icon: Shield,
      title: "Tus derechos",
      color: "text-pink-500",
      bg: "bg-pink-500/10",
      content: [
        "Podés solicitar una copia de todos tus datos en cualquier momento.",
        "Podés desconectar cualquier integración desde el panel de Integraciones.",
        "Podés solicitar la eliminación completa de tu cuenta y datos enviando un email a soporte.",
        "Podés revocar los permisos de OAuth directamente desde cada plataforma (Meta, Tiendanube, etc.).",
        "Tenés derecho a la portabilidad de tus datos en formato JSON o CSV.",
      ],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 pb-16">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 p-8 sm:p-10 text-white shadow-2xl shadow-violet-500/20">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/20 blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/10 blur-2xl translate-y-1/2 -translate-x-1/4" />
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 shadow-lg">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              Política de Privacidad
            </h1>
            <p className="text-violet-200 text-sm mt-1.5 font-medium">
              Algoritmia — Gestión Inteligente de Negocios
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-white/70 bg-white/10 border border-white/10 px-2.5 py-1 rounded-full">
              <span>Última actualización:</span>
              <span className="text-white">{lastUpdated}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Intro */}
      <div className="card-premium space-y-3">
        <p className="text-[14px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
          En <span className="font-bold text-zinc-900 dark:text-white">Algoritmia</span> tomamos muy en serio la privacidad de tu información. Esta política describe qué datos recopilamos, cómo los usamos y qué derechos tenés sobre ellos.
        </p>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-500 leading-relaxed">
          Al usar nuestra plataforma y conectar tus cuentas, aceptás los términos descritos en esta política. Si tenés alguna duda, podés contactarnos en cualquier momento.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-5">
        {sections.map((section, i) => {
          const Icon = section.icon;
          return (
            <div key={i} className="card-premium space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${section.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4.5 h-4.5 ${section.color}`} />
                </div>
                <h2 className="text-[15px] font-bold text-zinc-900 dark:text-white">
                  {i + 1}. {section.title}
                </h2>
              </div>
              <ul className="space-y-2">
                {section.content.map((item, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Cookies */}
      <div className="card-premium space-y-3">
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-white">6. Cookies y almacenamiento local</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Utilizamos el almacenamiento local del navegador (<code className="text-violet-500 bg-violet-500/10 px-1 py-0.5 rounded text-[11px]">localStorage</code>) para guardar preferencias de sesión y tokens de acceso de forma temporal. No usamos cookies de rastreo ni publicidad de terceros.
        </p>
      </div>

      {/* Contact */}
      <div className="rounded-2xl bg-gradient-to-r from-zinc-100 to-zinc-50 dark:from-zinc-900 dark:to-zinc-800 border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-bold text-zinc-800 dark:text-zinc-200">¿Tenés preguntas sobre tu privacidad?</p>
          <p className="text-[12px] text-zinc-500 mt-0.5">Contactanos directamente y te respondemos a la brevedad.</p>
        </div>
        <a
          href="mailto:hola@algoritmiadesarrollos.com.ar"
          className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[12px] font-bold flex items-center gap-1.5 hover:opacity-90 transition-all shrink-0"
        >
          <Mail className="w-3.5 h-3.5" />
          Contactar
        </a>
      </div>
    </div>
  );
}
