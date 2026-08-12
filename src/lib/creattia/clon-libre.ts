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
 *
 * TODO el camino de generación volvió a "Colores que se pueden elegir, logo que
 * se puede cambiar, producto más fiel" (b8ded8c): prompt corto, TODAS las fotos
 * del producto al motor, y el aspecto integrando la escenografía de las fotos.
 * Se probó dos veces "mejorarlo" —primero sumando bloques al prompt, después
 * filtrando la entrada con un clasificador y un packshot— y las dos veces las
 * imágenes salieron peor mirándolas al lado de las de b8ded8c. El costo asumido
 * a sabiendas: una tienda cuya galería es toda placas promocionales vuelve a
 * clonar la placa (el caso mojarra). Si algún arreglo vuelve, vuelve DE A UNO y
 * midiéndolo contra b8ded8c en el flujo staged de Vercel; las primeras
 * candidatas son la advertencia de idioma (mató el "OBTENEZ VOTRE BOXER" real)
 * y la cláusula de sellos ajenos (vista tres veces en producción).
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
	categoria?: string;
	url?: string;
	logoUrl?: string;
	paleta?: string[];
	/** Cómo se ve el producto, leído de sus fotos. Lo llena `leerElProducto`. */
	aspecto?: string;
	/** Sin efecto desde la vuelta a b8ded8c: la escenografía viaja adentro de `aspecto`. */
	ambiente?: string;
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
	/**
	 * Lo que el usuario quiere destacar, en sus palabras.
	 *
	 * No es una regla más: es del mismo tipo que el precio o la descripción, un
	 * dato del producto que la ficha no traía. Va como UNA línea y sin explicarle
	 * cómo obedecerla —dónde ponerlo y de qué tamaño lo sigue decidiendo él—,
	 * porque el prompt es un presupuesto de atención y cada orden que se agrega le
	 * come lugar a las reglas que sí se midieron.
	 */
	indicaciones?: string;
	/**
	 * Quién aparece, cuando el usuario lo decidió.
	 *
	 * Sin decisión el aviso la toma solo, que es lo que sale bien casi siempre.
	 * Cuando hay decisión REEMPLAZA la frase que dice recastear a la persona: con
	 * las dos presentes se le piden dos cosas distintas y gana la que ve en la
	 * imagen del ganador, así que la elección se ignoraba.
	 */
	decisionDePersona?: string;
	/** El usuario decidió qué hacer con el logo: pisa la regla por defecto. */
	decisionDeLogo?: string;
	/** Sin efecto desde la vuelta a b8ded8c: el bloque de pudor volvió a ser fijo. */
	seUsaEnElCuerpo?: boolean;
	/** Para una página de carrusel: en cuál va y de cuántas. */
	carrusel?: { indice: number; total: number };
	/** Cuántas páginas del carrusel viajan como contexto, al final de las imágenes. */
	otrasPaginas?: number;
};

export type LecturaDelProducto = {
	/** Qué se ve en las fotos, para que el motor no lo dibuje de memoria. */
	aspecto?: string;
	/** Sin efecto desde la vuelta a b8ded8c: la escenografía viaja adentro de `aspecto`. */
	ambiente?: string;
	/** El cliente ideal, para que la escena sea de él y no de un modelo cualquiera. */
	icp?: string;
	/**
	 * Vacíos desde la vuelta a b8ded8c: el clasificador de placas y el tope de
	 * tres fotos se midieron contra ese commit y las imágenes salían peor —
	 * entrada abundante gana. Los campos quedan porque los llamadores los leen, y
	 * porque son el punto exacto donde reintroducir el filtro si el caso de la
	 * galería toda-placas vuelve a doler: llenarlos de nuevo y medir.
	 */
	mejores: number[];
	graficas: number[];
	/**
	 * Índices (base 0) de las fotos donde aparece una persona.
	 *
	 * No es un capricho: el filtro de OpenAI rechaza el pedido ENTERO si entre
	 * las imágenes de entrada hay un cuerpo en ropa interior, aunque el aviso a
	 * generar no tenga nada. Esas fotos sirven para entender el producto, no para
	 * viajar al motor.
	 */
	conPersona: number[];
	/** Sin efecto desde la vuelta a b8ded8c: el bloque de pudor volvió a ser fijo. */
	seUsaEnElCuerpo?: boolean;
};

const LECTURA_VACIA: LecturaDelProducto = { mejores: [], graficas: [], conPersona: [] };

