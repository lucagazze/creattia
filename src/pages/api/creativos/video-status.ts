import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { downloadSoraVideo, retrieveSoraVideo, VIDEO_CREDIT_COST } from '../../../lib/creattia/video-engines';

export const prerender = false;

const OUTPUTS = 'creative-video-outputs';
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

async function refundOnce(admin: NonNullable<ReturnType<typeof getAdminClient>>, row: any, reason: string) {
	const snapshot = row.settings_snapshot || {};
	if (!snapshot.creditRefunded) {
		await admin.rpc('refund_creative_credits', { p_user_id: row.user_id, p_amount: Number(snapshot.creditCost || VIDEO_CREDIT_COST) });
	}
	await admin.from('creative_video_generations').update({
		status: 'failed',
		error_code: reason.slice(0, 500),
		settings_snapshot: { ...snapshot, creditRefunded: true },
	}).eq('id', row.id).eq('user_id', row.user_id);
}

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const id = url.searchParams.get('id')?.trim();
	if (!id) return json({ error: 'Falta el id del video.' }, 400);

	const { data: row, error: rowError } = await admin.from('creative_video_generations')
		.select('id,user_id,status,progress,provider,provider_job_id,output_path,error_code,title,settings_snapshot')
		.eq('id', id).eq('user_id', auth.user.id).maybeSingle();
	if (rowError) return json({ error: rowError.message }, 500);
	if (!row) return json({ error: 'El trabajo de video no existe.' }, 404);

	if (row.status === 'completed' && row.output_path) {
		const { data: signed } = await admin.storage.from(OUTPUTS).createSignedUrl(row.output_path, 60 * 60);
		return json({ ok: true, id: row.id, status: row.status, progress: 100, title: row.title, videoUrl: signed?.signedUrl || '' });
	}
	if (row.status === 'failed') return json({ ok: false, id: row.id, status: row.status, progress: row.progress, error: row.error_code || 'El video no pudo generarse.' });

	const openAIKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	if (!openAIKey) return json({ error: 'Falta configurar OPENAI_API_KEY.' }, 503);
	if (!row.provider_job_id) return json({ error: 'El proveedor no devolvió un id de trabajo.' }, 502);

	try {
		const provider = await retrieveSoraVideo(openAIKey, row.provider_job_id);
		const providerStatus = provider.status === 'completed'
			? 'completed'
			: provider.status === 'failed' || provider.status === 'cancelled'
				? 'failed'
				: provider.status === 'in_progress' ? 'in_progress' : 'queued';

		if (providerStatus === 'failed') {
			await refundOnce(admin, row, provider.error || 'El proveedor rechazó la generación.');
			return json({ ok: false, id: row.id, status: 'failed', progress: provider.progress || 0, error: provider.error || 'El proveedor rechazó la generación.' });
		}

		if (providerStatus !== 'completed') {
			await admin.from('creative_video_generations').update({ status: providerStatus, progress: Math.max(0, Math.min(99, provider.progress || 0)) }).eq('id', row.id).eq('user_id', row.user_id);
			return json({ ok: true, id: row.id, status: providerStatus, progress: provider.progress || 0, title: row.title });
		}

		const buffer = await downloadSoraVideo(openAIKey, row.provider_job_id);
		if (!buffer.length || buffer.length > MAX_VIDEO_BYTES) throw new Error('El archivo de video generado supera el límite permitido.');
		const outputPath = `${row.user_id}/${row.id}.mp4`;
		const { error: uploadError } = await admin.storage.from(OUTPUTS).upload(outputPath, buffer, { contentType: 'video/mp4', upsert: true });
		if (uploadError) throw uploadError;
		const { error: completeError } = await admin.from('creative_video_generations').update({
			status: 'completed',
			progress: 100,
			output_path: outputPath,
			completed_at: new Date().toISOString(),
		}).eq('id', row.id).eq('user_id', row.user_id);
		if (completeError) throw completeError;

		const { data: signed } = await admin.storage.from(OUTPUTS).createSignedUrl(outputPath, 60 * 60);
		return json({ ok: true, id: row.id, status: 'completed', progress: 100, title: row.title, videoUrl: signed?.signedUrl || '' });
	} catch (error) {
		console.error(`[video-status ${row.id}]`, error);
		// Los fallos transitorios de consulta no deben marcar el trabajo como
		// fallido ni devolver créditos; el cliente volverá a consultar.
		return json({ error: error instanceof Error ? error.message : 'No se pudo consultar el video.' }, 502);
	}
};
