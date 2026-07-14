// Catálogo inicial usado como respaldo cuando la biblioteca dinámica no está conectada.
// N = nivel de consciencia al que le habla (N1 inconsciente → N5 decisión).
// ring = anillo del framework (Prueba social, Oferta, Comparación, Educativo, Demo, Autoridad).

export type Creativo = {
	id: number;
	nombre: string;
	ring: string;
	n: string;
	sirve: string;   // para qué sirve
	cuando: string;  // cuándo usarlo
	slug?: string;
	categoryGroup?: string;
	categoryBranch?: string;
	categoryLeaf?: string;
	keywords?: string[];
	featured?: boolean;
	sortOrder?: number;
};

export const rings = [
	{ id: 'todos',     label: 'Explorar todo', icon: 'grid_view' },
	{ id: 'social',    label: 'Prueba social', icon: 'reviews' },
	{ id: 'oferta',    label: 'Oferta',        icon: 'sell' },
	{ id: 'vs',        label: 'Comparación',   icon: 'compare_arrows' },
	{ id: 'educativo', label: 'Educativo',     icon: 'lightbulb' },
	{ id: 'demo',      label: 'Producto',      icon: 'inventory_2' },
	{ id: 'autoridad', label: 'Autoridad',     icon: 'verified' }
];

