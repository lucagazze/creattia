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
 * El prompt vigente es el PROMPT B del experimento de la campera GAP
 * (2026-08-11): tres referencias reales —editorial MR PORTER, callouts de Oats
 * Overnight, "Wait... Mmmhmm" de keto— generadas lado a lado con el prompt de
 * la app (base b8ded8c + advertencia de idioma) y con B. B ganó las tres,
 * juzgado por Luca y verificado aparte: styling más fiel al ganador, paleta del
 * ganador conservada (la base se iba a los colores de la marca), la
 * interjección manuscrita localizada ("Siiiiii" donde la base dejó "Mmmhmm") y
 * la escenografía adaptada con criterio. B es la base b8ded8c más cuatro
 * bloques: TYPESET, el diseño-sale-de-la-primera-imagen, el bloque de prendas
 * en lugar del pudor fijo, y el cierre con marcas de terceros.
 *
 * La ENTRADA sigue siendo la de b8ded8c: TODAS las fotos del producto viajan,
 * con una sola excepción quirúrgica y a todo o nada — la galería que es 100%
 * placas promocionales (el caso mojarra) viaja como packshot. El filtrado
 * parcial y el tope de fotos se midieron y perdieron.
 *
 * El prompt mínimo (C del mismo experimento) quedó DESCARTADO con causa: lindo
 * y mentiroso — inventó un rating 4.7 y un precio de $69.000 sobre un producto
 * de $75.000, y en el panel de 5 referencias dejó la marca del ganador entera.
 * Todo cambio nuevo entra de a uno, comparando imágenes contra el vigente en el
 * flujo staged de Vercel.
 *
 * Dos ajustes post-panel de 5 referencias (2026-08-11), cada uno con su
 * evidencia: la comparativa exige OTRO artículo genérico del otro lado (B puso
 * la misma campera en los dos lados de un us-vs-them y la comparación no decía
 * nada) y el cierre nombra garantías, envío gratis y promesas de servicio (B
 * inventó "Garantía real" y "Atención personalizada" que la ficha no tenía).
 *
 * Y un tercero con su evidencia (2026-08-11, mojarra sobre el comparador
 * alemán de colágeno): los números del ganador no son datos de este producto,
 * ni copiados ni disfrazados. El modelo convirtió "22,40€ pro Kilo" en
 * "22.400$ por unidad" y "240€ pro Jahr" en "240.000$ por año" — para él no
 * era inventar, era reemplazar el texto del bloque. La regla ahora lo dice
 * explícito: todo número del aviso aparece dígito por dígito en la ficha.
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
	/**
	 * Qué color va en qué: el fondo, los títulos, los textos, el acento, el botón
	 * y el texto del botón. Una lista plana de hexadecimales deja que el modelo los
	 * reparta a su criterio, y así el fondo de la marca terminaba de titular.
	 */
	rolesDeColor?: { fondo?: string; titulo?: string; texto?: string; acento?: string; boton?: string; textoBoton?: string };
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
	/**
	 * Si el producto se usa puesto sobre el cuerpo: activa el bloque de prendas
	 * del PROMPT B. En un aviso de pesca o suplementos ese bloque no aporta nada.
	 */
	seUsaEnElCuerpo?: boolean;
	/**
	 * El lugar donde pasa la escena, cuando el usuario lo pidió.
	 *
	 * Mismo patrón que la persona y el logo: sin elección el prompt es b8ded8c
	 * intacto, y la elección SUSTITUYE la cláusula del recasteo ("somewhere this
	 * product is really used") en vez de sumarle una orden.
	 */
	lugarElegido?: string;
	/**
	 * Los textos ya escritos: qué decía cada bloque del ganador y qué va a decir.
	 *
	 * El análisis del ganador ya devuelve esta lista en CADA generación y hasta
	 * ahora se descartaba entera. Pasarla cambia quién escribe el copy: sin ella el
	 * motor lo improvisa mientras dibuja, y ahí es donde sobrevivían el disclaimer
	 * de la FDA, un "$20 OFF" que no era de nadie, un titular en inglés y los
	 * números del ganador transliterados. Con la lista delante, el texto del
	 * ganador no tiene por dónde colarse.
	 *
	 * Es la lista SOLA —700 a 1.000 caracteres— y no el análisis entero, que son
	 * 10.000 a 14.000 y es lo que hacía que el prompt se pasara del techo de
	 * OpenAI y saliera rígido.
	 */
	textos?: Array<{ original?: string; replacement?: string }>;
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
	 * `mejores` queda siempre vacío: el tope de tres fotos se midió contra
	 * b8ded8c y las imágenes salían peor — entrada abundante gana. `graficas` sí
	 * se llena, pero alimenta una sola decisión, binaria: si la galería ENTERA
	 * son placas de diseño, no viaja ninguna y se fabrica un packshot. Nunca un
	 * filtrado parcial.
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
	/**
	 * Si el producto se usa puesto sobre el cuerpo: activa el bloque de prendas
	 * del PROMPT B. En un aviso de pesca o suplementos ese bloque no aporta nada.
	 */
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

