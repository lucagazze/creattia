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

// Supported Winners Categories — IDs match categoryLeaf values in the manifest
const winnersCategories = [
	{ id: 'todos', label: 'Todos los anuncios' },
	{ id: 'guardados', label: '❤️ Guardados' },
	{ id: 'hero', label: 'Producto héroe' },
	{ id: 'caracteristicas', label: 'Características' },
	{ id: 'precio', label: 'Precio / Oferta' },
	{ id: 'resenas', label: 'Reseñas' },
	{ id: 'mitos', label: 'Cazador de mitos' },
	{ id: 'urgencia', label: 'Urgencia' },
	{ id: 'envio', label: 'Envío gratis' },
	{ id: 'competencia', label: 'Nosotros vs Ellos' },
	{ id: 'garantia', label: 'Garantía' }
];

// Use categoryLeaf from manifest (set by Foreplay's own classification) as primary source
function classifyItem(item: any): string {
	// Primary: use categoryLeaf from the manifest scraper
	const leaf = (item.categoryLeaf || '').toLowerCase().trim();
	if (leaf) return leaf;

	// Fallback: text-based heuristics when categoryLeaf is missing
	const notes = (item.promptNotes || '').toLowerCase();
	const tid = item.templateId;

	if (tid === 23 || notes.includes(' vs ') || notes.includes('versus') || notes.includes('better than')) {
		return 'competencia';
	}
	if (notes.includes('review') || notes.includes('testimonial') || notes.includes('customer') || notes.includes('says')) {
		return 'resenas';
	}
	if (notes.includes('myth') || notes.includes('truth') || notes.includes('fact')) {
		return 'mitos';
	}
	if (tid === 15 || notes.includes('limited') || notes.includes('hurry') || notes.includes('expires')) {
		return 'urgencia';
	}
	if (tid === 18 || notes.includes('free shipping') || notes.includes('envio')) {
		return 'envio';
	}
	if (notes.includes('%') || notes.includes('off') || notes.includes('sale') || notes.includes('discount') || notes.includes('price')) {
		return 'precio';
	}
	if (notes.includes('guarantee') || notes.includes('warranty')) {
		return 'garantia';
	}
	if (notes.includes('feature') || notes.includes('benefit') || notes.includes('works')) {
		return 'caracteristicas';
	}
	return 'hero';
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
	preselectedWinnerPath = null,
	onClearPreselectedWinner,
	likedScrapedPaths = new Set(),
	onToggleLikedScraped,
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
	preselectedWinnerPath?: string | null;
	onClearPreselectedWinner?: () => void;
	likedScrapedPaths?: Set<string>;
	onToggleLikedScraped?: (path: string) => void;
	onUpdateProfile?: (profile: any) => Promise<void>;
	historyCount?: number;
	favorites?: Set<number>;
	onToggleFavorite?: (id: number) => void;
}) {
	const [items, setItems] = useState<WinnerItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeCategory, setActiveCategory] = useState('todos');
	const [activeNiche, setActiveNiche] = useState('todos');
	const [query, setQuery] = useState('');
	const [error, setError] = useState('');
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

	const getFallbackImage = (templateId: number) => {
		const numStr = String(templateId).padStart(2, '0');
		const map: Record<string, string> = {
			'01': '01-tweet.png',
			'02': '02-resena-5-estrellas.png',
			'03': '03-muro-de-resenas.png',
			'04': '04-captura-de-whatsapp.png',
			'05': '05-comentario-destacado.png',
			'06': '06-antes-y-despues.png',
			'07': '07-testimonial-con-rostro.png',
			'08': '08-dm-queda-stock.png',
			'09': '09-contador-social.png',
			'10': '10-como-se-vio-en.png',
			'11': '11-review-de-marketplace.png',
			'12': '12-ugc-con-producto-en-mano.png',
			'13': '13-precio-tachado.png',
			'14': '14-bundle-kit.png',
			'15': '15-fecha-limite.png',
			'16': '16-regalo-con-la-compra.png',
			'17': '17-2x1-3x2.png',
			'18': '18-envio-gratis.png',
			'19': '19-cupon-visual.png',
			'20': '20-escalera-de-precio.png',
			'21': '21-sello-de-garantia.png',
			'22': '22-cuotas-sin-interes.png',
			'23': '23-nosotros-vs-ellos.png',
			'24': '24-lado-a-lado.png',
			'25': '25-comparacion-de-costo.png',
			'26': '26-pagas-x-recibis-y.png',
			'27': '27-checklist-de-compra.png',
			'28': '28-composicion-comparada.png',
			'29': '29-con-vs-sin.png',
			'30': '30-listicle.png',
			'31': '31-estadistica-brutal.png',
			'32': '32-mito-vs-realidad.png',
			'33': '33-diagrama-senalado.png',
			'34': '34-pregunta-directa.png',
			'35': '35-meme.png',
			'36': '36-comic.png',
			'37': '37-si-no.png',
			'38': '38-definicion.png',
			'39': '39-nota-manuscrita.png',
			'40': '40-hero-limpio.png',
			'41': '41-features-senaladas.png',
			'42': '42-lifestyle-en-uso.png',
			'43': '43-despiece.png',
			'44': '44-escala-real.png',
			'45': '45-paso-a-paso-1-2-3.png',
			'46': '46-que-viene-en-la-caja.png',
			'47': '47-secuencia-de-3-frames.png',
			'48': '48-aval-de-experto.png',
			'49': '49-sellos-y-certificaciones.png',
			'50': '50-carta-del-fundador.png',
		};
		const file = map[numStr] || '40-hero-limpio.png';
		return `/images/creattia/reference-library/${file}`;
	};

	// Admin form states
	const [showAddModal, setShowAddModal] = useState(false);
	const [newAdName, setNewAdName] = useState('');
	const [newAdCopy, setNewAdCopy] = useState('');
	const [newAdTemplateId, setNewAdTemplateId] = useState('40'); // default hero
	const [newAdFile, setNewAdFile] = useState<File | null>(null);
	const [submitting, setSubmitting] = useState(false);

	// Interactive generation modal states
	const [activeAd, setActiveAd] = useState<WinnerItem | null>(null);
	const [currentSlide, setCurrentSlide] = useState(0);
	const [urlList, setUrlList] = useState<string[]>(['']); // dynamic multi-URL fields
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
	// Saved products (loaded from Supabase once)
	const [savedProducts, setSavedProducts] = useState<any[]>([]);
	const [savedProductsLoaded, setSavedProductsLoaded] = useState(false);
	const [selectedSavedProduct, setSelectedSavedProduct] = useState<any | null>(null);
	// Custom instructions for re-generation
	const [customInstructions, setCustomInstructions] = useState('');
	const [showCustomInstructions, setShowCustomInstructions] = useState(false);

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

	// Load saved products from Supabase once when modal opens
	const loadSavedProducts = async () => {
		if (savedProductsLoaded || !isSupabaseConfigured || !supabase) return;
		try {
			const { data, error } = await supabase
				.from('creative_products')
				.select('id,name,description,image_path,source_image_url,analysis')
				.order('created_at', { ascending: false })
				.limit(20);
			if (!error && data) {
				setSavedProducts(data);
			}
		} catch {}
		setSavedProductsLoaded(true);
	};

	const handleUseIdea = (item: WinnerItem) => {
		setActiveAd(item);
		setCurrentSlide(0);
		setUrlList(['']); // reset to single empty URL field
		setManualFiles([]);
		setManualDesc('');
		setIsUrlMode(true);
		setScanning(false);
		setScannedOptions([]);
		setSelectedOptions([]);
		setFidelity(3);
		setGeneratedResult('');
		setGenerationError('');
		setSelectedSavedProduct(null);
		setCustomInstructions('');
		setShowCustomInstructions(false);
		// Load saved products when opening modal
		void loadSavedProducts();
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const filesArr = Array.from(e.target.files).slice(0, 5);
			setManualFiles(filesArr);
		}
	};

	const handleScanUrls = async () => {
		const validUrls = urlList.map(u => normalizeProductUrl(u)).filter(Boolean);
		if (!validUrls.length) return;
		setScanning(true);
		setGenerationError('');
		setSelectedSavedProduct(null);
		try {
			if (!isSupabaseConfigured || !supabase) {
				await new Promise(resolve => setTimeout(resolve, 1500));
				const options: string[] = [];
				validUrls.forEach((url, i) => {
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
				for (const normalizedUrl of validUrls.slice(0, 5)) {
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
					.select('id,name,description,image_path,analysis')
					.in('id', ids);
				
				if (!dbErr && prodData?.length) {
					// Auto-select the first scanned product
					setSelectedSavedProduct(prodData[0]);
					// Refresh saved products list to include newly saved
					const { data: allProds } = await supabase
						.from('creative_products')
						.select('id,name,description,image_path,source_image_url,analysis')
						.order('created_at', { ascending: false })
						.limit(20);
					if (allProds) setSavedProducts(allProds);

					// Generate dynamic options based on product analysis
					const prod = prodData[0];
					const analysis = prod.analysis || {};
					const productName = prod.name || 'el producto';
					const options: string[] = [];
					
					if (analysis.mainBenefit || analysis.benefit) options.push(`Destacar el beneficio principal: ${analysis.mainBenefit || analysis.benefit}`);
					if (analysis.price || analysis.priceText) options.push(`Mostrar el precio: ${analysis.price || analysis.priceText}`);
					if (analysis.socialProof || analysis.reviews) options.push(`Incluir reseña de cliente real (${analysis.socialProof || '⭐⭐⭐⭐⭐'})`);
					if (analysis.problem) options.push(`Mostrar el problema que resuelve ${productName}`);
					if (analysis.beforeAfter) options.push(`Comparación antes/después con ${productName}`);
					options.push(`Mostrar el producto principal (${productName})`);
					if (prod.description) options.push(`Destacar características de (${productName})`);
					options.push("Enfatizar los colores y el logotipo de mi marca");
					options.push("Urgencia / Oferta por tiempo limitado");
					if (analysis.ingredients || analysis.specs) options.push(`Mostrar ingredientes o especificaciones de ${productName}`);
					
					setScannedOptions(options.slice(0, 6));
					setSelectedOptions([options[0]]);
				} else {
					validUrls.forEach((_, i) => {
						const options = [`Mostrar el producto principal (Producto ${i+1})`];
						setScannedOptions(options);
						setSelectedOptions([options[0]]);
					});
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
			// Extract the templateId from the imagePath prefix (e.g. "40/abc123.webp" → 40)
			const pathPrefixId = parseInt(activeAd.imagePath.split('/')[0], 10);
			const templateId = !isNaN(pathPrefixId) ? pathPrefixId : (activeAd.templateId || 40);
			const creative = creativeCatalog.find(c => c.id === templateId) || creativeCatalog.find(c => c.id === activeAd.templateId) || creativeCatalog[0];
			
			form.set('templateId', String(templateId));
			form.set('templateName', creative?.nombre || activeAd.name || 'Anuncio Ganador');
			form.set('purpose', creative?.sirve || 'Crear un anuncio de alto rendimiento inspirado en el diseño de referencia');
			form.set('usageHint', creative?.cuando || 'Cuando querés inspirarte en un anuncio ganador');
			form.set('format', 'square');
			form.set('imageType', 'promotion'); // always 'promotion' so no product is required
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
				// If a saved product is selected, use its info
				if (selectedSavedProduct) {
					const sp = selectedSavedProduct;
					const analysis = sp.analysis || {};
					briefText = `PRODUCTO SELECCIONADO: ${sp.name}. `;
					if (sp.description) briefText += `Descripción: ${sp.description}. `;
					if (analysis.mainBenefit) briefText += `Beneficio principal: ${analysis.mainBenefit}. `;
					if (analysis.price) briefText += `Precio: ${analysis.price}. `;
					// Also pass the product ID so the backend can fetch the product image
					form.set('productIds', sp.id);
				} else {
					const validUrls = urlList.map(u => normalizeProductUrl(u)).filter(Boolean);
					if (validUrls.length > 0) briefText = `URLs de referencia del producto: ${validUrls.join(', ')}. `;
				}
				if (selectedOptions.length) {
					briefText += `Enfoque publicitario seleccionado: ${selectedOptions.join(' · ')}. `;
				}
			} else {
				briefText = `Descripción del producto/servicio: ${manualDesc}. `;
				if (manualFiles.length) {
					form.append('product', manualFiles[0]);
				}
			}
			
			// Add custom instructions if provided
			if (customInstructions.trim()) {
				briefText += `\n\nINSTRUCCIONES ADICIONALES DEL USUARIO: ${customInstructions.trim()}`;
			}
			
			const fidelityInstructions: Record<number, string> = {
				1: 'ART DIRECTION STYLE: SUPER FAITHFUL TO THE REFERENCED DESIGN. Preserve visual structure, color choices, card positions, typography framing, and exact layout composition of the reference image as closely as possible.',
				2: 'ART DIRECTION STYLE: BRAND IDENTITY INTEGRATION. Use the brand logo and colors (Primary, Secondary) to style the background and text overlays, blending them with the reference layout.',
				3: 'ART DIRECTION STYLE: OPTIMIZED HYBRID. Merge the visual elements of the winning reference layout with the brand aesthetics in a high-performing composition.'
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
							title: activeAd.name,
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
			// Deduplicate by imagePath — keep only first occurrence of each unique image
			const seen = new Set<string>();
			const deduped = classified.filter(item => {
				if (!item.imagePath || seen.has(item.imagePath)) return false;
				seen.add(item.imagePath);
				return true;
			});
			setItems(deduped);
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

	useEffect(() => {
		if (preselectedWinnerPath && items.length > 0) {
			const match = items.find(item => item.imagePath === preselectedWinnerPath);
			if (match) {
				handleUseIdea(match);
			}
			if (onClearPreselectedWinner) onClearPreselectedWinner();
		}
	}, [preselectedWinnerPath, items]);

	// Extract unique niches
	const availableNiches = useMemo(() => {
		const nichesSet = new Set<string>();
		items.forEach(item => {
			if (item.metadata?.foreplayNiches && Array.isArray(item.metadata.foreplayNiches)) {
				item.metadata.foreplayNiches.forEach((n: string) => {
					if (n && n.trim()) nichesSet.add(n.trim());
				});
			}
		});
		return ['todos', ...Array.from(nichesSet).sort()];
	}, [items]);

	// Filter items
	const filteredItems = useMemo(() => {
		return items.filter(item => {
			// Category filter
			const matchesCategory = activeCategory === 'guardados'
				? (item.imagePath ? likedScrapedPaths.has(item.imagePath) : favorites.has(item.templateId))
				: (activeCategory === 'todos' || item.category === activeCategory);

			// Niche filter
			const matchesNiche = activeNiche === 'todos' || 
				(item.metadata?.foreplayNiches && Array.isArray(item.metadata.foreplayNiches) && item.metadata.foreplayNiches.includes(activeNiche));

			// Search query filter
			const search = query.toLowerCase().trim();
			const matchesSearch = !search || 
				item.name.toLowerCase().includes(search) || 
				(item.promptNotes || '').toLowerCase().includes(search) ||
				(item.categoryLeaf || '').toLowerCase().includes(search) ||
				(item.tags || []).some(t => t.toLowerCase().includes(search));

			return matchesCategory && matchesNiche && matchesSearch;
		});
	}, [items, activeCategory, activeNiche, query, likedScrapedPaths, favorites]);

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

			{/* Niche filter rail */}
			{availableNiches.length > 1 && (
				<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', overflowX: 'auto', paddingBottom: '8px', borderBottom: '1px solid #f3eff6' }}>
					<span style={{ fontSize: '11px', fontWeight: 800, color: '#918b95', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
						🔍 Filtrar por Nicho:
					</span>
					<div style={{ display: 'flex', gap: '8px' }}>
						{availableNiches.map(niche => (
							<button 
								key={niche}
								onClick={() => setActiveNiche(niche)}
								style={{
									height: '28px',
									padding: '0 12px',
									borderRadius: '14px',
									border: activeNiche === niche ? '1.5px solid #a25df7' : '1.5px solid #e9e6ed',
									background: activeNiche === niche ? '#fcfbfe' : '#fff',
									color: activeNiche === niche ? '#a25df7' : '#716d79',
									fontSize: '11.5px',
									fontWeight: activeNiche === niche ? 800 : 600,
									cursor: 'pointer',
									whiteSpace: 'nowrap',
									transition: 'all 0.15s'
								}}
							>
								{niche === 'todos' ? 'Todos los nichos' : niche}
							</button>
						))}
					</div>
				</div>
			)}

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
						const hasFailed = item.imagePath ? failedImages.has(item.imagePath) : false;
						const imageUrl = hasFailed 
							? getFallbackImage(item.templateId)
							: (supabase 
								? supabase.storage.from('creative-references').getPublicUrl(item.imagePath).data.publicUrl
								: `https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${item.imagePath}`);

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
											if (item.imagePath && onToggleLikedScraped) {
												onToggleLikedScraped(item.imagePath);
											} else if (onToggleFavorite) {
												onToggleFavorite(item.templateId);
											}
										}}
										style={{ 
											position: 'absolute',
											top: '10px',
											right: '10px',
											zIndex: 4,
											border: 0,
											background: 'rgba(255,255,255,0.85)',
											color: (item.imagePath ? likedScrapedPaths.has(item.imagePath) : favorites.has(item.templateId)) ? '#ff4185' : '#716d79',
											borderRadius: '50%',
											width: '30px',
											height: '30px',
											display: 'grid',
											placeItems: 'center',
											cursor: 'pointer',
											boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
											outline: 0
										}}
										title={(item.imagePath ? likedScrapedPaths.has(item.imagePath) : favorites.has(item.templateId)) ? "Quitar de guardados" : "Guardar idea"}
									>
										<Icon name="heart" size={15} fill={(item.imagePath ? likedScrapedPaths.has(item.imagePath) : favorites.has(item.templateId)) ? '#ff4185' : 'none'} />
									</button>
									
									{/* Carousel Badge */}
									{(item.metadata?.mediaType === 'carousel' || item.metadata?.carouselImages?.length > 0) && (
										<div 
											style={{
												position: 'absolute',
												top: '10px',
												left: '10px',
												zIndex: 4,
												background: 'rgba(25, 23, 29, 0.75)',
												backdropFilter: 'blur(4px)',
												color: '#fff',
												borderRadius: '6px',
												padding: '4px 8px',
												fontSize: '9px',
												fontWeight: 700,
												display: 'flex',
												alignItems: 'center',
												gap: '4px'
											}}
										>
											<Icon name="layers" size={10} />
											{item.metadata.carouselImages ? `${item.metadata.carouselImages.length} PÁGS` : 'CARRUSEL'}
										</div>
									)}

									<img 
										src={imageUrl} 
										alt={item.name} 
										style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }} 
										loading="lazy" 
										onError={() => {
											if (item.imagePath && !failedImages.has(item.imagePath)) {
												setFailedImages(prev => {
													const next = new Set(prev);
													next.add(item.imagePath);
													return next;
												});
											}
										}}
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
					onClick={() => setActiveAd(null)}
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
						onClick={(e) => e.stopPropagation()}
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
						<header style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', borderBottom: '1px solid #f3eff6', paddingBottom: '14px' }}>
							{/* Reference image thumbnail */}
							{activeAd.imagePath && (
								<div style={{ width: '60px', height: '60px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, border: '2px solid #ede8f2', background: '#f5f3f8' }}>
									<img 
										src={`https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${activeAd.imagePath}`}
										alt=""
										style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
									onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
									/>
								</div>
							)}
							<div style={{ flex: 1 }}>
								<h3 style={{ margin: 0, fontSize: '17px', color: '#19171d', fontWeight: 800 }}>
									Crear con este diseño
								</h3>
								<p style={{ margin: '2px 0 0', fontSize: '12px', color: '#716d79' }}>
									Referencia: <strong>{activeAd.name}</strong>
								</p>
							</div>
							<button 
								onClick={() => setActiveAd(null)}
								style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: '6px', color: '#716d79', flexShrink: 0 }}
							>
								<Icon name="close" size={20} />
							</button>
						</header>

						{generating ? (
							<div style={{ textAlign: 'center', padding: '40px 0' }}>
								<span className="studio-spinner" style={{ width: '40px', height: '40px', margin: '0 auto 20px' }} />
								<h4 style={{ fontSize: '16px', fontWeight: 800, color: '#19171d', marginBottom: '8px' }}>Creattia está generando tu anuncio...</h4>
								<p style={{ fontSize: '13px', color: '#716d79' }}>Esto puede demorar hasta 30 segundos. ¡No cierres el modal!</p>
							</div>
						) : generatedResult ? (
							<div style={{ padding: '10px 0' }}>
								<div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '20px' }}>
									{/* Reference mini */}
									<div style={{ flexShrink: 0 }}>
										<p style={{ fontSize: '10px', color: '#918b95', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase' }}>Referencia</p>
										<div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e9e6ed' }}>
											<img src={`https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${activeAd.imagePath}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
										</div>
									</div>
									{/* Generated result */}
									<div style={{ flex: 1 }}>
										<p style={{ fontSize: '10px', color: '#918b95', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase' }}>Tu anuncio</p>
										<div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e9e6ed', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>
											<img src={generatedResult} alt="Resultado" style={{ width: '100%', height: 'auto', display: 'block' }} />
										</div>
									</div>
								</div>

								{/* Custom instructions for re-generation */}
								<div style={{ marginBottom: '14px' }}>
									<textarea
										value={customInstructions}
										onChange={(e) => setCustomInstructions(e.target.value)}
										placeholder="Da indicaciones para mejorar (ej: 'usá fondo azul', 'agrandá el texto', 'agrega precio $99')…"
										style={{ width: '100%', minHeight: '64px', padding: '10px 12px', border: '1px solid #d8d3e0', borderRadius: '10px', resize: 'vertical', fontSize: '13px', outline: 0, fontFamily: 'inherit', boxSizing: 'border-box' }}
									/>
								</div>

								<div style={{ display: 'flex', gap: '10px' }}>
									<button 
										onClick={() => { setGeneratedResult(''); void handleGenerateFromModal(); }}
										className="studio-primary-button"
										style={{ flex: 1, height: '44px', background: 'var(--holo-gradient)' }}
									>
										{customInstructions.trim() ? '↺ Regenerar con indicaciones' : '↺ Crear otra versión'}
									</button>
									<a 
										href={generatedResult} 
										download="anuncio-creattia.png" 
										target="_blank" 
										rel="noreferrer"
										className="studio-primary-button" 
										style={{ textDecoration: 'none', height: '44px', padding: '0 20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#19171d' }}
									>
										<Icon name="download" size={16} />
										Descargar
									</a>
								</div>
							</div>
						) : onboardingShow ? (
							<div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
								<div style={{ textAlign: 'center', marginBottom: '10px' }}>
									<h4 style={{ fontSize: '16px', fontWeight: 800, color: '#19171d', margin: 0 }}>⚙️ Configuración de tu Marca (Opcional)</h4>
									<p style={{ fontSize: '12px', color: '#716d79', margin: '4px 0 0' }}>Completá estos datos una sola vez para que Creattia personalice tus anuncios.</p>
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
								{(() => {
									const slides = (activeAd.metadata?.carouselImages && activeAd.metadata.carouselImages.length > 0)
										? activeAd.metadata.carouselImages
										: [activeAd.imagePath];

									return (
										<div style={{ marginBottom: '24px' }}>
											<p style={{ fontSize: '11px', fontWeight: 800, color: '#918b95', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
												🎨 Diseño de Referencia ({slides.length} {slides.length === 1 ? 'imagen' : 'imágenes'})
											</p>
											<div style={{ position: 'relative', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e9e6ed', background: '#f8f6fb', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
												<div style={{ width: '100%', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
													<img 
														src={`https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${slides[currentSlide]}`} 
														alt="" 
														style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', display: 'block' }}
													/>

													{/* Left Arrow */}
													{slides.length > 1 && (
														<button 
															type="button"
															onClick={() => setCurrentSlide(prev => (prev === 0 ? slides.length - 1 : prev - 1))}
															style={{
																position: 'absolute',
																left: '12px',
																top: '50%',
																transform: 'translateY(-50%)',
																width: '32px',
																height: '32px',
																borderRadius: '50%',
																background: 'rgba(255,255,255,0.9)',
																border: '1px solid #e9e6ed',
																boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
																cursor: 'pointer',
																display: 'grid',
																placeItems: 'center',
																color: '#19171d',
																zIndex: 5
															}}
														>
															<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
																<polyline points="15 18 9 12 15 6" />
															</svg>
														</button>
													)}

													{/* Right Arrow */}
													{slides.length > 1 && (
														<button 
															type="button"
															onClick={() => setCurrentSlide(prev => (prev === slides.length - 1 ? 0 : prev + 1))}
															style={{
																position: 'absolute',
																right: '12px',
																top: '50%',
																transform: 'translateY(-50%)',
																width: '32px',
																height: '32px',
																borderRadius: '50%',
																background: 'rgba(255,255,255,0.9)',
																border: '1px solid #e9e6ed',
																boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
																cursor: 'pointer',
																display: 'grid',
																placeItems: 'center',
																color: '#19171d',
																zIndex: 5
															}}
														>
															<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
																<polyline points="9 18 15 12 9 6" />
															</svg>
														</button>
													)}
												</div>

												{/* Dots indicator */}
												{slides.length > 1 && (
													<div style={{ display: 'flex', gap: '6px', padding: '12px 0', justifyContent: 'center' }}>
														{slides.map((_, i) => (
															<div 
																key={i} 
																style={{
																	width: '6px',
																	height: '6px',
																	borderRadius: '50%',
																	background: currentSlide === i ? '#a25df7' : '#d8d3e0',
																	transition: 'background-color 0.2s'
																}}
															/>
														))}
													</div>
												)}
											</div>
										</div>
									);
								})()}

								{/* Step 1: Input URLs or manual details */}
								{/* ── Saved products quick-select ── */}
								{savedProducts.length > 0 && (
									<div style={{ marginBottom: '16px' }}>
										<p style={{ fontSize: '12px', fontWeight: 800, color: '#19171d', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
											🗂 Productos guardados
										</p>
										<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
											{savedProducts.map(sp => (
												<button
													key={sp.id}
													type="button"
													onClick={() => {
														if (selectedSavedProduct?.id === sp.id) {
															setSelectedSavedProduct(null);
														} else {
															setSelectedSavedProduct(sp);
															setScannedOptions([]);
															setSelectedOptions([]);
														}
													}}
													style={{
														height: '32px',
														padding: '0 12px',
														border: selectedSavedProduct?.id === sp.id ? '2px solid #7c3aed' : '1px solid #ddd',
														borderRadius: '20px',
														background: selectedSavedProduct?.id === sp.id ? '#f3ecff' : '#f8f6fb',
														color: selectedSavedProduct?.id === sp.id ? '#7c3aed' : '#4b4452',
														fontWeight: 700,
														cursor: 'pointer',
														fontSize: '12px',
														transition: 'all 0.15s',
													}}
												>
													{sp.name || 'Producto'}
												</button>
											))}
										</div>
										{selectedSavedProduct && (
											<div style={{ marginTop: '10px', padding: '10px 12px', background: '#f8f6fb', borderRadius: '10px', border: '1px solid #e9e6ed' }}>
												<p style={{ margin: 0, fontSize: '12px', color: '#716d79' }}>
													<strong style={{ color: '#19171d' }}>{selectedSavedProduct.name}</strong>
													{selectedSavedProduct.description && ` — ${selectedSavedProduct.description.slice(0, 80)}...`}
												</p>
											</div>
										)}
										<div style={{ height: '1px', background: '#f0ecf5', margin: '16px 0' }} />
									</div>
								)}

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
									<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
										<label style={{ fontSize: '13px', fontWeight: 'bold', color: '#19171d' }}>
											URLs de tu producto o página (hasta 5)
										</label>
										{urlList.map((url, idx) => (
											<div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
												<input 
													type="url"
													value={url}
													onChange={(e) => {
														const next = [...urlList];
														next[idx] = e.target.value;
														setUrlList(next);
													}}
													placeholder={idx === 0 ? 'https://tutienda.com/producto' : `URL ${idx + 1} (opcional)`}
													style={{ flex: 1, height: '42px', padding: '0 12px', border: '1px solid #aaa4b0', borderRadius: '10px', outline: 0, fontSize: '14px' }}
												/>
												{urlList.length > 1 && (
													<button
														type="button"
														onClick={() => setUrlList(urlList.filter((_, i) => i !== idx))}
														style={{ width: '34px', height: '34px', border: '1px solid #e9e6ed', borderRadius: '8px', background: '#fff', cursor: 'pointer', color: '#716d79', display: 'grid', placeItems: 'center', flexShrink: 0 }}
													>
														<Icon name="close" size={14} />
													</button>
												)}
											</div>
										))}
										{urlList.length < 5 && (
											<button
												type="button"
												onClick={() => setUrlList([...urlList, ''])}
												style={{ alignSelf: 'flex-start', height: '34px', padding: '0 14px', border: '1px dashed #a25df7', borderRadius: '8px', background: 'transparent', color: '#a25df7', cursor: 'pointer', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
											>
												<Icon name="plus" size={14} /> Agregar URL
											</button>
										)}
										<button 
											type="button" 
											onClick={handleScanUrls}
											disabled={scanning || !urlList.some(u => u.trim())}
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
											{ id: 3, title: '3. Híbrido optimizado (Recomendado)', desc: 'Creattia combina el ganador con tu marca.' }
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

