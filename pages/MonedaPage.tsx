import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Check, Clock3, Loader2, RefreshCw, Save, Table2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useViewAs } from "../contexts/ViewAsContext";
import { useToast } from "../components/Toast";
import { supabase } from "../services/supabase";
import {
  CURRENCY_OPTIONS,
  CurrencyCode,
  CurrencySettings,
  DEFAULT_CURRENCY_SETTINGS,
  formatCurrencyValue,
  getExchangeRate,
  getRateKey,
  normalizeCurrencySettings,
} from "../utils/currencySettings";

type SourceKey = "storeCurrency" | "metaCurrency" | "emailCurrency" | "costsCurrency";

const SOURCE_ROWS: Array<{ key: SourceKey; title: string; description: string }> = [
  { key: "storeCurrency", title: "Tienda online", description: "Ingresos, pedidos y ticket promedio de Shopify, Tiendanube, WooCommerce o Mercado Libre." },
  { key: "metaCurrency", title: "Meta Ads", description: "Inversión, retorno, CPL, costo por mensaje y métricas monetarias de publicidad." },
  { key: "emailCurrency", title: "Email Marketing", description: "Ingresos atribuidos y métricas monetarias de Klaviyo." },
  { key: "costsCurrency", title: "Costos", description: "Costos de productos, cajas, envíos, costos fijos y adicionales." },
];

const AUTO_REFRESH_MS = 60 * 60 * 1000;

const supportedRateCurrencies = (settings: CurrencySettings) =>
  Array.from(new Set([
    "USD",
    "ARS",
    settings.baseCurrency,
    settings.storeCurrency,
    settings.metaCurrency,
    settings.emailCurrency,
    settings.costsCurrency,
  ].filter((code) => code !== "LOCAL")));

const isRateStale = (updatedAt?: string) => {
  if (!updatedAt) return true;
  const time = new Date(updatedAt).getTime();
  return !Number.isFinite(time) || Date.now() - time >= AUTO_REFRESH_MS;
};