Answer JSON with four keys:

"aspecto": what you actually SEE, so someone who never saw it can draw it exactly — what kind of object it is, its shape and cut, its exact colours, the material and how it behaves, the seams, labels, prints and where they sit, and anything written on it. Describe the object on its own: never how it fits on a body, no anatomy, nothing about the models. Under 180 words.

"icp": the one customer this is really for, in ONE sentence a photographer could cast from — age range, gender, how they dress and how they live their day. A casting note, nothing about the body or about using the product. Only what the text above supports.

"conPersona": the 0-based indexes of the photos where a human body is visible. Photos of the product alone, flat lays and diagrams do not count.

"graficas": the 0-based indexes of the images that are DESIGNED GRAPHICS rather than photographs of the object — a promo card with headlines, prices, badges, banners, flags or a collage laid over or beside it. A shop's own promo card counts even when the object is inside it. A plain photo never counts.

"seUsaEnElCuerpo": true only if this is something a person wears or puts on their body.`;

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
			// `mejores` queda vacío a propósito: el tope de tres fotos se midió
			// contra b8ded8c y perdió. `graficas` sí se lee, pero solo alimenta la
			// pregunta binaria de `todasSonPlacas` — nunca un filtrado parcial.
			mejores: [],
			graficas: indices(leido.graficas),
			conPersona: indices(leido.conPersona),
			seUsaEnElCuerpo: leido.seUsaEnElCuerpo === true,
		};
	} catch (error) {
		// Un fallo acá no corta nada: se genera igual, con una ficha más pobre.
		console.error('[clon-libre] no se pudo leer el producto:', error);
		return LECTURA_VACIA;
	}
}

/**
 * La única pregunta que se le hace al clasificador: ¿la galería ENTERA son
 * placas de diseño? Ahí el output actual es basura segura —el motor clona la
 * placa de la tienda, como pasó con la mojarra— así que cualquier intervención
 * solo puede mejorar. Con una sola foto real la respuesta es no y no se toca
 * nada: el filtrado parcial y el tope de fotos ya se midieron contra b8ded8c y
 * perdieron.
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
 * La única excepción es la galería que es TODA placas: no viaja ninguna, y el
 * vacío le dice al que llama que fabrique un packshot. Es a todo o nada a
 * propósito — mientras haya una foto real, esto es b8ded8c intacto, placas
 * incluidas.
 */
export function fotosParaElMotor(fotos: EngineImage[], lectura: LecturaDelProducto): EngineImage[] {
	if (todasSonPlacas(fotos, lectura)) return [];
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

	// La advertencia volvió el 2026-08-11, sola y con disparador visto: con la
	// línea pelada de b8ded8c salieron un "Wait..." intacto y el "Mmmhmm"
	// manuscrito del ganador en avisos de una campera GAP — palabras del ganador
	// que sobreviven por no parecer idioma. Es la reintroducción 1 de la lista
	// del encabezado; se compara contra producción antes de promover.
	const idioma = `Every word in the ad is written in ${ficha.idioma || 'the language the product information above is written in'}, exactly as a native speaker would write it — correct spelling, correct accents, correct grammar. Not one word of the reference survives: not a short word that looks international, not a handwritten interjection — each one is replaced by what a person selling THIS product would actually write.`;

	// Los colores y la tipografía de la marca no se agregan como un pedido más:
	// REEMPLAZAN la cláusula del ganador. Tener las dos es pedirle dos cosas
	// distintas, y ahí gana la que ve en la imagen y la elección se ignora.
	// La identidad elegida salía nombrada DENTRO de la lista de siete cosas que se
	// conservan del ganador, y ahí pesaba como un ítem más entre siete: se elegían
	// los colores de la web y el aviso salía con los del ganador igual. Lo que
	// queda en la lista es la ESTRUCTURA —tamaños, pesos, alineaciones, roles— y
	// la identidad pasa a un bloque propio, que es lo único que la hace pesar.
	const eligioLetra = Boolean(ficha.tipografiaDeLaMarca?.headings || ficha.tipografiaDeLaMarca?.body);
	const eligioColor = Boolean(ficha.coloresDeLaMarca?.length);

	const letra = eligioLetra
		? 'the same type sizes, weights, alignments and hierarchy'
		: 'the same typography — the very letterforms you can see in the image — the same type sizes, weights and alignments';

	const color = eligioColor
		? 'the same colour roles: what was the background is still the background, what was the ink is still the ink, and the accent still lands on the equivalent word'
		: 'the same colour palette, the same accent colour on the same word';

	const tipografiaPedida = [
		ficha.tipografiaDeLaMarca?.headings && `${ficha.tipografiaDeLaMarca.headings} for every headline and every large word`,
		ficha.tipografiaDeLaMarca?.body && `${ficha.tipografiaDeLaMarca.body} for the body copy, the captions and the small print`,
	].filter(Boolean).join(', and ');

	// Cada color con el nombre de lo que pinta. Sin esto son hexadecimales sueltos
	// y el modelo decide él cuál va dónde, que es justamente lo que se estaba
	// eligiendo a mano en la pantalla.
	const roles = ficha.rolesDeColor || {};
	const porRol = [
		roles.fondo && `${roles.fondo} is the background`,
		roles.titulo && `${roles.titulo} is every headline`,
		roles.texto && `${roles.texto} is the body copy and the small print`,
		roles.acento && `${roles.acento} is the accent`,
		roles.boton && `${roles.boton} fills the buttons`,
		roles.textoBoton && `${roles.textoBoton} is the text on top of the buttons`,
	].filter(Boolean).join(', ');

	const identidad = (eligioLetra || eligioColor)
		? `THIS AD IS SET IN THE ADVERTISER'S OWN IDENTITY, NOT THE REFERENCE'S. ${
			eligioLetra ? `The type is ${tipografiaPedida}. Those are the typefaces that get drawn — the reference's letterforms do not appear anywhere in this ad, not even where they would look better. ` : ''
		}${
			eligioColor ? (porRol
				? `The colours are assigned, not suggested: ${porRol}. Paint each thing with the colour named for it and with no other. A colour of the reference that is not in that list does not survive anywhere in the ad. `
				: `The colours are ${ficha.coloresDeLaMarca!.join(', ')}, and only those: every surface, every block, every word and every button is painted from that set, in the same roles the reference uses them. A colour of the reference that is not in that list does not survive. `) : ''
		}This is the part somebody will check first against their own brand, so it is the part that has to be exact.

