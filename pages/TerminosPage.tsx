import React from "react";
import { FileText, ShieldCheck, CreditCard, Plug, Ban, Mail, ChevronRight } from "lucide-react";

export default function TerminosPage() {
  const lastUpdated = "15 de junio de 2026";
  const sections = [
    {
      icon: ShieldCheck,
      title: "Uso de la plataforma",
      content: [
        "Algoritmia es una plataforma SaaS para centralizar métricas, tiendas, campañas, mensajería y análisis operativo de negocios online.",
        "El usuario es responsable de mantener actualizada y veraz la información de su cuenta, negocio e integraciones conectadas.",
        "No está permitido usar la plataforma para actividades ilegales, spam, abuso de APIs, scraping no autorizado o vulneración de derechos de terceros.",
      ],
    },
    {
      icon: Plug,
      title: "Integraciones y datos conectados",
      content: [
        "Al conectar servicios como Shopify, Tiendanube, Meta Ads, Google Ads, TikTok Ads, Klaviyo o WooCommerce, autorizás a Algoritmia a procesar los datos necesarios para prestar el servicio.",
        "Podés desconectar integraciones desde la plataforma o revocar permisos desde cada proveedor externo cuando lo necesites.",
        "La disponibilidad de datos depende también de las APIs, permisos, límites y políticas de cada proveedor externo.",
      ],
    },
    {
      icon: CreditCard,
      title: "Planes, pagos y prueba gratuita",
      content: [
        "Los planes, precios y condiciones comerciales vigentes son los publicados en la landing o comunicados por el equipo comercial de Algoritmia.",
        "La prueba gratuita, cuando esté disponible, permite evaluar la plataforma por el período informado antes de contratar un plan pago.",
        "Algoritmia puede modificar precios o condiciones futuras, notificando los cambios relevantes por los canales de contacto disponibles.",
      ],
    },
    {
      icon: Ban,
      title: "Limitación de responsabilidad",
      content: [
        "Algoritmia provee herramientas de análisis y automatización, pero las decisiones comerciales, publicitarias y operativas son responsabilidad del usuario.",
        "No garantizamos resultados específicos de ventas, ROAS, rentabilidad o performance publicitaria.",
        "Podemos suspender o limitar el acceso ante uso abusivo, fraude, incumplimiento de estos términos o riesgos de seguridad.",
      ],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 pb-16">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-violet-900 to-indigo-900 p-8 sm:p-10 text-white shadow-2xl shadow-violet-500/20">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 shadow-lg">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">Términos de Uso</h1>
            <p className="text-violet-200 text-sm mt-1.5 font-medium">Algoritmia — Gestión Inteligente de Negocios</p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-white/70 bg-white/10 border border-white/10 px-2.5 py-1 rounded-full">
              <span>Última actualización:</span>
              <span className="text-white">{lastUpdated}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card-premium space-y-3">
        <p className="text-[14px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Estos términos regulan el uso de <span className="font-bold text-zinc-900 dark:text-white">Algoritmia</span>. Al crear una cuenta o utilizar la plataforma, aceptás estas condiciones.
        </p>
      </div>

      <div className="space-y-5">
        {sections.map((section, i) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="card-premium space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5 text-violet-500" />
                </div>
                <h2 className="text-[15px] font-bold text-zinc-900 dark:text-white">
                  {i + 1}. {section.title}
                </h2>
              </div>
              <ul className="space-y-2">
                {section.content.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-gradient-to-r from-zinc-100 to-zinc-50 dark:from-zinc-900 dark:to-zinc-800 border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-bold text-zinc-800 dark:text-zinc-200">¿Tenés preguntas sobre estos términos?</p>
          <p className="text-[12px] text-zinc-500 mt-0.5">Contactanos y te ayudamos a resolver cualquier duda.</p>
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
