import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { db, MonthlyReport } from '../services/db';
import { FileText, Download, Calendar, ArrowUpRight } from 'lucide-react';

export default function ReportsPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    db.reports.getByClientId(profile.id).then(data => {
      setReports(data);
      setLoading(false);
    });
  }, [profile]);

  return (
    <div className="w-full space-y-8 pt-3 md:pt-6 animate-in fade-in slide-in-from-bottom-3 duration-400">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-zinc-900 dark:text-white">
          Reportes
        </h1>
        <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1 font-medium">
          Resúmenes mensuales y documentos estratégicos de tu cuenta.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map(report => (
            <div
              key={report.id}
              className="group bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:shadow-xl hover:shadow-zinc-200/40 dark:hover:shadow-black/20 hover:-translate-y-0.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200"
            >
              <div className="flex gap-4 items-start min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center flex-shrink-0 border border-violet-100 dark:border-violet-500/20 group-hover:scale-110 transition-transform duration-200">
                  <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-[14px] text-zinc-900 dark:text-white truncate">{report.title}</h3>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                    <Calendar className="w-3 h-3" />
                    <span>{report.period}</span>
                  </div>
                  {report.summary && (
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                      {report.summary}
                    </p>
                  )}
                </div>
              </div>

              {report.file_url && (
                <a
                  href={report.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[12px] font-bold rounded-xl shadow-sm hover:shadow-md hover:opacity-90 active:scale-95 transition-all duration-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-zinc-400 dark:text-zinc-500" />
          </div>
          <h3 className="text-[15px] font-bold text-zinc-700 dark:text-zinc-300 mb-1">Sin reportes aún</h3>
          <p className="text-[13px] text-zinc-400 max-w-xs">
            Tu gestor irá subiendo los reportes mensuales de tu cuenta aquí.
          </p>
        </div>
      )}
    </div>
  );
}
