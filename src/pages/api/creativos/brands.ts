import type { APIRoute } from 'astro';
import { analyzeBrandStyle } from '../../../lib/creattia/brand-style';
import { normalizeExternalUrl, readLimited, safeExternalFetch } from '../../../lib/creattia/safe-fetch';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 120;

// Marcas por plan: básico 1, medio 3, avanzado 5.
const brandLimits: Record<string, number> = { trial: 1, creator: 1, pro: 3, scale: 5 };

function clean(value: unknown, max = 500) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Copia los datos de la marca activa al perfil: la generación ya lee de ahí.
async function activateBrand(admin: any, userId: string, brand: any) {
	await admin.from('creative_profiles').upsert({
		user_id: userId,
		active_brand_id: brand.id,
		brand_name: brand.name || null,
		website_url: brand.website_url || null,
		brand_colors: Array.isArray(brand.brand_colors) && brand.brand_colors.length ? brand.brand_colors : null,
		logo_path: brand.logo_path || null,
		brand_style: brand.brand_style || null,
		brand_voice: brand.brand_style?.brandVoice || null,
		updated_at: new Date().toISOString(),
	}, { onConflict: 'user_id' });
}

export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const [{ data: brands, error }, { data: profile }] = await Promise.all([
		admin.from('creative_brands').select('id,name,website_url,logo_path,brand_colors,brand_style,created_at')
			.eq('user_id', auth.user.id).eq('is_active', true).order('created_at', { ascending: true }),
		admin.from('creative_profiles').select('active_brand_id,plan_code').eq('user_id', auth.user.id).maybeSingle(),
	]);
	if (error) return json({ error: error.message }, 500);

	const planCode = profile?.plan_code || 'trial';
	const withLogos = await Promise.all((brands || []).map(async (brand) => {
		let logoUrl = '';
		if (brand.logo_path) {
			const { data: signed } = await admin.storage.from('creative-assets').createSignedUrl(brand.logo_path, 3600);
			logoUrl = signed?.signedUrl || '';
		}
		return { ...brand, logoUrl };
	}));

	return json({
		brands: withLogos,
		activeBrandId: profile?.active_brand_id || null,
		limit: brandLimits[planCode] || 1,
		planCode,
	});
};

// Crear una marca: la IA escanea la web (diseño, colores, tipografía, voz,
// botones, logo) y guarda todo automáticamente.
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const openAIKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
	const googleKey = import.meta.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

	try {
		const body = await request.json().catch(() => ({}));
		const website = normalizeExternalUrl(clean(body.url, 500));
		if (!website) return json({ error: 'Pegá la URL principal de tu negocio.' }, 400);

		// Límite del plan
		const [{ count }, { data: profile }] = await Promise.all([
			admin.from('creative_brands').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id).eq('is_active', true),
			admin.from('creative_profiles').select('plan_code').eq('user_id', auth.user.id).maybeSingle(),
		]);
		const planCode = profile?.plan_code || 'trial';
		const isAdmin = String(auth.user.email || '').toLowerCase().includes('lucagazze');
		const limit = isAdmin ? 99 : (brandLimits[planCode] || 1);
		if ((count || 0) >= limit) {
			return json({ error: `Tu plan permite hasta ${limit} ${limit === 1 ? 'marca' : 'marcas'}. Mejorá tu plan para agregar más.`, code: 'BRAND_LIMIT' }, 402);
		}

		// Análisis profundo con IA
		const style = await analyzeBrandStyle(website, { openAIKey, googleKey });

		const { data: brand, error: insertError } = await admin.from('creative_brands').insert({
			user_id: auth.user.id,
			name: clean(body.name, 120) || new URL(website).hostname.replace(/^www\./, ''),
			website_url: website,
			brand_colors: style.colors,
			brand_style: style,
		}).select('*').single();
		if (insertError) throw insertError;

		// Logo: descargar, normalizar a PNG y guardar
		if (style.logoUrl) {
			try {
				const response = await safeExternalFetch(style.logoUrl, { headers: { accept: 'image/*' } });
				if (response.ok) {
					const bytes = await readLimited(response, 2_000_000);
					if (bytes.length) {
						const sharp = (await import('sharp')).default;
						const png = await sharp(Buffer.from(bytes)).png().toBuffer();
						const path = `${auth.user.id}/brands/${brand.id}/logo.png`;
						const { error: uploadError } = await admin.storage.from('creative-assets')
							.upload(path, png, { contentType: 'image/png', upsert: true });
						if (!uploadError) {
							await admin.from('creative_brands').update({ logo_path: path }).eq('id', brand.id);
							brand.logo_path = path;
						}
					}
				}
			} catch { /* logo ilegible: la marca sigue siendo válida */ }
		}

		// Primera marca (o sin activa): activarla automáticamente
		const { data: currentProfile } = await admin.from('creative_profiles').select('active_brand_id').eq('user_id', auth.user.id).maybeSingle();
		if (!currentProfile?.active_brand_id) await activateBrand(admin, auth.user.id, brand);

		let logoUrl = '';
		if (brand.logo_path) {
			const { data: signed } = await admin.storage.from('creative-assets').createSignedUrl(brand.logo_path, 3600);
			logoUrl = signed?.signedUrl || '';
		}
		return json({ brand: { ...brand, logoUrl } }, 201);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo analizar la marca.' }, 500);
	}
};

// Activar una marca (sus colores/tipografía/logo pasan a usarse en la generación)
export const PATCH: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const body = await request.json().catch(() => ({}));
	const brandId = clean(body.brandId, 60);
	if (!brandId) return json({ error: 'Marca inválida.' }, 400);
	const { data: brand, error } = await admin.from('creative_brands').select('*')
		.eq('id', brandId).eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
	if (error) return json({ error: error.message }, 500);
	if (!brand) return json({ error: 'La marca no existe.' }, 404);
	await activateBrand(admin, auth.user.id, brand);
	return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const id = new URL(request.url).searchParams.get('id') || '';
	if (!id) return json({ error: 'Marca inválida.' }, 400);
	const { error } = await admin.from('creative_brands').update({ is_active: false, updated_at: new Date().toISOString() })
		.eq('id', id).eq('user_id', auth.user.id);
	if (error) return json({ error: error.message }, 500);
	const { data: profile } = await admin.from('creative_profiles').select('active_brand_id').eq('user_id', auth.user.id).maybeSingle();
	if (profile?.active_brand_id === id) {
		await admin.from('creative_profiles').update({ active_brand_id: null, updated_at: new Date().toISOString() }).eq('user_id', auth.user.id);
	}
	return json({ ok: true });
};
