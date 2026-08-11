/**
 * El clon libre: se le da el ganador, la ficha del producto y sus fotos, y la IA
 * rediseña el aviso como le parece.
 *
 * Es lo contrario del camino detallado que vive en `ad-analysis.ts`. Ese mide el
 * ganador zona por zona —cada texto con su cuerpo, su peso, su alineación y su
 * hexadecimal— y le dicta al motor dónde va cada cosa. Funciona, pero tiene dos
 * costos que se vieron en producción: el prompt crece con la referencia hasta
 * pasar el techo de 32.000 caracteres de OpenAI y la generación falla, y cuanto
 * más se le dicta menos margen tiene para adaptar la escena, así que el aviso
 * sale con la composición correcta y el mundo del otro anunciante adentro.
 *
 * Acá se le dice QUÉ tiene que pasar y se lo deja resolver. El prompt es fijo:
 * no crece con la referencia, así que el techo de OpenAI deja de existir.
 *
 * Cada regla de abajo se ganó el lugar midiéndola contra siete referencias
 * reales, no por parecer razonable. Las que se probaron y no cambiaron nada
 * están afuera. Antes de agregar una, generá con y sin ella y mirá las dos.
 */
import type { EngineImage } from './image-engines';

export type ClavesDeApi = { openAIKey?: string; googleKey?: string };

/** Lo que se scrapeó del producto, más lo que se dedujo mirándolo. */
export type FichaDelProducto = {
	nombres: string[];
	/** Descripción, precio, categoría: lo verificado de la página. */
	datos: string[];
	marca?: string;
	queVendeLaTienda?: string;
	url?: string;
	logoUrl?: string;
	paleta?: string[];
	/** Cómo se ve el producto, leído de sus fotos. Lo llena `leerElProducto`. */
	aspecto?: string;
	/** A quién le habla, en una línea de casting. Lo llena `leerElProducto`. */
	icp?: string;
	/** Idioma pedido por el usuario. Sin esto se usa el de la ficha. */
	idioma?: string;
	/**
	 * Los dos únicos controles del aviso: de dónde salen los colores y la
	 * tipografía. Sin elegir nada se usan los del ganador, que es lo que hace que
	 * el clon se parezca al original.
	 */
	coloresDeLaMarca?: string[];
	tipografiaDeLaMarca?: { headings?: string; body?: string };
	/** El usuario decidió qué hacer con el logo: pisa la regla por defecto. */
	decisionDeLogo?: string;
	/** Para una página de carrusel: en cuál va y de cuántas. */
	carrusel?: { indice: number; total: number };
};

export type LecturaDelProducto = {
	/** Qué se ve en las fotos, para que el motor no lo dibuje de memoria. */
	aspecto?: string;
	/** El cliente ideal, para que la escena sea de él y no de un modelo cualquiera. */
	icp?: string;
	/**
	 * Índices (base 0) de las fotos donde aparece una persona.
	 *
	 * No es un capricho: el filtro de OpenAI rechaza el pedido ENTERO si entre
	 * las imágenes de entrada hay un cuerpo en ropa interior, aunque el aviso a
	 * generar no tenga nada. Esas fotos sirven para entender el producto, no para
	 * viajar al motor.
	 */
	conPersona: number[];
};

const LECTURA_VACIA: LecturaDelProducto = { conPersona: [] };

/**
 * Una sola llamada de visión que devuelve las tres cosas.
 *
 * Podrían ser tres llamadas separadas y se leería mejor, pero esto corre por
 * cada generación: una request con las fotos adentro se paga una vez y no tres.
 */
