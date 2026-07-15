import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/creattia/supabase-browser';
import { creativeCatalog } from '../../lib/creattia/catalog';

function Icon({ name, size = 20, fill = 'none' }: { name: string; size?: number; fill?: string }) {
	const common = { width: size, height: size, viewBox: '0 0 24 24', fill, stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
	if (name === 'home') return <svg {...common}><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/></svg>;
	if (name === 'grid') return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>;
	if (name === 'spark') return <svg {...common}><path d="m12 3 1.2 4.1a5 5 0 0 0 3.4 3.4L21 12l-4.4 1.5a5 5 0 0 0-3.4 3.4L12 21l-1.2-4.1a5 5 0 0 0-3.4-3.4L3 12l4.4-1.5a5 5 0 0 0 3.4-3.4L12 3Z"/></svg>;
	if (name === 'history') return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>;
	if (name === 'brand') return <svg {...common}><path d="M5 20h14"/><path d="M7 17V7l5-3 5 3v10"/><path d="M9.5 10h5M9.5 13h5"/></svg>;
	if (name === 'bag') return <svg {...common}><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>;
	if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
	if (name === 'arrow') return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
	if (name === 'upload') return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 15v4h14v-4"/></svg>;
	if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
	if (name === 'download') return <svg {...common}><path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>;
	if (name === 'logout') return <svg {...common}><path d="M10 5H5v14h5"/><path d="M14 8l4 4-4 4M8 12h10"/></svg>;
	if (name === 'menu') return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
	if (name === 'close') return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
	if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
	if (name === 'external') return <svg {...common}><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></svg>;
	if (name === 'heart') return <svg {...common} fill={fill}><path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/></svg>;
	if (name === 'layers') return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
	return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

// Supported Winners Categories
const winnersCategories = [
	{ id: 'todos', label: 'Miles de ideas disponibles' },
	{ id: 'guardados', label: '❤️ Guardados' },
	{ id: 'vs', label: 'Nosotros vs Ellos' },
	{ id: 'testimonios', label: 'Testimonios' },
	{ id: 'mas-vendidos', label: 'Más vendidos' },
	{ id: 'multimedia', label: 'Multimedia' },
	{ id: 'gancho-negativo', label: 'Gancho negativo' },
	{ id: 'mitos', label: 'Cazador de mitos' },
	{ id: 'caracteristicas', label: 'Características' },
	{ id: 'notas', label: 'Notas' },
	{ id: 'contenido', label: 'Qué contiene' },
	{ id: 'preguntas', label: 'Preguntas frecuentes' },
	{ id: 'antes-despues', label: 'Antes y después' },
	{ id: 'top-razones', label: 'Top razones' },
	{ id: 'problema-solucion', label: 'Problema-solución' },
	{ id: 'estadisticas', label: 'Estadísticas' }
];

function classifyItem(item: any): string {
	const notes = (item.promptNotes || '').toLowerCase();
	const tid = item.templateId;

	if (tid === 23 || notes.includes(' vs ') || notes.includes('versus') || notes.includes('unlike') || notes.includes('better than')) {
		return 'vs';
	}
	if (tid === 1 || notes.includes('review') || notes.includes('love') || notes.includes('testimonial') || notes.includes('customer') || notes.includes('“') || notes.includes('"') || notes.includes('says')) {
		return 'testimonios';
	}
	if (notes.includes('before') || notes.includes('after') || notes.includes('antes') || notes.includes('después')) {
		return 'antes-despues';
	}
	if (tid === 32 || notes.includes('myth') || notes.includes('truth') || notes.includes('fact') || notes.includes('real') || notes.includes('fake')) {
		return 'mitos';
	}
	if (notes.includes('stop') || notes.includes('don\'t') || notes.includes('mistake') || notes.includes('avoid') || notes.includes('hate') || notes.includes('worst') || notes.includes('never')) {
		return 'gancho-negativo';
	}
	if (notes.includes('?') || notes.includes('how do') || notes.includes('why do') || notes.includes('what is') || notes.includes('question')) {
		return 'preguntas';
	}
	if (notes.includes('reason') || notes.includes('reasons') || notes.includes('why you need') || notes.includes('top 3') || notes.includes('top 5')) {
		return 'top-razones';
	}
	if (notes.includes('%') || notes.includes('10x') || notes.includes('3x') || notes.includes('5x') || /\b\d{1,3}%\b/.test(notes) || notes.includes('stats') || notes.includes('numbers')) {
		return 'estadisticas';
	}
	if (notes.includes('what\'s inside') || notes.includes('ingredients') || notes.includes('contains') || notes.includes('what you get') || notes.includes('box') || notes.includes('pack')) {
		return 'contenido';
	}
	if (notes.includes('tired of') || notes.includes('struggle') || notes.includes('solution') || notes.includes('finally') || notes.includes('save time') || notes.includes('easy way')) {
		return 'problema-solucion';
	}
	if (notes.includes('note:') || notes.includes('memo') || notes.includes('tweet') || notes.includes('slack') || notes.includes('post-it')) {
		return 'notas';
	}
	if (notes.includes('video') || notes.includes('watch') || notes.includes('media') || notes.includes('show') || notes.includes('gif')) {
		return 'multimedia';
	}
	if (tid === 13 || tid === 15 || tid === 18 || notes.includes('free') || notes.includes('shipping') || notes.includes('off') || notes.includes('save') || notes.includes('sale') || notes.includes('discount') || notes.includes('price') || notes.includes('best seller') || notes.includes('popular')) {
		return 'mas-vendidos';
	}
	return 'caracteristicas';
}

function getTags(item: any, category: string): string[] {
	const name = (item.name || '').toLowerCase();
	const notes = (item.promptNotes || '').toLowerCase();
	const ind = ((item.metadata && item.metadata.industry) || '').toLowerCase();
	const tags = new Set<string>();

	if (category === 'vs') tags.add('Comparación').add('VS');
	if (category === 'testimonios') tags.add('Testimonial').add('Opinión').add('Social Proof');
	if (category === 'mas-vendidos') tags.add('Oferta').add('Descuento').add('Promo');
	if (category === 'mitos') tags.add('Mitos').add('Educativo');
	if (category === 'caracteristicas') tags.add('Producto').add('Llamativo');
	if (category === 'notas') tags.add('Tweet').add('Texto');
	if (category === 'preguntas') tags.add('Preguntas').add('FAQ');
	if (category === 'estadisticas') tags.add('Métricas').add('Números');
	if (category === 'antes-despues') tags.add('Antes/Después').add('Resultados');
	if (category === 'problema-solucion') tags.add('Solución').add('Beneficios');

	if (item.templateId === 40) tags.add('Minimalista').add('Clean');
	if (item.templateId === 13) tags.add('Precio').add('Tachado');
	if (item.templateId === 15) tags.add('Fecha Límite').add('Urgencia');
	if (item.templateId === 18) tags.add('Envío Gratis').add('Beneficio');

	if (ind.includes('b2b') || ind.includes('saas') || ind.includes('software') || name.includes('notion') || name.includes('figma') || name.includes('zapier')) {
		tags.add('SaaS').add('B2B').add('Tecnología');
	} else {
		tags.add('E-commerce').add('Físico');
	}
	if (ind.includes('health') || ind.includes('wellness') || ind.includes('beauty') || ind.includes('collagen') || name.includes('billie')) {
		tags.add('Estilo de Vida').add('Salud').add('Belleza');
	}
	if (ind.includes('food') || ind.includes('snack') || name.includes('flings')) {
		tags.add('Comida').add('Snacks');
	}

	if (notes.includes('bold') || name.includes('bold')) tags.add('Llamativo').add('Bold');
	if (notes.includes('simple') || notes.includes('minimal')) tags.add('Minimalista');
	if (notes.includes('premium') || notes.includes('luxury')) tags.add('Premium');
	if (notes.includes('modern') || notes.includes('next-gen')) tags.add('Moderno');

	return Array.from(tags);
}

type WinnerItem = {
	templateId: number;
	name: string;
	imagePath: string;
	promptNotes: string | null;
	categoryGroup: string | null;
	categoryBranch: string | null;
	categoryLeaf: string | null;
	category?: string;
	tags?: string[];
	metadata: {
		scrapedAt?: string;
		addedBy?: string;
		industry?: string;
		logoUrl?: string;
	};
};

export default function WinnersLibrary({
	session,
	profile,
	onGenerated,
	isSupabaseConfigured,
	onToast,
	preselectedTemplateId = null,
	onClearPreselected,
	onUpdateProfile,
	historyCount = 0,
	favorites = new Set(),
	onToggleFavorite
}: {
	session: any;
	profile?: any;
	onGenerated?: (generations: any[], credits: number) => void;
	isSupabaseConfigured?: boolean;
	onToast?: (message: string) => void;
	preselectedTemplateId?: number | null;
	onClearPreselected?: () => void;
	onUpdateProfile?: (profile: any) => Promise<void>;
	historyCount?: number;
	favorites?: Set<number>;
	onToggleFavorite?: (id: number) => void;
}) {
	const [items, setItems] = useState<WinnerItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeCategory, setActiveCategory] = useState('todos');
	const [query, setQuery] = useState('');
	const [error, setError] = useState('');
	
	// Admin form states
	const [showAddModal, setShowAddModal] = useState(false);
	const [newAdName, setNewAdName] = useState('');
	const [newAdCopy, setNewAdCopy] = useState('');
	const [newAdTemplateId, setNewAdTemplateId] = useState('40'); // default hero
	const [newAdFile, setNewAdFile] = useState<File | null>(null);
	const [submitting, setSubmitting] = useState(false);

	// Interactive generation modal states
	const [activeAd, setActiveAd] = useState<WinnerItem | null>(null);
	const [fastUrls, setFastUrls] = useState('');
	const [manualFiles, setManualFiles] = useState<File[]>([]);
	const [manualDesc, setManualDesc] = useState('');
	const [isUrlMode, setIsUrlMode] = useState(true);
	const [scanning, setScanning] = useState(false);
	
	// Multiple Choice options after scan
	const [scannedOptions, setScannedOptions] = useState<string[]>([]);
	const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
	
	// Fidelity option: 1 = Muy fiel, 2 = Estética marca, 3 = Híbrido
	const [fidelity, setFidelity] = useState(3);

	// Optional onboarding step states inside modal
	const [onboardingShow, setOnboardingShow] = useState(false);
	const [onboardingSkippedOrDone, setOnboardingSkippedOrDone] = useState(false);
	const [onboardingBrandName, setOnboardingBrandName] = useState(profile?.brandName || '');
	const [onboardingWebsite, setOnboardingWebsite] = useState(profile?.website || '');
	const [onboardingInstagram, setOnboardingInstagram] = useState(profile?.instagram || '');
	const [onboardingSaving, setOnboardingSaving] = useState(false);
	
	// Output results
	const [generating, setGenerating] = useState(false);
	const [generatedResult, setGeneratedResult] = useState('');
	const [generationError, setGenerationError] = useState('');

	const userEmail = session?.user?.email || '';
	const isAdmin = userEmail.toLowerCase().trim() === 'lucagazze1@gmail.com';

	const getSessionToken = (sess: any) => sess?.access_token || '';

	const normalizeProductUrl = (value: string) => {
		let raw = value.trim();
		if (!raw) return '';
		if (!/^https?:\/\//i.test(raw)) {
			raw = 'https://' + raw;
		}
		return raw;
	};

	const handleUseIdea = (item: WinnerItem) => {
		setActiveAd(item);
		setFastUrls('');
		setManualFiles([]);
		setManualDesc('');
		setIsUrlMode(true);
		setScanning(false);
		setScannedOptions([]);
		setSelectedOptions([]);
		setFidelity(3);
		setGeneratedResult('');
		setGenerationError('');
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const filesArr = Array.from(e.target.files).slice(0, 5);
			setManualFiles(filesArr);
		}
	};

	const handleScanUrls = async () => {
		if (!fastUrls.trim()) return;
		setScanning(true);
		setGenerationError('');
		try {
			const urlsList = fastUrls.split(',').map(u => u.trim()).filter(Boolean);
			if (!isSupabaseConfigured || !supabase) {
				await new Promise(resolve => setTimeout(resolve, 1500));
				const options: string[] = [];
				urlsList.forEach((url, i) => {
					let label = `Producto ${i + 1}`;
					try {
						label = new URL(url).hostname.replace('www.', '').split('.')[0];
						label = label.charAt(0).toUpperCase() + label.slice(1);
					} catch {}
					options.push(`Mostrar el producto principal (${label})`);
					options.push(`Destacar oferta o beneficios de (${label})`);
				});
				options.push("Enfatizar los colores y el logotipo de mi marca");
				options.push("Incluir nota/reseña de cliente verificado");
				setScannedOptions(options);
				setSelectedOptions([options[0]]);
			} else {
				const ids: string[] = [];
				const options: string[] = [];
				for (const rawUrl of urlsList.slice(0, 5)) {
					const normalizedUrl = normalizeProductUrl(rawUrl);
					const response = await fetch('/api/creativos/products', {
						method: 'POST',
						headers: {
							authorization: `Bearer ${getSessionToken(session)}`,
							'content-type': 'application/json'
						},
						body: JSON.stringify({ url: normalizedUrl }),
					});
					const payload = await response.json();
					if (response.ok && payload.importedIds?.length) {
						ids.push(...payload.importedIds);
					}
				}
				if (!ids.length) {
					throw new Error('No pudimos analizar los productos de las URLs. Probá ingresando una descripción manual.');
				}
				const { data: prodData, error: dbErr } = await supabase
					.from('creative_products')
					.select('id,name,description')
					.in('id', ids);
				
				if (!dbErr && prodData?.length) {
					prodData.forEach(p => {
						options.push(`Mostrar el producto principal (${p.name})`);
						if (p.description) {
							options.push(`Destacar características de (${p.name})`);
						}
					});
					options.push("Enfatizar los colores y el logotipo de mi marca");
					options.push("Incluir nota/reseña de cliente verificado");
					setScannedOptions(options);
					setSelectedOptions([options[0]]);
				} else {
					urlsList.forEach((_, i) => {
						options.push(`Mostrar el producto principal (Producto ${i+1})`);
					});
					setScannedOptions(options);
					setSelectedOptions([options[0]]);
				}
			}
		} catch (err: any) {
			setGenerationError(err.message || 'Error al escanear la URL.');
		} finally {
			setScanning(false);
		}
	};

	const handleGenerateFromModal = async () => {
		if (!activeAd) return;
		
		if (profile && !profile.onboardingCompleted && historyCount === 0 && !onboardingSkippedOrDone) {
			setOnboardingShow(true);
			return;
		}

		setGenerating(true);
		setGenerationError('');
		setGeneratedResult('');
		try {
			const form = new FormData();
			const creative = creativeCatalog.find(c => c.id === activeAd.templateId) || creativeCatalog[0];
			
			form.set('templateId', String(creative.id));
			form.set('templateName', creative.nombre);
			form.set('purpose', creative.sirve);
			form.set('usageHint', creative.cuando);
			form.set('format', 'square');
			form.set('imageType', 'product');
			form.set('referencePath', activeAd.imagePath);
			
			const brandName = onboardingBrandName || (profile ? profile.brandName : '');
			const website = onboardingWebsite || (profile ? profile.website : '');
			const instagram = onboardingInstagram || (profile ? profile.instagram : '');
			
			form.set('brandName', brandName);
			form.set('website', website);
			form.set('instagram', instagram);
			if (profile) {
				form.set('colors', `${profile.primaryColor || ''}, ${profile.secondaryColor || ''}`);
			}
			
			let briefText = '';
			if (isUrlMode) {
				briefText = `URLs de referencia del producto: ${fastUrls}. `;
				if (selectedOptions.length) {
					briefText += `Enfoque publicitario seleccionado: ${selectedOptions.join(' · ')}. `;
				}
			} else {
				briefText = `Descripción del producto/servicio: ${manualDesc}. `;
				if (manualFiles.length) {
					form.append('product', manualFiles[0]);
				}
			}
			
			const fidelityInstructions: Record<number, string> = {
				1: 'ART DIRECTION STYLE: SUPER FAITHFUL TO THE REFERENCED DESIGN. Preserve visual structure, color choices, card positions, typography framing, and exact layout composition of the reference image as closely as possible.',
				2: 'ART DIRECTION STYLE: BRAND IDENTITY INTEGRATION. Use the brand logo and colors (Primary, Secondary) to style the background and text overlays, blending them with the reference layout.',
				3: 'ART DIRECTION STYLE: OPTIMIZED HYBRID. Merge the visual elements of the winning reference layout with the brand aesthetics in a high-performing composition recommended by Moki.'
			};
			
			form.set('brief', `${briefText}\n\n${fidelityInstructions[fidelity]}`);
			form.set('preset', 'Fiel al ganador');
			form.set('count', '1');
			
			if (!isSupabaseConfigured || !supabase) {
				await new Promise(resolve => setTimeout(resolve, 3000));
				setGeneratedResult(`https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${activeAd.imagePath}`);
				if (onToast) onToast('¡Vista demo creada con éxito!');
			} else {
				const response = await fetch('/api/creativos/generate', {
					method: 'POST',
					headers: {
						authorization: `Bearer ${getSessionToken(session)}`
					},
					body: form
				});
				const payload = await response.json();
				if (!response.ok) throw new Error(payload.error || 'Error al generar la imagen.');
				
				const genResult = payload.generations?.[0] || { imageUrl: payload.imageUrl };
				if (genResult.imageUrl) {
					setGeneratedResult(genResult.imageUrl);
					if (onGenerated) {
						onGenerated(payload.generations || [{
							id: payload.id,
							imageUrl: payload.imageUrl,
							outputIndex: 1,
							createdAt: new Date().toISOString(),
							title: creative.nombre,
							format: 'square'
						}], payload.creditsRemaining);
					}
					if (onToast) onToast('¡Tu anuncio ganador ha sido generado con éxito!');
				} else {
					throw new Error('La respuesta de generación no contiene imágenes.');
				}
			}
		} catch (err: any) {
			setGenerationError(err.message || 'Error al generar la imagen.');
		} finally {
			setGenerating(false);
		}
	};

	const loadWinners = async () => {
		try {
			setLoading(true);
			let rawItems: any[] = [];
			if (supabase) {
				const { data: manifestUrl } = supabase.storage.from('creative-references').getPublicUrl('manifests/starter-static-50.json');
				const res = await fetch(manifestUrl.publicUrl + '?t=' + Date.now());
				if (!res.ok) throw new Error('No se pudo descargar el catálogo de ganadores.');
				const data = await res.json();
				rawItems = data.items || [];
			} else {
				const res = await fetch('/scraped_ads/manifest.json');
				if (!res.ok) throw new Error('No se pudo cargar el catálogo local.');
				const data = await res.json();
				rawItems = data.items || [];
			}
			const classified = rawItems.map(item => {
				const category = classifyItem(item);
				const tags = getTags(item, category);
				return { ...item, category, tags };
			});
			setItems(classified);
		} catch (err: any) {
			setError(err.message || 'Error cargando ganadores.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadWinners();
	}, []);

	useEffect(() => {
		if (preselectedTemplateId && items.length > 0) {
			const match = items.find(item => item.templateId === preselectedTemplateId);
			if (match) {
				handleUseIdea(match);
			}
			if (onClearPreselected) onClearPreselected();
		}
	}, [preselectedTemplateId, items]);

	// Filter items
	const filteredItems = useMemo(() => {
		return items.filter(item => {
			// Category filter
			const matchesCategory = activeCategory === 'guardados'
				? favorites.has(item.templateId)
				: (activeCategory === 'todos' || item.category === activeCategory);

			// Search query filter
			const search = query.toLowerCase().trim();
			const matchesSearch = !search || 
				item.name.toLowerCase().includes(search) || 
				(item.promptNotes || '').toLowerCase().includes(search) ||
				(item.categoryLeaf || '').toLowerCase().includes(search) ||
				(item.tags || []).some(t => t.toLowerCase().includes(search));

			return matchesCategory && matchesSearch;
		});
	}, [items, activeCategory, query]);

	// Delete winner handler
	const handleDelete = async (imagePath: string) => {
		if (!window.confirm('¿Seguro que querés eliminar este anuncio de la biblioteca de ganadores?')) return;
		try {
			const res = await fetch(`/api/creativos/references?imagePath=${encodeURIComponent(imagePath)}`, {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${session?.access_token || ''}`
				}
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Error al eliminar.');
			
			// Update local state
			setItems(prev => prev.filter(item => item.imagePath !== imagePath));
		} catch (err: any) {
			alert(err.message);
		}
	};

	// Add winner handler
	const handleAddSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newAdName) return alert('Por favor ingresá la marca.');
		if (!newAdFile) return alert('Por favor subí una imagen.');
		
		try {
			setSubmitting(true);
			const formData = new FormData();
			formData.append('name', newAdName);
			formData.append('promptNotes', newAdCopy);
			formData.append('templateId', newAdTemplateId);
			formData.append('image', newAdFile);
			
			// Find taxonomy from selected template
			const temp = creativeCatalog.find(c => c.id === Number(newAdTemplateId));
			if (temp) {
				formData.append('categoryGroup', temp.categoryGroup || 'producto');
				formData.append('categoryBranch', temp.categoryBranch || 'presentar');
				formData.append('categoryLeaf', temp.categoryLeaf || 'hero');
			}

			const res = await fetch('/api/creativos/references', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${session?.access_token || ''}`
				},
				body: formData
			});
			
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Error al agregar.');

			alert('¡Anuncio ganador agregado con éxito!');
			setShowAddModal(false);
			setNewAdName('');
			setNewAdCopy('');
			setNewAdFile(null);
			void loadWinners();
		} catch (err: any) {
			alert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="winners-library-container">
			<div className="studio-page-heading">
				<div>
					<p>Catálogo de Alto Rendimiento</p>
					<h1>Biblioteca de ganadores</h1>
					<span>Inspirate en más de {items.length} anuncios ganadores reales y usalos como plantilla.</span>
				</div>
				{isAdmin && (
					<button className="studio-primary-button compact" onClick={() => setShowAddModal(true)}>
						<Icon name="plus" size={16} />
						Agregar Ganador
					</button>
				)}
			</div>

			<div className="studio-library-tools">
				<label>
					<Icon name="search" size={18} />
					<input 
						value={query} 
						onChange={(e) => setQuery(e.target.value)} 
						placeholder="Buscar por marca o palabra clave..." 
					/>
				</label>
				<span>{filteredItems.length} ganadores encontrados</span>
			</div>

			{/* Category rail */}
			<div className="studio-filter-row">
				{winnersCategories.map(cat => (
					<button 
						key={cat.id}
						className={activeCategory === cat.id ? 'active' : ''}
						onClick={() => setActiveCategory(cat.id)}
					>
						{cat.label}
					</button>
				))}
			</div>

			{loading ? (
				<div className="studio-boot" style={{ minHeight: '300px', background: 'transparent' }}>
					<span className="studio-spinner" />
					<p>Cargando anuncios ganadores...</p>
				</div>
			) : error ? (
				<div className="studio-empty large">
					<Icon name="close" size={40} />
					<h3>Error de conexión</h3>
					<p>{error}</p>
					<button onClick={() => void loadWinners()}>Reintentar</button>
				</div>
			) : filteredItems.length === 0 ? (
				<div className="studio-empty large">
					<Icon name="search" size={40} />
					<h3>No encontramos anuncios</h3>
					<p>Probá cambiando la categoría o la palabra clave de búsqueda.</p>
					<button onClick={() => { setActiveCategory('todos'); setQuery(''); }}>Limpiar filtros</button>
				</div>
			) : (
				<div className="library-ad-grid-masonry">
					{filteredItems.map((item, idx) => {
						const imageUrl = supabase 
							? supabase.storage.from('creative-references').getPublicUrl(item.imagePath).data.publicUrl
							: `https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${item.imagePath}`;

						return (
							<article 
								className="library-ad-card-masonry" 
								key={item.imagePath || idx}
								style={{ 
									display: 'flex',
									flexDirection: 'column',
									position: 'relative',
									cursor: 'pointer'
								}}
								onClick={() => handleUseIdea(item)}
							>
								{/* Card header (Social Proof looks like FB ad) */}
								<div 
									style={{ 
										padding: '12px', 
										display: 'flex', 
										alignItems: 'center', 
										gap: '10px', 
										borderBottom: '1px solid #f3eff6' 
									}}
								>
									<span 
										style={{ 
											width: '32px', 
											height: '32px', 
											borderRadius: '50%', 
											background: '#ece7f4', 
											color: '#6d35e8', 
											fontWeight: 'bold', 
											display: 'grid', 
											placeItems: 'center',
											fontSize: '11px',
											overflow: 'hidden'
										}}
									>
										{item.metadata?.logoUrl ? (
											<img src={item.metadata.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
										) : (
											item.name.slice(0, 1).toUpperCase()
										)}
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<strong style={{ display: 'block', fontSize: '11.5px', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
											{item.name}
										</strong>
										<span style={{ fontSize: '9px', color: '#918b95' }}>Patrocinado</span>
									</div>

									{isAdmin && (
										<button 
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(item.imagePath);
											}}
											style={{ 
												border: 0, 
												background: 'transparent', 
												color: '#dc2626', 
												cursor: 'pointer',
												padding: '4px',
												zIndex: 5
											}}
											title="Eliminar ganador"
										>
											<Icon name="close" size={16} />
										</button>
									)}
								</div>

								{/* Image visual with download protection */}
								<div 
									style={{ 
										background: '#f8f6fb', 
										position: 'relative',
										overflow: 'hidden' 
									}}
								>
									{/* Protection overlay */}
									<div 
										style={{
											position: 'absolute',
											inset: 0,
											zIndex: 2,
											background: 'transparent'
										}}
										onContextMenu={(e) => e.preventDefault()}
										onDragStart={(e) => e.preventDefault()}
									/>
									
									{/* Heart Button */}
									<button 
										onClick={(e) => {
											e.stopPropagation();
											if (onToggleFavorite) onToggleFavorite(item.templateId);
										}}
										style={{ 
											position: 'absolute',
											top: '10px',
											right: '10px',
											zIndex: 4,
											border: 0,
											background: 'rgba(255,255,255,0.85)',
											color: favorites.has(item.templateId) ? '#ff4185' : '#716d79',
											borderRadius: '50%',
											width: '30px',
											height: '30px',
											display: 'grid',
											placeItems: 'center',
											cursor: 'pointer',
											boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
											outline: 0
										}}
										title={favorites.has(item.templateId) ? "Quitar de guardados" : "Guardar idea"}
									>
										<Icon name="heart" size={15} fill={favorites.has(item.templateId) ? '#ff4185' : 'none'} />
									</button>

									<img 
										src={imageUrl} 
										alt={item.name} 
										style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }} 
										loading="lazy" 
										onContextMenu={(e) => e.preventDefault()}
										onDragStart={(e) => e.preventDefault()}
									/>
								</div>

								{/* Copy text and actions */}
								<div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
									<p 
										style={{ 
											fontSize: '11px', 
											color: '#4a444f', 
											margin: '0 0 12px 0', 
											lineHeight: '1.45',
											maxHeight: '44px',
											overflow: 'hidden',
											display: '-webkit-box',
											WebkitLineClamp: 2,
											WebkitBoxOrient: 'vertical'
										}}
									>
										{item.promptNotes || 'Inspiración publicitaria ganadora.'}
									</p>
									<button 
										onClick={(e) => {
											e.stopPropagation();
											handleUseIdea(item);
										}}
										style={{ 
											width: '100%', 
											height: '35px', 
											background: '#f2ecfc', 
											border: 0, 
											borderRadius: '8px', 
											color: '#6d35e8', 
											fontWeight: 'bold', 
											fontSize: '10.5px', 
											cursor: 'pointer',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											gap: '6px'
										}}
									>
										Usar esta idea
										<Icon name="arrow" size={13} />
									</button>
								</div>
							</article>
						);
					})}
				</div>
			)}

			{/* Add winner modal */}
			{showAddModal && (
				<div 
					style={{
						position: 'fixed',
						inset: 0,
						background: 'rgba(0,0,0,0.5)',
						display: 'grid',
						placeItems: 'center',
						zIndex: 100,
						backdropFilter: 'blur(4px)'
					}}
				>
					<div 
						style={{
							background: '#fff',
							padding: '24px',
							borderRadius: '16px',
							width: '100%',
							maxWidth: '460px',
							border: '1px solid #e5dfe8',
							boxShadow: '0 12px 30px rgba(0,0,0,0.15)'
						}}
					>
						<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
							<h3 style={{ margin: 0, fontSize: '16px' }}>Agregar anuncio ganador</h3>
							<button 
								onClick={() => setShowAddModal(false)}
								style={{ border: 0, background: 'transparent', cursor: 'pointer', marginLeft: 'auto' }}
							>
								<Icon name="close" size={18} />
							</button>
						</header>

						<form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Marca / Nombre del anuncio
								<input 
									type="text"
									value={newAdName}
									onChange={(e) => setNewAdName(e.target.value)}
									placeholder="ej. Slack, Coca Cola, True Classic"
									style={{ height: '38px', padding: '0 12px', border: '1px solid #ded7e2', borderRadius: '8px' }}
									required
								/>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Copy / Texto principal
								<textarea 
									value={newAdCopy}
									onChange={(e) => setNewAdCopy(e.target.value)}
									placeholder="ej. ¿Cansado de reuniones eternas? Pasate a Slack hoy."
									style={{ minHeight: '60px', padding: '10px 12px', border: '1px solid #ded7e2', borderRadius: '8px', resize: 'none' }}
								/>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Ángulo / Plantilla asociada
								<select
									value={newAdTemplateId}
									onChange={(e) => setNewAdTemplateId(e.target.value)}
									style={{ height: '38px', padding: '0 10px', border: '1px solid #ded7e2', borderRadius: '8px' }}
								>
									{creativeCatalog.map(c => (
										<option key={c.id} value={c.id}>
											#{String(c.id).padStart(2, '0')} - {c.nombre}
										</option>
									))}
								</select>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Imagen del anuncio (formato vertical 9:16 preferido)
								<input 
									type="file"
									accept="image/png, image/jpeg, image/webp"
									onChange={(e) => setNewAdFile(e.target.files?.[0] || null)}
									style={{ fontSize: '11px' }}
									required
								/>
							</label>

							<button 
								type="submit" 
								className="studio-primary-button" 
								style={{ height: '42px', marginTop: '10px' }}
								disabled={submitting}
							>
								{submitting ? 'Guardando...' : 'Guardar en la biblioteca'}
							</button>
						</form>
					</div>
				</div>
			)}

			{/* Interactive Generation Modal */}
			{activeAd && (
				<div 
					style={{
						position: 'fixed',
						inset: 0,
						background: 'rgba(0,0,0,0.5)',
						display: 'grid',
						placeItems: 'center',
						zIndex: 100,
						backdropFilter: 'blur(4px)',
						padding: '20px'
					}}
				>
					<div 
						style={{
							background: '#fff',
							padding: '24px',
							borderRadius: '16px',
							width: '100%',
							maxWidth: '560px',
							maxHeight: '90vh',
							overflowY: 'auto',
							border: '1px solid #e9e6ed',
							boxShadow: '0 25px 75px rgba(52, 40, 79, 0.08)',
							position: 'relative'
						}}
					>
						<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f3eff6', paddingBottom: '12px' }}>
							<div>
								<h3 style={{ margin: 0, fontSize: '18px', color: '#19171d', fontWeight: 800 }}>
									Crear con este diseño
								</h3>
								<p style={{ margin: '2px 0 0', fontSize: '12px', color: '#716d79' }}>
									Inspirado en el anuncio de <strong>{activeAd.name}</strong>
								</p>
							</div>
							<button 
								onClick={() => setActiveAd(null)}
								style={{ border: 0, background: 'transparent', cursor: 'pointer', marginLeft: 'auto', padding: '6px', color: '#716d79' }}
							>
								<Icon name="close" size={20} />
							</button>
						</header>

						{generating ? (
							<div style={{ textAlign: 'center', padding: '40px 0' }}>
								<span className="studio-spinner" style={{ width: '40px', height: '40px', margin: '0 auto 20px' }} />
								<h4 style={{ fontSize: '16px', fontWeight: 800, color: '#19171d', marginBottom: '8px' }}>Moki está diseñando tu anuncio...</h4>
								<p style={{ fontSize: '13px', color: '#716d79' }}>Esto puede demorar hasta 30 segundos. ¡No cierres el modal!</p>
							</div>
						) : generatedResult ? (
							<div style={{ textAlign: 'center', padding: '10px 0' }}>
								<div style={{ width: '28px', height: '28px', background: '#e6f9ed', color: '#137333', borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
									<Icon name="check" size={16} />
								</div>
								<h4 style={{ fontSize: '16px', fontWeight: 800, color: '#19171d', marginBottom: '15px' }}>¡Tu anuncio está listo!</h4>
								
								<div style={{ width: '100%', maxWidth: '280px', margin: '0 auto 20px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e9e6ed', boxShadow: '0 8px 24px rgba(0,0,0,0.05)' }}>
									<img src={generatedResult} alt="Resultado" style={{ width: '100%', height: 'auto', display: 'block' }} />
								</div>

								<div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
									<a 
										href={generatedResult} 
										download="anuncio-creattia.png" 
										target="_blank" 
										rel="noreferrer"
										className="studio-primary-button" 
										style={{ textDecoration: 'none', height: '42px', padding: '0 24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
									>
										<Icon name="download" size={16} />
										Descargar imagen
									</a>
									<button 
										onClick={() => setGeneratedResult('')}
										style={{ height: '42px', padding: '0 20px', borderRadius: '10px', border: '1px solid #e9e6ed', background: '#fff', color: '#19171d', cursor: 'pointer', fontWeight: 700 }}
									>
										Crear otra versión
									</button>
								</div>
							</div>
						) : onboardingShow ? (
							<div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
								<div style={{ textAlign: 'center', marginBottom: '10px' }}>
									<h4 style={{ fontSize: '16px', fontWeight: 800, color: '#19171d', margin: 0 }}>⚙️ Configuración de tu Marca (Opcional)</h4>
									<p style={{ fontSize: '12px', color: '#716d79', margin: '4px 0 0' }}>Completá estos datos una sola vez para que Moki personalice tus anuncios.</p>
								</div>
								
								<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#19171d' }}>
									Nombre de tu marca
									<input 
										type="text" 
										value={onboardingBrandName} 
										onChange={(e) => setOnboardingBrandName(e.target.value)}
										placeholder="ej. Vitta, Nike, Bold"
										style={{ height: '42px', padding: '0 12px', border: '1px solid #aaa4b0', borderRadius: '10px', outline: 0, fontSize: '14px' }}
									/>
								</label>

								<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#19171d' }}>
									Sitio web (opcional)
									<input 
										type="url" 
										value={onboardingWebsite} 
										onChange={(e) => setOnboardingWebsite(e.target.value)}
										placeholder="https://tumarca.com"
										style={{ height: '42px', padding: '0 12px', border: '1px solid #aaa4b0', borderRadius: '10px', outline: 0, fontSize: '14px' }}
									/>
								</label>

								<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#19171d' }}>
									Instagram (opcional)
									<input 
										type="text" 
										value={onboardingInstagram} 
										onChange={(e) => setOnboardingInstagram(e.target.value)}
										placeholder="https://instagram.com/tumarca"
										style={{ height: '42px', padding: '0 12px', border: '1px solid #aaa4b0', borderRadius: '10px', outline: 0, fontSize: '14px' }}
									/>
								</label>

								{generationError && (
									<p style={{ margin: '0', padding: '10px 12px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '8px', color: '#a43f3f', fontSize: '12px' }}>
										{generationError}
									</p>
								)}

								<div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
									<button
										type="button"
										onClick={async () => {
											setOnboardingSaving(true);
											setGenerationError('');
											try {
												if (onUpdateProfile) {
													await onUpdateProfile({
														...profile,
														onboardingCompleted: true
													});
												}
												setOnboardingSkippedOrDone(true);
												setOnboardingShow(false);
												setTimeout(() => {
													void handleGenerateFromModal();
												}, 100);
											} catch (err: any) {
												setGenerationError(err.message || 'Error al guardar.');
											} finally {
												setOnboardingSaving(false);
											}
										}}
										style={{ flex: 1, height: '44px', borderRadius: '10px', border: '1px solid #e9e6ed', background: '#fff', color: '#716d79', cursor: 'pointer', fontWeight: 700 }}
										disabled={onboardingSaving}
									>
										Omitir y Generar
									</button>
									<button
										type="button"
										onClick={async () => {
											setOnboardingSaving(true);
											setGenerationError('');
											try {
												if (onUpdateProfile) {
													await onUpdateProfile({
														...profile,
														brandName: onboardingBrandName,
														website: onboardingWebsite,
														instagram: onboardingInstagram,
														onboardingCompleted: true
													});
												}
												setOnboardingSkippedOrDone(true);
												setOnboardingShow(false);
												setTimeout(() => {
													void handleGenerateFromModal();
												}, 100);
											} catch (err: any) {
												setGenerationError(err.message || 'Error al guardar.');
											} finally {
												setOnboardingSaving(false);
											}
										}}
										className="studio-primary-button"
										style={{ flex: 1, height: '44px', background: 'var(--holo-gradient)', color: '#fff', border: 0 }}
										disabled={onboardingSaving || !onboardingBrandName.trim()}
									>
										{onboardingSaving ? 'Guardando...' : 'Guardar y Generar'}
									</button>
								</div>
							</div>
						) : (
							<div>
								{/* Step 1: Input URLs or manual details */}
								<div style={{ display: 'flex', gap: '8px', padding: '4px', background: '#f5f2f7', borderRadius: '10px', marginBottom: '20px' }}>
									<button 
										type="button" 
										onClick={() => setIsUrlMode(true)}
										style={{ flex: 1, height: '34px', border: 0, borderRadius: '7px', background: isUrlMode ? '#fff' : 'transparent', color: isUrlMode ? '#19171d' : '#716d79', fontWeight: 800, cursor: 'pointer', boxShadow: isUrlMode ? '0 2px 6px rgba(0,0,0,0.05)' : 'none' }}
									>
										Analizar URLs
									</button>
									<button 
										type="button" 
										onClick={() => setIsUrlMode(false)}
										style={{ flex: 1, height: '34px', border: 0, borderRadius: '7px', background: !isUrlMode ? '#fff' : 'transparent', color: !isUrlMode ? '#19171d' : '#716d79', fontWeight: 800, cursor: 'pointer', boxShadow: !isUrlMode ? '0 2px 6px rgba(0,0,0,0.05)' : 'none' }}
									>
										Subida manual
									</button>
								</div>

								{isUrlMode ? (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
										<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#19171d' }}>
											Ingresá las URLs de tus productos (hasta 5 separadas por coma)
											<input 
												type="text" 
												value={fastUrls} 
												onChange={(e) => setFastUrls(e.target.value)}
												placeholder="https://tutienda.com/producto-1, https://tutienda.com/producto-2"
												style={{ height: '42px', padding: '0 12px', border: '1px solid #aaa4b0', borderRadius: '10px', outline: 0, fontSize: '14px' }}
											/>
										</label>
										
										<button 
											type="button" 
											onClick={handleScanUrls}
											disabled={scanning || !fastUrls.trim()}
											className="studio-primary-button"
											style={{ height: '42px', background: '#19171d' }}
										>
											{scanning ? 'Analizando con IA...' : 'Analizar URLs'}
										</button>
									</div>
								) : (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
										<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#19171d' }}>
											Descripción de tu producto o servicio
											<textarea 
												value={manualDesc}
												onChange={(e) => setManualDesc(e.target.value)}
												placeholder="ej. Remera clásica de algodón peinado, corte regular fit..."
												style={{ minHeight: '80px', padding: '12px', border: '1px solid #aaa4b0', borderRadius: '10px', resize: 'none', fontSize: '14px' }}
											/>
										</label>

										<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#19171d' }}>
											Subí fotos de tus productos (opcional, hasta 5)
											<input 
												type="file" 
												multiple
												accept="image/*"
												onChange={handleFileChange}
												style={{ fontSize: '13px' }}
											/>
										</label>
									</div>
								)}

								{/* Step 2: Multiple Choice Questions */}
								{scannedOptions.length > 0 && (
									<div style={{ marginTop: '20px', borderTop: '1px solid #f3eff6', paddingTop: '15px' }}>
										<strong style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#19171d', marginBottom: '10px' }}>
											¿Qué querés mostrar en el anuncio? (Opción múltiple)
										</strong>
										<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
											{scannedOptions.map((opt, idx) => (
												<label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#4b4452', cursor: 'pointer', fontWeight: 'normal' }}>
													<input 
														type="checkbox" 
														checked={selectedOptions.includes(opt)}
														onChange={(e) => {
															if (e.target.checked) {
																setSelectedOptions([...selectedOptions, opt]);
															} else {
																setSelectedOptions(selectedOptions.filter(o => o !== opt));
															}
														}}
														style={{ width: '16px', height: '16px', accentColor: '#a25df7' }}
													/>
													{opt}
												</label>
											))}
										</div>
									</div>
								)}

								{/* Step 3: Fidelity selector */}
								<div style={{ marginTop: '20px', borderTop: '1px solid #f3eff6', paddingTop: '15px', marginBottom: '25px' }}>
									<strong style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#19171d', marginBottom: '10px' }}>
										Fidelidad del diseño final
									</strong>
									<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
										{[
											{ id: 1, title: '1. Super fiel al diseño', desc: 'Mantiene la estructura y fondo de la imagen de referencia.' },
											{ id: 2, title: '2. Estética de tu marca', desc: 'Usa tus colores y logotipo para vestir el diseño.' },
											{ id: 3, title: '3. Híbrido optimizado (Recomendado)', desc: 'Moki combina inteligentemente el ganador y tu marca.' }
										].map(f => (
											<button
												key={f.id}
												type="button"
												onClick={() => setFidelity(f.id)}
												style={{
													padding: '10px 12px',
													borderRadius: '8px',
													border: fidelity === f.id ? '2px solid #a25df7' : '1px solid #e9e6ed',
													background: fidelity === f.id ? '#fcfbfe' : '#fff',
													textAlign: 'left',
													cursor: 'pointer',
													outline: 0
												}}
											>
												<strong style={{ display: 'block', fontSize: '13px', color: '#19171d' }}>{f.title}</strong>
												<p style={{ margin: '2px 0 0', fontSize: '11px', color: '#716d79' }}>{f.desc}</p>
											</button>
										))}
									</div>
								</div>

								{generationError && (
									<p style={{ margin: '0 0 15px', padding: '10px 12px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '8px', color: '#a43f3f', fontSize: '12px' }}>
										{generationError}
									</p>
								)}

								{/* Step 4: Submit button */}
								<button 
									type="button"
									onClick={handleGenerateFromModal}
									disabled={isUrlMode && scannedOptions.length === 0}
									className="studio-primary-button"
									style={{ width: '100%', height: '46px', background: 'var(--holo-gradient)', color: '#fff', border: 0 }}
								>
									Generar imagen ganadora
								</button>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

