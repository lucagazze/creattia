import React, { useState } from 'react';

export type ProductReviewMedia = {
	path?: string;
	url: string;
	type?: 'image' | 'video';
};

export type ProductReviewItem = {
	id: string;
	name: string;
	product_url?: string | null;
	price_text?: string | null;
	media?: ProductReviewMedia[];
	imageUrls?: string[];
	videoUrls?: string[];
	metadata?: Record<string, any>;
};

function mediaFor(product: ProductReviewItem): ProductReviewMedia[] {
	if (product.media?.length) return product.media;
	return [
		...(product.imageUrls || []).map((url) => ({ url, type: 'image' as const })),
		...(product.videoUrls || []).map((url) => ({ url, type: 'video' as const })),
	];
}

/**
 * Lo que se importó de la URL, para elegir qué entra al creativo.
 *
 * Era una lista vertical: cada producto ocupaba un bloque alto con su cabecera,
 * su botón y una tira de fotos. Con la home de una tienda —que ahora trae hasta
 * 8 productos separados— había que scrollear muchísimo para ver qué se detectó.
 *
 * Ahora es una grilla de tarjetas: la foto manda, el nombre debajo, y se
 * selecciona tocando la tarjeta entera. Se ve todo de un vistazo y las fotos
 * extra de un producto se abren solo si hacen falta.
 */
export type SubjectChoice = 'general' | 'especifico';

/**
 * De qué habla el anuncio. Dos opciones, no tres.
 *
 * Antes se elegía entre "la tienda", "un producto" y "un servicio". Las dos
 * primeras responden a la misma pregunta —¿de todo o de una cosa?— y la tercera
 * responde a otra: si eso que se vende es un objeto o no. Eso último no hace
 * falta preguntarlo, se sabe mirando si hay fotos. Queda una sola decisión.
 */
const SUBJECT_OPTIONS: Array<{ value: SubjectChoice; label: string; hint: string }> = [
	{ value: 'general', label: 'En general', hint: 'Habla del negocio completo: lo que ofrecés, para quién es y por qué elegirte.' },
	{ value: 'especifico', label: 'De algo puntual', hint: 'Se centra en un producto o servicio concreto, con su nombre y sus datos.' },
];

