import React from 'react';

export default function AtencionPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-md mb-2 inline-block">Módulo A</span>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-zinc-900 dark:text-white">
            Atención (Chat & IA)
          </h1>
          <p className="text-[14px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
            Métricas de soporte automatizado en WhatsApp y respuestas instantáneas.
          </p>
        </div>
      </div>
      <div className="card p-8 text-center text-zinc-500">
        Próximamente: Estadísticas de consultas resueltas por IA, tiempo de respuesta y escalado humano.
      </div>
    </div>
  );
}
