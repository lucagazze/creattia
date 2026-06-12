import React, { useState } from "react";
import {
  LifeBuoy,
  MessageCircle,
  Mail,
  BookOpen,
  Zap,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  Clock,
  Send,
} from "lucide-react";

const FAQ = [
  {
    q: "¿Cómo conecto mi tienda Tiendanube?",
    a: "Andá a Integraciones → Tiendanube → Conectar. Serás redirigido al portal oficial de Tiendanube donde solo tenés que hacer clic en Autorizar. No necesitás copiar ninguna clave.",
  },
  {
    q: "¿Cómo conecto Meta Ads / Facebook?",
    a: "Andá a Integraciones → Meta Ads & Píxel → Conectar. Se abre una ventana emergente de Facebook donde iniciás sesión y autorizás el acceso. Después seleccionás tu cuenta publicitaria y tu página de Facebook.",
  },
  {
    q: "¿Por qué no veo datos en el Dashboard?",
    a: "Verificá que tu tienda esté conectada correctamente en la sección Integraciones. El estado debe mostrar ✓ Conectado en verde. Si aparece un error, intentá reconectar la integración.",
  },
  {
    q: "¿Mis contraseñas o datos bancarios son almacenados?",
    a: "No. Nunca almacenamos contraseñas ni datos bancarios. Solo guardamos tokens de acceso OAuth que las plataformas generan de forma segura y que podés revocar cuando quieras.",
  },
  {
    q: "¿Puedo conectar más de una tienda?",
    a: "Sí. Cada cuenta de Algoritmia puede tener una plataforma de ecommerce principal conectada (Shopify, Tiendanube o WooCommerce) más las integraciones de publicidad.",
  },
  {
    q: "¿Cómo desconecto una integración?",
    a: "Andá a Integraciones → hacé clic en Configurar sobre la plataforma conectada → Desconectar. El estado se actualizará automáticamente.",
  },
  {
    q: "¿La IA de Algoritmia tiene acceso a mis datos privados de clientes?",
    a: "El asistente de IA solo accede a los datos de tu negocio que estén dentro de la plataforma. No comparte esa información con terceros y procesa todo de forma segura.",
  },
  {
    q: "¿Cómo solicito la eliminación de mi cuenta?",
    a: "Envianos un email a hola@algoritmiadesarrollos.com.ar indicando tu solicitud. Eliminamos todos tus datos en un plazo máximo de 30 días.",
  },
];

export default function SoportePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formMsg, setFormMsg] = useState("");
  const [sent, setSent] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    // Open mailto with prefilled subject/body
    const subject = encodeURIComponent(`[Soporte Algoritmia] ${formName}`);
    const body = encodeURIComponent(`Nombre: ${formName}\nEmail: ${formEmail}\n\n${formMsg}`);
    window.open(`mailto:hola@algoritmiadesarrollos.com.ar?subject=${subject}&body=${body}`, '_blank');
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 pb-16">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 p-8 sm:p-10 text-white shadow-2xl shadow-emerald-500/20">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/20 blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/10 blur-2xl translate-y-1/2 -translate-x-1/4" />
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 shadow-lg">
            <LifeBuoy className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">Centro de Soporte</h1>
            <p className="text-emerald-100 text-sm mt-1.5 font-medium">Algoritmia — Estamos para ayudarte</p>
            <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-white/70 bg-white/10 border border-white/10 px-2.5 py-1 rounded-full">
              <Clock className="w-3 h-3" />
              Respuesta habitual en menos de 24 hs
            </div>
          </div>
        </div>
      </div>

      {/* Contact channels */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: Mail,
            label: "Email",
            value: "hola@algoritmiadesarrollos.com.ar",
            href: "mailto:hola@algoritmiadesarrollos.com.ar",
            color: "text-violet-500",
            bg: "bg-violet-500/10",
            border: "border-violet-500/20",
          },
          {
            icon: MessageCircle,
            label: "WhatsApp",
            value: "Escribinos por WhatsApp",
            href: "https://wa.me/5491112345678",
            color: "text-emerald-500",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20",
          },
          {
            icon: Globe2,
            label: "Web",
            value: "algoritmiadesarrollos.com.ar",
            href: "https://algoritmiadesarrollos.com.ar",
            color: "text-blue-500",
            bg: "bg-blue-500/10",
            border: "border-blue-500/20",
          },
        ].map((ch, i) => {
          const Icon = ch.icon;
          return (
            <a
              key={i}
              href={ch.href}
              target="_blank"
              rel="noreferrer"
              className={`card-premium flex items-start gap-3 hover:scale-[1.01] transition-all group border ${ch.border}`}
            >
              <div className={`w-9 h-9 rounded-xl ${ch.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4.5 h-4.5 ${ch.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{ch.label}</p>
                <p className={`text-[13px] font-bold ${ch.color} truncate mt-0.5 group-hover:underline`}>{ch.value}</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400 ml-auto mt-0.5 shrink-0" />
            </a>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="card-premium space-y-4">
        <div className="flex items-center gap-3 pb-1">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <BookOpen className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-zinc-900 dark:text-white">Preguntas frecuentes</h2>
            <p className="text-[12px] text-zinc-400">Encontrá respuestas rápidas a las preguntas más comunes</p>
          </div>
        </div>

        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <div
              key={i}
              className={`rounded-xl border transition-all cursor-pointer overflow-hidden ${
                openFaq === i
                  ? "border-violet-500/30 bg-violet-500/5"
                  : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div className="flex items-center justify-between gap-3 p-4">
                <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">{item.q}</p>
                <ChevronRight
                  className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${openFaq === i ? "rotate-90" : ""}`}
                />
              </div>
              {openFaq === i && (
                <div className="px-4 pb-4 pt-0">
                  <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contact Form */}
      <div className="card-premium space-y-5">
        <div className="flex items-center gap-3 pb-1">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Send className="w-4.5 h-4.5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-zinc-900 dark:text-white">Envianos un mensaje</h2>
            <p className="text-[12px] text-zinc-400">No encontraste lo que buscabas? Te ayudamos directamente.</p>
          </div>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <p className="text-[15px] font-bold text-zinc-800 dark:text-zinc-200">¡Mensaje enviado!</p>
            <p className="text-[13px] text-zinc-400">Te respondemos en menos de 24 horas.</p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Tu nombre</label>
                <input
                  type="text"
                  className="apple-input"
                  placeholder="Juan García"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Tu email</label>
                <input
                  type="email"
                  className="apple-input"
                  placeholder="juan@mitienda.com"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">¿En qué podemos ayudarte?</label>
              <textarea
                className="apple-textarea min-h-[100px]"
                placeholder="Describí tu consulta o problema..."
                value={formMsg}
                onChange={e => setFormMsg(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full h-11 bg-zinc-900 dark:bg-white hover:opacity-90 text-white dark:text-zinc-900 font-bold rounded-xl text-[13px] flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <Send className="w-4 h-4" />
              Enviar mensaje
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// Small inline helper to avoid importing an extra icon
function Globe2({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
