import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, MonthlyReport } from '../services/db';
import { FileText, Download, Calendar } from 'lucide-react';

export default function ReportsPage() {
  const { profile } = useAuth();
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-zinc-900 dark:text-white">
            Mis Reportes
          </h1>
          <p className="text-[14px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
            Resúmenes mensuales y documentos estratégicos.
          </p>
        </div>
      </div>
      
      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1,2].map(i => <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {reports.length > 0 ? reports.map(report => (
            <div key={report.id} className="card p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-bold text-[15px] text-zinc-900 dark:text-white">{report.title}</h3>
                  <div className="flex items-center gap-2 mt-1 text-[12px] text-zinc-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Período: {report.period}</span>
                  </div>
                  {report.summary && <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-2 line-clamp-2">{report.summary}</p>}
                </div>
              </div>
              
              {report.file_url && (
                <a 
                  href={report.file_url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="w-full sm:w-auto px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[13px] font-semibold rounded-[8px] shadow-sm hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Descargar
                </a>
              )}
            </div>
          )) : (
            <div className="card p-8 text-center text-zinc-500">
              Todavía no hay reportes generados.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