/**
 * Una sola llamada de visión que devuelve todo.
 *
 * Podrían ser varias llamadas separadas y se leería mejor, pero esto corre por
 * cada generación: una request con las fotos adentro se paga una vez y no cuatro.
 *
 * Va con el modelo GRANDE y no con un mini, y no es por comodidad. `aspecto` es
 * literalmente la descripción con la que el motor dibuja el producto, y la
 * clasificación decide qué fotos ve: con un mini la descripción sale más pobre y
 * el producto se renderiza peor en TODAS las generaciones, y una clasificación
 * floja puede dejar afuera fotos reales o disparar un packshot que no hacía
 * falta. Se probó bajarlo para ahorrar y el resultado se notó enseguida.
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
		const indices = (valor: unknown) => (Array.isArray(valor) ? valor.filter((i: unknown) => Number.isInteger(i)) as number[] : []);
		return {
			aspecto: typeof leido.aspecto === 'string' ? leido.aspecto.trim() : undefined,
			icp: typeof leido.icp === 'string' ? leido.icp.trim() : undefined,
			// Vacíos a propósito: el clasificador se midió contra b8ded8c y perdió.
			mejores: [],
			graficas: [],
			conPersona: indices(leido.conPersona),
		};
	} catch (error) {
		// Un fallo acá no corta nada: se genera igual, con una ficha más pobre.
		console.error('[clon-libre] no se pudo leer el producto:', error);
		return LECTURA_VACIA;
	}
}

/**
 * Desde la vuelta a b8ded8c el clasificador no corre y `graficas` llega vacío,
 * así que esto es siempre false: el packshot queda apagado sin tocar a los que
 * lo llaman. Si la galería toda-placas vuelve a doler, la reintroducción
 * empieza acá: llenar `graficas` de nuevo y medir contra b8ded8c.
 */
export function todasSonPlacas(fotos: EngineImage[], lectura: LecturaDelProducto): boolean {
	return fotos.length > 0 && lectura.graficas.length === fotos.length;
}

/**
 * Las fotos que pueden viajar al motor: TODAS, como en b8ded8c.
 *
 * Se quedan afuera solo las que muestran una persona, que hacen que OpenAI
 * rechace el pedido entero cuando el producto es ropa interior. Si TODAS la
 * muestran no se filtra nada: quedarse sin fotos es peor que arriesgar el
 * filtro, porque sin ninguna el motor dibuja el producto de memoria.
 *
 * El tope de tres fotos y el filtro de placas se midieron contra b8ded8c y las
 * imágenes salían peor: entrada abundante gana, y acá se ignoran a propósito
 * `mejores` y `graficas`.
 */
export function fotosParaElMotor(fotos: EngineImage[], lectura: LecturaDelProducto): EngineImage[] {
	if (!lectura.conPersona.length) return fotos;
	const limpias = fotos.filter((_, i) => !lectura.conPersona.includes(i));
	return limpias.length ? limpias : fotos;
}

/**
 * Re-fotografía el producto solo, sobre fondo neutro y sin una letra encima.
 *
 * Existe para las tiendas cuya galería son todas placas promocionales —bandera,
 * caja, "SORTEO DÍA 30", que es lo normal en Tiendanube y Shopify—. Mandarle esas
 * placas al motor es peor que no mandarle nada: las lee como el producto y
 * termina clonando el diseño de la tienda en vez del anuncio ganador.
 *
 * Va por el mismo motor que genera los avisos y no por Gemini: es una llamada de
 * imagen común, y hacerla con la clave que ya está configurada evita que esta
 * función quede muerta en las cuentas que no tienen la de Google. Cuesta unos
 * ocho centavos y unos cuarenta segundos.
 */
export async function refotografiarProducto(
	claves: ClavesDeApi,
	foto: EngineImage,
	descripcion?: string,
): Promise<EngineImage | null> {
	if (!claves.openAIKey) return null;
	try {
		const { generateAdImage } = await import('./image-engines');
		const r = await generateAdImage({
			openAIKey: claves.openAIKey,
			googleKey: claves.googleKey,
			prompt: `The image shows a product, most likely inside a promotional graphic made by the shop that sells it. Take that product out and photograph it on its own.

${descripcion ? `The product is: ${descripcion}

` : ''}One single object, centred, with generous margins, on a plain neutral studio background under soft even light and one gentle contact shadow. Its shape, proportions, colours, materials and texture come out exactly as they are in the image, down to anything printed or moulded on the object itself.

Everything that was around it stays behind: the layout, the headlines, the prices, the badges, the banners, the flags, the arrows and any other object. What comes out is the product and the background, and nothing else.`,
			images: [foto],
			format: '1:1',
			tier: 'low',
		});
		return r.buffer.length > 1024 ? { buffer: r.buffer, type: 'image/png' } : null;
	} catch (error) {
		// Sin packshot se genera igual, con la descripción de texto: peor, no roto.
		console.error('[clon-libre] no se pudo rehacer la foto del producto:', error);
		return null;
	}
}

