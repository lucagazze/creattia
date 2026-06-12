import React from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Globe, Instagram, Zap, MessageSquare } from "lucide-react";

interface ChatwootSetupCardProps {
  onSuccess?: () => void;
}

export default function ChatwootSetupCard({ onSuccess }: ChatwootSetupCardProps) {
  const navigate = useNavigate();

  const handleGoToIntegrations = () => {
    navigate("/integraciones?platform=chatwoot");
  };

  return (
    <div className="max-w-2xl mx-auto my-12 bg-white dark:bg-[#161618] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl p-8 shadow-xl flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="w-16 h-16 bg-violet-100 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
        <MessageSquare className="w-8 h-8 text-violet-600 dark:text-violet-400" />
      </div>

      <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white mb-3">
        Conectar Centro de Mensajería
      </h2>
      <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 max-w-lg mb-8 leading-relaxed">
        Vinculá tu cuenta de mensajería (Cloud oficial o instancia autohospedada) para unificar tus canales de soporte (WhatsApp, Instagram, Facebook y Chat Web) en una sola bandeja de entrada inteligente.
      </p>

      {/* Grid of features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full text-left mb-8">
        <div className="p-4 border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl flex gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">WhatsApp Business</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-450 mt-0.5 leading-normal">
              Respondé chats de WhatsApp de tus clientes en tiempo real y asignalos a tu equipo.
            </p>
          </div>
        </div>

        <div className="p-4 border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl flex gap-3">
          <div className="w-9 h-9 rounded-xl bg-pink-100 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0">
            <Instagram className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">Instagram & Messenger</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-450 mt-0.5 leading-normal">
              Unificá comentarios y mensajes directos (DMs) de tus redes en una única pantalla.
            </p>
          </div>
        </div>

        <div className="p-4 border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl flex gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">Widget Chat Web</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-450 mt-0.5 leading-normal">
              Instalá un globito de chat en tu tienda online (Shopify, WordPress o Tiendanube).
            </p>
          </div>
        </div>

        <div className="p-4 border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl flex gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200">Automatización por IA</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-450 mt-0.5 leading-normal">
              Entrená tu modelo (Cerebro de IA) para sugerir respuestas o automatizar soporte.
            </p>
          </div>
        </div>
      </div>

      {/* Button */}
      <button
        onClick={handleGoToIntegrations}
        className="px-8 py-3.5 bg-violet-600 hover:bg-violet-750 text-white rounded-2xl text-[13px] font-black shadow-lg shadow-violet-600/15 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <Zap className="w-4 h-4" />
        Configurar Conexión en Integraciones
      </button>
      <p className="text-[10px] text-zinc-450 dark:text-zinc-550 mt-3 font-semibold">
        Rápido y configurable. Vas a poder ingresar tu URL oficial y tu token de acceso privado.
      </p>
    </div>
  );
}
