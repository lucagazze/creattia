import type { Creativo } from '../../../data/creativos50';
import { catalogTaxonomy, creativeNumber, referenceImagePath, ringMeta, templatePath } from '../../../lib/creattia/catalog';
import { fetchLibraryItems, fetchReferenceUrls } from '../../../lib/creattia/reference-urls';
import { isSupabaseConfigured, supabase } from '../../../lib/creattia/supabase-browser';
import { Icon } from '../Icon';
import { conciseText } from '../app-session';
import { useEffect, useMemo, useState } from 'react';
/** Catálogo de ángulos creativos con favoritos. */

export function Library({ items, favorites, onChoose, onToggleFavorite }: { items: Creativo[]; favorites: Set<number>; onChoose: (creative: Creativo) => void; onToggleFavorite: (id: number) => void }) {
	const [query, setQuery] = useState('');
	const [scope, setScope] = useState<'all' | 'favorites'>('all');
	const [groupId, setGroupId] = useState('');
	const [branchId, setBranchId] = useState('');
	const [leafId, setLeafId] = useState('');
	const [sort, setSort] = useState<'relevant' | 'newest'>('relevant');
	const [referenceImages, setReferenceImages] = useState<Record<number, string>>({});
	const activeGroup = catalogTaxonomy.find((group) => group.id === groupId);
	const activeBranch = activeGroup?.branches.find((branch) => branch.id === branchId);
	const activeLeaf = activeBranch?.leaves.find((leaf) => leaf.id === leafId);

	useEffect(() => {
		if (!isSupabaseConfigured || !supabase) return;
		let active = true;
		async function loadReferenceImages() {
			const client = supabase;
			if (!client) return;
			const { data } = await client.from('creative_references')
				.select('template_id,image_path,metadata,sort_order')
				.eq('is_active', true)
				.in('rights_status', ['owned', 'licensed', 'public_domain'])
				.order('sort_order', { ascending: true })
				.limit(250);
			const firstStaticByTemplate = new Map<number, string>();
			for (const item of data || []) {
				const isStatic = item.metadata?.mediaType === 'static_image' || /\.(png|jpe?g|webp|avif)$/i.test(item.image_path || '');
				if (isStatic && !firstStaticByTemplate.has(Number(item.template_id))) firstStaticByTemplate.set(Number(item.template_id), item.image_path);
			}
			// El manifiesto ya no se puede leer desde el navegador (bucket privado):
			// /api/creativos/library lo devuelve filtrado por plan.
			if (!firstStaticByTemplate.size) {
				const remoteManifest = await fetchLibraryItems(client);
				for (const item of remoteManifest) if (!firstStaticByTemplate.has(Number(item.templateId))) firstStaticByTemplate.set(Number(item.templateId), item.imagePath);
			}
			const paths = [...firstStaticByTemplate.values()];
			const signed = await fetchReferenceUrls(client, paths);
			const entries = [...firstStaticByTemplate.entries()]
				.map(([templateId, imagePath]) => [templateId, signed[imagePath] || ''] as const)
				.filter(([, url]) => Boolean(url));
			if (active) setReferenceImages(Object.fromEntries(entries));
		}
		void loadReferenceImages();
		return () => { active = false; };
	}, []);

	const filtered = useMemo(() => items.filter((creative) => {
		const path = templatePath(creative);
		const matchesFavorite = scope === 'all' || favorites.has(creative.id);
		const matchesGroup = !groupId || creative.categoryGroup === groupId || path?.group.id === groupId;
		const matchesBranch = !branchId || creative.categoryBranch === activeBranch?.label.toLowerCase() || path?.branch.id === branchId;
		const matchesLeaf = !leafId || creative.categoryLeaf === activeLeaf?.label.toLowerCase() || activeLeaf?.templateIds.includes(creative.id);
		const haystack = `${creative.nombre} ${creative.sirve} ${creative.cuando} ${(creative.keywords || []).join(' ')} ${path?.group.label || ''} ${path?.branch.label || ''} ${path?.leaf.label || ''}`.toLowerCase();
		return matchesFavorite && matchesGroup && matchesBranch && matchesLeaf && haystack.includes(query.toLowerCase().trim());
	}).sort((a, b) => sort === 'newest' ? b.id - a.id : Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id)), [items, favorites, scope, groupId, branchId, leafId, activeBranch, activeLeaf, query, sort]);

	function chooseGroup(id: string) {
		setGroupId(id); setBranchId(''); setLeafId(''); setScope('all');
	}

	function clearFilters() {
		setScope('all'); setGroupId(''); setBranchId(''); setLeafId(''); setQuery('');
	}

	return <>
		<section className="library-discovery-hero">
			<div><span><i/> BIBLIOTECA CURADA</span><h1>Anuncios estáticos<br/><em>para crear mejor.</em></h1><p>Explorá estructuras visuales probadas, guardá tus favoritas y adaptalas a tu marca en minutos.</p></div>
		</section>
		<div className="library-search-tools">
			<label><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por ángulo, oferta o formato…"/>{query && <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda">×</button>}</label>
			<select value={sort} onChange={(event) => setSort(event.target.value as 'relevant' | 'newest')} aria-label="Ordenar biblioteca"><option value="relevant">Más relevantes</option><option value="newest">Más nuevas</option></select>
		</div>
		<nav className="library-category-rail" aria-label="Filtrar anuncios por objetivo">
			<button className={!groupId && scope === 'all' ? 'active' : ''} onClick={() => { setScope('all'); setGroupId(''); setBranchId(''); setLeafId(''); }}><Icon name="grid" size={15}/><span>Todos</span><b>{items.length}</b></button>
			{catalogTaxonomy.map((group) => {
				const count = items.filter((creative) => templatePath(creative)?.group.id === group.id).length;
				return <button key={group.id} className={groupId === group.id ? 'active' : ''} onClick={() => chooseGroup(group.id)} style={{ '--category-accent': group.accent } as React.CSSProperties}><i/><span>{group.label}</span><b>{count}</b></button>;
			})}
			<button className={scope === 'favorites' ? 'active saved' : 'saved'} onClick={() => { setScope('favorites'); setGroupId(''); setBranchId(''); setLeafId(''); }}><Icon name="heart" size={15}/><span>Guardados</span><b>{favorites.size}</b></button>
		</nav>
		{activeGroup && <div className="library-subfilters">
			<div><small>CATEGORÍA</small>{activeGroup.branches.map((branch) => <button key={branch.id} className={branchId === branch.id ? 'active' : ''} onClick={() => { setBranchId(branch.id); setLeafId(''); }}>{branch.label}</button>)}</div>
			{activeBranch && <div><small>TIPO</small>{activeBranch.leaves.map((leaf) => <button key={leaf.id} className={leafId === leaf.id ? 'active' : ''} onClick={() => setLeafId(leaf.id)}>{leaf.label}</button>)}</div>}
		</div>}
		<div className="library-results-heading new-library-heading"><div><strong>{scope === 'favorites' ? 'Tus anuncios guardados' : activeLeaf?.label || activeBranch?.label || activeGroup?.label || 'Todos los anuncios'}</strong><small>Elegí una referencia para abrir el generador paso a paso.</small></div>{(groupId || scope === 'favorites' || query) && <button onClick={clearFilters}>Limpiar filtros</button>}</div>
		<div className="library-ad-grid">{filtered.map((creative) => {
			const meta = ringMeta[creative.ring] || ringMeta.demo;
			const path = templatePath(creative);
			const imageUrl = referenceImages[creative.id] || referenceImagePath(creative);
			return <article className="library-ad-card" key={creative.id} style={{ '--card-accent': path?.group.accent || meta?.accent } as React.CSSProperties}>
				<div className="library-ad-visual">
					<button className="library-ad-open" onClick={() => onChoose(creative)} aria-label={`Usar ${creative.nombre} como referencia`}><img src={imageUrl} alt={`Referencia estática: ${creative.nombre}`} loading="lazy"/><span className="library-ad-overlay"><b>Usar esta referencia</b><Icon name="arrow" size={17}/></span></button>
					<span className="library-media-badge"><i/> IMAGEN · 4:5</span>
					<button className={`library-ad-save ${favorites.has(creative.id) ? 'active' : ''}`} onClick={() => onToggleFavorite(creative.id)} aria-label={favorites.has(creative.id) ? `Quitar ${creative.nombre} de guardados` : `Guardar ${creative.nombre}`}><Icon name="heart" size={17}/></button>
				</div>
				<div className="library-ad-info">
					<div className="library-ad-source"><span>{creativeNumber(creative.id)}</span><p><strong>Creattia reference</strong><small>{path?.group.label || meta?.label} · {path?.leaf.label || creative.n}</small></p><b>{creative.featured ? 'DESTACADO' : creative.n}</b></div>
					<button onClick={() => onChoose(creative)}><h3>{creative.nombre}</h3><p>{conciseText(creative.sirve)}</p><footer><span>Crear con esta idea</span><Icon name="arrow" size={15}/></footer></button>
				</div>
			</article>;
		})}</div>
		{filtered.length === 0 && <div className="studio-empty library-empty"><span><Icon name={scope === 'favorites' ? 'heart' : 'search'}/></span><h3>{scope === 'favorites' ? 'Todavía no guardaste anuncios' : 'No encontramos ese tipo'}</h3><p>{scope === 'favorites' ? 'Tocá el corazón de una referencia para encontrarla acá.' : 'Probá otra búsqueda o limpiá los filtros.'}</p><button onClick={clearFilters}>Explorar toda la biblioteca</button></div>}
	</>;
}