/**
 * Tres cosas del producto que valdría la pena destacar, para no dejar el campo
 * de indicaciones en blanco.
 *
 * Sale de lo que se scrapeó de la URL y nada más: no mira el anuncio ganador. Se
 * probó mirándolo y no pagaba —tres ganadores muy distintos devolvían las mismas
 * tres frases— así que la llamada de visión y la descarga de la imagen se
 * ahorran enteras. Son un punto de partida, no una recomendación: la cuarta
 * opción, escribir lo propio, es el campo de abajo y nunca se va.
 */
export async function sugerirQueDestacar(
	claves: ClavesDeApi,
	entrada: { nombre?: string; datos?: string },
): Promise<string[]> {
	if (!claves.openAIKey || !(entrada.nombre || entrada.datos)) return [];
	try {
		const respuesta = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${claves.openAIKey}` },
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				response_format: { type: 'json_object' },
				max_tokens: 250,
				messages: [{
					role: 'user',
					content: `A shop sells this:
${entrada.nombre || ''}
${entrada.datos || ''}

Three things worth putting in an ad for it, in the advertiser's own everyday words: its offer if it has one, what makes it better than what people use today, the proof or guarantee it can show. Under 9 words each, in the same language as the text above. Only what that text supports — skip anything it does not say. Never mention where to put them or how big.

Answer JSON: {"sugerencias":["...","...","..."]}`,
				}],
			}),
		});
		if (!respuesta.ok) return [];
		const json = await respuesta.json();
		const leido = JSON.parse(json?.choices?.[0]?.message?.content || '{}');
		return Array.isArray(leido.sugerencias)
			? leido.sugerencias.filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => s.trim().slice(0, 120)).slice(0, 3)
			: [];
	} catch (error) {
		console.error('[clon-libre] no se pudieron armar las sugerencias:', error);
		return [];
	}
}

const linea = (etiqueta: string, valor?: string | string[] | null) => {
	if (!valor) return '';
	const texto = Array.isArray(valor) ? valor.filter(Boolean).join(' · ') : String(valor).trim();
	return texto ? `${etiqueta}: ${texto}\n` : '';
};

/** Sin el punto final, que después se le agrega otro y quedan dos. */
const sinPuntoFinal = (texto: string) => texto.replace(/\s*\.\s*$/, '');

/**
 * El prompt del clon libre. Fijo: no crece con la referencia.
 *
 * `magro` arma la versión para reintentar cuando OpenAI rechaza el pedido por su
 * filtro de contenido. Saca las dos líneas que hablan de personas —el ICP y lo
 * que pidió el usuario—, que es lo que medimos que dispara el rechazo con un
 * producto sensible. Se pierde puntería, pero una imagen sin el ICP es
 * infinitamente mejor que ninguna imagen.
 */
export function buildPromptLibre(ficha: FichaDelProducto, magro = false): string {
	const datosDelProducto = [
		linea('Product', ficha.nombres.filter(Boolean).join(' + ')),
		linea('Brand', ficha.marca),
		linea('What it is', ficha.datos),
		linea('What this shop sells', ficha.queVendeLaTienda),
		linea('Category', ficha.categoria),
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

	const publico = (!magro && ficha.icp)
		? `WHO THIS AD IS FOR: ${sinPuntoFinal(ficha.icp)}. Whoever appears in it is that person, and every choice in it is made so that person recognises themselves at a glance.`
		: `WHO THIS AD IS FOR is the customer the product information above describes. Whoever appears in it is that person, and every choice in it is made so that person recognises themselves at a glance.`;

	// La línea de b8ded8c, sin la advertencia. Si el mix de idiomas vuelve (el
	// "OBTENEZ VOTRE BOXER" real), la cura medida fue una frase: "Not one word of
	// the reference survives" — reintroducirla sola y comparando contra b8ded8c.
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

	const pedido = (!magro && ficha.indicaciones?.trim())
		? `
WHAT THE ADVERTISER ALSO WANTS THIS AD TO SAY: ${ficha.indicaciones.trim()}
`
		: '';

	// La decisión sobre la persona reemplaza la frase entera, no se le suma.
	const escena = ficha.decisionDePersona
		? `EVERYTHING IN THE PICTURE IS RE-CAST FOR THIS PRODUCT — the setting, the scene and whoever appears in it. Same composition, same roles, same positions, same light, but photographed again for what is being sold now, somewhere this product is really used. ${ficha.decisionDePersona}`
		: 'EVERYTHING IN THE PICTURE IS RE-CAST FOR THIS PRODUCT — the setting, the scene and whoever appears in it. Same composition, same roles, same positions, same light, but photographed again for what is being sold now: another person, the one this product is for, somewhere this product is really used. The same face in the same place is the sign nothing was adapted.';

	const pagina = ficha.carrusel
		// Las páginas se generan por separado y sin verse entre sí, y todas reciben
		// la misma ficha: sin esto las tres escribían el mismo titular y el mismo
		// beneficio, y el carrusel quedaba diciendo lo mismo tres veces.
		? `\nThis is page ${ficha.carrusel.indice + 1} of a ${ficha.carrusel.total}-page carousel and the reference is that page: make this one only, and make it sit with the others as one set. The pages are read one after the other and each carries its own step of the argument — the step this reference page is making. Say what only THIS page says: no headline, no claim and no benefit repeated from another page, and nothing that would leave a later page with nothing left to add. Page ${ficha.carrusel.indice + 1} of ${ficha.carrusel.total} is one moment in a sequence, not the whole ad said again.${ficha.otrasPaginas ? ` The last ${ficha.otrasPaginas} input image${ficha.otrasPaginas > 1 ? 's are' : ' is'} the other page${ficha.otrasPaginas > 1 ? 's' : ''} of this same carousel — they are there so you can read what they already say and say something else. Read them first, then write what is missing. They are context and nothing else: never draw them, never copy their words, never let any of them into this page.` : ''}\n`
		: '';

	return `The first input image is a winning advertisement. Make EXACTLY THIS AD, for a different product. The images after it are real photos of that product.

Everything about the design stays: the same layout, the same composition, ${letra}, ${color}, the same spacing and the same margins. Someone comparing the two must see the same ad twice, about two different things.

FIRST, READ EVERY WORD IN THE IMAGE. Go through it block by block — the logo lockup, the headline, every line of it, the paragraph, the button, any badge, pill, caption or small print — and for EACH ONE write the equivalent line for the product below. Every one of them changes. A line that still talks about the original advertiser's business is the single worst thing this can produce: the ad ends up looking right and saying nothing.

Each new line keeps the shape of the one it replaces: the same number of lines, roughly the same length, the same tone, the same job in the ad — a headline stays a headline, a benefit line stays a benefit line, a button stays a button. Where the original highlights one word in the accent colour, highlight the equivalent word of the new line.

THE PRODUCT THIS AD IS NOW FOR
${datosDelProducto}${pedido}${pagina}
THE PRODUCT IS THE ONE IN THE PHOTOS, NOT ONE LIKE IT — study every photo you were given and reproduce that exact object: its real shape and cut, its real colour, its real material, its waistband, seams, labels, prints and proportions where the photos show them. Its surface is copied as closely as its shape: the same weave or grain, the same perforations, speckles, flecks or bubbles, the same sheen and the same texture up close. Anything printed, stitched, embossed or moulded on it — a wordmark, a size tag, a seal, a logo — is reproduced letter for letter and sits exactly where the photos put it, at the same size and the same angle. Getting the product wrong ruins the ad even if everything else is perfect.

NOTHING EXPLICIT IS EVER SHOWN — people may wear the product and their body may be seen, hips, waist and the groin area the garment covers included. What must never appear is bare genitals, the shape of genitals read through the fabric, or bare nipples. The fabric is opaque and sits flat, and the framing is the one a retailer uses for its catalogue, not an erotic one.

${escena}

If the ad sets two sides against each other — before and after, us against them, with and without — keep that comparison and keep the sides clearly opposed. The product's side is the good one.

The decoration is what survives by mistake. Flowers, fruit, stones, ingredients, fabric, tools, scenery — whatever surrounds the original product was chosen to say something about THAT product and says nothing about this one. Replace it with the equivalent for this product, in the same spot and at the same size.

THE PRODUCT IS SHOT THE WAY THE REFERENCE SHOOTS ITS OWN — Look at how the original product appears and repeat exactly that: the same number of pieces, laid out in the same arrangement and the same angles, at the same size in the frame, with the same crop, the same lighting and the same shadows, on a surface that plays the same role but belongs to this product. If the original scatters seven items across the canvas, this product is scattered as seven items too; if it shows one hero piece dead centre, so does this one. The product is real and photographed, never illustrated, and it is shown as what it actually is — not turned into the shape of the original product.

${marca}

${publico}

${idioma}

Do not invent prices, percentages, ratings, guarantees or claims that are not written above. Do not keep the original advertiser's brand, logo, wordmark or product anywhere in the image. No watermarks, no platform UI.`;
}
