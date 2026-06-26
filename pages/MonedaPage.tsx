import React, { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Calculator, Check, DollarSign, Loader2, RefreshCw, Save, TrendingUp } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useViewAs } from "../contexts/ViewAsContext";
import { useToast } from "../components/Toast";
import { supabase } from "../services/supabase";
import {
  CURRENCY_OPTIONS,
  CurrencyCode,
  DEFAULT_CURRENCY_SETTINGS,
  convertCurrency,
  formatCurrencyValue,
  getRateKey,
  normalizeCurrencySettings,
} from "../utils/currencySettings";

export default function MonedaPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const profileId = profile?.id || "";
  const { showToast } = useToast();

  const [settings, setSettings] = useState(DEFAULT_CURRENCY_SETTINGS);
  const [rawCostSettings, setRawCostSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [testAmount, setTestAmount] = useState(100);

  const rateKey = getRateKey(settings.metaCurrency, settings.baseCurrency);
  const currentRate = Number(settings.rates?.[rateKey]) || 1;
  const convertedTest = convertCurrency(testAmount, settings.metaCurrency, settings.baseCurrency, settings);

  const sameCurrency = settings.metaCurrency === settings.baseCurrency;
  const currencyLabel = useMemo(() => {
    const labelFor = (code: string) => CURRENCY_OPTIONS.find((item) => item.code === code)?.label || code;
    return {
      base: labelFor(settings.baseCurrency),
      store: labelFor(settings.storeCurrency),
      meta: labelFor(settings.metaCurrency),
    };
  }, [settings]);

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

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      if (!profileId) return;
      setLoading(true);
      try {
        const data = await callCostsApi("costs-load");
        if (!mounted) return;
        const saved = data.costSettings || {};
        setRawCostSettings(saved);
        setSettings(normalizeCurrencySettings(saved));
        setUpdatedAt(saved?.currency?.updatedAt || data.costSettingsUpdatedAt || null);
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

  const updateSetting = (key: "baseCurrency" | "storeCurrency" | "metaCurrency", value: CurrencyCode) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      const nextRateKey = getRateKey(next.metaCurrency, next.baseCurrency);
      return {
        ...next,
        rates: {
          ...next.rates,
          [nextRateKey]: Number(next.rates?.[nextRateKey]) || 1,
        },
      };
    });
  };

  const updateRate = (value: number) => {
    setSettings((prev) => ({
      ...prev,
      rates: {
        ...prev.rates,
        [getRateKey(prev.metaCurrency, prev.baseCurrency)]: Number(value) || 0,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const savedAt = new Date().toISOString();
      const mergedSettings = {
        ...(rawCostSettings || {}),
        currency: {
          ...settings,
          updatedAt: savedAt,
        },
      };
      await callCostsApi("costs-save-settings", { settings: mergedSettings });
      setRawCostSettings(mergedSettings);
      setUpdatedAt(savedAt);
      try {
        localStorage.setItem(`car_currency_${profileId}`, JSON.stringify(mergedSettings.currency));
        window.dispatchEvent(new CustomEvent("car_currency_settings_updated", { detail: mergedSettings.currency }));
      } catch {
        // Local storage is only a convenience cache.
      }
      showToast("Configuración de moneda guardada.", "success");
    } catch (err: any) {
      console.error("Currency settings save error:", err);
      showToast(err.message || "Error al guardar la configuración de moneda.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full animate-fade-in pb-20 text-zinc-900 dark:text-zinc-100">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h1 className="page-title">Convertidor de moneda</h1>
              <p className="text-zinc-500 dark:text-zinc-400 font-semibold text-sm">
                Unificá tienda, costos y pauta para que la facturación neta y el ROAS real estén en la misma moneda.
              </p>
            </div>
          </div>
        </div>
        {updatedAt && (
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
            <Check className="w-4 h-4" />
            Guardado: {new Date(updatedAt).toLocaleString("es-AR")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
        <section className="rounded-[22px] bg-white dark:bg-zinc-950 border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-500 mb-2">Configuración</p>
            <h2 className="text-2xl font-black">Moneda principal del negocio</h2>
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
              Elegí la moneda en la que querés leer el dashboard. Meta se convierte a esa moneda antes de calcular neto y ROAS real.
            </p>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {loading ? (
              <div className="h-48 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-white/[0.03] flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <CurrencySelect
                    label="Moneda base"
                    value={settings.baseCurrency}
                    onChange={(value) => updateSetting("baseCurrency", value)}
                  />
                  <CurrencySelect
                    label="Tienda / costos"
                    value={settings.storeCurrency}
                    onChange={(value) => updateSetting("storeCurrency", value)}
                  />
                  <CurrencySelect
                    label="Meta Ads"
                    value={settings.metaCurrency}
                    onChange={(value) => updateSetting("metaCurrency", value)}
                  />
                </div>

                <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-white/[0.03] p-4 sm:p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400 mb-1">Tipo de cambio</p>
                      <h3 className="text-lg font-black">
                        1 {settings.metaCurrency} = {sameCurrency ? "1" : currentRate.toLocaleString("es-AR")} {settings.baseCurrency}
                      </h3>
                      <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
                        Es manual para que puedas usar el dólar/tipo de cambio que realmente querés para gestión.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-zinc-500">1 {settings.metaCurrency}</span>
                      <ArrowRightLeft className="w-4 h-4 text-zinc-400" />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={sameCurrency}
                        value={sameCurrency ? 1 : currentRate}
                        onChange={(e) => updateRate(Number(e.target.value))}
                        className="w-36 h-11 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 disabled:opacity-50"
                      />
                      <span className="text-sm font-black text-zinc-500">{settings.baseCurrency}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving || (!sameCurrency && currentRate <= 0)}
                  className="w-full sm:w-auto h-12 px-6 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-sm font-black shadow-lg shadow-black/10 dark:shadow-white/5 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? "Guardando..." : "Guardar configuración"}
                </button>
              </>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[22px] bg-white dark:bg-zinc-950 border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-500">Prueba rápida</p>
                <h2 className="text-xl font-black">Simular conversión</h2>
              </div>
            </div>
            <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] p-4">
              <label className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Monto en {settings.metaCurrency}</label>
              <div className="flex items-center gap-2 mt-2">
                <DollarSign className="w-4 h-4 text-zinc-400" />
                <input
                  type="number"
                  min="0"
                  value={testAmount}
                  onChange={(e) => setTestAmount(Number(e.target.value) || 0)}
                  className="flex-1 h-11 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div className="mt-4 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-zinc-400">Resultado en {settings.baseCurrency}</p>
                <p className="text-3xl font-black mt-1">{formatCurrencyValue(convertedTest, settings.baseCurrency)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-[22px] bg-gradient-to-br from-violet-50 to-white dark:from-violet-500/10 dark:to-zinc-950 border border-violet-100 dark:border-violet-500/20 shadow-sm p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black">Cómo se usa</h2>
                <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300 mt-2 leading-relaxed">
                  En Inicio, la tienda y los costos quedan como {currencyLabel.store}. La inversión y retorno de Meta Ads se pasan de {currencyLabel.meta} a {currencyLabel.base}. Con eso se calculan Facturación neta, ROAS real y M.E.R. en una sola moneda.
                </p>
              </div>
            </div>
          </section>

          <button
            onClick={() => window.location.reload()}
            className="w-full h-11 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-black text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Recargar valores
          </button>
        </aside>
      </div>
    </div>
  );
}

function CurrencySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        className="mt-2 w-full h-12 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
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
