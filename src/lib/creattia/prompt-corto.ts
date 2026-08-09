import { LANGUAGE_NAMES, type LayoutAnalysis } from './ad-analysis';
// Se importa la función SOLO como tipo: así la firma queda atada a la del prompt
// largo y no puede desincronizarse sin que TypeScript avise, sin tocar ni
// importar nada en runtime del archivo original (que otro agente está editando).
import type { buildReferenceClonePrompt } from './ad-analysis';

/**
 * Prompt de render corto — la mitad B del experimento.
 *
 * El prompt de `buildReferenceClonePrompt` creció a ~26.000 caracteres a fuerza
 * de parches: cada falla observada agregó un bloque nuevo. La hipótesis que se
 * quiere medir acá es que ese volumen DILUYE las reglas —el modelo no puede
 * priorizar treinta secciones "CRITICAL"— y que dos principios bien dichos
 * (nada que no esté en el ganador / nada del ganador salvo su estructura)
 * gobiernan mejor el resultado en ~7.000 caracteres.
 *
 * Vive en un módulo aparte a propósito: el experimento se juzga generando LA
 * MISMA imagen con los dos prompts, así que los dos tienen que poder convivir y
 * ser intercambiables en el mismo llamado.
 */

/** Exactamente el mismo objeto de entrada que recibe el prompt largo. */
export type PromptCortoInput = Parameters<typeof buildReferenceClonePrompt>[0];

/**
 * Construye el prompt corto a partir del mismo input que el prompt largo.
 *
 * `analysis` y `hasLogo` viajan dentro de `input` —igual que en el original, para
 * que sea un reemplazo directo en el call site— y además se aceptan sueltos como
 * 2º y 3er parámetro para poder correr el experimento pisando solo el análisis
 * sin rearmar el objeto entero.
 */