export const creativos: Creativo[] = [
	// ---------- PRUEBA SOCIAL (12) ----------
	{ id: 1,  ring: 'social', n: 'N3', nombre: 'Tweet',
	  sirve: 'Un tweet elogiando tu producto, con avatar, likes y retweets. El cerebro lo lee como opinión de un tercero, no como publicidad — por eso baja la guardia antes de que te des cuenta de que es un anuncio.',
	  cuando: 'Es una estructura fuerte para audiencias frías. Si vas a probar una sola, empezá por esta.' },

	{ id: 2,  ring: 'social', n: 'N4', nombre: 'Reseña 5 estrellas',
	  sirve: 'Una reseña real ampliada a pantalla completa: estrellas, nombre, verificado y la frase que más pega. Convierte una review escondida en tu web en el argumento central del anuncio.',
	  cuando: 'Retargeting a gente que vio el producto y no compró. La duda que tienen es "¿funcionará?" y esto la responde.' },

	{ id: 3,  ring: 'social', n: 'N4', nombre: 'Muro de reseñas',
	  sirve: 'Grid de 6 a 9 reseñas juntas. No convence una — convence el volumen. El mensaje real es "todo el mundo ya lo compró menos vos".',
	  cuando: 'Cuando ya tenés más de 50 reseñas. Con pocas se nota y juega en contra.' },

	{ id: 4,  ring: 'social', n: 'N3', nombre: 'Captura de WhatsApp',
	  sirve: 'Conversación real con un cliente feliz, con los tildes azules. Es el formato más creíble que existe porque es el que todos usamos todos los días.',
	  cuando: 'Ideal para servicios, high ticket y productos donde hay conversación previa a la venta.' },

	{ id: 5,  ring: 'social', n: 'N3', nombre: 'Comentario destacado',
	  sirve: 'Un comentario de Instagram o TikTok ampliado, con los likes visibles. Funciona porque el usuario está viendo el anuncio en la misma app donde vive ese comentario.',
	  cuando: 'Perfecto si tenés contenido orgánico con comentarios buenos. Reciclás lo que ya tenés gratis.' },

	{ id: 6,  ring: 'social', n: 'N2', nombre: 'Antes y después',
	  sirve: 'Split vertical u horizontal. El creativo más viejo del mundo y sigue siendo de los que más venden porque muestra la transformación sin explicarla.',
	  cuando: 'Skincare, fitness, reformas, limpieza, estética. Cualquier cosa con resultado visible.' },

	{ id: 7,  ring: 'social', n: 'N4', nombre: 'Testimonial con rostro',
	  sirve: 'Foto real del cliente + frase textual + nombre. La cara humana es lo que frena el scroll; la frase es lo que cierra.',
	  cuando: 'Cuando el cliente te dio permiso y tiene una historia concreta. Nunca con foto de banco de imágenes: se nota.' },

	{ id: 8,  ring: 'social', n: 'N5', nombre: 'DM "¿queda stock?"',
	  sirve: 'Captura de un mensaje directo preguntando si todavía hay unidades. Comunica demanda y escasez al mismo tiempo, sin que vos digas ninguna de las dos cosas.',
	  cuando: 'Retargeting caliente y remarketing de carrito abandonado.' },

	{ id: 9,  ring: 'social', n: 'N3', nombre: 'Contador social',
	  sirve: 'Un número gigante: "12.483 personas ya lo están usando". La cifra hace todo el trabajo. Cero adorno.',
	  cuando: 'Cuando el número ya es respetable. Debajo de 1.000 clientes, mejor no.' },

	{ id: 10, ring: 'social', n: 'N2', nombre: 'Como se vio en',
	  sirve: 'Logos de medios, podcasts o marcas donde apareciste. Autoridad prestada: te asocia a marcas que el usuario ya respeta.',
	  cuando: 'Público frío que no te conoce. Es un atajo de confianza.' },

	{ id: 11, ring: 'social', n: 'N4', nombre: 'Review de marketplace',
	  sirve: 'Captura de una reseña de Mercado Libre o Amazon, con el sello de compra verificada. El "compra verificada" vale más que cualquier adjetivo que escribas.',
	  cuando: 'Si vendés también en marketplaces. Trae la credibilidad de la plataforma a tu tienda propia.' },

	{ id: 12, ring: 'social', n: 'N3', nombre: 'UGC con producto en mano',
	  sirve: 'Foto tipo celular, mala luz a propósito, producto en mano + frase escrita encima. Se ve como contenido, no como anuncio, y eso es exactamente el punto.',
	  cuando: 'Feed y Stories en frío. Se integra al contenido sin parecer un anuncio tradicional.' },

	// ---------- OFERTA (10) ----------
	{ id: 13, ring: 'oferta', n: 'N5', nombre: 'Precio tachado',
	  sirve: 'Precio viejo tachado, precio nuevo enorme. El ancla de precio es el sesgo más viejo y más rentable del marketing.',
	  cuando: 'Cierre de venta. Retargeting de 7 días, gente que ya vio el producto.' },

	{ id: 14, ring: 'oferta', n: 'N5', nombre: 'Bundle / Kit',
	  sirve: 'Grid con todos los productos del combo y un precio único abajo. Sube el ticket promedio sin que el cliente sienta que gastó más.',
	  cuando: 'Cuando querés levantar el AOV. Es el creativo que más plata suele mover por venta.' },

	{ id: 15, ring: 'oferta', n: 'N5', nombre: 'Fecha límite',
	  sirve: 'Un contador o una fecha concreta en pantalla. La urgencia real convierte; la falsa te quema la marca. Poné una fecha que se cumpla de verdad.',
	  cuando: 'Últimas 48-72hs de una promo. No lo dejes corriendo siempre o pierde todo el efecto.' },

	{ id: 16, ring: 'oferta', n: 'N5', nombre: 'Regalo con la compra',
	  sirve: 'El producto principal más el regalo destacado con un lazo o un badge. Regalar algo funciona mejor que descontar lo mismo en plata: no devalúa tu producto.',
	  cuando: 'Cuando no querés bajar el precio pero necesitás empujar la conversión.' },

	{ id: 17, ring: 'oferta', n: 'N5', nombre: '2x1 / 3x2',
	  sirve: 'Cantidad visual. Se entiende en medio segundo sin leer una palabra.',
	  cuando: 'Productos de consumo repetido: cosmética, suplementos, comida, descartables.' },

	{ id: 18, ring: 'oferta', n: 'N4', nombre: 'Envío gratis',
	  sirve: 'El envío es la razón número uno de carrito abandonado. Si es gratis, no lo escondas en el checkout: gritalo en el creativo.',
	  cuando: 'Retargeting de carrito abandonado. Es el que más recupera de todos.' },

	{ id: 19, ring: 'oferta', n: 'N5', nombre: 'Cupón visual',
	  sirve: 'El código de descuento gigante en pantalla. El usuario lo memoriza y llega al checkout con la decisión medio tomada.',
	  cuando: 'Campañas de temporada: Hot Sale, Black Friday, Navidad.' },

	{ id: 20, ring: 'oferta', n: 'N5', nombre: 'Escalera de precio',
	  sirve: 'Tabla mostrando que cuanto más llevás, menos pagás por unidad. Empuja al pack grande solo con lógica, sin presión.',
	  cuando: 'Suplementos, cosmética, cualquier producto con reposición mensual.' },

	{ id: 21, ring: 'oferta', n: 'N4', nombre: 'Sello de garantía',
	  sirve: 'La garantía como protagonista, no como letra chica. Te saca el riesgo de encima del cliente y lo pone sobre vos — que es donde tiene que estar.',
	  cuando: 'Productos caros o marcas nuevas donde la desconfianza es el freno principal.' },

	{ id: 22, ring: 'oferta', n: 'N5', nombre: 'Cuotas sin interés',
	  sirve: 'El precio partido en cuotas, con la cuota más grande que el total. Cambia la percepción de "caro" a "accesible" sin tocar el precio.',
	  cuando: 'Ticket alto. Indispensable en Argentina y en LATAM en general.' },

	// ---------- COMPARACIÓN (7) ----------
	{ id: 23, ring: 'vs', n: 'N4', nombre: 'Nosotros vs Ellos',
	  sirve: 'Tabla de dos columnas con tildes verdes de tu lado y cruces rojas del otro. Polariza, y polarizar vende.',
	  cuando: 'Mercados saturados donde el cliente ya está comparando opciones.' },

	{ id: 24, ring: 'vs', n: 'N4', nombre: 'Lado a lado',
	  sirve: 'Tu producto y la alternativa, foto contra foto, con las diferencias señaladas. Deja que la imagen argumente sola.',
	  cuando: 'Cuando tu producto gana visualmente. Si no gana a simple vista, no uses este.' },

	{ id: 25, ring: 'vs', n: 'N3', nombre: 'Comparación de costo',
	  sirve: 'Tu precio contra lo que gasta el cliente hoy en la alternativa cara. Reencuadra tu producto como ahorro, no como gasto.',
	  cuando: 'Servicios, software, y todo lo que reemplaza algo más caro.' },

	{ id: 26, ring: 'vs', n: 'N4', nombre: 'Pagás X, recibís Y',
	  sirve: 'Un lado el precio, del otro la pila de todo lo que incluye. Desbalancea la ecuación de valor a tu favor.',
	  cuando: 'Bundles, cursos, membresías, kits. Todo lo que tiene muchos componentes.' },

	{ id: 27, ring: 'vs', n: 'N3', nombre: 'Checklist de compra',
	  sirve: '"Qué mirar antes de comprar" con 5 criterios que — casualmente — solo vos cumplís todos. Educás y descalificás a la competencia en el mismo movimiento.',
	  cuando: 'Público que está investigando y todavía no eligió marca.' },

	{ id: 28, ring: 'vs', n: 'N3', nombre: 'Composición comparada',
	  sirve: 'Tus ingredientes o materiales contra los del genérico. Funciona porque es verificable y el cliente puede chequearlo.',
	  cuando: 'Suplementos, skincare, alimentos, textiles. Todo donde la fórmula importa.' },

	{ id: 29, ring: 'vs', n: 'N2', nombre: 'Con vs sin',
	  sirve: 'La línea de tiempo del cliente con tu producto y sin él. Vende el futuro, no el objeto.',
	  cuando: 'Productos de transformación lenta donde el resultado tarda en verse.' },

	// ---------- EDUCATIVO (10) ----------
	{ id: 30, ring: 'educativo', n: 'N1', nombre: 'Listicle',
	  sirve: '"Los 5 errores que están arruinando tu X". Entrega valor antes de pedir nada. Es la puerta de entrada al mundo del que no te conoce.',
	  cuando: 'Top of funnel puro. El mejor creativo para llenar públicos de retargeting barato.' },

	{ id: 31, ring: 'educativo', n: 'N1', nombre: 'Estadística brutal',
	  sirve: 'Un número enorme que incomoda: "el 73% de las mujeres tiene esto y no lo sabe". El dato frena el scroll mejor que cualquier foto.',
	  cuando: 'Frío absoluto. Especialmente si el problema todavía no es consciente.' },

	{ id: 32, ring: 'educativo', n: 'N2', nombre: 'Mito vs realidad',
	  sirve: 'Contradecís una creencia común. La contradicción genera curiosidad y la curiosidad genera clicks.',
	  cuando: 'Nichos con mucha desinformación: salud, finanzas, nutrición, marketing.' },

	{ id: 33, ring: 'educativo', n: 'N2', nombre: 'Diagrama señalado',
	  sirve: 'Flechas y etiquetas sobre una imagen explicando qué pasa y por qué. Enseña algo, y quien te enseña algo se gana tu confianza.',
	  cuando: 'Productos técnicos que necesitan una explicación para que se entienda el valor.' },

	{ id: 34, ring: 'educativo', n: 'N2', nombre: 'Pregunta directa',
	  sirve: '"¿Te levantás cansado aunque duermas 8 horas?" Si la respuesta es sí, ya te ganaste al lector. El resto del anuncio es un trámite.',
	  cuando: 'Cuando conocés muy bien el dolor exacto de tu cliente. Si la pregunta es genérica, no funciona.' },

	{ id: 35, ring: 'educativo', n: 'N1', nombre: 'Meme',
	  sirve: 'Humor que el cliente siente propio. Se comparte, y un anuncio compartido es alcance gratis.',
	  cuando: 'Marcas jóvenes con tono suelto. Con una marca seria queda forzado y se nota.' },

	{ id: 36, ring: 'educativo', n: 'N1', nombre: 'Comic',
	  sirve: 'Dos a cuatro viñetas: problema, intento fallido, tu producto, resolución. Cuenta una historia entera en una sola imagen.',
	  cuando: 'Frío. Es de los pocos estáticos que retienen la atención como si fuera un video.' },

	{ id: 37, ring: 'educativo', n: 'N2', nombre: 'Sí / No',
	  sirve: 'Dos columnas con lo que hay que hacer y lo que no. Simple, escaneable, y el cliente se autoevalúa mientras lo lee.',
	  cuando: 'Educar rápido a un público que recién empieza a entender su problema.' },

	{ id: 38, ring: 'educativo', n: 'N1', nombre: 'Definición',
	  sirve: 'Formato entrada de diccionario definiendo el problema con nombre y todo. Ponerle nombre a lo que sentís es la mitad de la solución.',
	  cuando: 'Cuando el cliente tiene el síntoma pero no sabe cómo se llama.' },

	{ id: 39, ring: 'educativo', n: 'N2', nombre: 'Nota manuscrita',
	  sirve: 'Texto escrito a mano sobre papel. Rompe el patrón visual del feed entero: en un scroll de imágenes limpias, la letra manuscrita grita.',
	  cuando: 'Cuando querés un mensaje personal y cercano. Excelente para marcas de fundador.' },

	// ---------- PRODUCTO / DEMO (8) ----------
	{ id: 40, ring: 'demo', n: 'N4', nombre: 'Hero limpio',
	  sirve: 'El producto solo, fondo plano, luz perfecta. Aburrido y necesario: es el que sostiene el escalado cuando los creativos raros se queman.',
	  cuando: 'Retargeting y catálogo. Es el caballo de tiro, no el ganador de la carrera.' },

	{ id: 41, ring: 'demo', n: 'N3', nombre: 'Features señaladas',
	  sirve: 'El producto con líneas y etiquetas apuntando a cada beneficio. Convierte características en razones para comprar.',
	  cuando: 'Productos con varios diferenciales que se pierden si solo mostrás la foto.' },

	{ id: 42, ring: 'demo', n: 'N3', nombre: 'Lifestyle en uso',
	  sirve: 'El producto usado por una persona real en contexto real. El cliente se proyecta: no ve el producto, se ve a sí mismo.',
	  cuando: 'Moda, deco, tecnología, todo lo aspiracional.' },

	{ id: 43, ring: 'demo', n: 'N3', nombre: 'Despiece',
	  sirve: 'El producto abierto o explotado, mostrando cada capa o componente. Comunica calidad e ingeniería sin decir "somos de calidad".',
	  cuando: 'Productos donde el interior justifica el precio.' },

	{ id: 44, ring: 'demo', n: 'N3', nombre: 'Escala real',
	  sirve: 'Tu producto al lado de un objeto conocido: una mano, una moneda, un teléfono. Elimina la duda de tamaño, que es una objeción silenciosa que mata muchas ventas.',
	  cuando: 'Cualquier producto físico chico. Es una estructura simple y muy subestimada.' },

	{ id: 45, ring: 'demo', n: 'N4', nombre: 'Paso a paso 1-2-3',
	  sirve: 'Tres cuadros mostrando lo simple que es usarlo. Mata la objeción de "esto va a ser complicado" antes de que aparezca.',
	  cuando: 'Productos que parecen difíciles de usar aunque no lo sean.' },

	{ id: 46, ring: 'demo', n: 'N4', nombre: 'Qué viene en la caja',
	  sirve: 'Todo el contenido desplegado y ordenado, tipo flat lay. Justifica el precio mostrando cantidad.',
	  cuando: 'Kits, combos, cajas de suscripción, cualquier cosa con varios componentes.' },

	{ id: 47, ring: 'demo', n: 'N3', nombre: 'Secuencia de 3 frames',
	  sirve: 'Tres momentos del producto funcionando, uno al lado del otro. Es lo más cerca que un estático puede estar de un video, al costo de un estático.',
	  cuando: 'Cuando el video rinde pero no tenés presupuesto para producirlo.' },

	// ---------- AUTORIDAD (3) ----------
	{ id: 48, ring: 'autoridad', n: 'N3', nombre: 'Aval de experto',
	  sirve: 'Un profesional con credencial respaldando el producto. Toma prestada la confianza que a tu marca todavía le falta.',
	  cuando: 'Salud, estética, suplementos, finanzas. Cualquier rubro donde el riesgo percibido es alto.' },

	{ id: 49, ring: 'autoridad', n: 'N4', nombre: 'Sellos y certificaciones',
	  sirve: 'Certificados, aprobaciones y sellos como protagonistas. Cierra las objeciones de seguridad de un plumazo.',
	  cuando: 'Productos regulados o mercados donde ya hubo estafas y la gente desconfía.' },

	{ id: 50, ring: 'autoridad', n: 'N2', nombre: 'Carta del fundador',
	  sirve: 'Tu foto y tu historia: por qué existe esto. La gente no le compra a las empresas, le compra a las personas.',
	  cuando: 'Marcas nuevas sin reseñas todavía. Es lo único que tenés cuando no tenés prueba social.' }
];
