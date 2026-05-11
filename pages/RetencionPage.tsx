import React from 'react';

export default function RetencionPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-[10px] font-bold text-pink-500 uppercase tracking-widest bg-pink-50 dark:bg-pink-900/30 px-2 py-1 rounded-md mb-2 inline-block">Módulo R</span>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-zinc-900 dark:text-white">
            Retención (Email & Klaviyo)
          </h1>
          <p className="text-[14px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
            Fidelización, flujos de recompra y Life Time Value (LTV).
          </p>
        </div>
      </div>
      <div className="card p-8 text-center text-zinc-500">
        Próximamente: Gráficos de recupero de carritos, tasa de recompra y retorno de flujos automáticos en Klaviyo.
      </div>
    </div>
  );
}