export async function leerElProducto(
	claves: ClavesDeApi,
	entrada: { fotos: EngineImage[]; nombre?: string; datos?: string; queVendeLaTienda?: string; url?: string },
): Promise<LecturaDelProducto> {
	if (!claves.openAIKey || !entrada.fotos.length) return LECTURA_VACIA;

	// El pedido evita hablar del calce sobre el cuerpo y del momento de uso: con
	// ropa interior esas dos cosas hacen que el filtro de OpenAI rechace después
	// la generación entera, y para dibujar el producto no aportan nada.
	const pedido = `These are the photos of ONE product, in order. It is sold as:
${entrada.nombre || '(sin nombre)'}
${entrada.datos || ''}
${entrada.queVendeLaTienda || ''}
${entrada.url || ''}

Answer JSON with three keys:

"aspecto": what you actually SEE, so someone who never saw it can draw it exactly — what kind of object it is, its shape and cut, its exact colours, the material and how it behaves, the seams, labels, prints and where they sit, and anything written on it. Describe the object on its own: never how it fits on a body, no anatomy, nothing about the models. Under 180 words.

"icp": the one customer this is really for, in ONE sentence a photographer could cast from — age range, gender, how they dress and how they live their day. A casting note, nothing about the body or about using the product. Only what the text above supports.

"conPersona": the 0-based indexes of the photos where a human body is visible. Photos of the product alone, flat lays and diagrams do not count.`;

	try {
		const respuesta = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${claves.openAIKey}` },
			body: JSON.stringify({
				model: 'gpt-4o',
				response_format: { type: 'json_object' },
				max_tokens: 700,
				messages: [{
					role: 'user',
					content: [
						{ type: 'text', text: pedido },
						...entrada.fotos.map((foto) => ({
							type: 'image_url',
							image_url: { url: `data:${foto.type};base64,${foto.buffer.toString('base64')}` },
						})),
					],
				}],
			}),
		});
		if (!respuesta.ok) return LECTURA_VACIA;
		const json = await respuesta.json();
		const leido = JSON.parse(json?.choices?.[0]?.message?.content || '{}');
		return {
			aspecto: typeof leido.aspecto === 'string' ? leido.aspecto.trim() : undefined,
			icp: typeof leido.icp === 'string' ? leido.icp.trim() : undefined,
			conPersona: Array.isArray(leido.conPersona)
				? leido.conPersona.filter((i: unknown) => Number.isInteger(i)) as number[]
				: [],
		};
	} catch (error) {
		// Un fallo acá no corta nada: se genera igual, con una ficha más pobre.
		console.error('[clon-libre] no se pudo leer el producto:', error);
		return LECTURA_VACIA;
	}
}

/**
 * Las fotos que pueden viajar al motor.
 *
 * Se quedan afuera las que muestran una persona. Si TODAS la muestran no se
 * filtra nada: quedarse sin fotos es peor que arriesgar el filtro, porque sin
 * ninguna el motor dibuja el producto de memoria.
 */
export function fotosParaElMotor(fotos: EngineImage[], lectura: LecturaDelProducto): EngineImage[] {
	if (!lectura.conPersona.length) return fotos;
	const limpias = fotos.filter((_, i) => !lectura.conPersona.includes(i));
	return limpias.length ? limpias : fotos;
}

const linea = (etiqueta: string, valor?: string | string[] | null) => {
	if (!valor) return '';
	const texto = Array.isArray(valor) ? valor.filter(Boolean).join(' · ') : String(valor).trim();
	return texto ? `${etiqueta}: ${texto}\n` : '';
};

/** Sin el punto final, que después se le agrega otro y quedan dos. */
const sinPuntoFinal = (texto: string) => texto.replace(/\s*\.\s*$/, '');

/** El prompt del clon libre. Fijo: no crece con la referencia. */
export function buildPromptLibre(ficha: FichaDelProducto): string {
	const datosDelProducto = [
		linea('Product', ficha.nombres.filter(Boolean).join(' + ')),
		linea('Brand', ficha.marca),
		linea('What it is', ficha.datos),
		linea('What this shop sells', ficha.queVendeLaTienda),
		linea('Brand colours', ficha.paleta),
		linea('url', ficha.url),
		linea('logo', ficha.logoUrl),
		ficha.aspecto ? `\nWHAT THE PRODUCT LOOKS LIKE, read off its real photos:\n${ficha.aspecto}\n` : '',
	].filter(Boolean).join('');

	// La decisión del usuario sobre el logo, cuando la hay, reemplaza la regla por
	// defecto entera. Tenerlas a las dos es pedirle dos cosas distintas, y ya se
	// vio que en ese caso gana la más gráfica y la decisión se ignora.
	const marca = ficha.decisionDeLogo
		? `THE BRAND MARK — ${ficha.decisionDeLogo}`
		: `THE BRAND MARK — Look at the reference: does it show a logo or a brand name anywhere? If it does NOT, this ad does not get one either. Do not add a logo, a mark, a wordmark or a brand line anywhere, at any size, no matter how natural it would look — an ad that gains a logo the original did not have is no longer the same ad. If it DOES show one, replace it with this brand's, in the same position, at the same size and in the same style as the ad.`;

	const publico = ficha.icp
		? `WHO THIS AD IS FOR: ${sinPuntoFinal(ficha.icp)}. Whoever appears in it is that person, and every choice in it is made so that person recognises themselves at a glance.`
		: `WHO THIS AD IS FOR is the customer the product information above describes. Whoever appears in it is that person, and every choice in it is made so that person recognises themselves at a glance.`;

	const idioma = ficha.idioma
		? `Every word in the ad is written in ${ficha.idioma}.`
		: 'Every word in the ad is written in the language the product information above is written in.';

	// Los colores y la tipografía de la marca no se agregan como un pedido más:
	// REEMPLAZAN la cláusula del ganador. Tener las dos es pedirle dos cosas
	// distintas, y ahí gana la que ve en la imagen y la elección se ignora.
	const letra = (ficha.tipografiaDeLaMarca?.headings || ficha.tipografiaDeLaMarca?.body)
		? `the same type sizes, weights, alignments and hierarchy, but set in this brand's own typefaces (${[
			ficha.tipografiaDeLaMarca.headings && `${ficha.tipografiaDeLaMarca.headings} for headings`,
			ficha.tipografiaDeLaMarca.body && `${ficha.tipografiaDeLaMarca.body} for body`,
		].filter(Boolean).join(', ')})`
		: 'the same typography — the very letterforms you can see in the image — the same type sizes, weights and alignments';

	const color = ficha.coloresDeLaMarca?.length
		? `this brand's own palette (${ficha.coloresDeLaMarca.join(', ')}) mapped onto the very same roles the reference uses — what was the background stays the background, what was the ink stays the ink, and the accent still lands on the equivalent word`
		: 'the same colour palette, the same accent colour on the same word';

	const pagina = ficha.carrusel
		? `\nThis is page ${ficha.carrusel.indice + 1} of a ${ficha.carrusel.total}-page carousel and the reference is that page: make this one only, and make it sit with the others as one set.\n`
		: '';

	return `The first input image is a winning advertisement. Make EXACTLY THIS AD, for a different product. The images after it are real photos of that product.

Everything about the design stays: the same layout, the same composition, ${letra}, ${color}, the same spacing and the same margins. Someone comparing the two must see the same ad twice, about two different things.

FIRST, READ EVERY WORD IN THE IMAGE. Go through it block by block — the logo lockup, the headline, every line of it, the paragraph, the button, any badge, pill, caption or small print — and for EACH ONE write the equivalent line for the product below. Every one of them changes. A line that still talks about the original advertiser's business is the single worst thing this can produce: the ad ends up looking right and saying nothing.

Each new line keeps the shape of the one it replaces: the same number of lines, roughly the same length, the same tone, the same job in the ad — a headline stays a headline, a benefit line stays a benefit line, a button stays a button. Where the original highlights one word in the accent colour, highlight the equivalent word of the new line.

THE PRODUCT THIS AD IS NOW FOR
${datosDelProducto}${pagina}
THE PRODUCT IS THE ONE IN THE PHOTOS, NOT ONE LIKE IT — study every photo you were given and reproduce that exact object: its real shape and cut, its real colour, its real material, its seams, labels, prints and proportions where the photos show them. Getting the product wrong ruins the ad even if everything else is perfect.

NOTHING EXPLICIT IS EVER SHOWN — people may wear the product and their body may be seen, hips, waist and the area the garment covers included. What must never appear is bare genitals, the shape of genitals read through the fabric, or bare nipples. The fabric is opaque and sits flat, and the framing is the one a retailer uses for its catalogue, not an erotic one.

EVERYTHING IN THE PICTURE IS RE-CAST FOR THIS PRODUCT — the setting, the scene and whoever appears in it. Same composition, same roles, same positions, same light, but photographed again for what is being sold now: another person, the one this product is for, somewhere this product is really used. The same face in the same place is the sign nothing was adapted.

If the ad sets two sides against each other — before and after, us against them, with and without — keep that comparison and keep the sides clearly opposed. The product's side is the good one.

The decoration is what survives by mistake. Flowers, fruit, stones, ingredients, fabric, tools, scenery — whatever surrounds the original product was chosen to say something about THAT product and says nothing about this one. Replace it with the equivalent for this product, in the same spot and at the same size.

THE PRODUCT IS SHOT THE WAY THE REFERENCE SHOOTS ITS OWN — Look at how the original product appears and repeat exactly that: the same number of pieces, laid out in the same arrangement and the same angles, at the same size in the frame, with the same crop, the same lighting and the same shadows, on a surface that plays the same role but belongs to this product. If the original scatters seven items across the canvas, this product is scattered as seven items too; if it shows one hero piece dead centre, so does this one. The product is real and photographed, never illustrated, and it is shown as what it actually is — not turned into the shape of the original product.

${marca}

${publico}

${idioma}

Do not invent prices, percentages, ratings, guarantees or claims that are not written above. Do not keep the original advertiser's brand, logo, wordmark or product anywhere in the image. No watermarks, no platform UI.`;
}
