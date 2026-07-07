import React from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  Download,
  Edit3,
  Image,
  Instagram,
  Link as LinkIcon,
  Loader2,
  Megaphone,
  MessageCircle,
  Package,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShoppingCart,
  Sparkles,
  Store,
  Upload,
  Wand2,
  X,
} from 'lucide-react';

type Screen =
  | 'login'
  | 'trial'
  | 'trialResults'
  | 'dashboard'
  | 'brand'
  | 'products'
  | 'objective'
  | 'workspace'
  | 'review'
  | 'content'
  | 'sales'
  | 'settings';

type Creative = {
  id: number;
  title: string;
  angle: string;
  copy: string;
  color: string;
  status: 'Borrador' | 'Listo' | 'Publicado';
};

const APP_NAME = 'Creattia';

const navItems = [
  { id: 'dashboard', label: 'Inicio', icon: Sparkles },
  { id: 'brand', label: 'ADN de marca', icon: Store },
  { id: 'products', label: 'Productos', icon: Package },
  { id: 'workspace', label: 'Campaña', icon: MessageCircle },
  { id: 'review', label: 'Ads', icon: Megaphone },
  { id: 'content', label: 'Contenido', icon: Image },
  { id: 'sales', label: 'Ventas', icon: BarChart3 },
  { id: 'settings', label: 'Ajustes', icon: Settings2 },
] as const;

const products = [
  {
    name: 'Serum Glow C',
    tag: 'Best seller',
    price: '$34.900',
    image: 'from-orange-100 via-rose-100 to-pink-200',
    insight: 'Promesa visible, ideal para antes/despues y autoridad con cifras.',
  },
  {
    name: 'Crema Repair Night',
    tag: 'Margen alto',
    price: '$42.500',
    image: 'from-blue-100 via-cyan-50 to-emerald-100',
    insight: 'Buen fit para rutina nocturna, textura y objeciones de sensibilidad.',
  },
  {
    name: 'Kit Rutina 3 pasos',
    tag: 'Bundle',
    price: '$71.000',
    image: 'from-violet-100 via-fuchsia-50 to-amber-100',
    insight: 'Mejor para ticket promedio y comparativa versus comprar suelto.',
  },
];

const initialCreatives: Creative[] = [
  {
    id: 1,
    title: 'Autoridad con cifras',
    angle: 'Performance',
    copy: 'La rutina que ilumina la piel en 7 dias sin sumar diez pasos.',
    color: 'from-[#fff0c9] via-[#ffd6d6] to-[#eef4ff]',
    status: 'Listo',
  },
  {
    id: 2,
    title: 'Problema cotidiano',
    angle: 'Dolor',
    copy: 'Si tu piel se ve apagada aunque descanses, este serum trabaja justo ahi.',
    color: 'from-[#dff8ff] via-[#e8f1ff] to-[#f5e8ff]',
    status: 'Borrador',
  },
  {
    id: 3,
    title: 'Prueba social',
    angle: 'Confianza',
    copy: 'Mas de 1.200 rutinas creadas para recuperar brillo sin irritacion.',
    color: 'from-[#e8fff3] via-[#f8f4dd] to-[#ffe5ee]',
    status: 'Borrador',
  },
];

const trialAds = [
  {
    title: 'Tus manos merecen un cuero a su altura.',
    subtitle: 'Espesor uniforme para un trabajo impecable.',
    cta: 'Descubrí la diferencia',
    format: 'feed',
    color: 'from-[#2b160e] via-[#7a4327] to-[#c38b5d]',
  },
  {
    title: 'El punto de partida de una obra maestra.',
    subtitle: 'Espesor uniforme para un rendimiento superior.',
    cta: 'Elegí tu falda',
    format: 'feed',
    color: 'from-[#1d120d] via-[#5d321f] to-[#9c7048]',
  },
  {
    title: 'El espesor perfecto, de punta a punta.',
    subtitle: 'Menos desperdicio, más rendimiento en cada pieza.',
    cta: 'Materia prima de EE. UU. · Curtido vegetal en Argentina',
    format: 'feed',
    color: 'from-[#321c11] via-[#805033] to-[#d6a56f]',
  },
  {
    title: '¡Uff, me pasaba siempre!',
    subtitle: 'El espesor es perfecto y parejo de punta a punta.',
    cta: 'Formato historia con prueba conversacional',
    format: 'story',
    color: 'from-[#e9e3d8] via-[#9f7559] to-[#4b2a1e]',
  },
];

const timeline = [
  'Investigando la marca',
  'Leyendo el contenido',
  'Analizando el producto',
  'Estudiando el mercado',
  'Generando borradores',
];

function GoogleMark() {
  return (
    <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[15px] font-bold">
      <span className="bg-gradient-to-br from-blue-500 via-red-500 to-yellow-400 bg-clip-text text-transparent">G</span>
    </span>
  );
}

function Mascot({ className = '' }: { className?: string }) {
  return (
    <img
      src="/assets/creattia-mascot.svg"
      alt={`${APP_NAME} mascot`}
      className={`object-contain drop-shadow-[0_18px_30px_rgba(76,100,150,0.22)] ${className}`}
    />
  );
}

