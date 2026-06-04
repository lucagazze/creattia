import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import {
  Search, User, Mail, Phone, MapPin, Building, Instagram, 
  Loader2, ArrowLeft, ArrowRight, Bot, MessageSquare, 
  ExternalLink, Save, Check, FileText, AlertCircle
} from 'lucide-react';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';

export default function ContactosPage() {
  const navigate = useNavigate();
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const cwUrl = (profile as any)?.chatwoot_url;
  const cwToken = (profile as any)?.chatwoot_token;

  // Contacts list states
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<'name' | 'id'>('name');

  // Contact details states
  const [selected, setSelected] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Detail Form states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formInstagram, setFormInstagram] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // AI complete states
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>({});
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, boolean>>({
    name: true,
    email: true,
    phone_number: true,
    instagram: true,
    location: true,
    company: true,
    notes: true
  });

  // Load Contacts
  const loadContacts = useCallback(async () => {
    if (!cwUrl || !cwToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let data;
      if (search.trim()) {
        data = await chatwoot.searchContacts(cwUrl, cwToken, search, currentPage);
      } else {
        data = await chatwoot.getContacts(cwUrl, cwToken, currentPage);
      }
      const list = data?.payload || data?.data || [];
      setContacts(list);
      setTotalCount(data?.meta?.count || list.length);
    } catch (e: any) {
      setError(e.message || 'Error al obtener los contactos.');
    } finally {
      setLoading(false);
    }
  }, [cwUrl, cwToken, currentPage, search]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Handle Search Input Change (reset page to 1)
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  // Select Contact & fill Form
  const handleSelectContact = (contact: any) => {
    setSelected(contact);
    setSaveSuccess(false);
    setFormName(contact.name || '');
    setFormEmail(contact.email || '');
    setFormPhone(contact.phone_number || '');
    setFormInstagram(contact.custom_attributes?.instagram || '');
    setFormLocation(contact.custom_attributes?.location || '');
    setFormCompany(contact.custom_attributes?.company || '');
    setFormNotes(contact.custom_attributes?.notes || '');
  };

  // Update Contact (Save manual edits)
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !cwUrl || !cwToken) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const payload = {
        name: formName.trim(),
        email: formEmail.trim() || null,
        phone_number: formPhone.trim() || null,
        custom_attributes: {
          ...(selected.custom_attributes || {}),
          instagram: formInstagram.trim() || null,
          location: formLocation.trim() || null,
          company: formCompany.trim() || null,
          notes: formNotes.trim() || null,
        }
      };

      const updated = await chatwoot.updateContact(cwUrl, cwToken, selected.id, payload);
      const updatedContact = updated?.payload || updated || selected;
      setSelected(updatedContact);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      
      // Update list item
      setContacts(prev => prev.map(c => c.id === selected.id ? updatedContact : c));
    } catch (e: any) {
      alert(`Error al guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Run AI Contact Completion
  const handleAiComplete = async () => {
    if (!selected || !cwUrl || !cwToken) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/complete-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selected.id,
          cwUrl,
          cwToken
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al completar con IA');
      
      if (!data.success) {
        setAiError(data.message || 'No se pudo extraer información del chat.');
        return;
      }

      setAiSuggestions(data.suggestions || {});
      // Reset checkboxes
      setSelectedSuggestions({
        name: !!data.suggestions.name && data.suggestions.name !== formName,
        email: !!data.suggestions.email && data.suggestions.email !== formEmail,
        phone_number: !!data.suggestions.phone_number && data.suggestions.phone_number !== formPhone,
        instagram: !!data.suggestions.instagram && data.suggestions.instagram !== formInstagram,
        location: !!data.suggestions.location && data.suggestions.location !== formLocation,
        company: !!data.suggestions.company && data.suggestions.company !== formCompany,
        notes: !!data.suggestions.notes && data.suggestions.notes !== formNotes
      });
      setShowAiModal(true);
    } catch (e: any) {
      setAiError(e.message || 'No se pudo procesar la conversación con IA.');
    } finally {
      setAiLoading(false);
    }
  };

  // Apply AI Suggestions & Save
  const handleApplySuggestions = async () => {
    if (!selected || !cwUrl || !cwToken) return;
    setSaving(true);
    try {
      const finalName = selectedSuggestions.name ? aiSuggestions.name : formName;
      const finalEmail = selectedSuggestions.email ? aiSuggestions.email : formEmail;
      const finalPhone = selectedSuggestions.phone_number ? aiSuggestions.phone_number : formPhone;
      const finalInstagram = selectedSuggestions.instagram ? aiSuggestions.instagram : formInstagram;
      const finalLocation = selectedSuggestions.location ? aiSuggestions.location : formLocation;
      const finalCompany = selectedSuggestions.company ? aiSuggestions.company : formCompany;
      const finalNotes = selectedSuggestions.notes ? aiSuggestions.notes : formNotes;

      const payload = {
        name: finalName?.trim() || formName,
        email: finalEmail?.trim() || null,
        phone_number: finalPhone?.trim() || null,
        custom_attributes: {
          ...(selected.custom_attributes || {}),
          instagram: finalInstagram?.trim() || null,
          location: finalLocation?.trim() || null,
          company: finalCompany?.trim() || null,
          notes: finalNotes?.trim() || null,
        }
      };

      const updated = await chatwoot.updateContact(cwUrl, cwToken, selected.id, payload);
      const updatedContact = updated?.payload || updated || selected;
      
      setSelected(updatedContact);
      // Sync local form states
      setFormName(updatedContact.name || '');
      setFormEmail(updatedContact.email || '');
      setFormPhone(updatedContact.phone_number || '');
      setFormInstagram(updatedContact.custom_attributes?.instagram || '');
      setFormLocation(updatedContact.custom_attributes?.location || '');
      setFormCompany(updatedContact.custom_attributes?.company || '');
      setFormNotes(updatedContact.custom_attributes?.notes || '');
      
      // Update list item
      setContacts(prev => prev.map(c => c.id === selected.id ? updatedContact : c));
      setShowAiModal(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      alert(`Error al guardar sugerencias: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Navigate to Chat page and select active chat
  const handleStartChat = async () => {
    if (!selected || !cwUrl || !cwToken) return;
    try {
      const conversationsList = await chatwoot.getContactConversations(cwUrl, cwToken, selected.id);
      if (conversationsList && conversationsList.length > 0) {
        const latestConvId = conversationsList[0].id;
        // Direct transition using search parameter
        navigate(`/atencion?convId=${latestConvId}`);
      } else {
        // Fallback: just go to Attention Page
        navigate('/atencion');
      }
    } catch {
      navigate('/atencion');
    }
  };

  // Avatar Initials + Gradient builder
  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-pink-500 to-rose-500 text-white',
      'from-violet-500 to-purple-500 text-white',
      'from-blue-500 to-indigo-500 text-white',
      'from-emerald-500 to-teal-500 text-white',
      'from-amber-500 to-orange-500 text-white',
      'from-sky-500 to-cyan-500 text-white',
    ];
    if (!name) return gradients[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  // Pagination bounds
  const startItem = (currentPage - 1) * 15 + 1;
  const endItem = Math.min(currentPage * 15, totalCount);
  const totalPages = Math.ceil(totalCount / 15) || 1;

  if (!cwUrl || !cwToken) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 max-w-md flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-800 dark:text-amber-400 text-[14px]">Chatwoot no configurado</h3>
            <p className="text-[12px] text-amber-600 dark:text-amber-500 mt-1">Completá la URL y el token en Administración → Gestión de Clientes.</p>
          </div>
        </div>
      </div>
    );
  }

  // Sort contact array locally if name sorting is selected
  const sortedContacts = [...contacts].sort((a, b) => {
    if (sortBy === 'id') return b.id - a.id;
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <CenteredPageLoader isLoading={loading}>
      <div className="flex flex-col h-full w-full overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a0a]">
      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT COLUMN: Contacts list */}
        <div className="w-full md:w-[320px] flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-300">
          
          {/* Header & Search */}
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 space-y-3">
            <h1 className="text-[18px] font-black tracking-tight text-zinc-900 dark:text-white">Contactos</h1>
            
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar contactos..."
                  value={search}
                  onChange={handleSearchChange}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-400 text-zinc-700 dark:text-zinc-300"
                />
              </div>

              {/* Sorting Button */}
              <button
                onClick={() => setSortBy(prev => prev === 'name' ? 'id' : 'name')}
                title={sortBy === 'name' ? "Ordenar por Más Recientes" : "Ordenar por Nombre"}
                className="p-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                <svg className="w-4 h-4 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" />
                </svg>
              </button>
            </div>
          </div>

          {/* List scroll container */}
          <div className="flex-1 overflow-y-auto py-2 space-y-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                <p className="text-[11px] text-zinc-400">Obteniendo contactos...</p>
              </div>
            ) : error ? (
              <div className="p-4 text-[11px] text-red-500 font-semibold">{error}</div>
            ) : sortedContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
                <User className="w-8 h-8 opacity-40" />
                <p className="text-[12px] font-bold">Sin contactos</p>
              </div>
            ) : (
              sortedContacts.map(c => {
                const isSelected = selected?.id === c.id;
                const gradient = getAvatarGradient(c.name || String(c.id));
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectContact(c)}
                    className={`mx-2.5 my-0.5 px-3 py-2.5 flex items-center gap-3 transition-all duration-200 cursor-pointer rounded-xl group ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/10'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/35 border border-transparent'
                    }`}
                  >
                    {/* Initials Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black bg-gradient-to-br shadow-inner flex-shrink-0 ${gradient}`}>
                      {getInitials(c.name || '')}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-[12.5px] truncate font-bold ${isSelected ? 'text-white' : 'text-zinc-800 dark:text-zinc-100'}`}>
                        {c.name || `Contacto #${c.id}`}
                      </p>
                      <p className={`text-[10px] font-mono mt-0.5 truncate ${isSelected ? 'text-blue-200' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {c.phone_number || c.email || 'Sin teléfono/email'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          {totalCount > 0 && (
            <div className="p-3.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 select-none">
              <span>{startItem}-{endItem} de {totalCount}</span>
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-mono">{currentPage}/{totalPages}</span>
                <button
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Contact details */}
        <div className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-900/30 overflow-hidden relative">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">👤</div>
              <p className="text-[13.5px] font-medium">Seleccioná un contacto para ver detalles</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-3xl w-full">
              
              {/* Header profile block */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-[18px] font-black bg-gradient-to-br shadow-inner ${getAvatarGradient(selected.name || '')}`}>
                    {getInitials(selected.name || '')}
                  </div>
                  <div>
                    <h2 className="text-[20px] font-black tracking-tight text-zinc-900 dark:text-white">{selected.name || `Contacto #${selected.id}`}</h2>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
                      <span>ID: {selected.id}</span>
                      {selected.created_at && (
                        <>
                          <span>•</span>
                          <span>Conectado: {new Date(selected.created_at * 1000).toLocaleDateString('es-AR')}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Start Chat Button */}
                  <button
                    onClick={handleStartChat}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[12px] font-black shadow-sm shadow-blue-500/10 transition-all active:scale-[0.98]"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Iniciar Chat
                  </button>

                  {/* AI Complete Button */}
                  <button
                    onClick={handleAiComplete}
                    disabled={aiLoading}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/20 dark:hover:bg-violet-900/35 text-violet-750 dark:text-violet-400 rounded-xl text-[12px] font-black border border-violet-200 dark:border-violet-800/40 transition-all active:scale-[0.98] siri-glow"
                  >
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                    Completar con IA
                  </button>
                </div>
              </div>

              {/* Form container */}
              <form onSubmit={handleSaveContact} className="space-y-6">
                
                {/* Core Attributes */}
                <div className="bg-white dark:bg-[#161618] border border-zinc-150 dark:border-zinc-800/60 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-[13px] font-black text-zinc-800 dark:text-zinc-100 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60 pb-2">Información Básica</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Nombre Completo</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="text"
                          required
                          value={formName}
                          onChange={e => setFormName(e.target.value)}
                          className="w-full pl-9 pr-3 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 px-3 text-[12.5px]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Teléfono</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="text"
                          value={formPhone}
                          onChange={e => setFormPhone(e.target.value)}
                          placeholder="+54 9..."
                          className="w-full pl-9 pr-3 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 px-3 text-[12.5px]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-[10.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Correo Electrónico</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="email"
                          value={formEmail}
                          onChange={e => setFormEmail(e.target.value)}
                          placeholder="nombre@ejemplo.com"
                          className="w-full pl-9 pr-3 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 px-3 text-[12.5px]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Custom Attributes */}
                <div className="bg-white dark:bg-[#161618] border border-zinc-150 dark:border-zinc-800/60 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-[13px] font-black text-zinc-800 dark:text-zinc-100 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60 pb-2">Atributos Personalizados</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Instagram</label>
                      <div className="relative">
                        <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="text"
                          value={formInstagram}
                          onChange={e => setFormInstagram(e.target.value)}
                          placeholder="@usuario"
                          className="w-full pl-9 pr-3 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 px-3 text-[12.5px]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Ubicación / Ciudad</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="text"
                          value={formLocation}
                          onChange={e => setFormLocation(e.target.value)}
                          placeholder="Ciudad, Provincia"
                          className="w-full pl-9 pr-3 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 px-3 text-[12.5px]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-[10.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Empresa / Negocio</label>
                      <div className="relative">
                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="text"
                          value={formCompany}
                          onChange={e => setFormCompany(e.target.value)}
                          placeholder="Nombre de la empresa"
                          className="w-full pl-9 pr-3 h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 px-3 text-[12.5px]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-[10.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Notas / Resumen del cliente</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-3.5 w-4 h-4 text-zinc-400" />
                        <textarea
                          rows={3}
                          value={formNotes}
                          onChange={e => setFormNotes(e.target.value)}
                          placeholder="Ingresa notas comerciales sobre este cliente..."
                          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 text-[12.5px] resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Error display */}
                {aiError && (
                  <div className="p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/35 rounded-xl flex items-start gap-2 text-[12px] text-red-700 dark:text-red-400 font-semibold select-none">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span>{aiError}</span>
                  </div>
                )}

                {/* Footer Save Button */}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-850 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 rounded-xl text-[12.5px] font-black shadow-sm disabled:opacity-50 transition-all active:scale-[0.98]"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar Cambios
                  </button>

                  {saveSuccess && (
                    <div className="flex items-center gap-1 text-[12px] text-emerald-500 font-bold animate-in fade-in duration-200">
                      <Check className="w-4 h-4" />
                      Guardado con éxito
                    </div>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* AI SUGGESTION DIFF COMPARISON MODAL */}
      {showAiModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAiModal(false)} />
          
          <div className="relative bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-[24px] shadow-2xl p-6 md:p-8 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-start gap-3.5 border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-4 flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[16px] font-black text-zinc-900 dark:text-white">Perfil Completado con IA</h3>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-semibold mt-0.5">Revisá y seleccioná los campos extraídos del chat que querés aplicar.</p>
              </div>
            </div>

            {/* Modal Content Scroll */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {[
                { key: 'name', label: 'Nombre', current: formName, suggestion: aiSuggestions.name },
                { key: 'email', label: 'Correo', current: formEmail, suggestion: aiSuggestions.email },
                { key: 'phone_number', label: 'Teléfono', current: formPhone, suggestion: aiSuggestions.phone_number },
                { key: 'instagram', label: 'Instagram', current: formInstagram, suggestion: aiSuggestions.instagram },
                { key: 'location', label: 'Ubicación', current: formLocation, suggestion: aiSuggestions.location },
                { key: 'company', label: 'Empresa', current: formCompany, suggestion: aiSuggestions.company },
                { key: 'notes', label: 'Resumen / Nota', current: formNotes, suggestion: aiSuggestions.notes, isTextarea: true }
              ].map(field => {
                const hasSuggestion = field.suggestion && field.suggestion.trim();
                const isDifferent = hasSuggestion && field.current !== field.suggestion;
                
                return (
                  <div 
                    key={field.key}
                    className={`p-3.5 rounded-xl border transition-all ${
                      selectedSuggestions[field.key]
                        ? 'border-violet-300 dark:border-violet-900 bg-violet-50/10 dark:bg-violet-950/5'
                        : 'border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-950/10'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 mb-2.5">
                      <input
                        type="checkbox"
                        disabled={!hasSuggestion}
                        checked={selectedSuggestions[field.key]}
                        onChange={e => setSelectedSuggestions(prev => ({ ...prev, [field.key]: e.target.checked }))}
                        className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 text-violet-600 focus:ring-violet-500/20 disabled:opacity-30 cursor-pointer"
                      />
                      <span className="text-[11.5px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{field.label}</span>
                      
                      {isDifferent && (
                        <span className="text-[9px] font-black bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-full ml-auto">
                          Sugerencia Nueva
                        </span>
                      )}
                    </div>

                    {/* Values comparison */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] font-medium leading-relaxed">
                      <div>
                        <span className="block text-[10px] text-zinc-400 dark:text-zinc-500 font-bold mb-0.5">Valor Actual:</span>
                        {field.isTextarea ? (
                          <p className="text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/60 max-h-[80px] overflow-y-auto text-[11.5px]">
                            {field.current || <span className="italic opacity-40">Vacío</span>}
                          </p>
                        ) : (
                          <span className="text-zinc-600 dark:text-zinc-400 truncate block">
                            {field.current || <span className="italic opacity-40">Vacío</span>}
                          </span>
                        )}
                      </div>

                      <div className={hasSuggestion ? '' : 'opacity-40'}>
                        <span className="block text-[10px] text-violet-500 dark:text-violet-400 font-black mb-0.5">Sugerido por IA:</span>
                        {hasSuggestion ? (
                          field.isTextarea ? (
                            <p className="text-zinc-900 dark:text-zinc-100 bg-violet-100/10 dark:bg-violet-900/10 p-2 rounded-lg border border-violet-200 dark:border-violet-900 max-h-[80px] overflow-y-auto text-[11.5px]">
                              {field.suggestion}
                            </p>
                          ) : (
                            <span className="text-zinc-900 dark:text-zinc-100 font-bold truncate block">
                              {field.suggestion}
                            </span>
                          )
                        ) : (
                          <span className="italic text-zinc-400 block">No detectado en chat</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-4 flex-shrink-0">
              <button
                onClick={() => setShowAiModal(false)}
                className="flex-1 h-11 rounded-xl border border-zinc-200 dark:border-zinc-700 text-[12.5px] font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              
              <button
                onClick={handleApplySuggestions}
                disabled={saving || !Object.values(selectedSuggestions).some(Boolean)}
                className="flex-1 h-11 bg-violet-600 hover:bg-violet-750 text-white rounded-xl text-[12.5px] font-black shadow-md shadow-violet-600/10 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 active:scale-[0.98]"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar y Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </CenteredPageLoader>
  );
}
