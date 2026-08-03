import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { downloadGeminiOmniVideo, downloadRunwayVideo, downloadSoraVideo, retrieveGeminiOmniVideo, retrieveRunwayVideo, retrieveSoraVideo, type VideoJobStatus } from '../../../lib/creattia/video-engines';
import { concatenateVideoBuffers, verifyVideoBuffer } from '../../../lib/creattia/video-media';

export const prerender = false;

const OUTPUTS = 'creative-video-outputs';
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

async function refundOnce(admin: NonNullable<ReturnType<typeof getAdminClient>>, row: any, reason: string) {
	const { error } = await admin.rpc('fail_creative_video_generation', {
		p_job_id: row.id,
		p_user_id: row.user_id,
		p_reason: reason.slice(0, 500),
	});
	if (error) throw error;
}

async function completeVideo(admin: NonNullable<ReturnType<typeof getAdminClient>>, row: any, buffer: Buffer) {
	if (!buffer.length || buffer.length > MAX_VIDEO_BYTES) throw new Error('El archivo de video generado supera el límite permitido.');
	try {
		await verifyVideoBuffer(buffer, { requireAudio: Boolean(row.settings_snapshot?.creativePlan?.hasSpokenDialogue) });
	} catch (error) {
		throw new Error(`GENERATED_VIDEO_INVALID: ${error instanceof Error ? error.message : 'El archivo no contiene las pistas esperadas.'}`);
	}
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
	return json({ ok: true, id: row.id, status: 'completed', progress: 100, title: row.title, videoUrl: signed?.signedUrl || '', adCopy: row.settings_snapshot?.adCopy || null });
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
		return json({ ok: true, id: row.id, status: row.status, progress: 100, title: row.title, videoUrl: signed?.signedUrl || '', adCopy: row.settings_snapshot?.adCopy || null });
	}
	if (row.status === 'failed') return json({ ok: false, id: row.id, status: row.status, progress: row.progress, error: row.error_code || 'El video no pudo generarse.' });

	if (!row.provider_job_id) return json({ error: 'El proveedor no devolvió un id de trabajo.' }, 502);

	try {
		if (row.provider === 'gemini') {
			const googleKey = process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '';
			if (!googleKey) return json({ error: 'Falta configurar GOOGLE_AI_API_KEY.' }, 503);
			const snapshot = row.settings_snapshot || {};
			const segmentJobs = Array.isArray(snapshot.segmentJobs) && snapshot.segmentJobs.length
				? snapshot.segmentJobs
				: [{ id: row.provider_job_id, index: 0, start: 0, duration: 10, status: row.status, progress: row.progress || 0 }];
			const results = await Promise.all(segmentJobs.map((segment: any) => retrieveGeminiOmniVideo(googleKey, String(segment.id))));
			const updatedJobs = segmentJobs.map((segment: any, index: number) => ({
				...segment,
				status: results[index].status,
				progress: results[index].progress || 0,
			}));
			const failed = results.find((result) => ['failed', 'cancelled'].includes(result.status));
			if (failed) {
				const reason = failed.error || 'Gemini rechazó uno de los segmentos.';
				await refundOnce(admin, { ...row, settings_snapshot: { ...snapshot, segmentJobs: updatedJobs } }, reason);
				return json({ ok: false, id: row.id, status: 'failed', progress: 0, error: reason });
			}
			const progress = Math.round(results.reduce((total, result) => total + (result.progress || 0), 0) / Math.max(1, results.length));
			if (!results.every((result) => result.status === 'completed')) {
				const status = results.some((result) => result.status === 'in_progress') ? 'in_progress' : 'queued';
				await admin.from('creative_video_generations').update({
					status,
					progress: Math.max(0, Math.min(99, progress)),
					settings_snapshot: { ...snapshot, segmentJobs: updatedJobs },
				}).eq('id', row.id).eq('user_id', row.user_id);
				return json({ ok: true, id: row.id, status, progress, title: row.title, segments: updatedJobs.map(({ index, status: segmentStatus, progress: segmentProgress }: any) => ({ index, status: segmentStatus, progress: segmentProgress })) });
			}
			const buffers = await Promise.all(results.map((result) => downloadGeminiOmniVideo(googleKey, result)));
			return completeVideo(admin, row, await concatenateVideoBuffers(buffers));
		}

		let provider: VideoJobStatus;
		if (row.provider === 'runway') {
			const runwayKey = process.env.RUNWAYML_API_SECRET || import.meta.env.RUNWAYML_API_SECRET || '';
			if (!runwayKey) return json({ error: 'Falta configurar RUNWAYML_API_SECRET.' }, 503);
			provider = await retrieveRunwayVideo(runwayKey, row.provider_job_id);
		} else {
			// Compatibilidad únicamente para trabajos anteriores iniciados con Sora.
			const openAIKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
			if (!openAIKey) return json({ error: 'Falta configurar OPENAI_API_KEY para consultar este video anterior.' }, 503);
			provider = await retrieveSoraVideo(openAIKey, row.provider_job_id);
		}
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

		const buffer = row.provider === 'gemini'
			? await downloadGeminiOmniVideo(process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '', provider)
			: row.provider === 'runway'
				? await downloadRunwayVideo(provider.outputUrl || '')
				: await downloadSoraVideo(process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '', row.provider_job_id);
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
		const message = error instanceof Error ? error.message : 'No se pudo consultar el video.';
		const permanentProviderFailure = row.provider === 'gemini' && /(input blocked|prohibited use|budget_exceeded|invalid argument|generated_video_invalid|\b400\b)/i.test(message);
		if (permanentProviderFailure) {
			await refundOnce(admin, row, message);
			return json({ ok: false, id: row.id, status: 'failed', progress: row.progress || 0, error: 'Gemini rechazó esta referencia o sus indicaciones. Los créditos fueron devueltos; probá otra referencia o reformulá el pedido.' });
		}
		console.error(`[video-status ${row.id}]`, error);
		// Los fallos transitorios de consulta no deben marcar el trabajo como
		// fallido ni devolver créditos; el cliente volverá a consultar.
		return json({ error: message }, 502);
	}
};
