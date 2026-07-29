import { creativos, type Creativo } from '../../data/creativos50';
import type { ScannedProduct } from './catalog-scanner';

export type AdSlotConfig = {
	slots: { name: string; icon: string; description: string }[];
	layoutTemplate: string;
};

// Mapa detallado de requerimientos visuales y blueprint de prompt para CADA UNO de los 50 anuncios probados
export function getTemplateBlueprint(template: Creativo): AdSlotConfig {
	switch (template.id) {
		// ---------- PRUEBA SOCIAL (1-12) ----------
		case 1:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Imagen destacada del producto' },
					{ name: 'Avatar & Usuario', icon: '👤', description: 'Perfil de cliente verificado' },
					{ name: 'Tweet / Elogio', icon: '💬', description: 'Texto de tweet elogiando el producto' }
				],
				layoutTemplate: 'TWEET_OVERLAY: Modern Twitter/X card UI with verified avatar, handle (@username), viral praise tweet quote and likes/retweets counter overlaying the studio product photo.'
			};
		case 2:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Foto principal limpia' },
					{ name: '5 Estrellas Doradas', icon: '⭐', description: 'Rating 5.0 estrellas' },
					{ name: 'Testimonio / Reseña', icon: '📝', description: 'Cita con sello "Compra Verificada"' }
				],
				layoutTemplate: 'SINGLE_REVIEW_CARD: Full-width review card with 5 golden stars, customer name, green "Compra Verificada" checkmark, review quote text and product hero shot.'
			};
		case 3:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto al centro' },
					{ name: 'Muro de Reseñas', icon: '⭐', description: 'Grid de 6 a 9 reviews cortas' }
				],
				layoutTemplate: 'REVIEW_WALL_GRID: Mosaic of 6-9 customer star rating badges surrounding the central product, creating a powerful social proof volume effect.'
			};
		case 4:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto en alta calidad' },
					{ name: 'Chat WhatsApp', icon: '💬', description: 'Burbuja de conversación con tildes azules' }
				],
				layoutTemplate: 'WHATSAPP_CHAT_UI: Realistic WhatsApp messaging interface with green header, double blue checkmarks and enthusiasm message from a customer.'
			};
		case 5:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto en uso o estudio' },
					{ name: 'Comentario Red Social', icon: '❤️', description: 'Comentario tipo Instagram/TikTok con likes' }
				],
				layoutTemplate: 'SOCIAL_COMMENT_CARD: Amplified Instagram/TikTok comment bubble overlay with heart icon, like count and user avatar next to the product.'
			};
		case 6:
			return {
				slots: [
					{ name: 'Estado Antes (Problema)', icon: '❌', description: 'Situación o estado previo' },
					{ name: 'Estado Después (Solución)', icon: '✅', description: 'Resultado usando el producto' }
				],
				layoutTemplate: 'BEFORE_AFTER_SPLIT: 50/50 vertical or horizontal split screen showing Before (problem state) vs After (dramatic result after using product).'
			};
		case 7:
			return {
				slots: [
					{ name: 'Foto Rostro Cliente', icon: '🧑', description: 'Rostro humano de cliente feliz' },
					{ name: 'Cita Testimonial', icon: '💬', description: 'Frase entre comillas + nombre' },
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto secundario u en mano' }
				],
				layoutTemplate: 'HUMAN_TESTIMONIAL: Real customer face photo paired with large quote text, customer name and product photo.'
			};
		case 8:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto buscado' },
					{ name: 'Consulta DM Stock', icon: '📩', description: 'Captura de DM preguntando "¿queda stock?"' }
				],
				layoutTemplate: 'INSTAGRAM_DM_STOCK: Instagram Direct Message screenshot asking "Hola! ¿Les queda stock de este producto?", demonstrating high demand and scarcity.'
			};
		case 9:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Cifra Gigante', icon: '🔢', description: 'Ej: +15.000 clientes felices' }
				],
				layoutTemplate: 'GIANT_SOCIAL_COUNTER: Oversized bold stat number ("+15.000 clientes satisfechos en Argentina") over clean product layout.'
			};
		case 10:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto de calidad' },
					{ name: 'Logos de Medios / Prensa', icon: '📰', description: 'Logos "Como se vio en"' }
				],
				layoutTemplate: 'AS_SEEN_ON_PRESS: Premium product hero shot with "COMO SE VIO EN" media logo bar (Forbes, Infobae, Clarin, etc.).'
			};
		case 11:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Badge Marketplace', icon: '🛒', description: 'Reseña de MercadoLibre/Amazon' }
				],
				layoutTemplate: 'MARKETPLACE_REVIEW: MercadoLibre or Amazon verified buyer card format with 5 stars and delivery badge.'
			};
		case 12:
			return {
				slots: [
					{ name: 'Foto POV en Mano', icon: '🤳', description: 'Sosteniendo producto en la mano' },
					{ name: 'Texto Encima', icon: '📝', description: 'Frase auténtica tipo Story' }
				],
				layoutTemplate: 'UGC_HANDHELD_POV: Authentic first-person camera photo holding the product in hand with casual text overlay.'
			};

		// ---------- OFERTA (13-22) ----------
		case 13:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Precio Tachado', icon: '🏷️', description: 'Precio original' },
					{ name: 'Precio Oferta', icon: '💥', description: 'Precio especial gigante' }
				],
				layoutTemplate: 'PRICE_SCRATCH_PROMO: Strikethrough regular price ($X), giant offer price ($Y), discount pill badge (-25% OFF), and product hero.'
			};
		case 14:
			return {
				slots: [
					{ name: 'Fotos del Kit', icon: '📦', description: 'Muestra del combo completo' },
					{ name: 'Precio Kit', icon: '💰', description: 'Precio del pack' }
				],
				layoutTemplate: 'BUNDLE_KIT_DISPLAY: Multi-product combo showcase with "PACK AHORRO" badge, component breakdown and total kit price.'
			};
		case 15:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Contador Urgencia', icon: '⏰', description: 'Fecha o timer de promo' }
				],
				layoutTemplate: 'URGENCY_COUNTDOWN: Promo banner with "SOLO HASTA HOY" / "ÚLTIMAS 24 HS" countdown badge, offer price and product.'
			};
		case 16:
			return {
				slots: [
					{ name: 'Producto Principal', icon: '📷', description: 'Producto a comprar' },
					{ name: 'Regalo Incluido', icon: '🎁', description: 'Bonus o regalo con cinta' }
				],
				layoutTemplate: 'FREE_GIFT_BONUS: Main product hero with highlighted gift item wrapped in a ribbon and "LLEVÁ X DE REGALO" ribbon badge.'
			};
		case 17:
			return {
				slots: [
					{ name: 'Imágenes Multi-unidad', icon: '♊', description: '2 o 3 productos juntos' },
					{ name: 'Badge 2x1 / 3x2', icon: '🔥', description: 'Leyenda de promoción' }
				],
				layoutTemplate: 'MULTI_UNIT_PROMO: 2x1 or 3x2 volume offer banner displaying multiple units side by side with "LLEVÁ 2 PAGÁ 1".'
			};
		case 18:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Badge Envío Gratis', icon: '🚚', description: 'Camión o insigina de envío' }
				],
				layoutTemplate: 'FREE_SHIPPING_PROMO: Product presentation with bold "ENVÍO GRATIS A TODO EL PAÍS" truck icon and delivery promise.'
			};
		case 19:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Código de Cupón', icon: '✂️', description: 'Cupón punteado (ej: PROMO20)' }
				],
				layoutTemplate: 'VISUAL_COUPON_CARD: Voucher card format with dashed borders, coupon code (e.g. DESCUENTO20) and % OFF badge.'
			};
		case 20:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Escala de Precios', icon: '📊', description: '1 ud vs 2 uds vs 3 uds' }
				],
				layoutTemplate: 'PRICE_TIER_TABLE: Tiered pricing grid showing 1 Unit = $X, 2 Units = $Y/ea, 3 Units = $Z/ea (BEST VALUE highlight).'
			};
		case 21:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Sello de Garantía', icon: '🛡️', description: 'Garantía 30 días' }
				],
				layoutTemplate: 'GUARANTEE_SEAL_PROMO: Golden guarantee badge ("GARANTÍA 30 DÍAS - SATISFACCIÓN O DEVOLUCIÓN DE DINERO") next to product.'
			};
		case 22:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Badge Cuotas', icon: '💳', description: 'Cuotas sin interés' }
				],
				layoutTemplate: 'INSTALLMENT_PROMO: Installment pricing highlight ("3 Y 6 CUOTAS SIN INTERÉS") displaying low monthly payment figure.'
			};

		// ---------- COMPARACIÓN (23-29) ----------
		case 23:
			return {
				slots: [
					{ name: 'Tu Marca', icon: '✅', description: 'Columna con tildes verdes' },
					{ name: 'Otras Marcas', icon: '❌', description: 'Columna con cruces rojas' }
				],
				layoutTemplate: 'VS_COMPARISON_TABLE: 2-column comparative table ("Tu Marca" vs "Otras Marcas") with green checkmarks ✔ on your side and red ✘ on the other.'
			};
		case 24:
			return {
				slots: [
					{ name: 'Tu Producto', icon: '✨', description: 'Foto alta calidad' },
					{ name: 'Alternativa Común', icon: '📉', description: 'Producto mediocre' }
				],
				layoutTemplate: 'SIDE_BY_SIDE_PHOTO: Side-by-side photo comparison pitting your premium product against a cheap alternative.'
			};
		case 25:
			return {
				slots: [
					{ name: 'Costo Tu Producto', icon: '💡', description: 'Inversión única o mensual baja' },
					{ name: 'Costo Alternativa Cara', icon: '💸', description: 'Gasto acumulado recurrente' }
				],
				layoutTemplate: 'COST_COMPARISON: Financial comparison showing what the customer pays today vs how much your product saves them.'
			};
		case 26:
			return {
				slots: [
					{ name: 'Precio Invertido', icon: '💵', description: 'Monto pagado' },
					{ name: 'Pila de Valor', icon: '🎁', description: 'Todo lo que incluye el pack' }
				],
				layoutTemplate: 'PAY_X_RECEIVE_Y: Split value equation showing price paid on left vs huge stack of deliverables/items received on right.'
			};
		case 27:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Checklist de 5 Criterios', icon: '📋', description: 'Puntos indispensables' }
				],
				layoutTemplate: 'BUYING_CHECKLIST: "5 Cosas que tenés que mirar antes de comprar X" checklist with green ticks on features your product delivers.'
			};
		case 28:
			return {
				slots: [
					{ name: 'Tus Ingredientes', icon: '🌿', description: 'Ingredientes puros' },
					{ name: 'Ingredientes Genéricos', icon: '⚠️', description: 'Rellenos o químicos' }
				],
				layoutTemplate: 'INGREDIENT_COMPARISON: Pure ingredient breakdown vs cheap chemical fillers used in generic options.'
			};
		case 29:
			return {
				slots: [
					{ name: 'Con Tu Producto', icon: '🌟', description: 'Día 30 con resultados' },
					{ name: 'Sin Tu Producto', icon: '🌀', description: 'Mismo problema continuo' }
				],
				layoutTemplate: 'WITH_VS_WITHOUT: Customer journey timeline showing life with your product vs without your product.'
			};

		// ---------- EDUCATIVO (30-39) ----------
		case 30:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Solución' },
					{ name: 'Lista de 5 Errores', icon: '🔢', description: 'Errores comunes a evitar' }
				],
				layoutTemplate: 'LISTICLE_ERRORS: "5 Errores que están arruinando tu X" numbered list presentation leading to your product.'
			};
		case 31:
			return {
				slots: [
					{ name: 'Estadística Impactante', icon: '📊', description: 'Ej: 78% de la gente...' },
					{ name: 'Solución del Producto', icon: '💡', description: 'Explicación corta' }
				],
				layoutTemplate: 'SHOCKING_STATISTIC: Oversized statistical percentage ("El 78% sufre de X sin saberlo") leading to your product solution.'
			};
		case 32:
			return {
				slots: [
					{ name: 'Mito Falso', icon: '❌', description: 'Creencia popular errónea' },
					{ name: 'Realidad Verdadera', icon: '✅', description: 'Verdad demostrada' }
				],
				layoutTemplate: 'MYTH_VS_REALITY: Red "MITO: X" box vs Green "REALIDAD: Y" box with product showcase.'
			};
		case 33:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto centrado' },
					{ name: 'Líneas y Flechas', icon: '🎯', description: 'Puntos explicativos 1, 2, 3' }
				],
				layoutTemplate: 'INFOGRAPHIC_CALLOUTS: Product centered with numbered pins (1, 2, 3) pointing to key ingredients, features or benefits.'
			};
		case 34:
			return {
				slots: [
					{ name: 'Pregunta de Empatía', icon: '❓', description: '¿Te pasa esto?' },
					{ name: 'Foto del Producto', icon: '📷', description: 'Respuesta al dolor' }
				],
				layoutTemplate: 'DIRECT_QUESTION_HOOK: High-empathy question headline ("¿Te cuesta trabajo X?") leading straight into the product.'
			};
		case 35:
			return {
				slots: [
					{ name: 'Plantilla Meme', icon: '🎭', description: 'Meme reconocible' },
					{ name: 'Remate / Producto', icon: '😄', description: 'Situación cotidiana' }
				],
				layoutTemplate: 'MARKETING_MEME: Relatable meme format adapted for brand products with humor and high shareability.'
			};
		case 36:
			return {
				slots: [
					{ name: 'Viñetas de Cómic', icon: '🎨', description: '4 cuadros ilustrados' }
				],
				layoutTemplate: 'COMIC_STORYBOARD: 4-panel comic strip (Problem -> Failed Attempt -> Discovery -> Resolution with product).'
			};
		case 37:
			return {
				slots: [
					{ name: 'SÍ Hacer', icon: '🟢', description: 'Práctica recomendada' },
					{ name: 'NO Hacer', icon: '🔴', description: 'Práctica errónea' }
				],
				layoutTemplate: 'DO_VS_DONT: Two columns: "SÍ HACE ESTO" (Green) vs "NO HAGAS ESTO" (Red) with product recommendation.'
			};
		case 38:
			return {
				slots: [
					{ name: 'Término / Nombre', icon: '📖', description: 'Entrada de diccionario' },
					{ name: 'Definición & Cura', icon: '💡', description: 'Explicación del problema' }
				],
				layoutTemplate: 'DICTIONARY_DEFINITION: Dictionary entry style format defining the problem name and your product cure.'
			};
		case 39:
			return {
				slots: [
					{ name: 'Nota Escrita a Mano', icon: '✍️', description: 'Texto sobre hoja borrador' },
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto junto a la nota' }
				],
				layoutTemplate: 'HANDWRITTEN_NOTE: Handwritten style note on paper highlighting core advice and product.'
			};

		// ---------- PRODUCTO / DEMO (40-47) ----------
		case 40:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Foto limpia de estudio' }
				],
				layoutTemplate: 'CLEAN_PRODUCT_HERO: Minimalist studio product hero shot on solid premium backdrop.'
			};
		case 41:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Vista completa' },
					{ name: 'Flechas de Features', icon: '📍', description: 'Detalle de materiales' }
				],
				layoutTemplate: 'FEATURE_CALLOUTS: Exploded callout lines pointing to materials, quality, and craftsmanship.'
			};
		case 42:
			return {
				slots: [
					{ name: 'Foto en Uso Lifestyle', icon: '🌟', description: 'Persona usando el producto' }
				],
				layoutTemplate: 'LIFESTYLE_IN_USE: Model or person in real environment actively using the product.'
			};
		case 43:
			return {
				slots: [
					{ name: 'Corte / Despiece', icon: '🔬', description: 'Capas o interior del producto' }
				],
				layoutTemplate: 'EXPLODED_VIEW: Cutaway diagram or exploded view showing internal layers and engineering.'
			};
		case 44:
			return {
				slots: [
					{ name: 'Producto junto a Mano/Objeto', icon: '📏', description: 'Referencia de tamaño real' }
				],
				layoutTemplate: 'REAL_SCALE_COMPARISON: Product next to a hand or familiar object establishing true dimensions.'
			};
		case 45:
			return {
				slots: [
					{ name: 'Pasos 1-2-3', icon: '🔢', description: '3 cuadros de uso fácil' }
				],
				layoutTemplate: 'STEP_BY_STEP_123: 3 numbered steps showing how easy it is to apply/use the product.'
			};
		case 46:
			return {
				slots: [
					{ name: 'Flat Lay Contenido', icon: '🎁', description: 'Todo lo desplegado en la caja' }
				],
				layoutTemplate: 'UNBOXING_FLAT_LAY: Unboxing flat-lay layout displaying all items included in the packaging.'
			};
		case 47:
			return {
				slots: [
					{ name: '3 Frames Secuencia', icon: '🎬', description: 'Momentos 1, 2, 3 de uso' }
				],
				layoutTemplate: 'THREE_FRAME_SEQUENCE: 3-frame horizontal sequence showing phase 1, phase 2, phase 3 of usage.'
			};

		// ---------- AUTORIDAD (48-50) ----------
		case 48:
			return {
				slots: [
					{ name: 'Foto del Experto', icon: '👨‍⚕️', description: 'Profesional con credencial' },
					{ name: 'Cita del Experto', icon: '💬', description: 'Aval científico o profesional' }
				],
				layoutTemplate: 'EXPERT_ENDORSEMENT: Professional / Doctor / Expert with credential badge endorsing the product.'
			};
		case 49:
			return {
				slots: [
					{ name: 'Foto del Producto', icon: '📷', description: 'Producto' },
					{ name: 'Sellos de Calidad', icon: '🎖️', description: 'Certificados oficiales' }
				],
				layoutTemplate: 'CERTIFICATION_SEALS: Product surrounded by official certification seals (FDA, ANMAT, ISO, Cruelty-Free).'
			};
		case 50:
			return {
				slots: [
					{ name: 'Foto del Fundador', icon: '👤', description: 'Fundador/a de la marca' },
					{ name: 'Carta / Historia', icon: '✉️', description: 'Por qué creamos este producto' }
				],
				layoutTemplate: 'FOUNDER_LETTER: Founder photo + personal story & signoff explaining why the brand was created.'
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

// Genera dinámicamente un Blueprint de Prompt para cualquiera de las 1.300+ referencias ganadoras de la biblioteca
export function getDynamicReferenceBlueprint(item: {
	name: string;
	promptNotes?: string;
	categoryGroup?: string;
	categoryBranch?: string;
	categoryLeaf?: string;
	metadata?: any;
	templateId?: number;
}): AdSlotConfig {
	if (item.templateId && item.templateId >= 1 && item.templateId <= 50) {
		const tpl = creativos.find(c => c.id === item.templateId);
		if (tpl) return getTemplateBlueprint(tpl);
	}

	const notes = (item.promptNotes || '').toLowerCase();
	const name = (item.name || '').toLowerCase();
	const group = (item.categoryGroup || '').toLowerCase();

	const slots: { name: string; icon: string; description: string }[] = [
		{ name: 'Foto del Producto', icon: '📷', description: 'Producto principal presentado en escena' }
	];

	if (notes.includes('precio') || notes.includes('oferta') || notes.includes('descuento') || notes.includes(' off') || name.includes('oferta')) {
		slots.push({ name: 'Badge de Oferta / Precio', icon: '🏷️', description: 'Precio especial o porcentaje de descuento' });
	}

	if (notes.includes('estrella') || notes.includes('review') || notes.includes('reseña') || notes.includes('opinión') || notes.includes('rating') || notes.includes('5 stars')) {
		slots.push({ name: '5 Estrellas & Review', icon: '⭐', description: 'Valoración de clientes e insignia de confianza' });
	}

	if (notes.includes('vs') || notes.includes('comparat') || notes.includes('nosotros') || notes.includes('ellos') || name.includes('vs')) {
		slots.push({ name: 'Tabla Comparativa', icon: '📊', description: 'Puntos clave marcados con ✔ y ✘' });
	}

	if (notes.includes('whatsapp') || notes.includes('chat') || notes.includes('mensaje') || notes.includes('dm')) {
		slots.push({ name: 'Burbuja de Chat / Mensaje', icon: '💬', description: 'Interfaz de mensaje directo' });
	}

	if (notes.includes('envío') || notes.includes('shipping') || notes.includes('gratis')) {
		slots.push({ name: 'Envío Gratis', icon: '🚚', description: 'Promesa de despacho a domicilio' });
	}

	const layoutTemplate = `DYNAMIC_REFERENCE_LAYOUT: Precise reproduction of winner reference "${item.name}".
Specific Reference Notes: ${item.promptNotes || 'Clean high-converting commercial ad'}.
Category: ${group || 'e-commerce'} / ${item.categoryBranch || 'direct-response'}.
Structure: Recreate reference layout, typography structure, badges and text placements adjusted for the user's product.`;

	return { slots, layoutTemplate };
}

// Construye un prompt hiper-específico combinando el Blueprint de la plantilla o referencia de la biblioteca (1.300+ anuncios)
export function buildSpecializedAdPrompt(
	templateOrReference: Creativo | { name: string; promptNotes?: string; categoryGroup?: string; categoryBranch?: string; templateId?: number; ring?: string; sirve?: string; cuando?: string; id?: number },
	product: Partial<ScannedProduct> & { name: string; description?: string; priceText?: string; currency?: string },
	format: string,
	userBrief?: string
): { prompt: string; blueprint: AdSlotConfig } {
	const templateId = (templateOrReference as any).id || (templateOrReference as any).templateId;
	const isCatalogTemplate = templateId && templateId >= 1 && templateId <= 50;
	
	const blueprint = isCatalogTemplate 
		? getTemplateBlueprint(templateOrReference as Creativo)
		: getDynamicReferenceBlueprint(templateOrReference as any);

	// El precio se usa TAL CUAL viene de la web del producto. No se reformatea
	// (parsear "$50.350" como número lo convertía en "50.35") y nunca se inventa
	// un precio anterior para el tachado: un descuento falso en un anuncio real
	// es un problema legal, no un detalle de diseño.
	const rawPrice = (product.priceText || '').trim();
	const currency = (product.currency || '').trim();
	const hasSymbol = /[$€£¥]|USD|ARS|EUR|MXN|COP|CLP|PEN|BRL/i.test(rawPrice);
	const priceStr = rawPrice
		? (hasSymbol || !currency ? rawPrice : `${currency} ${rawPrice}`)
		: '';

	const refName = (templateOrReference as any).nombre || (templateOrReference as any).name || 'Anuncio Ganador';
	const refNotes = (templateOrReference as any).sirve || (templateOrReference as any).promptNotes || 'Diseño de alto rendimiento';

	const prompt = `Create a high-converting ecommerce static ad creative inspired by the winning reference "${refName}".

[WINNING AD REFERENCE BLUEPRINT]
Reference / Template: "${refName}" ${templateId ? `(ID #${templateId})` : ''}
Reference Concept: ${refNotes}

[LAYOUT ENGINE INSTRUCTIONS]
${blueprint.layoutTemplate}

[PRODUCT INFORMATION & SLOTS]
Product Name: "${product.name}"
Product Description: "${product.description || 'Premium high-quality product.'}"
Price: ${priceStr || 'NOT AVAILABLE — do not write any price, discount, percentage or strikethrough anywhere on the image.'}
${priceStr ? 'Write the price EXACTLY as given, character for character. Do not reformat it, do not change separators, do not round it.\nThere is NO previous/original price available: do not draw a strikethrough price, a "% OFF" badge or any discount claim.' : ''}
Aspect Ratio / Format: ${format}

[REQUIRED VISUAL SLOTS TO RENDER]
${blueprint.slots.map(s => `- ${s.icon} ${s.name}: ${s.description}`).join('\n')}

[DESIGN & TYPOGRAPHY SPECIFICATIONS]
1. Show the product prominently in realistic studio lighting with razor-sharp edges.
2. Render clean, professional copy in natural Spanish tailored to Latin America / Argentina.
3. Integrate UI overlays matching "${refName}" (e.g. star ratings, verified badges, offer pills, or comparative checkmarks).
4. Maintain high visual contrast, rich typography and modern ecommerce aesthetic.
5. Never invent prices, discounts, percentages, shipping deadlines, certifications, awards, medical claims or customer counts. If a slot has no verified data behind it, leave that element out of the layout instead of filling it with a made-up figure.
${userBrief ? `\n[CUSTOM USER DIRECTION]: ${userBrief}` : ''}`;

	return { prompt, blueprint };
}
