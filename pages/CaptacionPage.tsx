import React from 'react';

export default function CaptacionPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md mb-2 inline-block">Módulo C</span>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-zinc-900 dark:text-white">
            Captación (Meta Ads)
          </h1>
          <p className="text-[14px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
            Rendimiento de adquisición de clientes a través de campañas pagas.
          </p>
        </div>
      </div>
      <div className="card p-8 text-center text-zinc-500">
        Próximamente: Gráficos de Inversión, Costo de Adquisición (CPA) y Retorno publicitario (ROAS) organizados por Niveles de Consciencia.
      </div>
    </div>
  );
}
