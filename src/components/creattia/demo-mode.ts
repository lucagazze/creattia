import type { Creativo } from '../../data/creativos50';
import { ringMeta } from '../../lib/creattia/catalog';
import type { AppProfile, Product } from './app-types';
import { fileAsDataUrl } from './app-products';

/**
 * Contenido de relleno para cuando Supabase todavía no está configurado: el
 * catálogo de ejemplo y las vistas previas dibujadas en canvas.
 */

export function demoProductArt(label: string, color: string) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720"><rect width="720" height="720" rx="60" fill="#f7f5fb"/><circle cx="520" cy="170" r="190" fill="${color}" opacity=".18"/><rect x="218" y="120" width="284" height="450" rx="64" fill="white" stroke="#e6e0ef" stroke-width="5"/><rect x="258" y="170" width="204" height="250" rx="38" fill="${color}"/><text x="360" y="470" text-anchor="middle" font-family="Arial" font-size="31" font-weight="700" fill="#201a27">${label}</text><text x="360" y="515" text-anchor="middle" font-family="Arial" font-size="20" fill="#8d8495">TU PRODUCTO</text></svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const demoProducts: Product[] = [
	{ id: 'demo-1', name: 'Producto estrella', description: 'El producto principal de tu tienda.', priceText: '$89.900', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('01', '#19171d'), imageUrls: [demoProductArt('01', '#19171d')], imageCount: 1, source: 'website' },
	{ id: 'demo-2', name: 'Nueva colección', description: 'Una segunda opción para probar otro enfoque.', priceText: '$64.500', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('02', '#ea580c'), imageUrls: [demoProductArt('02', '#ea580c')], imageCount: 1, source: 'website' },
	{ id: 'demo-3', name: 'Best seller', description: 'Producto con buena respuesta comercial.', priceText: '$112.000', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('03', '#059669'), imageUrls: [demoProductArt('03', '#059669')], imageCount: 1, source: 'website' },
];

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, radius);
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let line = '';
	words.forEach((word) => {
		const test = line ? `${line} ${word}` : word;
		if (ctx.measureText(test).width > maxWidth && line) {
			lines.push(line);
			line = word;
		} else line = test;
	});
	if (line) lines.push(line);
	return lines;
}

export async function createDemoCreative(options: {
	creative: Creativo;
	profile: AppProfile;
	preset: string;
	format: string;
	brief: string;
	product: File | null;
}) {
	const dims = options.format === 'story' ? [1080, 1920] : options.format === 'portrait' ? [1080, 1350] : options.format === 'landscape' ? [1350, 1080] : [1080, 1080];
	const [width, height] = dims;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas no disponible');

	const impact = options.preset === 'impacto';
	const brandFirst = options.preset === 'marca';
	const bg = impact ? '#17131f' : brandFirst ? options.profile.secondaryColor : '#f3efe7';
	const ink = impact ? '#ffffff' : options.profile.primaryColor;
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, width, height);

	const glow = ctx.createRadialGradient(width * .82, height * .18, 10, width * .82, height * .18, width * .65);
	glow.addColorStop(0, impact ? 'rgba(139,92,246,.42)' : 'rgba(139,92,246,.18)');
	glow.addColorStop(1, 'rgba(139,92,246,0)');
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, width, height);

	const margin = Math.round(width * .075);
	ctx.fillStyle = impact ? '#a78bfa' : '#19171d';
	ctx.font = `700 ${Math.round(width * .022)}px Inter, Arial`;
	ctx.letterSpacing = '2px';
	ctx.fillText(`MODO DEMO  •  ${ringMeta[options.creative.ring]?.label.toUpperCase()}`, margin, margin + 10);
	ctx.letterSpacing = '0px';

	ctx.fillStyle = ink;
	ctx.font = `800 ${Math.round(width * (impact ? .084 : .073))}px Inter, Arial`;
	const headline = options.brief.trim() || options.creative.nombre;
	const headlineLines = wrapText(ctx, headline.toUpperCase(), width * .7).slice(0, 3);
	const headlineY = margin + Math.round(height * .115);
	const lineHeight = Math.round(width * (impact ? .088 : .078));
	headlineLines.forEach((line, index) => ctx.fillText(line, margin, headlineY + index * lineHeight));

	ctx.font = `500 ${Math.round(width * .027)}px Inter, Arial`;
	ctx.fillStyle = impact ? 'rgba(255,255,255,.66)' : 'rgba(24,24,27,.6)';
	const subtitle = options.creative.cuando.split('.')[0] + '.';
	wrapText(ctx, subtitle, width * .57).slice(0, 2).forEach((line, index) => {
		ctx.fillText(line, margin, headlineY + headlineLines.length * lineHeight + 30 + index * Math.round(width * .036));
	});

	const cardW = width * .54;
	const cardH = height * .44;
	const cardX = width - cardW - margin;
	const cardY = height - cardH - margin * .95;
	ctx.save();
	roundedRect(ctx, cardX, cardY, cardW, cardH, 36);
	ctx.fillStyle = impact ? '#f6f3ff' : '#ffffff';
	ctx.shadowColor = 'rgba(20,15,30,.18)';
	ctx.shadowBlur = 38;
	ctx.shadowOffsetY = 18;
	ctx.fill();
	ctx.restore();

	if (options.product) {
		const src = await fileAsDataUrl(options.product);
		const image = new Image();
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error('No se pudo leer el producto'));
			image.src = src;
		});
		const scale = Math.min((cardW * .78) / image.width, (cardH * .76) / image.height);
		const dw = image.width * scale;
		const dh = image.height * scale;
		ctx.drawImage(image, cardX + (cardW - dw) / 2, cardY + (cardH - dh) / 2, dw, dh);
	} else {
		ctx.fillStyle = impact ? '#ddd6fe' : '#ede9fe';
		roundedRect(ctx, cardX + cardW * .18, cardY + cardH * .14, cardW * .64, cardH * .62, 28);
		ctx.fill();
		ctx.fillStyle = '#19171d';
		ctx.font = `700 ${Math.round(width * .032)}px Inter, Arial`;
		ctx.textAlign = 'center';
		ctx.fillText('TU PRODUCTO', cardX + cardW / 2, cardY + cardH * .49);
		ctx.font = `500 ${Math.round(width * .018)}px Inter, Arial`;
		ctx.fillText('o una oferta general', cardX + cardW / 2, cardY + cardH * .58);
		ctx.textAlign = 'left';
	}

	ctx.fillStyle = impact ? '#ffffff' : options.profile.primaryColor;
	ctx.font = `800 ${Math.round(width * .032)}px Inter, Arial`;
	ctx.fillText(options.profile.brandName || 'TU MARCA', margin, height - margin * 1.1);
	ctx.font = `500 ${Math.round(width * .018)}px Inter, Arial`;
	ctx.fillStyle = impact ? 'rgba(255,255,255,.55)' : 'rgba(24,24,27,.5)';
	ctx.fillText('Vista previa local · conectá la IA para producir el anuncio final', margin, height - margin * .62);

	return canvas.toDataURL('image/jpeg', .9);
}
