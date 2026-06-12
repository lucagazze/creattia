import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import {
  Inbox, Plus, Trash2, Globe, Facebook, Instagram, MessageCircle, Mail,
  Code, Copy, Check, Loader2, AlertCircle, ArrowLeft, ExternalLink, Settings
} from 'lucide-react';

export default function EntradasPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const cwUrl = (profile as any)?.chatwoot_url;
  const cwToken = (profile as any)?.chatwoot_token;

  const [inboxes, setInboxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<'select' | 'form' | 'success'>('select');
  const [selectedChannel, setSelectedChannel] = useState<'web_widget' | 'api' | 'facebook' | 'instagram' | 'whatsapp' | 'email' | null>(null);
  
  // Form fields
  const [inboxName, setInboxName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [welcomeTitle, setWelcomeTitle] = useState('¿En qué podemos ayudarte?');
  const [welcomeTagline, setWelcomeTagline] = useState('Chatea con nosotros en tiempo real.');
  const [widgetColor, setWidgetColor] = useState('#8b5cf6');
  const [webhookUrl, setWebhookUrl] = useState('');

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdInbox, setCreatedInbox] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const loadInboxes = useCallback(async () => {
    if (!cwUrl || !cwToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await chatwoot.getInboxes(cwUrl, cwToken);
      const list = Array.isArray(data) ? data : (data?.payload || data?.data || []);
      setInboxes(list);
    } catch (e: any) {
      setError(e.message || 'No se pudieron cargar las bandejas de entrada.');
    } finally {
      setLoading(false);
    }
  }, [cwUrl, cwToken]);

  useEffect(() => {
    loadInboxes();
  }, [loadInboxes]);

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`¿Estás seguro de que querés eliminar la bandeja "${name}"?\nEsta acción no se puede deshacer y borrará la conexión en Chatwoot.`)) return;
    try {
      await chatwoot.deleteInbox(cwUrl, cwToken, id);
      setInboxes(prev => prev.filter(item => item.id !== id));
    } catch (e: any) {
      alert(`Error al eliminar: ${e.message}`);
    }
  };

  const handleCreateInbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannel || !inboxName.trim() || !cwUrl || !cwToken) return;
    
    setCreating(true);
    setCreateError(null);
    try {
      let payload: any = {
        name: inboxName.trim(),
      };

      if (selectedChannel === 'web_widget') {
        payload.channel = {
          type: 'web_widget',
          website_url: websiteUrl.trim() || 'https://example.com',
          welcome_title: welcomeTitle.trim(),
          welcome_tagline: welcomeTagline.trim(),
          widget_color: widgetColor,
        };
      } else if (selectedChannel === 'api') {
        payload.channel = {
          type: 'api',
          ...(webhookUrl.trim() ? { callback_webhook_url: webhookUrl.trim() } : {}),
        };
      }

      const res = await chatwoot.createInbox(cwUrl, cwToken, payload);
      const inboxObj = res?.payload || res;
      setCreatedInbox(inboxObj);
      setInboxes(prev => [...prev, inboxObj]);
      setWizardStep('success');
    } catch (e: any) {
      setCreateError(e.message || 'Ocurrió un error al crear la bandeja.');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getChannelIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('web')) return <Globe className="w-5 h-5 text-blue-500" />;
    if (t.includes('facebook') || t.includes('page')) return <Facebook className="w-5 h-5 text-blue-600" />;
    if (t.includes('instagram')) return <Instagram className="w-5 h-5 text-pink-500" />;
    if (t.includes('whatsapp')) return <MessageCircle className="w-5 h-5 text-emerald-500" />;
    if (t.includes('email')) return <Mail className="w-5 h-5 text-violet-500" />;
    return <Code className="w-5 h-5 text-zinc-500" />;
  };

  const getWidgetCode = (inbox: any) => {
    if (!inbox) return '';
    const token = inbox.web_widget_script_bootstrap_key || inbox.token || '';
    const cleanUrl = cwUrl.replace(/\/$/, '');
    return `<script>
  (function(d,t) {
    var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
    g.src="${cleanUrl}/packs/js/sdk.js";
    g.defer=true;
    g.async=true;
    g.onload=function(){
      window.chatwootSDK.run({
        websiteToken: '${token}',
        baseUrl: '${cleanUrl}'
      })
    }
    s.parentNode.insertBefore(g,s);
  })(document,"script");
</script>`;
  };

  if (!cwUrl || !cwToken) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 max-w-md flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-800 dark:text-amber-400 text-[14px]">Chatwoot no configurado</h3>
            <p className="text-[12px] text-amber-600 dark:text-amber-500 mt-1">
              Completá la URL y el token en la pestaña de Administración → Gestión de Clientes para habilitar las bandejas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full p-4 md:p-6 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div>
          <h1 className="text-[24px] font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <Inbox className="w-6 h-6 text-violet-500" />
            Bandejas de Entrada
          </h1>
          <p className="text-[12px] text-zinc-400 font-bold mt-1">
            Gestioná y conectá tus canales de comunicación directos con Chatwoot.
          </p>
        </div>
        {!showWizard && (
          <button
            onClick={() => {
              setShowWizard(true);
              setWizardStep('select');
              setSelectedChannel(null);
              setInboxName('');
              setWebsiteUrl('');
              setWebhookUrl('');
              setCreatedInbox(null);
              setCreateError(null);
            }}
            className="flex items-center justify-center gap-1.5 px-4.5 py-2.5 bg-violet-600 hover:bg-violet-750 text-white rounded-xl text-[12.5px] font-black shadow-md shadow-violet-600/10 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Nueva Bandeja
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && !showWizard && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
          <p className="text-[12.5px] text-zinc-400 font-bold">Obteniendo tus bandejas de entrada...</p>
        </div>
      )}

      {/* Error state */}
      {error && !showWizard && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-2xl flex items-start gap-2.5 text-[12px] text-red-700 dark:text-red-400 font-semibold">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Main List */}
      {!loading && !error && !showWizard && (
        <div className="grid grid-cols-1 gap-4">
          {inboxes.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl space-y-4">
              <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto text-zinc-400">
                <Inbox className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[13.5px] font-bold text-zinc-700 dark:text-zinc-300">No hay bandejas creadas</p>
                <p className="text-[11.5px] text-zinc-450 mt-1 max-w-sm mx-auto">
                  Agregá un widget web, API, o vinculá tus redes sociales para empezar a recibir mensajes en tu CRM.
                </p>
              </div>
            </div>
          ) : (
            inboxes.map(inbox => {
              const type = inbox.channel_type || '';
              const isWidget = type.includes('WebWidget');
              const isApi = type.includes('Api');
              const token = inbox.token || inbox.web_widget_script_bootstrap_key || '';
              return (
                <div
                  key={inbox.id}
                  className="bg-white dark:bg-[#161618] border border-zinc-100 dark:border-zinc-800/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all group"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center flex-shrink-0 shadow-inner">
                      {getChannelIcon(type)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-black text-zinc-800 dark:text-zinc-200 truncate">{inbox.name}</h3>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5 tracking-wider flex items-center gap-1">
                        <span>ID: {inbox.id}</span>
                        <span>•</span>
                        <span>{type.replace('::', ' ')}</span>
                      </p>
                      {isWidget && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-450 mt-1 font-mono truncate">{inbox.website_url}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 mt-2 md:mt-0">
                    {isWidget && (
                      <button
                        onClick={() => {
                          setCreatedInbox(inbox);
                          setSelectedChannel('web_widget');
                          setWizardStep('success');
                          setShowWizard(true);
                        }}
                        className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-650 dark:text-zinc-300 rounded-lg text-[11px] font-black border border-zinc-200 dark:border-zinc-700/60 transition-all flex items-center gap-1.5"
                      >
                        <Code className="w-3.5 h-3.5" />
                        Ver Script
                      </button>
                    )}
                    {isApi && (
                      <button
                        onClick={() => {
                          setCreatedInbox(inbox);
                          setSelectedChannel('api');
                          setWizardStep('success');
                          setShowWizard(true);
                        }}
                        className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-650 dark:text-zinc-300 rounded-lg text-[11px] font-black border border-zinc-200 dark:border-zinc-700/60 transition-all flex items-center gap-1.5"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        Ver API Token
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(inbox.id, inbox.name)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                      title="Eliminar bandeja"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Creation Wizard / Info Modal */}
      {showWizard && (
        <div className="bg-white dark:bg-[#161618] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xl relative animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Back button */}
          {wizardStep !== 'success' && (
            <button
              onClick={() => {
                if (wizardStep === 'form') setWizardStep('select');
                else setShowWizard(false);
              }}
              className="absolute left-6 top-6 flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Atrás
            </button>
          )}

          {/* STEP 1: Select Channel Type */}
          {wizardStep === 'select' && (
            <div className="text-center pt-4 space-y-6">
              <div className="space-y-1.5">
                <h2 className="text-[17px] font-black text-zinc-800 dark:text-white">Seleccioná un Canal de Entrada</h2>
                <p className="text-[11.5px] text-zinc-400 font-bold">Elegí la plataforma o servicio que querés conectar a tu CRM.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl mx-auto">
                {/* Website Live Chat */}
                <button
                  onClick={() => {
                    setSelectedChannel('web_widget');
                    setInboxName('Chat Web');
                    setWizardStep('form');
                  }}
                  className="p-5 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-left hover:border-violet-400 dark:hover:border-violet-900 hover:bg-violet-50/10 dark:hover:bg-violet-950/5 transition-all group flex flex-col gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-zinc-800 dark:text-zinc-200 group-hover:text-violet-600 dark:group-hover:text-violet-400">Widget Chat Web</h4>
                    <p className="text-[10.5px] text-zinc-400 mt-1 leading-relaxed">Agrega un globito de chat en vivo directo en tu sitio web de WordPress, Shopify o HTML.</p>
                  </div>
                </button>

                {/* API Channel */}
                <button
                  onClick={() => {
                    setSelectedChannel('api');
                    setInboxName('API Canal Personalizado');
                    setWizardStep('form');
                  }}
                  className="p-5 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-left hover:border-violet-400 dark:hover:border-violet-900 hover:bg-violet-50/10 dark:hover:bg-violet-950/5 transition-all group flex flex-col gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 text-zinc-650 dark:text-zinc-400 flex items-center justify-center">
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-zinc-800 dark:text-zinc-200 group-hover:text-violet-600 dark:group-hover:text-violet-400">Canal API</h4>
                    <p className="text-[10.5px] text-zinc-400 mt-1 leading-relaxed">Conecta flujos de trabajo personalizados, webhooks de terceros o integra tu propio chat.</p>
                  </div>
                </button>

                {/* Facebook Page */}
                <button
                  onClick={() => {
                    setSelectedChannel('facebook');
                    setWizardStep('form');
                  }}
                  className="p-5 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-left hover:border-violet-400 dark:hover:border-violet-900 hover:bg-violet-50/10 dark:hover:bg-violet-950/5 transition-all group flex flex-col gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Facebook className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-zinc-800 dark:text-zinc-200 group-hover:text-violet-600 dark:group-hover:text-violet-400">Facebook Messenger</h4>
                    <p className="text-[10.5px] text-zinc-400 mt-1 leading-relaxed">Conecta páginas de Facebook para leer y responder chats grupales o de clientes directamente.</p>
                  </div>
                </button>

                {/* Instagram Direct */}
                <button
                  onClick={() => {
                    setSelectedChannel('instagram');
                    setWizardStep('form');
                  }}
                  className="p-5 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-left hover:border-violet-400 dark:hover:border-violet-900 hover:bg-violet-50/10 dark:hover:bg-violet-950/5 transition-all group flex flex-col gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-pink-50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 flex items-center justify-center">
                    <Instagram className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-zinc-800 dark:text-zinc-200 group-hover:text-violet-600 dark:group-hover:text-violet-400">Instagram Direct</h4>
                    <p className="text-[10.5px] text-zinc-400 mt-1 leading-relaxed">Gestiona DMs de perfiles comerciales, comentarios públicos e interactúa en historias.</p>
                  </div>
                </button>

                {/* WhatsApp Cloud */}
                <button
                  onClick={() => {
                    setSelectedChannel('whatsapp');
                    setWizardStep('form');
                  }}
                  className="p-5 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-left hover:border-violet-400 dark:hover:border-violet-900 hover:bg-violet-50/10 dark:hover:bg-violet-950/5 transition-all group flex flex-col gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-zinc-800 dark:text-zinc-200 group-hover:text-violet-600 dark:group-hover:text-violet-400">WhatsApp</h4>
                    <p className="text-[10.5px] text-zinc-400 mt-1 leading-relaxed">Vincula tu número comercial de WhatsApp Cloud API para automatizar y delegar conversaciones.</p>
                  </div>
                </button>

                {/* Email Support */}
                <button
                  onClick={() => {
                    setSelectedChannel('email');
                    setWizardStep('form');
                  }}
                  className="p-5 border border-zinc-200 dark:border-dashed dark:border-zinc-800 rounded-2xl text-left hover:border-violet-400 dark:hover:border-violet-900 hover:bg-violet-50/10 dark:hover:bg-violet-950/5 transition-all group flex flex-col gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-zinc-800 dark:text-zinc-200 group-hover:text-violet-600 dark:group-hover:text-violet-400">Correo Electrónico</h4>
                    <p className="text-[10.5px] text-zinc-400 mt-1 leading-relaxed">Conecta tu cuenta de Gmail, Outlook o tu servidor SMTP/IMAP para delegar correos entrantes.</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Configure & Submit Forms (Depending on selectedChannel) */}
          {wizardStep === 'form' && selectedChannel && (
            <div className="max-w-xl mx-auto pt-4 space-y-5">
              <div className="text-center space-y-1">
                <h3 className="text-[16px] font-black text-zinc-800 dark:text-white flex items-center justify-center gap-1.5">
                  Conectar {selectedChannel === 'web_widget' ? 'Chat Web' : selectedChannel === 'api' ? 'Canal API' : selectedChannel.toUpperCase()}
                </h3>
                <p className="text-[11.5px] text-zinc-400 font-bold">Completá los campos de configuración a continuación.</p>
              </div>

              {/* WEBSITE FORM */}
              {selectedChannel === 'web_widget' && (
                <form onSubmit={handleCreateInbox} className="space-y-4">
                  <div className="grid grid-cols-1 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Nombre de la bandeja</label>
                      <input type="text" value={inboxName} onChange={e => setInboxName(e.target.value)} required placeholder="ej: Chat Web Principal" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 text-[12.5px]" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Sitio Web URL</label>
                      <input type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} required placeholder="https://miempresa.com" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 text-[12.5px]" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Título de bienvenida</label>
                        <input type="text" value={welcomeTitle} onChange={e => setWelcomeTitle(e.target.value)} placeholder="¿Cómo te podemos ayudar?" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 text-[12.5px]" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Color del Widget</label>
                        <div className="flex gap-2 items-center">
                          <input type="color" value={widgetColor} onChange={e => setWidgetColor(e.target.value)} className="w-8 h-8 rounded-lg border-0 cursor-pointer" />
                          <input type="text" value={widgetColor} onChange={e => setWidgetColor(e.target.value)} className="flex-1 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 text-[12.5px] font-mono" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Subtítulo / Tagline</label>
                      <input type="text" value={welcomeTagline} onChange={e => setWelcomeTagline(e.target.value)} placeholder="Chatea en tiempo real." className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 text-[12.5px]" />
                    </div>
                  </div>

                  {createError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/35 rounded-xl text-[11.5px] text-red-700 dark:text-red-400 font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      {createError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={creating}
                    className="w-full h-10 bg-violet-600 hover:bg-violet-750 text-white rounded-xl text-[12.5px] font-black shadow-md shadow-violet-600/10 flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Crear Canal de Chat Web
                  </button>
                </form>
              )}

              {/* API FORM */}
              {selectedChannel === 'api' && (
                <form onSubmit={handleCreateInbox} className="space-y-4">
                  <div className="grid grid-cols-1 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Nombre de la bandeja API</label>
                      <input type="text" value={inboxName} onChange={e => setInboxName(e.target.value)} required placeholder="ej: Servidor de Chat / Webhook CRM" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 text-[12.5px]" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">URL de Callback (Webhook de tu servidor - Opcional)</label>
                      <input type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://miservidor.com/webhook" className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 text-[12.5px]" />
                    </div>
                  </div>

                  {createError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/35 rounded-xl text-[11.5px] text-red-700 dark:text-red-400 font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      {createError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={creating}
                    className="w-full h-10 bg-violet-600 hover:bg-violet-750 text-white rounded-xl text-[12.5px] font-black shadow-md shadow-violet-600/10 flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Crear Canal de API
                  </button>
                </form>
              )}

              {/* SOCIAL / REDES SOCIALES MANUAL INSTRUCTIONS */}
              {['facebook', 'instagram', 'whatsapp', 'email'].includes(selectedChannel) && (
                <div className="space-y-5 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 bg-zinc-50/40 dark:bg-zinc-950/5">
                  <div className="space-y-1.5">
                    <h4 className="text-[13.5px] font-black text-zinc-800 dark:text-zinc-200">
                      Vincular Canal con Chatwoot
                    </h4>
                    <p className="text-[11.5px] text-zinc-400 leading-relaxed">
                      Por motivos de seguridad y flujos de autenticación de Meta y Servidores de correo, la conexión inicial del canal de {selectedChannel?.toUpperCase()} debe realizarse ingresando a la consola oficial de Chatwoot.
                    </p>
                  </div>

                  <div className="space-y-2 text-[11.5px] text-zinc-650 dark:text-zinc-400 font-semibold leading-relaxed">
                    <p>1. Hacé click en el botón de abajo **"Abrir Configuración de Chatwoot"**.</p>
                    <p>2. En la consola de Chatwoot, seleccioná **"Agregar bandeja de entrada"**.</p>
                    <p>3. Elegí el canal de **{selectedChannel === 'facebook' ? 'Facebook' : selectedChannel === 'instagram' ? 'Instagram' : selectedChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}** y completá la autenticación.</p>
                    <p>4. Una vez guardado en Chatwoot, **recargá esta página** y verás el canal ya listado e integrado automáticamente con tu CRM.</p>
                  </div>

                  <a
                    href={`${cwUrl.replace(/\/$/, '')}/app/accounts/${inboxes[0]?.account_id || 'me'}/settings/inboxes/new`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full h-10 bg-violet-600 hover:bg-violet-750 text-white rounded-xl text-[12.5px] font-black shadow-md shadow-violet-600/10 flex items-center justify-center gap-1.5 transition-all"
                  >
                    Abrir Configuración de Chatwoot
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: SUCCESS (Code Script or Token Output) */}
          {wizardStep === 'success' && createdInbox && (
            <div className="max-w-xl mx-auto pt-4 space-y-6">
              <div className="text-center space-y-1">
                <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 flex items-center justify-center mx-auto mb-2">
                  <Check className="w-5 h-5" />
                </div>
                <h3 className="text-[17px] font-black text-zinc-800 dark:text-white">¡Bandeja Conectada Correctamente!</h3>
                <p className="text-[12px] text-zinc-400 font-medium">Bandeja: <b className="text-zinc-600 dark:text-zinc-300 font-black">{createdInbox.name}</b> (ID: {createdInbox.id})</p>
              </div>

              {/* WEBSITE WIDGET OUTPUT (Code snippet) */}
              {selectedChannel === 'web_widget' && (
                <div className="space-y-3">
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 font-bold leading-normal">
                    Copia y pega este script de JavaScript justo antes de la etiqueta de cierre <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded font-bold font-mono text-[10.5px]">&lt;/body&gt;</code> en tu sitio web para mostrar el globito de chat:
                  </p>
                  <div className="relative">
                    <pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-100 p-4 rounded-2xl text-[11px] font-mono leading-relaxed overflow-x-auto max-h-[220px]">
                      {getWidgetCode(createdInbox)}
                    </pre>
                    <button
                      onClick={() => handleCopy(getWidgetCode(createdInbox))}
                      className="absolute right-3 top-3 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              {/* API CHANNEL OUTPUT (Inbox token) */}
              {selectedChannel === 'api' && (
                <div className="space-y-4">
                  <div className="space-y-1.5 p-4 bg-violet-50/30 dark:bg-violet-950/5 border border-violet-100/50 dark:border-violet-900/10 rounded-2xl">
                    <h4 className="text-[12.5px] font-black text-violet-700 dark:text-violet-400">Canal API Token Especial</h4>
                    <p className="text-[11.5px] text-zinc-500 leading-normal font-semibold">
                      Usa este token de canal para autenticar llamadas de clientes externos y enviar/recibir mensajes a esta bandeja mediante llamadas API:
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={createdInbox.token || ''}
                      className="w-full h-11 bg-zinc-900 dark:bg-zinc-950 text-zinc-100 px-4 rounded-xl font-mono text-[11.5px] pr-24 focus:outline-none"
                    />
                    <button
                      onClick={() => handleCopy(createdInbox.token || '')}
                      className="absolute right-2.5 top-1.5 h-8 px-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setShowWizard(false);
                  loadInboxes();
                }}
                className="w-full h-10 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 rounded-xl text-[12.5px] font-black transition-all hover:bg-zinc-800 dark:hover:bg-zinc-100 flex items-center justify-center"
              >
                Volver a la Lista
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
