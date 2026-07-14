import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evidenceSources, referenceFileName, starterReferences } from './reference-starter-50.mjs';

const destination = resolve('docs/reference-library.starter-50.json');
await mkdir(resolve('public/images/creattia/reference-library'), { recursive: true });

const items = starterReferences.map((item) => {
	const evidence = evidenceSources[item.sourceKey];
	return {
		templateId: item.id,
		name: `${String(item.id).padStart(2, '0')} · ${item.name} · Referencia estática`,
		localImage: `public/images/creattia/reference-library/${referenceFileName(item)}`,
		promptNotes: `Referencia estática original. Conservar la jerarquía de ${item.name.toLowerCase()}, adaptar el producto y la identidad de la marca, y evitar copiar textos o identidades de terceros. Patrón investigado: ${evidence.pattern}`,
		sortOrder: 1,
		sourceUrl: evidence.url,
		sourcePlatform: 'research-derived',
		rightsStatus: 'owned',
		licenseNotes: 'Composición original renderizada por Creattia. No contiene imágenes, logos, textos ni productos de la marca investigada.',
		categoryGroup: item.categoryGroup,
		categoryBranch: item.categoryBranch,
		categoryLeaf: item.categoryLeaf,
		metadata: {
			mediaType: 'static_image',
			originalAsset: true,
			format: '4:5',
			performanceEvidence: {
				sourceBrand: evidence.brand,
				sourceAd: evidence.title,
				signal: evidence.signal,
				pattern: evidence.pattern,
				evidenceUrl: evidence.url,
				researchedAt: '2026-07-14',
			},
		},
	};
});

await writeFile(destination, `${JSON.stringify({ version: 1, collection: 'starter-static-50', items }, null, 2)}\n`);
process.stdout.write(`Manifiesto creado: ${destination} (${items.length} referencias)\n`);
