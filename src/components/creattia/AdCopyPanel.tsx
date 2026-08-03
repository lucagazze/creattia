import React, { useState } from 'react';
import { adCopyToText, type AdaptedAdCopy } from '../../lib/creattia/ad-copy';

type Props = {
	copy: AdaptedAdCopy;
	onChange?: (copy: AdaptedAdCopy) => void;
	compact?: boolean;
	title?: string;
};

export default function AdCopyPanel({ copy, onChange, compact = false, title = 'Copy listo para publicar' }: Props) {
	const [copied, setCopied] = useState(false);
	const update = (field: keyof AdaptedAdCopy, value: string) => onChange?.({ ...copy, [field]: value });
	const copyAll = async (event?: React.MouseEvent) => {
		event?.preventDefault();
		event?.stopPropagation();
		await navigator.clipboard.writeText(adCopyToText(copy));
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1600);
	};

	if (compact) {
		return <div className="generated-ad-copy compact" onClick={(event) => event.stopPropagation()}>
			<p>{copy.primaryText}</p>
			<div><strong>{copy.headline}</strong><span>{copy.description}</span><span>CTA: {copy.cta}</span></div>
			<button type="button" onClick={(event) => void copyAll(event)}>{copied ? '✓ Copiado' : 'Copiar copy'}</button>
		</div>;
	}

	return <section className="generated-ad-copy">
		<header><div><span>✦</span><p><strong>{title}</strong><small>Adaptado al producto y preparado para Meta e Instagram.</small></p></div><button type="button" onClick={(event) => void copyAll(event)}>{copied ? '✓ Copiado' : 'Copiar todo'}</button></header>
		<label>Texto principal<textarea rows={4} value={copy.primaryText} readOnly={!onChange} onChange={(event) => update('primaryText', event.target.value)} /></label>
		<div className="generated-ad-copy-row"><label>Título<input value={copy.headline} readOnly={!onChange} onChange={(event) => update('headline', event.target.value)} /></label><label>Descripción<input value={copy.description} readOnly={!onChange} onChange={(event) => update('description', event.target.value)} /></label></div>
		<label className="generated-ad-copy-cta">Botón / CTA<input value={copy.cta} readOnly={!onChange} onChange={(event) => update('cta', event.target.value)} /></label>
	</section>;
}
