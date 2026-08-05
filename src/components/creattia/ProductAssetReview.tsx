import React from 'react';

export type ProductReviewMedia = {
	path?: string;
	url: string;
	type?: 'image' | 'video';
};

export type ProductReviewItem = {
	id: string;
	name: string;
	product_url?: string | null;
	media?: ProductReviewMedia[];
	imageUrls?: string[];
	videoUrls?: string[];
};

function mediaFor(product: ProductReviewItem): ProductReviewMedia[] {
	if (product.media?.length) return product.media;
	return [
		...(product.imageUrls || []).map((url) => ({ url, type: 'image' as const })),
		...(product.videoUrls || []).map((url) => ({ url, type: 'video' as const })),
	];
}

export default function ProductAssetReview({ products, selectedProductIds = [], onToggleProduct }: {
	products: ProductReviewItem[];
	selectedProductIds?: string[];
	onToggleProduct?: (productId: string) => void;
}) {
	if (!products.length) return null;

	return (
		<section className="product-asset-review" aria-labelledby="product-assets-title">
			<header className="product-asset-review-heading">
				<div>
					<span className="product-asset-review-kicker">REFERENCIAS IMPORTADAS</span>
					<h2 id="product-assets-title">Elegí qué productos usar</h2>
					<p>El Producto 1 es el de la URL principal. Podés sumar otros productos con URLs adicionales o dejar seleccionado solo uno. La IA recibe únicamente los que marques.</p>
				</div>
				<span className="product-asset-review-count">{selectedProductIds.length} seleccionados</span>
			</header>

			<div className="product-asset-review-list">
				{products.map((product, productIndex) => {
					const media = mediaFor(product);
					const imageCount = media.filter((item) => item.type !== 'video').length;
					const videoCount = media.filter((item) => item.type === 'video').length;
					const selected = selectedProductIds.includes(product.id);
					return (
						<article className={`product-asset-group ${selected ? 'is-selected' : ''}`} key={product.id}>
							<header>
								<div className="product-asset-group-index">{productIndex + 1}</div>
								<div className="product-asset-group-title">
									<strong>Producto {productIndex + 1}{productIndex === 0 ? ' · PRINCIPAL' : ''}</strong>
									<h3>{product.name || 'Producto importado'}</h3>
									{product.product_url && <a href={product.product_url} target="_blank" rel="noreferrer">Abrir página ↗</a>}
								</div>
								<button type="button" className={`product-asset-select ${selected ? 'active' : ''}`} onClick={() => onToggleProduct?.(product.id)} aria-pressed={selected}>
									<span aria-hidden="true">{selected ? '✓' : '+'}</span>{selected ? 'Usar este producto' : 'Agregar producto'}
								</button>
								<div className="product-asset-group-count" aria-label={`${imageCount} imágenes y ${videoCount} videos`}>
									{imageCount > 0 && <span>▧ {imageCount} {imageCount === 1 ? 'imagen' : 'imágenes'}</span>}
									{videoCount > 0 && <span>▶ {videoCount} {videoCount === 1 ? 'video' : 'videos'}</span>}
								</div>
							</header>

							{media.length ? (
								<div className="product-asset-media-rail" aria-label={`Medios de ${product.name || `Producto ${productIndex + 1}`}`}>
									{media.map((item, mediaIndex) => (
										<div className="product-asset-tile" key={`${item.path || item.url}-${mediaIndex}`}>
											{item.type === 'video' ? (
												<video src={item.url} controls muted playsInline preload="metadata" />
											) : (
												<img src={item.url} alt={`${product.name || 'Producto'} · referencia ${mediaIndex + 1}`} loading="lazy" decoding="async" />
											)}
											<span className={`product-asset-type ${item.type === 'video' ? 'is-video' : ''}`}>{item.type === 'video' ? 'VIDEO · SOLO REVISIÓN' : `IMG ${mediaIndex + 1}`}</span>
										</div>
									))}
								</div>
							) : (
								<div className="product-asset-empty">No pudimos obtener medios visuales de esta página. Podés sumar fotos a mano antes de generar.</div>
							)}
						</article>
					);
				})}
			</div>
		</section>
	);
}
