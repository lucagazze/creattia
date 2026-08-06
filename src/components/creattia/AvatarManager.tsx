import React, { useEffect, useMemo, useState } from 'react';
import { prepareReferenceImages } from '../../lib/creattia/client-image';

type AvatarImage = { path: string; url: string };
export type SavedAvatar = {
	id: string;
	name: string;
	description?: string | null;
	images: AvatarImage[];
	imageCount: number;
	coverUrl: string;
};

export default function AvatarManager({ session }: { session: any }) {
	const token = session?.access_token || '';
	const [avatars, setAvatars] = useState<SavedAvatar[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [files, setFiles] = useState<File[]>([]);
	const [consent, setConsent] = useState(false);
	const [saving, setSaving] = useState(false);
	const [preparing, setPreparing] = useState(false);
	const [removingId, setRemovingId] = useState('');
	const [error, setError] = useState('');
	const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

	useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
	useEffect(() => {
		let active = true;
		void fetch('/api/creativos/avatars', { headers: { authorization: `Bearer ${token}` } })
			.then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
			.then(({ response, payload }) => { if (active && response.ok) setAvatars(payload.avatars || []); })
			.catch(() => undefined)
			.finally(() => { if (active) setLoaded(true); });
		return () => { active = false; };
	}, [token]);

	const resetForm = () => {
		setName(''); setDescription(''); setFiles([]); setConsent(false); setError(''); setShowForm(false);
	};

	const save = async () => {
		if (files.length < 4) { setError('Subí al menos 4 fotos diferentes para construir una identidad consistente.'); return; }
		if (!consent) { setError('Confirmá que tenés permiso para usar la imagen de esta persona.'); return; }
		setSaving(true); setError('');
		try {
			const form = new FormData();
			form.set('name', name.trim()); form.set('description', description.trim()); form.set('consentConfirmed', 'true');
			files.forEach((file) => form.append('images', file));
			const response = await fetch('/api/creativos/avatars', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'No se pudo guardar el avatar.');
			setAvatars(payload.avatars || []); resetForm();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo guardar el avatar.');
		} finally { setSaving(false); }
	};

	const selectFiles = async (selected: FileList | null) => {
		if (!selected?.length) { setFiles([]); return; }
		setPreparing(true); setError('');
		try { setFiles(await prepareReferenceImages(selected)); }
		finally { setPreparing(false); }
	};

	const remove = async (avatar: SavedAvatar) => {
		if (!window.confirm(`¿Eliminar el avatar “${avatar.name}” y todas sus fotos?`)) return;
		setRemovingId(avatar.id); setError('');
		try {
			const response = await fetch(`/api/creativos/avatars?id=${encodeURIComponent(avatar.id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(payload.error || 'No se pudo eliminar el avatar.');
			setAvatars(payload.avatars || []);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo eliminar el avatar.');
		} finally { setRemovingId(''); }
	};

	return (
		<section className="avatar-manager">
			<header className="avatar-manager-head">
				<div><span className="avatar-kicker">PERSONAS GUARDADAS</span><h2>Tus avatares</h2><p>Subí fotos de una persona y guardala. Cuando generes una imagen donde aparezca alguien, elegís este avatar y sale siempre la misma cara, sin volver a cargar nada.</p></div>
				<button type="button" onClick={() => setShowForm((current) => !current)}>{showForm ? 'Cerrar' : '+ Crear avatar'}</button>
			</header>

			{showForm && <div className="avatar-create-panel">
				<div className="avatar-create-copy"><span>01</span><div><strong>Subí las fotos y listo</strong><p>Con 4 alcanza; entre 6 y 10 sale mejor. Frente, los dos perfiles, tres cuartos y alguna de cuerpo entero. Sin filtros fuertes ni lentes oscuros: cuanto más clara se vea la cara, más se parece después.</p></div></div>
				<div className="avatar-form-grid">
					<label><span>Nombre del avatar</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Sofía" maxLength={120} /></label>
					<label><span>Notas <em>(opcional)</em></span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="Rasgos que tienen que mantenerse: edad aproximada, estilo, vestuario habitual…" /></label>
				</div>
				<label className="avatar-file-drop"><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectFiles(event.target.files)} disabled={preparing} /><strong>{preparing ? 'Optimizando fotos…' : files.length ? `${files.length} fotos seleccionadas` : 'Elegí entre 4 y 12 fotos de la misma persona'}</strong><small>PNG, JPG o WebP · las optimizamos antes de subirlas</small></label>
				{previews.length > 0 && <div className="avatar-preview-strip">{previews.map((url, index) => <figure key={url}><img src={url} alt={`Foto ${index + 1} del avatar`} /><span>{String(index + 1).padStart(2, '0')}</span></figure>)}</div>}
				<label className="avatar-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Confirmo que soy esta persona o tengo su autorización expresa para usar estas imágenes en contenido generado con IA.</span></label>
				{error && <p className="avatar-error">{error}</p>}
				<div className="avatar-form-actions"><button type="button" onClick={resetForm} className="secondary">Cancelar</button><button type="button" onClick={() => void save()} disabled={preparing || saving || !name.trim() || files.length < 4 || !consent}>{saving ? 'Guardando…' : 'Guardar avatar'}</button></div>
			</div>}

			{!showForm && error && <p className="avatar-error">{error}</p>}
			{!loaded ? <div className="avatar-loading"><span className="studio-spinner" /></div> : avatars.length === 0 ? <div className="avatar-empty"><span>Todavía no guardaste ninguna persona</span><p>Subí las fotos de alguien una sola vez y después usalo en todas las imágenes que generes.</p></div> : <div className="avatar-library">{avatars.map((avatar) => <article key={avatar.id} className="avatar-card">
				<div className="avatar-card-images">{avatar.images.slice(0, 3).map((image, index) => <img key={image.path} src={image.url} alt={`${avatar.name}, referencia ${index + 1}`} />)}{avatar.images.length > 3 && <span>+{avatar.images.length - 3}</span>}</div>
				<div className="avatar-card-body"><div><strong>{avatar.name}</strong><small>{avatar.imageCount} fotos guardadas</small></div><p>{avatar.description || 'Listo para usar en tus imágenes.'}</p><button type="button" onClick={() => void remove(avatar)} disabled={removingId === avatar.id}>{removingId === avatar.id ? 'Eliminando…' : 'Eliminar'}</button></div>
			</article>)}</div>}
		</section>
	);
}
