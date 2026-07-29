import type { Creativo } from '../../data/creativos50';
import type { ScannedProduct } from './catalog-scanner';

export type AdSlotConfig = {
	slots: { name: string; icon: string; description: string }[];
	layoutTemplate: string;
};

// Mapa de requerimientos visuales y blueprint de prompt para cada plantilla de los 50 ganadores
export function getTemplateBlueprint(template: Creativo): AdSlotConfig {
	switch (template.ring) {
		case 'social':
			if (template.id === 1) { // Tweet
				return {
					slots: [
						{ name: 'Foto del Producto', icon: '📷', description: 'Imagen destacada en estudio' },
						{ name: 'Avatar & Usuario', icon: '👤', description: 'Perfil de cliente satisfecho' },
						{ name: 'Tweet / Opinión', icon: '💬', description: 'Frase elogiando el producto' }
					],
					layoutTemplate: 'TWEET_OVERLAY: Modern Twitter/X card with verified avatar, handle, praise tweet quote and likes count overlaid next to the product.'
				};
			}
			if (template.id === 2 || template.id === 3 || template.id === 11) { // Reseña 5 Estrellas / Muro / Marketplace
				return {
					slots: [
						{ name: 'Foto del Producto', icon: '📷', description: 'Producto principal en alta calidad' },
						{ name: '5 Estrellas Doradas', icon: '⭐', description: 'Rating de 5.0 estrellas' },
						{ name: 'Testimonio / Review', icon: '📝', description: 'Cita de comprador verificado' }
					],
					layoutTemplate: 'REVIEW_CARD: Full-width clean testimonial card with 5 golden stars, "Compra Verificada" badge, quote box and product hero shot.'
				};
			}
			if (template.id === 4 || template.id === 8) { // Captura de WhatsApp / DM
				return {
					slots: [
						{ name: 'Foto del Producto', icon: '📷', description: 'Foto real del producto' },
						{ name: 'Burbuja de Chat', icon: '💬', description: 'Mensaje con tildes azules o consulta de stock' }
					],
					layoutTemplate: 'CHAT_BUBBLE: Realistic messaging chat UI snippet (green checkmarks, timestamp) expressing enthusiasm about buying the product.'
				};
			}
			if (template.id === 6) { // Antes y Después
				return {
					slots: [
						{ name: 'Estado Antes', icon: '❌', description: 'Problema o estado previo' },
						{ name: 'Estado Después', icon: '✅', description: 'Resultado final impresionante con tu producto' }
					],
					layoutTemplate: 'BEFORE_AFTER_SPLIT: Vertical or horizontal split screen comparing Before (problem) vs After (stunning transformation with product).'
				};
			}
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Foto principal del producto' },
					{ name: 'Prueba Social', icon: '👥', description: 'Cita o métrica de satisfacción' }
				],
				layoutTemplate: 'SOCIAL_PROOF_HERO: High-converting social proof composition with human element, ratings badge and product showcase.'
			};

		case 'oferta':
			if (template.id === 13) { // Precio Tachado
				return {
					slots: [
						{ name: 'Foto del Producto', icon: '📷', description: 'Producto con iluminación de estudio' },
						{ name: 'Precio Regular (Tachado)', icon: '🏷️', description: 'Precio original' },
						{ name: 'Precio Oferta', icon: '💥', description: 'Precio de descuento en grande' },
						{ name: 'Badge Descuento', icon: '⚡', description: 'Insignia tipo 20% OFF' }
					],
					layoutTemplate: 'PRICE_SCRATCH_PROMO: Strikethrough regular price ($X), bold giant offer price ($Y), discount pill badge (-25% OFF), and prominent product.'
				};
			}
			if (template.id === 14 || template.id === 17) { // Bundle / Kit / 2x1
				return {
					slots: [
						{ name: 'Imágenes del Combo', icon: '📦', description: 'Muestra visual del kit completo' },
						{ name: 'Precio Especial Combo', icon: '💰', description: 'Ahorro al llevar el paquete' }
					],
					layoutTemplate: 'BUNDLE_KIT_DISPLAY: Multi-product combo showcase with "PACK AHORRO", clean breakdown list and total bundle price.'
				};
			}
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto destacado' },
					{ name: 'Llamado a la Oferta', icon: '🔥', description: 'Precio especial o regalo incluido' }
				],
				layoutTemplate: 'LIMITED_OFFER_HERO: Direct-response promo layout with price callouts, urgency banner and bold ecommerce typography.'
			};

		case 'vs':
			return {
				slots: [
					{ name: 'Tu Producto (Ganador)', icon: '✅', description: 'Foto y características superiores' },
					{ name: 'Competencia / Opción Común', icon: '❌', description: 'Alternativas tradicionales o sin marca' },
						{ name: 'Tabla Comparativa', icon: '📊', description: 'Puntos clave con ✔ y ✘' }
				],
				layoutTemplate: 'VS_COMPARISON_TABLE: 2-column comparative table ("Tu Marca" vs "Otras Marcas") with checkmarks ✔ on your side and ✘ on the other side.'
			};

		case 'educativo':
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Vista clara del producto' },
					{ name: '3 Razones o Beneficios', icon: '💡', description: 'Flechas o números con beneficios clave' }
				],
				layoutTemplate: 'INFOGRAPHIC_CALLOUTS: Product centered with numeric pins (1, 2, 3) pointing to key ingredients, features or benefits.'
			};

		case 'demo':
			return {
				slots: [
					{ name: 'Foto de Producto', icon: '📷', description: 'Foto limpia del envase/producto' },
					{ name: 'Modo de Uso / Aplicación', icon: '✨', description: 'Demostración práctica de funcionamiento' }
				],
				layoutTemplate: 'PRODUCT_DEMO_SHOWCASE: In-action demonstration or macro detail shot highlighting texture, usage or build quality.'
			};

		case 'autoridad':
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Presentación premium' },
					{ name: 'Logos / Medios / Expertos', icon: '🎖️', description: 'Sellos de garantía o mensiones en prensa' }
				],
				layoutTemplate: 'AUTHORITY_SEAL: Premium studio presentation featuring "AS SEEN ON" media badges, expert recommendation seal and clean typography.'
			};

		default:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Foto principal' },
					{ name: 'Título & Propuesta', icon: '📝', description: 'Mensaje central de venta' }
				],
				layoutTemplate: 'HIGH_CONVERTING_COMMERCIAL: High-performing ecommerce ad layout with clear visual hierarchy, direct response copy and crisp lighting.'
			};
	}
}