export function buildPromptCorto(
	input: PromptCortoInput,
	analysis?: LayoutAnalysis | null,
	hasLogo?: boolean,
): string {
	const analisis = analysis !== undefined ? analysis : input.analysis;
	const conLogo = hasLogo !== undefined ? hasLogo : input.hasLogo;

	const languageCode = input.languageCode || analisis?.language || input.adCopy?.language || 'es';
	const idioma = LANGUAGE_NAMES[languageCode] || LANGUAGE_NAMES.es;

	// ── {PRODUCTO} ────────────────────────────────────────────────────────────
	// En modo tienda el sujeto NO es la lista de productos: nombrarlos uno por uno
	// empuja al modelo a hablar de artículos sueltos, que es lo contrario de un
	// aviso del negocio. Ahí el sujeto es la tienda y los productos son la muestra.
	const esCatalogo = input.subjectMode === 'catalog';
	const esFisico = input.subjectMode === 'product' || esCatalogo || !input.subjectMode;
	const producto = esCatalogo
		? `${input.brandName ? `the store ${input.brandName}` : 'the store'} as a whole, using the supplied products only as a sample of its range`
		: input.productNames.length
			? input.productNames.join(' + ')
			: esFisico
				? 'the real product supplied by the user'
				: 'the service or SaaS offer supplied by the user';

	// ── {MEDIO} ───────────────────────────────────────────────────────────────
	// Sin dato medido no se inventa "photorealistic": ese default es justamente el
	// que rompía los ganadores ilustrados. Se dice que hay que mirarlo.
	const medio = (analisis?.renderingMedium || '').trim()
		|| 'read it off the winning ad itself and match it — do not default to photography';

	// ── {GEOMETRIA} ───────────────────────────────────────────────────────────
	const geometria = (analisis?.compositionGeometry || '').trim()
		|| 'measure the divisions, band heights and margins on the winning ad itself and reproduce them';

	// ── {PALETA} ──────────────────────────────────────────────────────────────
	// FALTA MEDIRLA. El análisis hoy NO devuelve la paleta del ganador en
	// hexadecimal: `brandPalette` es la paleta de la MARCA DEL USUARIO, no la del
	// anuncio ganador. Lo único que describe los colores del ganador es
	// `styleNotes`, y en prosa ("fondo crema, acento verde"). Es exactamente el
	// dato que se pierde y por eso el clon se retiñe hacia los colores del
	// producto nuevo. Cuando el analizador devuelva hex del ganador, esto pasa a
	// listarlos y deja de depender de una descripción.
	const paleta = (analisis?.styleNotes || '').trim()
		|| 'the exact background, text and accent colours visible in the winning ad, sampled from the image itself';

	// ── {TIPOGRAFIA} ──────────────────────────────────────────────────────────
	const t = analisis?.typography;
	const tipografia = [
		t?.headline && `headline — ${t.headline}`,
		t?.body && `body — ${t.body}`,
		t?.pairing && `pairing — ${t.pairing}`,
	].filter(Boolean).join('; ')
		|| 'read the letterforms off the winning ad and match their class, weight, width, case and spacing';

	// ── {DIRECCION_DE_ARTE} ───────────────────────────────────────────────────
	// El tipo de aviso va primero a propósito: saber que es un testimonial, una
	// comparativa o un antes/después gobierna la composición entera, mucho más
	// que cualquier detalle de iluminación.
	const c = analisis?.creative;
	const direccionDeArte = [
		c?.adType && `kind of ad — ${c.adType}`,
		c?.photographyStyle && `shot style — ${c.photographyStyle}`,
		c?.lighting && `lighting — ${c.lighting}`,
		c?.depth && `depth — ${c.depth}`,
		c?.composition && `composition — ${c.composition}`,
		c?.emotion && `emotion — ${c.emotion}`,
	].filter(Boolean).join('; ')
		|| 'reproduce the winning ad\'s own shot style, lighting, depth, composition and emotion';

	// ── {BLOQUE_AREAS_DE_IMAGEN} ──────────────────────────────────────────────
	// Sin esto quedaban las fotos originales del template: un aviso de veterinaria
	// clonado para un proveedor de cuero conservaba las chicas con perros. La
	// `idea` es lo que hay que salvar cuando el área no es una foto de producto.
	const areas = (analisis?.imageSlots || []).filter((area) => area && area.replaceWith);
	const bloqueAreas = areas.length
		? `THE IMAGE AREAS
Re-shoot each one with the subject named for it, same frame, crop, angle, lighting and position.

${areas.map((area, i) => `  ${i + 1}. [${area.where || 'image area'}] shows now: ${area.showsNow || 'unspecified'} → must show: ${area.replaceWith}${area.idea ? ` · the idea this area carries and that must survive: ${area.idea} — keep the idea, change only what it is about; do not turn it into a product shot` : ''}`).join('\n')}
`
		: '';

	// ── {BLOQUE_COMPARATIVA} ──────────────────────────────────────────────────
	// Un producto que cruza la división rompe lo único que hace legible a una
	// comparativa, y el texto positivo cayendo sobre la mitad "mala" invierte el
	// sentido del aviso. Y el ítem alternativo tiene que ser OTRO artículo: poner
	// el mismo producto de los dos lados deja el aviso diciendo nada.
	const comparativa = analisis?.comparison;
	const bloqueComparativa = comparativa?.detected
		? `THE COMPARISON
${comparativa.summary ? `  ${comparativa.summary}\n` : ''}  · Each side stays entirely inside its own half. Nothing crosses, overlaps or leans over the divider, which keeps its exact position, length and style.
  · Each text block keeps the side it had. A positive line never lands on the negative half; a problem statement never lands on the hero half.
  · The alternative side shows ANOTHER article of the same category — a generic, unbranded stand-in for what the buyer would otherwise get. Never ${producto} on both sides, and never a named competitor's real product or brand.${comparativa.userGuidance ? `\n  · ${comparativa.userGuidance}` : ''}
`
		: '';

	// ── {ZONAS_DE_TEXTO} ──────────────────────────────────────────────────────
	// Los textos impresos sobre el producto no se recrean si el producto real no
	// tiene packaging: inventarle letras a una superficie limpia es lo que hace
	// que el producto deje de ser el producto.
	const esBasura = (valor?: string) => {
		const texto = (valor || '').trim();
		return !texto || /^(null|undefined|none|n\/a|nan|-|—)$/i.test(texto);
	};
	const zonas = (analisis?.textZones || [])
		.filter((zona) => (analisis?.productHasPackaging ? true : !zona.onProduct))
		.filter((zona) => !esBasura(zona.replacement));
	const zonasDeTexto = zonas.length
		? zonas.map((zona, i) => {
			const original = (zona.original || '').trim();
			const largo = original.length;
			// La caja es lo primero que se pierde al reemplazar un texto y lo que
			// más cambia la jerarquía del aviso.
			const soloLetras = original.replace(/[^\p{L}]/gu, '');
			const enMayusculas = soloLetras.length > 2 && soloLetras === soloLetras.toUpperCase();
			// Las líneas las cuenta el analizador mirando la imagen. Deducirlas de
			// los saltos del string daba siempre 1, y a un titular partido en tres
			// se le pedía una sola: el prompt rompía lo que quería copiar. Sin el
			// dato es mejor no decir nada que afirmar un número inventado.
			const lineas = typeof zona.lines === 'number' && zona.lines >= 1 ? zona.lines : null;
			// `emphasis` y `onCurve` los devuelve el analizador pero `emphasis` no
			// está declarado en LayoutAnalysis, así que se lee con cast igual que
			// en el prompt largo (ese tipo lo mantiene el otro archivo).
			const enfasis = typeof (zona as any).emphasis === 'string'
				&& (zona as any).emphasis.trim()
				&& (zona as any).emphasis.trim().toLowerCase() !== 'null'
				? (zona as any).emphasis.trim() as string
				: '';
			const curva = typeof zona.onCurve === 'string'
				&& zona.onCurve.trim()
				&& zona.onCurve.trim().toLowerCase() !== 'null'
				? zona.onCurve.trim()
				: '';
			const datos = [
				largo ? `${largo} characters` : '',
				lineas ? `${lineas} line${lineas > 1 ? 's' : ''}` : '',
				enMayusculas ? 'ALL CAPS' : '',
				enfasis ? `emphasis: ${enfasis}` : '',
				curva ? `on a curve: ${curva}` : '',
				zona.labels ? `callout labelling ${zona.labels} — its leader line must end on the equivalent part of the new product` : '',
			].filter(Boolean).join(' · ');
			return `  ${i + 1}. [${zona.where || 'text zone'}] "${original}" → "${zona.replacement}"${datos ? ` — ${datos}` : ''}`;
		}).join('\n')
		: '  (no text blocks were measured in the winning ad — reproduce exactly the blocks it shows, and add none)';

	// ── {BLOQUE_MARCA} ────────────────────────────────────────────────────────
	// Misma lógica que el prompt largo: si el ganador firma con el nombre en
	// tipografía, pegar el archivo de logo del cliente —un escudo, un sello— deja
	// un bloque gráfico pesado donde había una línea de texto, y es de lo primero
	// que se ve como mal hecho.
	const marcaComoTexto = analisis?.logoIsWordmark === true;
	let bloqueMarca: string;
	if (analisis?.templateHasLogoSlot) {
		const donde = analisis.logoDescription ? ` (${analisis.logoDescription})` : '';
		if (marcaComoTexto) {
			bloqueMarca = input.brandName
				? `The winning ad signs with a WORDMARK — its name set in type, no emblem${donde}. Sign the same way: write "${input.brandName}" as clean typography in that same position, at the same relative size, weight, case, letter-spacing, colour and alignment. Do not paste the supplied logo image there, and do not add a shield, seal, badge, ribbon or any container shape around it — the winning ad has none.`
				: `The winning ad signs with a wordmark set in type${donde}, but no business name was supplied. Leave that space clean rather than inventing a name, an emblem or a badge.`;
		} else if (conLogo) {
			bloqueMarca = `The winning ad carries a drawn brand mark${donde}. Place the supplied logo file there instead, exactly once, in the same structural role, at the same size the winning ad gives its own mark: it is a small signature, not a hero element. Same clear space around it. Do not redraw it, recolour it or add a container shape.`;
		} else {
			bloqueMarca = `The winning ad carries a brand mark${donde} and no logo was supplied. Remove it cleanly and let the surrounding spacing close over the gap. Do not invent a name, an icon or a badge to fill it.`;
		}
	} else {
		// Si el ganador no firma, el clon no firma. Agregar una marca donde no
		// había es sumar un elemento que la referencia no tiene, que es la falla
		// que el principio 1 persigue.
		bloqueMarca = `The winning ad does not sign itself, so neither does this one: no logo, no wordmark, no business name, no domain, no watermark, no brand badge anywhere.${esFisico ? ' Genuine branding printed on the product itself is part of the product and stays.' : ''}`;
	}

	// ── Hechos verificados ────────────────────────────────────────────────────
	// El principio 1 prohíbe toda cifra que no esté en "los hechos verificados de
	// abajo". Sin la lista, esa referencia queda colgada y la regla no tiene a qué
	// apuntar. Se emite solo cuando efectivamente hay hechos.
	const hechos = (input.productFacts || []).filter(Boolean);
	const bloqueHechos = hechos.length
		? `\nVERIFIED FACTS — the only figures and claims that may appear\n${hechos.map((hecho) => `  · ${hecho}`).join('\n')}\n`
		: '';

	// ── {INDICACION_DEL_USUARIO} ──────────────────────────────────────────────
	const indicacion = (input.brief || '').trim()
		|| 'None. Follow the winning ad as measured above.';

	return `You are remaking one specific winning ad for a different advertiser.

THE JOB
The first input image is a winning ad. Rebuild it — not something inspired by it, not a variation. Same medium, same geometry, same palette, same typography, same graphic devices, same position and size for every block. Only the SUBJECT changes: the product, the scenes and the people all become ${producto}.

THE TEST
Put the winning ad and your output side by side. Every block lands in the same place, at the same size, in the same style. Someone should say "the same ad, remade for another product" — not "two similar ads". Whenever an instruction below leaves room, choose the option closer to the winning ad.

TWO PRINCIPLES DECIDE ALMOST EVERYTHING

  1. NOTHING THAT IS NOT IN THE WINNING AD.
     If you cannot point at it in the reference, it does not go in. No web address, domain, handle or QR. No badge, seal, ribbon, laurel, star rating or certification. No logo or brand line. No guarantee, discount or shipping promise. No number, percentage, price, rating or timeframe that is not in the verified facts below — not even one adapted from the winner's own figures. No empty band the winner does not have. The advertiser's website, brand name and facts are CONTEXT for writing honest copy, not instructions to print them.

  2. NOTHING FROM THE WINNING AD EXCEPT ITS STRUCTURE.
     Its people, its places, its objects, its brand and any third party it shows belong to someone else's campaign. None of them survives. The most common failure is pasting the new product on top of the winner's original photo: that leaves a scene that makes no sense and reads instantly as a collage. Re-shoot every image area with the subject named for it, keeping the same frame, crop, angle, lighting and position. Press logos and media rows must go entirely — reproducing them claims coverage this business does not have.

WHAT WAS MEASURED IN THIS WINNING AD — reproduce it, do not reinterpret it

  Medium: ${medio}
     Make the new ad the same way. If the winner is illustrated, the new ad is illustrated too: redraw the product in that style rather than pasting a photograph. If it is photographic, render photographs.

  Geometry: ${geometria}
     Fixed dimensions, not suggestions. Dividers stay put, each band keeps its share of the height, the headline keeps its size relative to the canvas, margins stay. If content does not fit its band, shorten the content.

  Palette: ${paleta}
     These are the winner's actual colours and they do not change. A cream background stays cream; a dark green background stays dark green. Do not retint the ad toward the product's own colours — that is the fastest way to lose the resemblance while every block is still in place.

  Typography: ${tipografia}
     Match the letterforms: same class, weight, width, case, letter-spacing and the same size relationship between headline and body. A light extended face rendered as a heavy condensed one is a failure even with correct words.

  Art direction: ${direccionDeArte}
     Same kind of ad, same shot style, same lighting, same depth, same composition, same emotion.

THE PRODUCT
Remove the winner's product completely and render ${producto} in its place, at the same position, scale and prominence. Re-photograph it into the scene — match the camera angle, light direction, colour temperature, reflections and shadow — never paste a cut-out.

  · Same physical object type as its photo: a hide stays a hide, a bottle stays a bottle. Keep its exact silhouette, colours, materials, texture and every printed, stitched or embossed detail. Someone who owns it must recognise it.
  · Add nothing to its surface: no tooling, print, pattern or texture the photo does not show. A plain surface stays plain.
  · No packaging unless the photo shows packaging. Text printed on real packaging is copied character by character.
  · True size. If the winner pinches a small object and this product is large and heavy, one hand cannot hold it: rest it, hang it, roll it, use two hands, or show it alone. A large item floating from one hand is a failure.
  · Replace EVERY appearance of the winner's product, including small repeats, grids and colour variants.

${bloqueAreas}${bloqueComparativa}
THE TEXT
Everything visible must be written in ${idioma}, correctly and idiomatically. Replace each block with the copy listed below, keeping its position, size, weight, case, line count and emphasis.

${zonasDeTexto}

  · Length is a hard constraint. A replacement may not exceed its original's character count or line count. If the honest message does not fit, cut whole words until it does — a shorter phrase that keeps the design beats a complete one that breaks it.
  · Text on a curve: the arc was drawn for that exact string. Keep its anchor, radius and span, and shorten the text to fit. Never lengthen the arc, never straighten it, or a corner accent becomes a band across the canvas.
  · Keep the same clear space from the edges. No letter touches an edge, no word is truncated.
  · Same number of blocks as the winner. No extra caption, no extra icon.

THE BRAND
${bloqueMarca}
Erase every trace of the winner's own brand: wordmark, logo, monogram, name — corners, footer, badges, the product, watermarks.
${bloqueHechos}
OUTPUT
Sharp and production-ready. Every character legible, correctly spelled, with stable letterforms and no melted or duplicated words. No watermarks, no platform interface.

USER DIRECTION
${indicacion}`;
}