`
		: '';

	// Vuelve al texto y al lugar de bb23858. La versión con "no es opcional, tiene
	// que verse" pesaba más sobre el papel, pero entró junto con otros cambios y
	// las imágenes salieron peor. Hasta que no se mida sola, vale la que ya estaba.
	const pedido = (!magro && ficha.indicaciones?.trim())
		? `
WHAT THE ADVERTISER ALSO WANTS THIS AD TO SAY: ${ficha.indicaciones.trim()}
`
		: '';

	// La decisión sobre la persona reemplaza la frase entera, no se le suma. El
	// lugar elegido sustituye la cláusula del recasteo, con la misma lógica.
	const dondePasa = ficha.lugarElegido?.trim()
		? `in this exact setting: ${sinPuntoFinal(ficha.lugarElegido.trim())}`
		: 'somewhere this product is really used';
	const escena = ficha.decisionDePersona
		? `EVERYTHING IN THE PICTURE IS RE-CAST FOR THIS PRODUCT — the setting, the scene and whoever appears in it. Same composition, same roles, same positions, same light, but photographed again for what is being sold now, ${dondePasa}. ${ficha.decisionDePersona}`
		: `EVERYTHING IN THE PICTURE IS RE-CAST FOR THIS PRODUCT — the setting, the scene and whoever appears in it. Same composition, same roles, same positions, same light, but photographed again for what is being sold now: another person, the one this product is for, ${dondePasa}. The same face in the same place is the sign nothing was adapted.`;

	// El bloque de prendas del PROMPT B: solo cuando el producto se usa puesto.
	// Dice lo del pudor por el lado positivo y sin el vocabulario que el filtro
	// de OpenAI castiga, así que va también en el magro.
	const vestible = ficha.seUsaEnElCuerpo
		? `PEOPLE CAN WEAR THE PRODUCT — shoot them the way the brand itself would for its own campaign: an editorial retail photograph, the kind a shop publishes on its product page and runs as an ad. The garment is opaque, sits flat and stays where it belongs, the pose is one a catalogue would print, and the crop is the one a retailer chooses.

