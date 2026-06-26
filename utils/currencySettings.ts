export type CurrencyCode = "ARS" | "USD" | "EUR" | "BRL" | "CLP" | "COP" | "MXN" | "UYU" | "LOCAL";

export type CurrencySettings = {
  baseCurrency: CurrencyCode;
  storeCurrency: CurrencyCode;
  metaCurrency: CurrencyCode;
  emailCurrency: CurrencyCode;
  costsCurrency: CurrencyCode;
  rates: Record<string, number>;
  updatedAt?: string;
  rateUpdatedAt?: string;
  rateProvider?: string;
};

export type CurrencySource = "store" | "meta" | "email" | "costs";

export const CURRENCY_OPTIONS: Array<{ code: CurrencyCode; label: string; symbol: string }> = [
  { code: "ARS", label: "Peso argentino", symbol: "$" },
  { code: "USD", label: "Dólar estadounidense", symbol: "US$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "BRL", label: "Real brasileño", symbol: "R$" },
  { code: "CLP", label: "Peso chileno", symbol: "$" },
  { code: "COP", label: "Peso colombiano", symbol: "$" },
  { code: "MXN", label: "Peso mexicano", symbol: "$" },
  { code: "UYU", label: "Peso uruguayo", symbol: "$U" },
  { code: "LOCAL", label: "Moneda local", symbol: "$" },
];

export const DEFAULT_CURRENCY_SETTINGS: CurrencySettings = {
  baseCurrency: "ARS",
  storeCurrency: "ARS",
  metaCurrency: "USD",
  emailCurrency: "ARS",
  costsCurrency: "ARS",
  rates: {
    "USD:ARS": 1200,
  },
};

export const normalizeCurrencySettings = (raw: any): CurrencySettings => {
  const parsed = raw && typeof raw === "object" ? raw : {};
  const currency = parsed.currency && typeof parsed.currency === "object" ? parsed.currency : parsed;
  const rates = currency.rates && typeof currency.rates === "object" ? currency.rates : {};
  return {
    ...DEFAULT_CURRENCY_SETTINGS,
    ...currency,
    rates: {
      ...DEFAULT_CURRENCY_SETTINGS.rates,
      ...rates,
    },
  };
};

export const getCurrencySymbol = (code?: string) =>
  CURRENCY_OPTIONS.find((item) => item.code === code)?.symbol || "$";

export const formatCurrencyValue = (value: number, currency?: string, maximumFractionDigits = 0) =>
  `${getCurrencySymbol(currency)} ${Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits })}`;

export const getRateKey = (from: string, to: string) => `${from}:${to}`;

export const getExchangeRate = (from: string, to: string, settings: CurrencySettings) => {
  if (!from || !to || from === to || from === "LOCAL" || to === "LOCAL") return 1;
  const direct = Number(settings.rates?.[getRateKey(from, to)]);
  if (direct > 0) return direct;
  const inverse = Number(settings.rates?.[getRateKey(to, from)]);
  if (inverse > 0) return 1 / inverse;
  return 1;
};

export const convertCurrency = (amount: number, from: string, to: string, settings: CurrencySettings) =>
  Number(amount || 0) * getExchangeRate(from, to, settings);

export const convertMetaToBase = (amount: number, settings: CurrencySettings) =>
  convertCurrency(amount, settings.metaCurrency, settings.baseCurrency, settings);

export const convertStoreToBase = (amount: number, settings: CurrencySettings) =>
  convertCurrency(amount, settings.storeCurrency, settings.baseCurrency, settings);

export const getSourceCurrency = (source: CurrencySource, settings: CurrencySettings) => {
  if (source === "meta") return settings.metaCurrency;
  if (source === "email") return settings.emailCurrency;
  if (source === "costs") return settings.costsCurrency;
  return settings.storeCurrency;
};