// Construye un prompt hiper-específico combinando el Blueprint de la plantilla y los datos extraídos del producto escaneado
export function buildSpecializedAdPrompt(
	template: Creativo,
	product: Partial<ScannedProduct> & { name: string; description?: string; priceText?: string; currency?: string },
	format: string,
	userBrief?: string
): { prompt: string; blueprint: AdSlotConfig } {
	const blueprint = getTemplateBlueprint(template);

	// Relleno inteligente de slots faltantes
	const rawPrice = product.priceText || '';
	let priceStr = rawPrice;
	let originalPriceStr = '';

	if (rawPrice) {
		const num = parseFloat(rawPrice.replace(/[^0-9.]/g, ''));
		if (!isNaN(num) && num > 0) {
			const origNum = Math.round(num * 1.25);
			const cur = product.currency || '$';
			priceStr = `${cur}${num}`;
			originalPriceStr = `${cur}${origNum}`;
		}
	} else {
		priceStr = 'OFERTA ESPECIAL';
		originalPriceStr = '$99.900';
	}

	const prompt = `Create a high-converting ecommerce static ad creative based on the proven "${template.nombre}" framework.

[AD FRAMEWORK BLUEPRINT]
Template ID: #${template.id} — "${template.nombre}" (Category: ${template.ring.toUpperCase()}, Awareness: ${template.n})
Framework Goal: ${template.sirve}
When to Use: ${template.cuando}

[LAYOUT ENGINE INSTRUCTIONS]
${blueprint.layoutTemplate}

[PRODUCT INFORMATION & SLOTS]
Product Name: "${product.name}"
Product Description: "${product.description || 'Premium high-quality product.'}"
Price: ${priceStr} ${originalPriceStr ? `(Regular Price Strikethrough: ${originalPriceStr})` : ''}
Aspect Ratio / Format: ${format}

[REQUIRED VISUAL SLOTS TO RENDER]
${blueprint.slots.map(s => `- ${s.icon} ${s.name}: ${s.description}`).join('\n')}

[DESIGN & TYPOGRAPHY SPECIFICATIONS]
1. Show the product prominently in realistic studio lighting with razor-sharp edges.
2. Render clean, professional copy in natural Spanish tailored to Latin America / Argentina.
3. Integrate UI overlays matching "${template.nombre}" (e.g. star ratings, verified badges, offer pills, or comparative checkmarks).
4. Maintain high visual contrast, rich typography and modern ecommerce aesthetic.
${userBrief ? `\n[CUSTOM USER DIRECTION]: ${userBrief}` : ''}`;

	return { prompt, blueprint };
}