`
		: '';

	// Va donde el prompt ya está leyendo el aviso bloque por bloque, no al final.
	//
	// Con tope, porque esta lista es lo ÚNICO del prompt que crece con la
	// referencia: sin límite, un ganador cargado de texto lo devuelve al problema
	// que tumbaba al detallado, los 32.000 caracteres de OpenAI. Veinte bloques de
	// doscientos caracteres cubren de sobra lo medido — entre 5 y 12 bloques, 295
	// a 1.008 caracteres en total.
	const recorte = (t: string) => (t.length > 200 ? `${t.slice(0, 199)}…` : t);
	const listaDeTextos = (ficha.textos || [])
		.filter((t) => (t.original || '').trim() && (t.replacement || '').trim())
		.slice(0, 20)
		.map((t, i) => `${i + 1}. "${recorte(t.original!.trim())}"  ->  "${recorte(t.replacement!.trim())}"`)
		.join('\n');
	const textosEscritos = listaDeTextos
		? `THE TEXT IS ALREADY WRITTEN. This is each block of the reference and the line that replaces it:

${listaDeTextos}

Use those words. If one will not fit cleanly at its size, shorten it — never go back to the reference's own wording.

`
		: '';

	const pagina = ficha.carrusel
		// Las páginas se generan por separado y sin verse entre sí, y todas reciben
		// la misma ficha: sin esto las tres escribían el mismo titular y el mismo
		// beneficio, y el carrusel quedaba diciendo lo mismo tres veces.
		? `\nThis is page ${ficha.carrusel.indice + 1} of a ${ficha.carrusel.total}-page carousel and the reference is that page: make this one only, and make it sit with the others as one set. The pages are read one after the other and each carries its own step of the argument — the step this reference page is making. Say what only THIS page says: no headline, no claim and no benefit repeated from another page, and nothing that would leave a later page with nothing left to add. Page ${ficha.carrusel.indice + 1} of ${ficha.carrusel.total} is one moment in a sequence, not the whole ad said again.${ficha.otrasPaginas ? ` The last ${ficha.otrasPaginas} input image${ficha.otrasPaginas > 1 ? 's are' : ' is'} the other page${ficha.otrasPaginas > 1 ? 's' : ''} of this same carousel — they are there so you can read what they already say and say something else. Read them first, then write what is missing. They are context and nothing else: never draw them, never copy their words, never let any of them into this page.` : ''}\n`
		: '';

	return `The first input image is a winning advertisement. Make EXACTLY THIS AD, for a different product. The images after it are real photos of that product.

