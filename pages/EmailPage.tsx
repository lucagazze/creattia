import React from 'react';

export default function EmailPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-zinc-900 dark:text-white">
            Email Marketing
          </h1>
          <p className="text-[14px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
            Rendimiento de tus envíos y flujos automatizados.
          </p>
        </div>
      </div>
      <div className="card p-8 text-center text-zinc-500">
        Próximamente: Gráficos y tablas de aperturas, clics y rebotes.
      </div>
    </div>
  );
}
