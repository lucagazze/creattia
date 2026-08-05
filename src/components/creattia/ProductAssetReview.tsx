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

export default function ProductAssetReview({ products }: { products: ProductReviewItem[] }) {
	if (!products.length) return null;

	return (
		<section className="product-asset-review" aria-labelledby="product-assets-title">
			<header className="product-asset-review-heading">
				<div>
					<span className="product-asset-review-kicker">REFERENCIAS IMPORTADAS</span>
					<h2 id="product-assets-title">Revisá todo lo que encontramos</h2>
					<p>Las imágenes reales se usan para analizar y mantener consistente el producto. Los videos quedan disponibles solo para revisarlos y no se envían a la IA.</p>
				</div>
				<span className="product-asset-review-count">{products.reduce((total, product) => total + mediaFor(product).length, 0)} medios</span>
			</header>

			<div className="product-asset-review-list">
				{products.map((product, productIndex) => {
					const media = mediaFor(product);
					const imageCount = media.filter((item) => item.type !== 'video').length;
					const videoCount = media.filter((item) => item.type === 'video').length;
					return (
						<article className="product-asset-group" key={product.id}>
							<header>
								<div className="product-asset-group-index">{productIndex + 1}</div>
								<div className="product-asset-group-title">
									<strong>Producto {productIndex + 1}</strong>
									<h3>{product.name || 'Producto importado'}</h3>
									{product.product_url && <a href={product.product_url} target="_blank" rel="noreferrer">Abrir página ↗</a>}
								</div>
								<div className="product-asset-group-count" aria-label={`${imageCount} imágenes y ${videoCount} videos`}>
									{imageCount > 0 && <span>▧ {imageCount} {imageCount === 1 ? 'imagen' : 'imágenes'}</span>}
									{videoCount > 0 && <span>▶ {videoCount} {videoCount === 1 ? 'video' : 'videos'}</span>}
								</div>
							</header>

							{media.length ? (
								<div className="product-asset-grid">
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