export default function ProductAssetReview({ products, selectedProductIds = [], onToggleProduct, isCatalog = false, storeName, detectionReason, subject, detectedSubject, onChangeSubject }: {
	products: ProductReviewItem[];
	selectedProductIds?: string[];
	onToggleProduct?: (productId: string) => void;
	/** La URL era la home o una categoría: son productos de la tienda, no una ficha. */
	isCatalog?: boolean;
	storeName?: string;
	/** Por qué se clasificó así, para que se entienda y se pueda desconfiar. */
	detectionReason?: string;
	/** De qué habla el anuncio ahora mismo (detectado o corregido a mano). */
	subject?: SubjectChoice;
	/** Lo que detectó la IA, para poder marcarlo aunque se haya cambiado. */
	detectedSubject?: SubjectChoice;
	/** Permite corregir a mano si la detección se equivocó. */
	onChangeSubject?: (subject: SubjectChoice) => void;
}) {
	const [expanded, setExpanded] = useState<string | null>(null);
	/**
	 * Por defecto no se muestra el catálogo entero.
	 *
	 * Se listaban los ocho productos con nombre, precio y foto grande, y había que
	 * revisarlos uno por uno. Para un anuncio del negocio eso es trabajo que no
	 * cambia el resultado: alcanza con ver qué imágenes se van a usar. La lista
	 * completa queda a un toque, para quien quiera elegir a mano.
	 */
	const [eligiendoAMano, setEligiendoAMano] = useState(false);
	if (!products.length) return null;

	const elegidos = products.filter((product) => selectedProductIds.includes(product.id));
	const enAutomatico = Boolean(onToggleProduct) && !eligiendoAMano && elegidos.length > 0;

	const selectable = Boolean(onToggleProduct);
	const allSelected = products.length > 0 && products.every((product) => selectedProductIds.includes(product.id));

	return (
		<section className="asset-review" aria-labelledby="product-assets-title">
			<header className="asset-review-head">
				<div>
					<span className="asset-review-kicker">{isCatalog ? 'PRODUCTOS DE LA TIENDA' : 'REFERENCIAS IMPORTADAS'}</span>
					<h2 id="product-assets-title">
						{isCatalog
							? `Encontramos ${products.length} ${products.length === 1 ? 'producto' : 'productos'}${storeName ? ` en ${storeName}` : ''}`
							: 'Elegí qué productos usar'}
					</h2>
					<p>
						{isCatalog
							? 'El anuncio va a hablar de la tienda. Elegí cuáles querés que se vean en la imagen.'
							: 'La IA recibe únicamente los que marques.'}
					</p>
				</div>
				<div className="asset-review-actions">
					<span className="asset-review-count">{selectedProductIds.length}/{products.length}</span>
					{selectable && products.length > 1 && (
						<button
							type="button"
							className="asset-review-all"
							onClick={() => products.forEach((product) => {
								const isSelected = selectedProductIds.includes(product.id);
								if (allSelected ? isSelected : !isSelected) onToggleProduct?.(product.id);
							})}
						>
							{allSelected ? 'Quitar todos' : 'Usar todos'}
						</button>
					)}
				</div>
			</header>

			{/* De qué va a hablar el anuncio, ANTES de generar: era la sorpresa más
			    cara de la app —se descubría recién en la imagen final—. Se marca lo
			    que detectó la IA y se puede cambiar sin volver a empezar. */}
			<div className="asset-subject">
				<div className="asset-subject-head">
					<strong>¿De qué habla el anuncio?</strong>
					{detectionReason && <small>Detectamos esto porque {detectionReason}.</small>}
				</div>
				<div className="asset-subject-options" role="radiogroup" aria-label="De qué habla el anuncio">
					{SUBJECT_OPTIONS.map((option) => {
						const active = (subject || (isCatalog ? 'general' : 'especifico')) === option.value;
						return (
							<button
								key={option.value}
								type="button"
								role="radio"
								aria-checked={active}
								className={active ? 'active' : ''}
								onClick={() => onChangeSubject?.(option.value)}
								disabled={!onChangeSubject}
							>
								<span className="asset-subject-label">
									{option.label}
									{detectedSubject === option.value && <em>detectado</em>}
								</span>
								<small>{option.hint}</small>
							</button>
						);
					})}
				</div>
			</div>

			{enAutomatico ? (
				<div className="asset-auto">
					<div className="asset-auto-thumbs">
						{elegidos.slice(0, 6).map((product) => {
							const media = mediaFor(product);
							const cover = media.find((item) => item.type !== 'video') || media[0];
							return (
								<span className="asset-auto-thumb" key={product.id} title={product.name}>
									{cover
										? <img src={cover.url} alt="" loading="lazy" decoding="async" />
										: <em>{(product.name || '?').slice(0, 2)}</em>}
								</span>
							);
						})}
					</div>
					<div className="asset-auto-copy">
						<strong>
							{isCatalog
								? `Elegimos ${elegidos.length} ${elegidos.length === 1 ? 'imagen' : 'imágenes'} para representar tu negocio`
								: elegidos[0]?.name || 'Producto elegido'}
						</strong>
						<small>
							{isCatalog
								? 'Son las que mejor muestran lo que vendés.'
								: 'Detectado en la URL que pasaste.'}
						</small>
					</div>
					<button type="button" className="asset-auto-manual" onClick={() => setEligiendoAMano(true)}>
						Elegir a mano
					</button>
				</div>
			) : (
			<div className="asset-grid">
				{products.map((product, index) => {
					const media = mediaFor(product);
					const cover = media.find((item) => item.type !== 'video') || media[0];
					const extras = media.length - 1;
					const selected = selectedProductIds.includes(product.id);
					const isOpen = expanded === product.id;
					return (
						<article className={`asset-card${selected ? ' is-selected' : ''}`} key={product.id}>
							<button
								type="button"
								className="asset-card-main"
								onClick={() => onToggleProduct?.(product.id)}
								aria-pressed={selected}
								aria-label={`${selected ? 'Quitar' : 'Usar'} ${product.name || `producto ${index + 1}`}`}
							>
								<span className="asset-card-photo">
									{cover ? (
										cover.type === 'video'
											? <video src={cover.url} muted playsInline preload="metadata" />
											// Las primeras entran de una; el resto a medida que se scrollea.
											: <img src={cover.url} alt="" loading={index < 6 ? 'eager' : 'lazy'} decoding="async" />
									) : <span className="asset-card-nophoto">Sin foto</span>}
									<span className="asset-card-check" aria-hidden="true">{selected ? '✓' : ''}</span>
								</span>
								<span className="asset-card-name" title={product.name}>{product.name || `Producto ${index + 1}`}</span>
								{product.price_text && <span className="asset-card-price">{product.price_text}</span>}
							</button>
							{extras > 0 && (
								<button type="button" className="asset-card-more" onClick={() => setExpanded(isOpen ? null : product.id)}>
									{isOpen ? 'Ocultar' : `+${extras} ${extras === 1 ? 'foto' : 'fotos'}`}
								</button>
							)}
							{isOpen && (
								<div className="asset-card-rail">
									{media.map((item, mediaIndex) => (
										<span className="asset-card-thumb" key={`${item.path || item.url}-${mediaIndex}`}>
											{item.type === 'video'
												? <video src={item.url} controls muted playsInline preload="metadata" />
												: <img src={item.url} alt={`${product.name} ${mediaIndex + 1}`} loading="lazy" decoding="async" />}
										</span>
									))}
								</div>
							)}
						</article>
					);
				})}
			</div>
			)}
		</section>
	);
}