export default function MonedaPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const profileId = profile?.id || "";
  const { showToast } = useToast();

  const [settings, setSettings] = useState<CurrencySettings>(DEFAULT_CURRENCY_SETTINGS);
  const [rawCostSettings, setRawCostSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingRates, setRefreshingRates] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const lastAutoSaveRef = useRef<string>("");

  const callCostsApi = async (action: string, payload: Record<string, any> = {}) => {
    if (!profileId) throw new Error("Cliente no disponible.");
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("La sesión expiró. Volvé a iniciar sesión.");
    const res = await fetch(`/api/oauth?action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ clientId: profileId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudo guardar la configuración.");
    return data;
  };

  const persistSettings = async (nextSettings: CurrencySettings, options: { silent?: boolean; rawSettings?: any } = {}) => {
    const savedAt = new Date().toISOString();
    const mergedSettings = {
      ...(options.rawSettings || rawCostSettings || {}),
      currency: {
        ...nextSettings,
        updatedAt: savedAt,
      },
    };
    await callCostsApi("costs-save-settings", { settings: mergedSettings });
    setRawCostSettings(mergedSettings);
    setSettings(mergedSettings.currency);
    setUpdatedAt(savedAt);
    try {
      localStorage.setItem(`car_currency_${profileId}`, JSON.stringify(mergedSettings.currency));
      window.dispatchEvent(new CustomEvent("car_currency_settings_updated", { detail: mergedSettings.currency }));
    } catch {
      // Cache only.
    }
    if (!options.silent) showToast("Configuración de moneda guardada.", "success");
  };

  const fetchLiveRates = async (baseSettings = settings, options: { silent?: boolean; persist?: boolean; rawSettings?: any } = {}) => {
    const currencies = supportedRateCurrencies(baseSettings);
    if (currencies.length < 2) return baseSettings;

    setRefreshingRates(true);
    try {
      const res = await fetch(`/api/oauth?action=currency-rates&currencies=${encodeURIComponent(currencies.join(","))}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudieron traer las cotizaciones.");
      const nextSettings: CurrencySettings = {
        ...baseSettings,
        rates: {
          ...(baseSettings.rates || {}),
          ...(data.rates || {}),
        },
        rateUpdatedAt: data.updatedAt || new Date().toISOString(),
        rateProvider: data.provider || "open.er-api.com",
      };
      setSettings(nextSettings);
      if (options.persist) await persistSettings(nextSettings, { silent: true, rawSettings: options.rawSettings });
      if (!options.silent) showToast("Cotizaciones actualizadas.", "success");
      return nextSettings;
    } catch (err: any) {
      console.error("Currency rates refresh error:", err);
      if (!options.silent) showToast(err.message || "Error al actualizar cotizaciones.", "error");
      return baseSettings;
    } finally {
      setRefreshingRates(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      if (!profileId) return;
      setLoading(true);
      try {
        const data = await callCostsApi("costs-load");
        if (!mounted) return;
        const saved = data.costSettings || {};
        const normalized = normalizeCurrencySettings(saved);
        setRawCostSettings(saved);
        setSettings(normalized);
        setUpdatedAt(saved?.currency?.updatedAt || data.costSettingsUpdatedAt || null);
        if (isRateStale(normalized.rateUpdatedAt)) {
          const signature = `${profileId}:${supportedRateCurrencies(normalized).join(",")}`;
          if (lastAutoSaveRef.current !== signature) {
            lastAutoSaveRef.current = signature;
            fetchLiveRates(normalized, { silent: true, persist: true, rawSettings: saved });
          }
        }
      } catch (err: any) {
        console.error("Currency settings load error:", err);
        showToast(err.message || "Error al cargar la configuración de moneda.", "error");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadSettings();
    return () => {
      mounted = false;
    };
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    const timer = window.setInterval(() => {
      fetchLiveRates(settings, { silent: true, persist: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [profileId, settings]);

  const updateSetting = (key: "baseCurrency" | SourceKey, value: CurrencyCode) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value, rates: { ...(prev.rates || {}) } };
      supportedRateCurrencies(next).forEach((from) => {
        supportedRateCurrencies(next).forEach((to) => {
          const rateKey = getRateKey(from, to);
          if (from === to) next.rates[rateKey] = 1;
        });
      });
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const latest = await fetchLiveRates(settings, { silent: true });
      await persistSettings(latest);
    } catch (err: any) {
      console.error("Currency settings save error:", err);
      showToast(err.message || "Error al guardar la configuración de moneda.", "error");
    } finally {
      setSaving(false);
    }
  };

  const rateRows = useMemo(() => {
    return SOURCE_ROWS.map((row) => {
      const from = settings[row.key];
      const to = settings.baseCurrency;
      const rate = getExchangeRate(from, to, settings);
      return { ...row, from, to, rate };
    });
  }, [settings]);

  const relationshipRows = useMemo(() => {
    const currencies = supportedRateCurrencies(settings);
    return currencies.flatMap((from) =>
      currencies
        .filter((to) => to !== from)
        .map((to) => ({
          from,
          to,
          rate: getExchangeRate(from, to, settings),
        }))
    );
  }, [settings]);

  return (
    <div className="w-full animate-fade-in pb-20 text-zinc-900 dark:text-zinc-100">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h1 className="page-title">Monedas y conversiones</h1>
              <p className="text-zinc-500 dark:text-zinc-400 font-semibold text-sm">
                Elegí en qué moneda viene cada integración y en qué moneda querés ver todo el dashboard.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {settings.rateUpdatedAt && (
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 px-4 py-2 text-sm font-black text-blue-700 dark:text-blue-300">
              <Clock3 className="w-4 h-4" />
              Cotización: {new Date(settings.rateUpdatedAt).toLocaleString("es-AR")}
            </div>
          )}
          {updatedAt && (
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
              <Check className="w-4 h-4" />
              Guardado: {new Date(updatedAt).toLocaleString("es-AR")}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-5">
        <section className="rounded-[22px] bg-white dark:bg-zinc-950 border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-500 mb-2">Configuración</p>
            <h2 className="text-2xl font-black">Moneda base y fuentes</h2>
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
              Todo se convierte a la moneda base para calcular facturación neta, ROAS real y métricas monetarias.
            </p>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {loading ? (
              <div className="h-64 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-white/[0.03] flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
              </div>
            ) : (
              <>
                <CurrencySelect
                  label="Ver todo el dashboard en"
                  value={settings.baseCurrency}
                  onChange={(value) => updateSetting("baseCurrency", value)}
                />

                <div className="space-y-3">
                  {SOURCE_ROWS.map((source) => (
                    <div key={source.key} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-white/[0.03] p-4">
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3 md:items-center">
                        <div>
                          <h3 className="text-base font-black">{source.title}</h3>
                          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mt-1">{source.description}</p>
                        </div>
                        <CurrencySelect
                          label="Moneda"
                          value={settings[source.key]}
                          onChange={(value) => updateSetting(source.key, value)}
                          compact
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving || refreshingRates}
                    className="h-12 px-6 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-sm font-black shadow-lg shadow-black/10 dark:shadow-white/5 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? "Guardando..." : "Guardar configuración"}
                  </button>
                  <button
                    onClick={() => fetchLiveRates(settings, { persist: true })}
                    disabled={refreshingRates || saving}
                    className="h-12 px-6 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-black text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshingRates ? "animate-spin" : ""}`} />
                    Actualizar cotizaciones
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-[22px] bg-white dark:bg-zinc-950 border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                <Table2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-500">Tabla de conversión</p>
                <h2 className="text-xl font-black">Cotizaciones usadas</h2>
                <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
                  Se actualizan automáticamente cada hora desde {settings.rateProvider || "la API de cotizaciones"}.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-zinc-50 dark:bg-white/[0.03] text-[11px] uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-5 py-4 font-black">Métrica</th>
                    <th className="px-5 py-4 font-black">Precio moneda 1</th>
                    <th className="px-5 py-4 font-black">Precio moneda 2</th>
                    <th className="px-5 py-4 font-black">Conversión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {rateRows.map((row) => (
                    <tr key={row.key} className="text-sm">
                      <td className="px-5 py-4">
                        <p className="font-black text-zinc-950 dark:text-white">{row.title}</p>
                        <p className="text-xs font-semibold text-zinc-400 mt-0.5">Se convierte al dashboard</p>
                      </td>
                      <td className="px-5 py-4 font-black">1 {row.from}</td>
                      <td className="px-5 py-4 font-black">{formatCurrencyValue(row.rate, row.to, 4)} {row.to}</td>
                      <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 font-semibold">
                        {row.from === row.to ? "Sin conversión" : `${row.from} -> ${row.to}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[22px] bg-white dark:bg-zinc-950 border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-500">Relación de monedas</p>
                <h2 className="text-xl font-black mt-1">Tabla completa de equivalencias</h2>
                <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
                  Muestra cómo se relacionan las monedas configuradas entre sí. USD y ARS quedan siempre disponibles.
                </p>
              </div>
              {refreshingRates && (
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-xs font-black text-blue-600 dark:text-blue-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Actualizando
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead className="bg-zinc-50 dark:bg-white/[0.03] text-[11px] uppercase tracking-widest text-zinc-400">
                  <tr>
                    <th className="px-5 py-4 font-black">Moneda 1</th>
                    <th className="px-5 py-4 font-black">Moneda 2</th>
                    <th className="px-5 py-4 font-black">Relación</th>
                    <th className="px-5 py-4 font-black">Actualizado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {relationshipRows.map((row) => (
                    <tr key={`${row.from}-${row.to}`} className="text-sm">
                      <td className="px-5 py-4 font-black">1 {row.from}</td>
                      <td className="px-5 py-4 font-black">{formatCurrencyValue(row.rate, row.to, 4)} {row.to}</td>
                      <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 font-semibold">{`${row.from} -> ${row.to}`}</td>
                      <td className="px-5 py-4 text-zinc-400 font-semibold">
                        {settings.rateUpdatedAt ? new Date(settings.rateUpdatedAt).toLocaleString("es-AR") : "Pendiente"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CurrencySelect({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        className={`${compact ? "mt-1 h-11" : "mt-2 h-12"} w-full rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400`}
      >
        {CURRENCY_OPTIONS.map((item) => (
          <option key={item.code} value={item.code}>
            {item.code} - {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