function PillButton({
  children,
  onClick,
  variant = 'dark',
  icon,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'dark' | 'light' | 'soft';
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const styles = {
    dark: 'bg-gray-950 text-white hover:bg-gray-800',
    light: 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50',
    soft: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]}`}
    >
      {icon}
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-gray-400"
      />
    </label>
  );
}

function ProgressDots({ active }: { active: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[0, 1, 2, 3, 4].map((dot) => (
        <span key={dot} className={`h-1.5 rounded-full transition-all ${dot <= active ? 'w-8 bg-gray-900' : 'w-1.5 bg-gray-200'}`} />
      ))}
    </div>
  );
}

function TrialAdCard({
  ad,
  selected,
  onToggle,
  onPreview,
  large = false,
}: {
  ad: (typeof trialAds)[number];
  selected?: boolean;
  onToggle?: () => void;
  onPreview?: () => void;
  large?: boolean;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${ad.color} shadow-[0_18px_45px_rgba(15,23,42,0.18)] ${large ? 'h-[648px] w-[365px]' : 'aspect-[9/16] w-full'}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.42),transparent_26%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.42))]" />
      <div className="absolute inset-x-5 top-9 text-white drop-shadow">
        {ad.format === 'story' && <p className="mb-6 text-[11px] font-semibold opacity-80">llannecz · 4h</p>}
        <h3 className={`${large ? 'text-[32px]' : 'text-[23px]'} font-serif leading-[0.95] tracking-tight`}>{ad.title}</h3>
        <p className={`${large ? 'mt-5 text-[18px]' : 'mt-4 text-[14px]'} max-w-[260px] font-semibold leading-tight`}>{ad.subtitle}</p>
        {ad.format === 'story' ? (
          <div className="mt-5 space-y-2 text-[11px] font-bold text-gray-900">
            <div className="ml-auto w-fit max-w-[220px] rounded-xl bg-white/85 px-3 py-2 text-center">¿Harto de renegar con el espesor del cuero?</div>
            <div className="mx-auto w-fit max-w-[220px] rounded-xl bg-white/85 px-3 py-2 text-center">¿Harto de renegar con el espesor del cuello?</div>
          </div>
        ) : null}
      </div>
      <div className="absolute bottom-8 left-1/2 h-[46%] w-[78%] -translate-x-1/2 rounded-[55%_45%_38%_62%] bg-[linear-gradient(135deg,rgba(25,12,8,0.85),rgba(158,91,48,0.96),rgba(238,178,111,0.72))] shadow-[inset_0_12px_38px_rgba(255,255,255,0.22),0_30px_60px_rgba(0,0,0,0.38)]" />
      <div className="absolute bottom-7 left-7 right-7 border-t border-white/45 pt-3 text-center text-xs font-semibold text-white/90">{ad.cta}</div>
      {typeof selected === 'boolean' && (
        <button
          type="button"
          onClick={onToggle}
          className={`absolute left-2.5 top-2.5 z-10 grid h-6 w-6 place-items-center rounded-full transition ${selected ? 'bg-[#d7ff3f] text-gray-950' : 'bg-white/80 text-transparent ring-1 ring-gray-300'}`}
        >
          <Check className="h-3 w-3" />
        </button>
      )}
      {onPreview && (
        <button
          type="button"
          onClick={onPreview}
          className="absolute right-2.5 top-2.5 z-10 grid h-7 w-7 place-items-center rounded-lg bg-black/35 text-white opacity-0 transition group-hover:opacity-100"
        >
          <ChevronRight className="-rotate-45 h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function PricingModal({
  annual,
  onAnnual,
  onClose,
}: {
  annual: boolean;
  onAnnual: (value: boolean) => void;
  onClose: () => void;
}) {
  const plans = [
    {
      name: 'Basic',
      badge: annual ? '30% OFF' : '20% OFF',
      price: annual ? '$61.500' : '$69.900',
      billed: annual ? '$738.000 facturado por año' : '',
      body: 'Tenés una empresa y manejás todo el marketing vos',
      cta: 'Empezar ahora',
      tone: 'white',
      features: ['Hasta 1 marca', '100 Ads y piezas de Contenido', 'Personalización absoluta', 'Edits ilimitados (cada edit = 1 imagen)'],
    },
    {
      name: 'Pro',
      badge: annual ? '70% OFF' : '60% OFF',
      price: annual ? '$74.900' : '$99.900',
      billed: annual ? '$898.800 facturado por año' : '',
      body: 'Optimiza tus campañas',
      cta: 'Convertirme en Pro',
      tone: 'blue',
      features: ['Hasta 1 marca', 'Ads y piezas de Contenido ilimitadas', 'Personalización absoluta', 'Edits infinitos por pieza', 'Modelos Pro de IA', 'Optimización de Campañas'],
    },
    {
      name: 'Agencia',
      badge: '',
      price: 'Personalizado',
      billed: '',
      body: 'Sos una agencia o tenés un equipo manejando varias marcas',
      cta: 'Agendar reunión',
      tone: 'white',
      features: ['Hasta 5 marcas', 'Hasta 10 usuarios en tu equipo', 'Ads y piezas de Contenido ilimitadas', 'Personalización absoluta', 'Edits infinitos por pieza', 'Modelos Pro de IA'],
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-gray-900/55 px-4 py-16 backdrop-blur-[1px]">
      <button onClick={onClose} className="fixed right-6 top-6 grid h-10 w-10 place-items-center rounded-full bg-white text-gray-600 shadow-xl">
        <X className="h-5 w-5" />
      </button>
      <div className="mx-auto mb-10 flex w-fit rounded-full bg-gray-800/70 p-1 shadow-lg">
        <button onClick={() => onAnnual(false)} className={`h-10 rounded-full px-6 text-sm font-bold ${!annual ? 'bg-white text-gray-900' : 'text-white/80'}`}>Mensual</button>
        <button onClick={() => onAnnual(true)} className={`h-10 rounded-full px-6 text-sm font-bold ${annual ? 'bg-white text-gray-900' : 'text-white/80'}`}>Anual</button>
      </div>
      <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-3">
        {plans.map((plan) => {
          const blue = plan.tone === 'blue';
          return (
            <article key={plan.name} className={`relative rounded-[24px] p-7 shadow-2xl ${blue ? 'bg-[#3fb3f4] text-white' : 'bg-white text-gray-950'}`}>
              {plan.badge && <span className="absolute right-7 top-7 rounded-full bg-[#d7ff3f] px-3 py-1 text-xs font-black text-gray-950">{plan.badge}</span>}
              <h3 className="text-3xl font-black">{plan.name}</h3>
              <div className="mt-8">
                {plan.name !== 'Agencia' && <p className={`text-sm line-through ${blue ? 'text-white/70' : 'text-gray-400'}`}>{plan.name === 'Basic' ? '$87.900' : '$249.900'}</p>}
                <p className={`text-5xl font-black tracking-tight ${blue ? 'text-[#d7ff3f]' : 'text-gray-950'}`}>{plan.price}<span className={`text-sm font-medium ${blue ? 'text-white' : 'text-gray-500'}`}>{plan.name !== 'Agencia' ? '/mes' : ''}</span></p>
                {plan.billed && <p className={`mt-1 text-xs ${blue ? 'text-white/80' : 'text-gray-400'}`}>{plan.billed}</p>}
              </div>
              <p className={`mt-7 min-h-[48px] text-sm leading-6 ${blue ? 'text-white/85' : 'text-gray-500'}`}>{plan.body}</p>
              <button className={`mt-5 h-12 w-full rounded-full text-sm font-black ${blue ? 'bg-[#d7ff3f] text-gray-950' : 'bg-gray-100 text-gray-700'}`}>{plan.cta}</button>
              <div className={`mt-5 overflow-hidden rounded-3xl ${blue ? 'bg-white/10' : 'bg-gray-50'}`}>
                {plan.features.map((feature) => (
                  <div key={feature} className={`flex items-center justify-between gap-4 border-b px-5 py-4 text-sm last:border-b-0 ${blue ? 'border-white/10' : 'border-gray-100'}`}>
                    <span>{feature}</span>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#d7ff3f] text-gray-950"><Check className="h-4 w-4" /></span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function PosttyReplicaPage() {
  const [screen, setScreen] = React.useState<Screen>('login');
  const [trialUrl, setTrialUrl] = React.useState('https://www.theskirtingfactoryllc.com');
  const [selectedTrialAds, setSelectedTrialAds] = React.useState([0, 1, 2, 3]);
  const [previewTrialAd, setPreviewTrialAd] = React.useState<number | null>(null);
  const [pricingOpen, setPricingOpen] = React.useState(false);
  const [annualPricing, setAnnualPricing] = React.useState(false);
  const [brandUrl, setBrandUrl] = React.useState('https://www.tumarca.com');
  const [brandName, setBrandName] = React.useState('Glow Studio');
  const [businessType, setBusinessType] = React.useState('Productos');
  const [flowMode, setFlowMode] = React.useState<'auto' | 'custom'>('auto');
  const [selectedProduct, setSelectedProduct] = React.useState(products[0]);
  const [objective, setObjective] = React.useState('Generar ventas');
  const [messages, setMessages] = React.useState([
    'Acabo de analizar tu marca. Detecte una voz cercana, visual limpia y foco en resultados simples.',
    'Para este producto recomiendo 3 angulos: autoridad con cifras, problema cotidiano y prueba social.',
  ]);
  const [prompt, setPrompt] = React.useState('');
  const [creatives, setCreatives] = React.useState(initialCreatives);
  const [working, setWorking] = React.useState(false);
  const [connected, setConnected] = React.useState({ instagram: true, meta: false, meli: true });
  const [toast, setToast] = React.useState('');

  const campaignStep = ['brand', 'products', 'objective', 'workspace', 'review'].indexOf(screen);
  const isLoggedIn = screen !== 'login';

  React.useEffect(() => {
    document.title = `${APP_NAME} | Ads con IA`;
  }, []);

  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 2200);
  };

  const simulateWork = (next: () => void, label = `${APP_NAME} está trabajando...`) => {
    setWorking(true);
    notify(label);
    window.setTimeout(() => {
      setWorking(false);
      next();
    }, 850);
  };

  const sendMessage = () => {
    const clean = prompt.trim();
    if (!clean) return;
    setMessages((items) => [...items, clean, 'Listo. Ajuste los borradores para que suenen mas directos y con CTA mas claro.']);
    setPrompt('');
    setCreatives((items) => items.map((item) => ({ ...item, status: item.status === 'Publicado' ? item.status : 'Listo' })));
  };

  const generateTrialAds = () => {
    if (!trialUrl.trim()) return;
    simulateWork(() => {
      setSelectedTrialAds([0, 1, 2, 3]);
      setScreen('trialResults');
    }, 'Generando tus Ads de prueba...');
  };

  const toggleTrialAd = (index: number) => {
    setSelectedTrialAds((items) => (items.includes(index) ? items.filter((item) => item !== index) : [...items, index].sort()));
  };

  const regenerateCreative = (id: number) => {
    simulateWork(() => {
      setCreatives((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                copy: 'Nuevo enfoque: una promesa concreta, una razon para creer y un CTA mas accionable.',
                status: 'Listo',
              }
            : item
        )
      );
    }, 'Generando borrador...');
  };

  const publishCreative = (id: number) => {
    setCreatives((items) => items.map((item) => (item.id === id ? { ...item, status: 'Publicado' } : item)));
    notify('Publicado en Instagram');
  };

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-white font-sans text-gray-900">
        <div className="flex min-h-screen flex-col items-center justify-center px-3 py-6">
          <section className="relative w-full max-w-[424px] text-center">
            <Mascot className="absolute left-1/2 top-[-93px] h-[207px] w-[207px] -translate-x-1/2" />
            <div className="relative rounded-[24px] border border-gray-100 bg-white px-6 pb-10 pt-11 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <h1 className="text-[28px] font-light leading-[1.15] tracking-tight text-gray-900">¡Bienvenido a {APP_NAME}!</h1>
              <p className="mt-3 text-sm leading-relaxed text-gray-500">Iniciá sesión con tu cuenta de Google</p>
              <button
                type="button"
                onClick={() => setScreen('trial')}
                className="mt-6 inline-flex h-[42px] items-center justify-center gap-2.5 rounded-full border border-gray-200 bg-white px-7 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 active:scale-[0.97]"
              >
                <GoogleMark />
                Iniciar sesión con Google
              </button>
            </div>
            <p className="mx-auto mt-4 max-w-[300px] text-center text-[11px] leading-relaxed text-gray-400">
              Al iniciar sesión, aceptás los <button className="underline hover:text-gray-700">Términos y Condiciones</button> y la{' '}
              <button className="underline hover:text-gray-700">Política de Privacidad</button>.
            </p>
          </section>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="mt-auto inline-flex h-[42px] items-center rounded-full border border-gray-200 bg-white px-7 text-sm font-bold text-gray-900 transition hover:bg-gray-100 active:scale-[0.97]"
          >
            Volver
          </button>
        </div>
      </main>
    );
  }

  if (screen === 'trial' || screen === 'trialResults') {
    const selectedCount = selectedTrialAds.length;

    return (
      <main className="min-h-screen bg-white font-sans text-gray-900">
        {screen === 'trial' ? (
          <div className="flex min-h-screen flex-col items-center justify-center px-3 py-6">
            <section className="relative w-full max-w-[520px] text-center">
              <Mascot className="absolute left-1/2 top-[-92px] h-[190px] w-[190px] -translate-x-1/2" />
              <div className="relative rounded-[24px] border border-gray-100 bg-white px-6 pb-10 pt-11 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
                <h1 className="text-[28px] font-light leading-[1.15] tracking-tight text-gray-900">Probá {APP_NAME} gratis</h1>
                <p className="mt-4 text-sm leading-relaxed text-gray-500">Ingresá el link de tu tienda y generamos 4 Ads de prueba</p>
                <input
                  value={trialUrl}
                  onChange={(event) => setTrialUrl(event.target.value)}
                  placeholder="https://mitienda.com"
                  autoFocus
                  className="mx-auto mt-5 h-[46px] w-full max-w-[320px] rounded-full border border-gray-300 bg-white px-6 text-sm text-gray-700 outline-none transition focus:border-gray-500"
                />
                <div>
                  <button
                    type="button"
                    onClick={generateTrialAds}
                    disabled={!trialUrl.trim()}
                    className="mt-4 inline-flex h-[48px] items-center justify-center rounded-full bg-gray-100 px-7 text-sm font-semibold text-gray-400 transition enabled:bg-gray-950 enabled:text-white enabled:hover:bg-gray-800 disabled:cursor-not-allowed"
                  >
                    Generar mis Ads
                  </button>
                </div>
              </div>
            </section>
            <div className="mt-auto flex gap-3">
              <PillButton variant="light" onClick={() => setScreen('login')}>Cerrar sesión</PillButton>
              <button
                type="button"
                onClick={() => setPricingOpen(true)}
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#d7ff3f] px-7 text-sm font-black text-gray-950 transition hover:opacity-90"
              >
                Comprar
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-screen pb-28">
            <section className="mx-auto max-w-[1120px] px-4 pt-20 sm:px-6 lg:px-0">
              <button
                type="button"
                onClick={() => setScreen('trial')}
                aria-label="Cerrar sesión"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-900 transition-colors hover:border-gray-300"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
              <h1 className="mt-6 text-[32px] font-light leading-[1.1] tracking-tight text-gray-900 sm:text-[36px]">Tus Ads de prueba</h1>
              <p className="mt-2 max-w-[900px] text-sm leading-relaxed text-gray-500">
                Estos Ads fueron creados como ejemplos, ¡imaginate los que podríamos crear si nos ayudas con tu conocimiento!
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {trialAds.map((ad, index) => (
                  <TrialAdCard
                    key={ad.title}
                    ad={ad}
                    selected={selectedTrialAds.includes(index)}
                    onToggle={() => toggleTrialAd(index)}
                    onPreview={() => setPreviewTrialAd(index)}
                  />
                ))}
              </div>
            </section>
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white/88 shadow-[0_-20px_50px_rgba(15,23,42,0.12)] backdrop-blur-xl">
              <div className="mx-auto flex max-w-[1120px] items-center justify-end gap-3 px-4 py-4 sm:gap-5">
                <span className="hidden text-sm text-gray-500 sm:inline">{selectedCount} seleccionados</span>
                <PillButton variant="light" disabled={selectedCount === 0} onClick={() => notify('Descargando tus Ads seleccionados...')}>
                  Descargar
                </PillButton>
                <button
                  type="button"
                  onClick={() => setPricingOpen(true)}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-[#d7ff3f] px-7 text-sm font-black text-gray-950 transition hover:opacity-90"
                >
                  Comprar
                </button>
              </div>
            </div>
          </div>
        )}

        {previewTrialAd !== null && (
          <div className="fixed inset-0 z-[90] grid place-items-center bg-gray-700/75 px-4 py-8">
            <div className="relative">
              <TrialAdCard ad={trialAds[previewTrialAd]} large />
              <button
                onClick={() => setPreviewTrialAd(null)}
                className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-white text-gray-700 shadow-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {pricingOpen && <PricingModal annual={annualPricing} onAnnual={setAnnualPricing} onClose={() => setPricingOpen(false)} />}

        {working && (
          <div className="fixed inset-0 z-[80] grid place-items-center bg-white/70 backdrop-blur-sm">
            <div className="rounded-[26px] border border-gray-100 bg-white p-6 text-center shadow-2xl">
              <Mascot className="mx-auto h-20 w-20" />
              <p className="mt-3 text-sm font-bold text-gray-800">{APP_NAME} está creando tus Ads...</p>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-24 left-1/2 z-[110] -translate-x-1/2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-2xl">
            {toast}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fafafa] font-sans text-gray-900">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center border-r border-gray-100 bg-white/90 py-5 backdrop-blur sm:flex">
          <Mascot className="h-12 w-12" />
          <nav className="mt-8 flex flex-1 flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id as Screen)}
                  title={item.label}
                  className={`grid h-11 w-11 place-items-center rounded-full transition ${active ? 'bg-gray-950 text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </nav>
          <button onClick={() => setScreen('login')} className="grid h-10 w-10 place-items-center rounded-full text-gray-400 hover:bg-gray-100" title="Salir">
            <X className="h-5 w-5" />
          </button>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col sm:pl-[88px]">
          <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/85 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-8">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => (screen === 'dashboard' ? setScreen('login') : setScreen('dashboard'))}
                  className="grid h-9 w-9 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{APP_NAME} Campaign</p>
                  <h2 className="text-sm font-bold text-gray-950 sm:text-base">{brandName}</h2>
                </div>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <button className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">Tu plan: Free trial</button>
                <PillButton onClick={() => setScreen('objective')} icon={<Plus className="h-4 w-4" />}>
                  Nueva campaña
                </PillButton>
              </div>
              <button className="grid h-10 w-10 place-items-center rounded-full bg-gray-950 text-white sm:hidden" onClick={() => setScreen('objective')}>
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-28 pt-6 sm:px-8 sm:py-8">
            {campaignStep >= 0 && (
              <div className="mb-6 rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <ProgressDots active={campaignStep} />
              </div>
            )}

            {screen === 'dashboard' && (
              <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
                <section className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-[0_16px_45px_rgba(15,23,42,0.05)] sm:p-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-sm font-semibold text-gray-400">Probá {APP_NAME} gratis</p>
                      <h1 className="mt-2 text-3xl font-light tracking-tight text-gray-950 sm:text-5xl">Creá campañas completas con {APP_NAME}</h1>
                      <p className="mt-4 max-w-xl text-sm leading-6 text-gray-500">
                        {APP_NAME} analiza tu marca, elige el producto, genera anuncios, posts y recomendaciones de ventas con un agente conversacional.
                      </p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <PillButton onClick={() => setScreen('brand')} icon={<Wand2 className="h-4 w-4" />}>
                          Conectá tu marca
                        </PillButton>
                        <PillButton variant="light" onClick={() => setScreen('review')} icon={<Megaphone className="h-4 w-4" />}>
                          Ver borradores
                        </PillButton>
                      </div>
                    </div>
                    <div className="relative mx-auto h-64 w-full max-w-[340px]">
                      <div className="absolute inset-x-7 bottom-0 h-44 rounded-[30px] bg-gradient-to-br from-gray-50 to-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]" />
                      <Mascot className="absolute left-1/2 top-0 h-52 w-52 -translate-x-1/2" />
                      <div className="absolute bottom-5 left-3 right-3 rounded-3xl border border-gray-100 bg-white/90 p-4 shadow-xl backdrop-blur">
                        <p className="text-xs font-bold text-gray-900">ADN de marca listo</p>
                        <p className="mt-1 text-xs leading-5 text-gray-500">Voz cercana, visual minimalista, foco en resultados medibles.</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  {[
                    ['1 marca', 'URL de tienda vinculada a la cuenta'],
                    ['100 ads', 'Ads y piezas de contenido disponibles'],
                    ['Meta Ads', connected.meta ? 'Meta conectado' : 'Requiere conexión'],
                  ].map(([value, label]) => (
                    <div key={value} className="rounded-[24px] border border-gray-100 bg-white p-5">
                      <p className="text-2xl font-light text-gray-950">{value}</p>
                      <p className="mt-1 text-sm text-gray-500">{label}</p>
                    </div>
                  ))}
                </section>

                <section className="grid gap-4 lg:col-span-2 sm:grid-cols-3">
                  {[
                    ['ADN de tu marca', `${APP_NAME} usa tu web, documentos y tono para crear piezas consistentes.`, 'brand', Store],
                    ['Campañas Meta Ads', 'Borradores editables, exportables y listos para publicar.', 'workspace', Megaphone],
                    ['Ventas Mercado Libre', 'Unidades, facturación, órdenes y lift estimado por publicación.', 'sales', ShoppingCart],
                  ].map(([title, body, target, Icon]) => (
                    <button
                      key={title as string}
                      type="button"
                      onClick={() => setScreen(target as Screen)}
                      className="group rounded-[24px] border border-gray-100 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(15,23,42,0.07)]"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-gray-100 text-gray-700">
                        {React.createElement(Icon as typeof Store, { className: 'h-5 w-5' })}
                      </span>
                      <h3 className="mt-4 text-base font-bold text-gray-950">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-gray-500">{body}</p>
                      <ChevronRight className="mt-4 h-5 w-5 text-gray-300 transition group-hover:translate-x-1 group-hover:text-gray-600" />
                    </button>
                  ))}
                </section>
              </div>
            )}

            {screen === 'brand' && (
              <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                <section className="rounded-[28px] border border-gray-100 bg-white p-6">
                  <h1 className="text-2xl font-light tracking-tight">Conectá tu marca</h1>
                  <p className="mt-2 text-sm leading-6 text-gray-500">Pegá una URL, subí un brief o escribí una descripción. {APP_NAME} arma tu Brand DNA.</p>
                  <div className="mt-6 space-y-4">
                    <Field label="URL de tienda" value={brandUrl} onChange={setBrandUrl} />
                    <Field label="Nombre de la marca" value={brandName} onChange={setBrandName} />
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-500">Tipo de negocio</span>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {['Productos', 'Servicios', 'Ambos'].map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setBusinessType(item)}
                            className={`h-10 rounded-full text-sm font-semibold transition ${businessType === item ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </label>
                    <button className="flex h-24 w-full flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50">
                      <Upload className="mb-2 h-5 w-5" />
                      Subí un brief, deck o planilla
                    </button>
                    <PillButton onClick={() => simulateWork(() => setScreen('products'), 'Estamos extrayendo el ADN de tu marca...')} icon={<Sparkles className="h-4 w-4" />}>
                      Analizar marca
                    </PillButton>
                  </div>
                </section>
                <section className="rounded-[28px] border border-gray-100 bg-white p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">El ADN de tu marca</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {[
                      ['Voz de marca', 'Cercana, experta y simple. Evita promesas infladas.'],
                      ['Cliente ideal', 'Personas que buscan resultados visibles sin rutinas extensas.'],
                      ['Territorio visual', 'Fondos blancos, textura de producto, luz suave y acentos pastel.'],
                      ['Objeciones', 'Sensibilidad, precio, constancia y miedo a irritación.'],
                    ].map(([title, body]) => (
                      <div key={title} className="rounded-3xl bg-gray-50 p-4">
                        <h3 className="text-sm font-bold">{title}</h3>
                        <p className="mt-2 text-sm leading-6 text-gray-500">{body}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {screen === 'products' && (
              <section className="rounded-[28px] border border-gray-100 bg-white p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <h1 className="text-2xl font-light tracking-tight">Elegí un producto</h1>
                    <p className="mt-2 text-sm text-gray-500">Explorando tu catálogo de productos. También podés subir una foto manual.</p>
                  </div>
                  <PillButton variant="light" icon={<Upload className="h-4 w-4" />}>Subir foto de producto</PillButton>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {products.map((product) => (
                    <button
                      key={product.name}
                      type="button"
                      onClick={() => setSelectedProduct(product)}
                      className={`rounded-[26px] border p-3 text-left transition ${selectedProduct.name === product.name ? 'border-gray-900 bg-gray-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                    >
                      <div className={`h-44 rounded-[22px] bg-gradient-to-br ${product.image} p-4`}>
                        <div className="h-full rounded-[20px] border border-white/70 bg-white/40 backdrop-blur-sm" />
                      </div>
                      <div className="p-3">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-500">{product.tag}</span>
                        <h3 className="mt-3 text-base font-bold text-gray-950">{product.name}</h3>
                        <p className="mt-1 text-sm font-semibold text-gray-500">{product.price}</p>
                        <p className="mt-3 text-sm leading-6 text-gray-500">{product.insight}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex justify-end">
                  <PillButton onClick={() => simulateWork(() => setScreen('objective'), 'Analizando el producto...')}>Continuar</PillButton>
                </div>
              </section>
            )}

            {screen === 'objective' && (
              <section className="mx-auto max-w-4xl rounded-[28px] border border-gray-100 bg-white p-6 text-center sm:p-10">
                <h1 className="text-3xl font-light tracking-tight">¿Qué querés lograr?</h1>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-500">{APP_NAME} arma la campaña alrededor del objetivo, el producto y el ADN de marca.</p>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {['Generar ventas', 'Nuevos seguidores', 'Chats por semana'].map((item) => (
                    <button
                      key={item}
                      onClick={() => setObjective(item)}
                      className={`rounded-[24px] border p-5 text-left transition ${objective === item ? 'border-gray-900 bg-gray-950 text-white' : 'border-gray-100 bg-gray-50 text-gray-800 hover:bg-gray-100'}`}
                    >
                      <p className="text-sm font-bold">{item}</p>
                      <p className={`mt-2 text-xs leading-5 ${objective === item ? 'text-gray-300' : 'text-gray-500'}`}>Se elige con tu ADN de marca y el producto seleccionado.</p>
                    </button>
                  ))}
                </div>
                <div className="mt-6 rounded-3xl bg-gray-50 p-4 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">Modo de creación</p>
                      <p className="mt-1 text-xs text-gray-500">Automático o custom con revisión paso a paso.</p>
                    </div>
                    <div className="flex rounded-full bg-white p-1">
                      {(['auto', 'custom'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setFlowMode(mode)}
                          className={`h-9 rounded-full px-4 text-xs font-bold ${flowMode === mode ? 'bg-gray-950 text-white' : 'text-gray-500'}`}
                        >
                          {mode === 'auto' ? 'Automático' : 'Custom'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-7">
                  <PillButton onClick={() => simulateWork(() => setScreen('workspace'), 'Estoy generando tus 3 borradores...')} icon={<Bot className="h-4 w-4" />}>
                    Crear campaña
                  </PillButton>
                </div>
              </section>
            )}

            {screen === 'workspace' && (
              <div className="grid min-h-[calc(100vh-180px)] gap-5 lg:grid-cols-[0.75fr_1.25fr]">
                <section className="rounded-[28px] border border-gray-100 bg-white p-5">
                  <h1 className="text-xl font-light tracking-tight">Habla con {APP_NAME}</h1>
                  <div className="mt-5 space-y-3">
                    {timeline.map((item, index) => (
                      <div key={item} className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
                        <span className={`grid h-7 w-7 place-items-center rounded-full ${index < 4 ? 'bg-gray-950 text-white' : 'bg-white text-gray-400'}`}>
                          {index < 4 ? <Check className="h-4 w-4" /> : <Loader2 className="h-4 w-4" />}
                        </span>
                        <span className="text-sm font-semibold text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="flex min-h-[560px] flex-col overflow-hidden rounded-[28px] border border-gray-100 bg-white">
                  <div className="border-b border-gray-100 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Campaign workspace</p>
                    <h2 className="mt-1 text-lg font-bold">{selectedProduct.name} · {objective}</h2>
                  </div>
                  <div className="flex-1 space-y-4 overflow-y-auto p-5">
                    {messages.map((message, index) => (
                      <div key={`${message}-${index}`} className={`max-w-[82%] rounded-[24px] px-4 py-3 text-sm leading-6 ${index % 2 === 0 ? 'bg-gray-100 text-gray-700' : 'ml-auto bg-gray-950 text-white'}`}>
                        {message}
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 p-4">
                    <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2">
                      <input
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && sendMessage()}
                        placeholder={`Decile a ${APP_NAME} qué cambio querés...`}
                        className="h-9 flex-1 bg-transparent px-2 text-sm outline-none"
                      />
                      <button onClick={sendMessage} className="grid h-9 w-9 place-items-center rounded-full bg-gray-950 text-white">
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {screen === 'review' && (
              <section className="rounded-[28px] border border-gray-100 bg-white p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-light tracking-tight">(✓) ¡Ads Listos!</h1>
                    <p className="mt-2 text-sm text-gray-500">Podés editarlos, descargarlos o subir a Meta directamente.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PillButton variant="light" icon={<Download className="h-4 w-4" />} onClick={() => notify('Descarga preparada')}>
                      Descargar
                    </PillButton>
                    <PillButton icon={<Megaphone className="h-4 w-4" />} onClick={() => notify(connected.meta ? 'Publicado en Meta Ads' : 'Conectá Meta Ads para publicar')}>
                      Publicar en Meta Ads
                    </PillButton>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                  {creatives.map((creative) => (
                    <article key={creative.id} className="overflow-hidden rounded-[26px] border border-gray-100 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.04)]">
                      <div className={`relative h-72 bg-gradient-to-br ${creative.color} p-5`}>
                        <div className="absolute left-5 top-5 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold text-gray-600 backdrop-blur">{creative.angle}</div>
                        <div className="absolute bottom-5 left-5 right-5 rounded-[24px] bg-white/90 p-4 shadow-lg backdrop-blur">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">{brandName}</p>
                          <h3 className="mt-2 text-xl font-light leading-tight text-gray-950">{creative.title}</h3>
                          <p className="mt-2 text-sm leading-5 text-gray-600">{creative.copy}</p>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${creative.status === 'Publicado' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{creative.status}</span>
                          <div className="flex gap-1">
                            <button onClick={() => regenerateCreative(creative.id)} className="grid h-9 w-9 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Regenerar">
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button onClick={() => publishCreative(creative.id)} className="grid h-9 w-9 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Publicar">
                              <Instagram className="h-4 w-4" />
                            </button>
                            <button className="grid h-9 w-9 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar">
                              <Edit3 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {screen === 'content' && (
              <section className="rounded-[28px] border border-gray-100 bg-white p-6">
                <h1 className="text-2xl font-light tracking-tight">Instagram · Posts</h1>
                <p className="mt-2 text-sm text-gray-500">Contenido para redes generado por {APP_NAME}. Cambiá el tamaño a 4:5, editá o borrá cada post.</p>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {['Educativo', 'Rutina', 'Testimonio'].map((title, index) => (
                    <div key={title} className="rounded-[26px] border border-gray-100 bg-gray-50 p-4">
                      <div className={`aspect-[4/5] rounded-[22px] bg-gradient-to-br ${initialCreatives[index].color}`} />
                      <h3 className="mt-4 text-sm font-bold">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-gray-500">Post listo con identidad de marca, caption y CTA.</p>
                      <PillButton variant="light" onClick={() => notify('Publicado en Instagram')} icon={<Instagram className="h-4 w-4" />}>
                        Subir a Instagram
                      </PillButton>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {screen === 'sales' && (
              <section className="rounded-[28px] border border-gray-100 bg-white p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-[#FFE600] text-gray-900">
                      <ShoppingCart className="h-5 w-5" />
                    </span>
                    <div>
                      <h1 className="text-xl font-bold">Ventas · Mercado Libre</h1>
                      <p className="text-sm text-gray-500">Unidades, facturación y órdenes por publicación.</p>
                    </div>
                  </div>
                  <PillButton variant={connected.meli ? 'soft' : 'light'} onClick={() => setConnected((state) => ({ ...state, meli: !state.meli }))}>
                    {connected.meli ? 'Mercado Libre conectado' : 'Conectar Mercado Libre'}
                  </PillButton>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    ['Facturación', '$3.420.000'],
                    ['Unidades', '286'],
                    ['Órdenes', '211'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="mt-1 text-xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-100">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Producto</th>
                        <th className="px-4 py-3 text-right font-semibold">Unidades</th>
                        <th className="px-4 py-3 text-right font-semibold">Facturación</th>
                        <th className="px-4 py-3 text-right font-semibold">Órdenes</th>
                        <th className="px-4 py-3 text-right font-semibold">Lift est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product, index) => (
                        <tr key={product.name} className="border-t border-gray-50">
                          <td className="px-4 py-3 font-semibold text-gray-700">{product.name}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{118 - index * 31}</td>
                          <td className="px-4 py-3 text-right text-gray-600">${(1420000 - index * 270000).toLocaleString('es-AR')}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{86 - index * 18}</td>
                          <td className="px-4 py-3 text-right text-green-600">+{18 - index * 4}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {screen === 'settings' && (
              <section className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-[28px] border border-gray-100 bg-white p-6">
                  <h1 className="text-2xl font-light">Integraciones</h1>
                  <div className="mt-5 space-y-3">
                    {[
                      ['Instagram', 'instagram', Instagram],
                      ['Meta Ads', 'meta', Megaphone],
                      ['Mercado Libre', 'meli', ShoppingCart],
                    ].map(([label, key, Icon]) => (
                      <div key={key as string} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4">
                        <div className="flex items-center gap-3">
                          {React.createElement(Icon as typeof Instagram, { className: 'h-5 w-5 text-gray-500' })}
                          <span className="text-sm font-bold">{label}</span>
                        </div>
                        <button
                          onClick={() => setConnected((state) => ({ ...state, [key as keyof typeof connected]: !state[key as keyof typeof connected] }))}
                          className={`rounded-full px-4 py-2 text-xs font-bold ${connected[key as keyof typeof connected] ? 'bg-green-50 text-green-700' : 'bg-white text-gray-500'}`}
                        >
                          {connected[key as keyof typeof connected] ? 'Conectado' : 'Conectar'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[28px] border border-gray-100 bg-white p-6">
                  <h2 className="text-2xl font-light">Tu plan actual</h2>
                  <div className="mt-5 rounded-3xl bg-gray-950 p-5 text-white">
                    <p className="text-sm text-gray-300">Free trial</p>
                    <p className="mt-2 text-3xl font-light">100 Ads y piezas de Contenido</p>
                    <button className="mt-5 rounded-full bg-white px-5 py-2 text-sm font-bold text-gray-950">Ver planes</button>
                  </div>
                  <a className="mt-4 flex items-center gap-2 text-sm font-semibold text-gray-500" href="https://calendly.com/soporte-posttyai/30min" target="_blank" rel="noreferrer">
                    <LinkIcon className="h-4 w-4" />
                    Agendar soporte
                  </a>
                </div>
              </section>
            )}
          </div>
        </section>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 flex justify-between rounded-full border border-gray-100 bg-white/95 p-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur sm:hidden">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = screen === item.id;
          return (
            <button key={item.id} onClick={() => setScreen(item.id as Screen)} className={`grid h-11 flex-1 place-items-center rounded-full ${active ? 'bg-gray-950 text-white' : 'text-gray-400'}`}>
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </nav>

      {working && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-white/70 backdrop-blur-sm">
          <div className="rounded-[26px] border border-gray-100 bg-white p-6 text-center shadow-2xl">
            <Mascot className="mx-auto h-20 w-20" />
            <p className="mt-3 text-sm font-bold text-gray-800">{APP_NAME} está mejorando tu instrucción...</p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-2xl sm:bottom-6">
          {toast}
        </div>
      )}
    </main>
  );
}