Everything about the design stays: the same layout, the same composition, ${letra}, ${color}, the same spacing and the same margins. Someone comparing the two must see the same ad twice, about two different things.

FIRST, READ EVERY WORD IN THE IMAGE. Go through it block by block — the logo lockup, the headline, every line of it, the paragraph, the button, any badge, pill, caption or small print — and for EACH ONE write the equivalent line for the product below. Every one of them changes. A line that still talks about the original advertiser's business is the single worst thing this can produce: the ad ends up looking right and saying nothing.

THE TYPE IS TYPESET, NOT DRAWN. Every letter comes out crisp at full resolution, with clean edges, even weight across the whole word and even spacing between letters. No ghosting, no doubled strokes, no soft halo, no drop shadow or glow the reference does not have, no letters that go blurry or dissolve at the end of a line. Spelling and accents are exact and every line reads like something a person would actually write. If a line will not fit cleanly at that size, shorten the wording — never squeeze the letters, never blur them, never let them overlap.

${textosEscritos}Each new line keeps the shape of the one it replaces: the same number of lines, roughly the same length, the same tone, the same job in the ad — a headline stays a headline, a benefit line stays a benefit line, a button stays a button. Where the original highlights one word in the accent colour, highlight the equivalent word of the new line.

THE PRODUCT THIS AD IS NOW FOR
${datosDelProducto}${pedido}${pagina}
${identidad}THE DESIGN COMES FROM THE FIRST IMAGE AND FROM NOWHERE ELSE. If a product photo arrives with a design of its own on it — text, a headline, a price, a badge, a banner, a flag — that design belongs to whoever made that photo and has nothing to do with this ad. Take the object out of it and leave the rest behind.

THE PRODUCT IS THE ONE IN THE PHOTOS, NOT ONE LIKE IT — study every photo you were given and reproduce that exact object: its real shape and cut, its real colour, its real material, its waistband, seams, labels, prints and proportions where the photos show them. Its surface is copied as closely as its shape: the same weave or grain, the same perforations, speckles, flecks or bubbles, the same sheen and the same texture up close. Anything printed, stitched, embossed or moulded on it — a wordmark, a size tag, a seal, a logo — is reproduced letter for letter and sits exactly where the photos put it, at the same size and the same angle. Getting the product wrong ruins the ad even if everything else is perfect.

${vestible}${escena}

If the ad sets two sides against each other — before and after, us against them, with and without — keep that comparison and keep the sides clearly opposed. The product's side is the good one, and the other side never shows this product again: it shows a DIFFERENT, generic, unbranded item of the same category — what the buyer would settle for instead. The same product on both sides says nothing.

The decoration is what survives by mistake. Flowers, fruit, stones, ingredients, fabric, tools, scenery — whatever surrounds the original product was chosen to say something about THAT product and says nothing about this one. Replace it with the equivalent for this product, in the same spot and at the same size.

THE PRODUCT IS SHOT THE WAY THE REFERENCE SHOOTS ITS OWN — Look at how the original product appears and repeat exactly that: the same number of pieces, laid out in the same arrangement and the same angles, at the same size in the frame, with the same crop, the same lighting and the same shadows, on a surface that plays the same role but belongs to this product. If the original scatters seven items across the canvas, this product is scattered as seven items too; if it shows one hero piece dead centre, so does this one. The product is real and photographed, never illustrated, and it is shown as what it actually is — not turned into the shape of the original product.

${marca}

${publico}

${idioma}

Do not invent prices, percentages, ratings, guarantees, warranties, free shipping or service promises — if a claim is not written above, it does not appear in the ad. The reference's own figures are never facts about this product: do not keep them and do not adapt them into lookalikes — a 50% there does not become a 45% here, a 22,40 there does not become a 22.400 here. Every number in the ad appears digit for digit in the product information above; a block built on a number you do not have gets a verified number doing the same job, or an honest line without one. Do not keep anything that came with the original ad: its brand, its logo, its wordmark, its product, and also the marks it borrowed from others — award seals, press logos, star ratings, certifications, legal small print. Any of those stays only if THIS product genuinely has its own. No watermarks, no platform UI.`;
}
