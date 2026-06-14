import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shield, Check, Globe, HelpCircle, Lock, AlertCircle } from 'lucide-react';

const ML_COUNTRIES = [
  { code: 'AR', name: 'Argentina' },
  { code: 'MX', name: 'México' },
  { code: 'BR', name: 'Brasil' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CL', name: 'Chile' },
  { code: 'UY', name: 'Uruguay' }
];

export default function OAuthSimulatePage() {
  const [searchParams] = useSearchParams();
  const platform = searchParams.get('platform') || '';
  const initialCountry = searchParams.get('country') || 'AR';

  const [mlCountry, setMlCountry] = useState(initialCountry);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleAuthorize = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      
      // Notify parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'simulated-oauth-success',
          platform,
          country: platform === 'mercadolibre' ? mlCountry : undefined
        }, window.location.origin);
      }

      // Close popup after a brief delay
      setTimeout(() => {
        window.close();
      }, 1500);
    }, 1800);
  };

  const handleCancel = () => {
    window.close();
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-6 font-sans">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold">¡Acceso Autorizado!</h1>
            <p className="text-zinc-400 text-sm">
              La conexión fue exitosa. Esta ventana se cerrará automáticamente.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── MERCADO LIBRE SIMULATION ──────────────────────────────────────────────
  if (platform === 'mercadolibre') {
    return (
      <div className="min-h-screen bg-[#f5f5f5] text-zinc-900 font-sans flex flex-col">
        {/* Header */}
        <header className="bg-[#ffe600] py-3.5 px-6 flex items-center justify-between border-b border-zinc-200 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <div className="bg-white rounded-full p-1 border border-zinc-200/50 shadow-sm">
              <svg viewBox="0 0 100 100" className="w-9 h-9">
                <path fill="#2D3277" d="M12 25h76v10H12zm0 18h76v10H12zm0 18h76v10H12z" className="hidden" />
                <circle cx="50" cy="50" r="45" fill="#ffe600" />
                <path fill="#2D3277" d="M30 45c0-10 8-18 18-18s18 8 18 18-8 18-18 18-18-8-18-18z" />
                <path fill="#FFF" d="M42 45c0-4 3-7 7-7s7 3 7 7-3 7-7 7-7-3-7-7z" />
              </svg>
            </div>
            <span className="font-extrabold text-[17px] tracking-tight text-[#2d3277]">mercado libre</span>
          </div>
          <div className="text-[12px] font-bold text-zinc-500 flex items-center gap-1.5 bg-white/40 px-3 py-1 rounded-full border border-black/5">
            <Lock className="w-3 h-3 text-[#2d3277]" />
            Conexión Segura
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-zinc-200/60 max-w-md w-full p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
            
            {/* Logos Connection */}
            <div className="flex items-center justify-center gap-4 py-2">
              <div className="w-14 h-14 rounded-2xl bg-zinc-50 border border-zinc-150 flex items-center justify-center shadow-sm">
                <img src="/email-images/tsf_bite_logo.png" alt="Algoritmia" className="w-9 h-9 object-contain" />
              </div>
              <div className="h-0.5 w-10 bg-zinc-200 relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-yellow-500 animate-pulse" />
              </div>
              <div className="w-14 h-14 rounded-2xl bg-[#ffe600]/10 border border-[#ffe600]/30 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 100 100" className="w-8 h-8">
                  <path fill="#3483fa" d="M20 50 A 30 30 0 1 0 80 50 A 30 30 0 1 0 20 50" />
                  <path fill="#fff" d="M40 50 A 10 10 0 1 0 60 50 A 10 10 0 1 0 40 50" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <div className="text-center space-y-2">
              <h2 className="text-lg font-bold text-zinc-800 leading-tight">
                Vincular cuenta con Algoritmia
              </h2>
              <p className="text-zinc-500 text-xs">
                Para importar publicaciones, sincronizar stock y ventas en tiempo real.
              </p>
            </div>

            {/* Country Selector */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                País de tu cuenta Mercado Libre
              </label>
              <select
                className="w-full h-11 px-3.5 rounded-xl border border-zinc-300 focus:border-[#3483fa] focus:ring-2 focus:ring-[#3483fa]/20 outline-none text-sm transition-all bg-white font-medium"
                value={mlCountry}
                onChange={e => setMlCountry(e.target.value)}
                disabled={loading}
              >
                {ML_COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Permissions List */}
            <div className="bg-zinc-50 rounded-2xl p-4.5 border border-zinc-100 space-y-3">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Permisos requeridos
              </span>
              <ul className="space-y-2 text-[12.5px] text-zinc-600 font-medium">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 stroke-[3]" />
                  <span>Ver tus publicaciones y nivel de stock.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 stroke-[3]" />
                  <span>Sincronizar tus órdenes de venta para métricas.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 stroke-[3]" />
                  <span>Leer preguntas de compradores.</span>
                </li>
              </ul>
            </div>

            {/* Info Security */}
            <div className="flex gap-2.5 items-start text-[11px] text-zinc-400 leading-normal">
              <Shield className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
              <p>
                Tu contraseña no se compartirá. Algoritmia solo accederá mediante tokens OAuth encriptados conforme a los estándares oficiales de Mercado Libre.
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handleAuthorize}
                disabled={loading}
                className="w-full h-11 bg-[#3483fa] hover:bg-[#296ecc] disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-500/10 active:scale-[0.99]"
              >
                {loading ? (
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : null}
                <span>Conceder Acceso</span>
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="w-full h-10 text-zinc-500 hover:text-zinc-700 font-bold rounded-xl text-sm transition-all"
              >
                Cancelar
              </button>
            </div>

          </div>
        </main>
      </div>
    );
  }

  // ── GOOGLE ADS SIMULATION ──────────────────────────────────────────────────
  if (platform === 'google_ads') {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-800 font-sans flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-zinc-200/80 max-w-md w-full p-8 space-y-6 animate-in fade-in duration-200">
          
          {/* Google Logo */}
          <div className="flex justify-center">
            <svg viewBox="0 0 24 24" className="w-11 h-11">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
          </div>

          {/* Title */}
          <div className="text-center space-y-1.5">
            <h1 className="text-xl font-bold text-zinc-900">Iniciar sesión con Google</h1>
            <p className="text-zinc-500 text-[13px]">para continuar en <span className="font-semibold text-zinc-700">Algoritmia</span></p>
          </div>

          {/* Connected Profiles list (Google style) */}
          <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-200">
            <div className="p-3.5 flex items-center gap-3 bg-zinc-50/50 hover:bg-zinc-50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
                A
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-zinc-800 truncate">Usuario Algoritmia</p>
                <p className="text-[11px] text-zinc-400 truncate">usuario@algoritmiadesarrollos.com.ar</p>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>

          {/* Scopes description */}
          <div className="space-y-4 pt-1">
            <p className="text-[12px] text-zinc-500 leading-relaxed">
              Algoritmia podrá acceder a la siguiente información en tu cuenta de Google:
            </p>

            <div className="space-y-3 bg-zinc-50 border border-zinc-150 p-4 rounded-xl">
              <div className="flex gap-3">
                <input type="checkbox" defaultChecked disabled className="mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0" />
                <div className="text-[12px] leading-relaxed">
                  <p className="font-bold text-zinc-700">Ver y gestionar tus campañas de Google Ads</p>
                  <p className="text-zinc-500 text-[11px] mt-0.5">Permite recopilar presupuestos, costos históricos e impresiones publicitarias.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer security */}
          <div className="flex gap-2 items-center text-[10.5px] text-zinc-400 bg-zinc-50 px-3.5 py-2.5 rounded-xl border border-zinc-100">
            <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>Tus credenciales están protegidas por Google Identity Services.</span>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={handleCancel}
              disabled={loading}
              className="px-4 h-10 rounded-xl text-[13px] font-bold text-zinc-500 hover:bg-zinc-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAuthorize}
              disabled={loading}
              className="px-6 h-10 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-50 text-white text-[13px] font-bold shadow-sm transition-all flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : null}
              <span>Continuar</span>
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ── TIKTOK ADS SIMULATION ──────────────────────────────────────────────────
  if (platform === 'tiktok_ads') {
    return (
      <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl animate-in fade-in duration-200">
          
          {/* TikTok Logo */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-2">
              <img src="/assets/logotiktok.png" alt="TikTok" className="w-9 h-9 -my-1.5 -mx-1 object-contain" />
              <span className="font-extrabold text-[15px] tracking-tight uppercase">TikTok for Business</span>
            </div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-800 px-2.5 py-1 rounded-full">
              OAuth 2.0
            </div>
          </div>

          {/* Card Info */}
          <div className="space-y-2">
            <h1 className="text-lg font-extrabold text-white">Autorizar Conexión</h1>
            <p className="text-zinc-400 text-xs leading-relaxed">
              <span className="text-white font-bold">Algoritmia</span> solicita acceso de lectura a tu Business Center de TikTok para sincronizar campañas y reportes.
            </p>
          </div>

          {/* Permissions detail */}
          <div className="space-y-3">
            <span className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider block">
              Permisos Solicitados
            </span>
            
            <div className="border border-zinc-800 bg-zinc-900/50 rounded-2xl p-4 space-y-3.5">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-cyan-400 shrink-0 mt-0.5">✓</div>
                <div className="text-xs">
                  <p className="font-semibold text-zinc-200">Acceso a reportes de TikTok Ads Manager</p>
                  <p className="text-zinc-500 mt-0.5">Permite calcular el ROAS, clics y visualizaciones de tus creativos de video.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[10px] font-bold text-cyan-400 shrink-0 mt-0.5">✓</div>
                <div className="text-xs">
                  <p className="font-semibold text-zinc-200">Visualizar campañas y grupos de anuncios</p>
                  <p className="text-zinc-500 mt-0.5">Sincroniza la estructura de tus conjuntos de anuncios de TikTok.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Security alert */}
          <div className="flex gap-2.5 items-start text-[10.5px] text-zinc-500 bg-zinc-900/20 border border-zinc-800 p-3 rounded-xl">
            <Lock className="w-4 h-4 text-[#ff0050] shrink-0 mt-0.5" />
            <p>Algoritmia no compartirá tu clave y solo procesará métricas de conversión con la API segura de TikTok.</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleAuthorize}
              disabled={loading}
              className="w-full h-11 bg-[#ff0050] hover:bg-[#d60043] disabled:opacity-50 text-white font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#ff0050]/10 active:scale-[0.99] transition-all"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : null}
              <span>Autorizar Conexión</span>
            </button>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="w-full h-10 text-zinc-500 hover:text-zinc-400 font-bold rounded-xl text-sm transition-all"
            >
              Cancelar
            </button>
          </div>

        </div>
      </div>
    );
  }

  // Fallback / Error view
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white p-6 font-sans">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-sm w-full text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <h1 className="text-lg font-bold">Error de Plataforma</h1>
        <p className="text-zinc-400 text-sm">
          No se especificó una plataforma válida para la simulación de OAuth.
        </p>
        <button
          onClick={handleCancel}
          className="px-5 h-10 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-sm transition-all"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
