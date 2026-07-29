import type { APIRoute } from 'astro';
import { creativos } from '../../../data/creativos50';
import { buildSpecializedAdPrompt } from '../../../lib/creattia/ad-prompt-builder';
import { generateAdImage, type EngineImage } from '../../../lib/creattia/image-engines';
import { normalizeImageInput } from '../../../lib/creattia/ad-analysis';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 300;

const BUCKET = 'creative-assets';

/**
 * Genera UNA sola imagen del lote y la deja lista en la base.
 *
 * Cada anuncio es una invocación HTTP independiente y corta: así ninguna
 * generación depende de que una única función serverless siga viva 10 minutos.
 * El cliente (o la barrida de reanudación) llama este endpoint una vez por fila
 * pendiente, con concurrencia limitada.
 */
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const googleKey = process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '';
	const openAIKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	if (!googleKey && !openAIKey) return json({ error: 'Falta configurar GOOGLE_AI_API_KEY u OPENAI_API_KEY.' }, 503);

	const userId = auth.user.id;
	const isAdmin = String(auth.user.email || '').toLowerCase().includes('lucagazze')
		|| String(auth.user.email || '').toLowerCase().includes('algoritmiadesarrollos');

	let generationId = '';
	try {
		const body = await request.json().catch(() => ({}));
		generationId = String(body?.generationId || '').trim();
		if (!generationId) return json({ error: 'Falta generationId.' }, 400);

		const { data: row, error: rowError } = await admin.from('creative_generations')
			.select('id,user_id,status,output_path,title,format,template_id,user_brief,batch_id,output_index,product_id,settings_snapshot')
			.eq('id', generationId).eq('user_id', userId).maybeSingle();
		if (rowError) throw rowError;
		if (!row) return json({ error: 'La generación no existe o no pertenece a tu cuenta.' }, 404);

		// Idempotente: si ya está lista, devolvemos la misma imagen sin volver a gastar.
		if (row.status === 'completed' && row.output_path) {
			const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(row.output_path, 60 * 60);
			return json({ ok: true, id: row.id, alreadyDone: true, imageUrl: signed?.signedUrl || '' });
		}

		const snapshot: any = row.settings_snapshot || {};
		const format = String(row.format || snapshot.format || 'square');

		// Fotos reales del producto como input del modelo. Sin esto el modelo
		// dibuja un producto inventado, que no sirve para vender.
		const images: EngineImage[] = [];
		const productId = row.product_id || snapshot.productId || null;
		if (productId) {
			const paths: string[] = [];
			const { data: product } = await admin.from('creative_products')
				.select('image_path').eq('id', productId).eq('user_id', userId).maybeSingle();
			if (product?.image_path) paths.push(product.image_path);
			const { data: productImages } = await admin.from('creative_product_images')
				.select('storage_path,sort_order').eq('product_id', productId).eq('user_id', userId).order('sort_order');
			for (const item of productImages || []) {
				if (item.storage_path) paths.push(item.storage_path);
			}
			for (const path of [...new Set(paths)].slice(0, 3)) {
				const { data: blob } = await admin.storage.from(BUCKET).download(path);
				if (!blob) continue;
				const normalized = await normalizeImageInput(Buffer.from(await blob.arrayBuffer()));
				if (normalized) images.push({ buffer: normalized.buffer, type: normalized.type });
			}
		}

		const template = creativos.find((item) => item.id === row.template_id) || creativos[0];
		const { prompt } = buildSpecializedAdPrompt(template, {
			name: snapshot.productName || row.title || 'Producto',
			description: snapshot.productDescription || '',
			priceText: snapshot.productPriceText || '',
			currency: snapshot.productCurrency || '$',
		}, format, row.user_brief || '');

		const productPhotoRule = images.length
			? `\n\n[FOTO REAL DEL PRODUCTO ADJUNTA]\nLas imágenes adjuntas son fotos reales del producto. Reproducí su forma, packaging, etiqueta y colores con fidelidad total. No inventes ni sustituyas el producto.`
			: '';

		const { buffer, engine } = await generateAdImage({
			googleKey,
			openAIKey,
			prompt: prompt + productPhotoRule,
			images,
			format,
		});

		// Gemini devuelve JPEG y OpenAI PNG: se etiqueta según los bytes reales,
		// no a ojo, para que el navegador y la descarga reciban el tipo correcto.
		const isPng = buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50;
		const extension = isPng ? 'png' : 'jpg';
		const contentType = isPng ? 'image/png' : 'image/jpeg';

		const outputPath = `${userId}/generations/${row.batch_id || row.id}/${row.output_index || 1}.${extension}`;
		const { error: uploadError } = await admin.storage.from(BUCKET)
			.upload(outputPath, buffer, { contentType, upsert: true });
		if (uploadError) throw uploadError;

		const { error: completionError } = await admin.from('creative_generations').update({
			status: 'completed',
			output_path: outputPath,
			prompt,
			completed_at: new Date().toISOString(),
		}).eq('id', row.id).eq('user_id', userId);
		if (completionError) {
			await admin.storage.from(BUCKET).remove([outputPath]);
			throw completionError;
		}

		const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(outputPath, 60 * 60);
		return json({ ok: true, id: row.id, engine, imageUrl: signed?.signedUrl || '' });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'No se pudo generar el anuncio.';
		console.error(`[batch-worker ${generationId}] falló:`, error);
		if (generationId) {
			await admin.from('creative_generations').update({
				status: 'failed',
				error_code: message.slice(0, 160),
				completed_at: new Date().toISOString(),
			}).eq('id', generationId).eq('user_id', userId);
			// El crédito de una imagen que no salió se devuelve siempre.
			if (!isAdmin) {
				const { error: refundError } = await admin.rpc('refund_creative_credits', { p_user_id: userId, p_amount: 1 });
				if (refundError) console.error('Refund falló:', refundError);
			}
		}
		return json({ error: message }, 500);
	}
};
