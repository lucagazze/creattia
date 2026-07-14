import { creativos, type Creativo } from '../../data/creativos50';

export type ReferencePreset = {
	id: string;
	name: string;
	description: string;
	label: string;
};

export const referencePresets: ReferencePreset[] = [
	{
		id: 'fiel',
		name: 'Fiel a la referencia',
		description: 'Conserva la estructura y cambia solo tu marca y producto.',
		label: 'Más fiel',
	},
	{
		id: 'impacto',
		name: 'Más impacto',
		description: 'Aumenta el contraste y hace protagonista la oferta.',
		label: 'Más llamativa',
	},
	{
		id: 'marca',
		name: 'Más marca',
		description: 'Prioriza tus colores, tu estilo y el reconocimiento de marca.',
		label: 'Más identidad',
	},
];

export const ringMeta: Record<string, { label: string; short: string; accent: string }> = {
	social: { label: 'Prueba social', short: 'Social', accent: '#7c3aed' },
	oferta: { label: 'Oferta', short: 'Oferta', accent: '#ea580c' },
	educativo: { label: 'Educativo', short: 'Educa', accent: '#0284c7' },
	demo: { label: 'Producto', short: 'Producto', accent: '#059669' },
	vs: { label: 'Comparación', short: 'VS', accent: '#dc2626' },
	autoridad: { label: 'Autoridad', short: 'Autoridad', accent: '#ca8a04' },
};

export const creativeCatalog: Creativo[] = creativos;

export type CatalogLeaf = { id: string; label: string; templateIds: number[] };
export type CatalogBranch = { id: string; label: string; leaves: CatalogLeaf[] };
export type CatalogGroup = { id: string; label: string; description: string; accent: string; branches: CatalogBranch[] };

export const catalogTaxonomy: CatalogGroup[] = [
	{
		id: 'vender', label: 'Vender más', description: 'Promos y ofertas para impulsar la compra.', accent: '#ea580c', branches: [
			{ id: 'promociones', label: 'Promociones', leaves: [
				{ id: 'precio', label: 'Precio y descuento', templateIds: [13, 19] },
				{ id: 'urgencia', label: 'Urgencia e incentivo', templateIds: [15, 16] },
				{ id: 'envio', label: 'Envío gratis', templateIds: [18] },
			] },
			{ id: 'ticket', label: 'Subir el ticket', leaves: [
				{ id: 'packs', label: 'Packs y volumen', templateIds: [14, 17, 20] },
				{ id: 'financiacion', label: 'Cuotas y financiación', templateIds: [22] },
				{ id: 'garantia', label: 'Garantía', templateIds: [21] },
			] },
		],
	},
	{
		id: 'confianza', label: 'Generar confianza', description: 'Reseñas y pruebas que reducen dudas.', accent: '#7c3aed', branches: [
			{ id: 'clientes', label: 'Lo dicen tus clientes', leaves: [
				{ id: 'resenas', label: 'Reseñas', templateIds: [1, 2, 3, 11] },
				{ id: 'mensajes', label: 'Mensajes y comentarios', templateIds: [4, 5, 8] },
				{ id: 'ugc', label: 'UGC y testimonios', templateIds: [6, 7, 12] },
			] },
			{ id: 'validacion', label: 'Validación externa', leaves: [
				{ id: 'volumen', label: 'Volumen social', templateIds: [9] },
				{ id: 'medios', label: 'Medios y marketplaces', templateIds: [10, 11] },
			] },
		],
	},
	{
		id: 'convencer', label: 'Convencer', description: 'Comparaciones que facilitan la decisión.', accent: '#dc2626', branches: [
			{ id: 'comparar', label: 'Comparar alternativas', leaves: [
				{ id: 'competencia', label: 'Contra la competencia', templateIds: [23, 24] },
				{ id: 'valor', label: 'Valor y costo', templateIds: [25, 26, 27] },
				{ id: 'resultado', label: 'Composición y resultado', templateIds: [28, 29] },
			] },
		],
	},
	{
		id: 'educar', label: 'Educar', description: 'Contenido que explica por qué elegirte.', accent: '#0284c7', branches: [
			{ id: 'descubrir', label: 'Descubrir el problema', leaves: [
				{ id: 'datos', label: 'Datos y preguntas', templateIds: [30, 31, 34, 38] },
				{ id: 'mitos', label: 'Mitos y explicación', templateIds: [32, 33, 37] },
			] },
			{ id: 'contar', label: 'Contar una historia', leaves: [
				{ id: 'entretenimiento', label: 'Meme y cómic', templateIds: [35, 36] },
				{ id: 'cercania', label: 'Nota personal', templateIds: [39] },
			] },
		],
	},
	{
		id: 'producto', label: 'Mostrar producto', description: 'Tu producto claro, atractivo y en contexto.', accent: '#059669', branches: [
			{ id: 'presentar', label: 'Presentación', leaves: [
				{ id: 'hero', label: 'Hero y lifestyle', templateIds: [40, 42, 44] },
				{ id: 'detalle', label: 'Detalle y contenido', templateIds: [41, 43, 46] },
				{ id: 'uso', label: 'Uso y secuencia', templateIds: [45, 47] },
			] },
		],
	},
	{
		id: 'autoridad', label: 'Construir autoridad', description: 'Credenciales e historias que dan respaldo.', accent: '#ca8a04', branches: [
			{ id: 'respaldo', label: 'Respaldo', leaves: [
				{ id: 'expertos', label: 'Expertos y certificaciones', templateIds: [48, 49] },
				{ id: 'fundador', label: 'Historia del fundador', templateIds: [50] },
			] },
		],
	},
];

export function templatePath(creative: Creativo) {
	const normalize = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
	if (creative.categoryGroup) {
		const dynamicGroup = catalogTaxonomy.find((group) => [group.id, group.label].some((value) => normalize(value) === normalize(creative.categoryGroup)));
		const dynamicBranch = dynamicGroup?.branches.find((branch) => [branch.id, branch.label].some((value) => normalize(value) === normalize(creative.categoryBranch)));
		const dynamicLeaf = dynamicBranch?.leaves.find((leaf) => [leaf.id, leaf.label].some((value) => normalize(value) === normalize(creative.categoryLeaf)));
		if (dynamicGroup && dynamicBranch && dynamicLeaf) return { group: dynamicGroup, branch: dynamicBranch, leaf: dynamicLeaf };
	}
	for (const group of catalogTaxonomy) {
		for (const branch of group.branches) {
			for (const leaf of branch.leaves) {
				if (leaf.templateIds.includes(creative.id)) return { group, branch, leaf };
			}
		}
	}
	return null;
}

export function mapTemplateRecord(record: any): Creativo {
	return {
		id: Number(record.id),
		nombre: record.name || 'Creativo',
		ring: record.category || 'demo',
		n: record.awareness_level || 'N3',
		sirve: record.purpose || '',
		cuando: record.usage_hint || '',
		slug: record.slug || undefined,
		categoryGroup: record.category_group || undefined,
		categoryBranch: record.category_branch || undefined,
		categoryLeaf: record.category_leaf || undefined,
		keywords: Array.isArray(record.keywords) ? record.keywords : [],
		featured: Boolean(record.is_featured),
		sortOrder: Number(record.sort_order ?? record.id),
	};
}

export function creativeNumber(id: number) {
	return String(id).padStart(2, '0');
}
