import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && key, 'Supabase service environment is required');
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let userId = '';
try {
	const created = await admin.auth.admin.createUser({ email: `video-refund-${Date.now()}@example.invalid`, email_confirm: true });
	if (created.error || !created.data.user) throw created.error || new Error('Test user was not created');
	userId = created.data.user.id;
	const profile = await admin.from('creative_profiles').update({ credits_remaining: 10 }).eq('user_id', userId);
	if (profile.error) throw profile.error;
	const inserted = await admin.from('creative_video_generations').insert({
		user_id: userId,
		title: 'Atomic refund test',
		reference_video_url: 'https://example.invalid/reference.mp4',
		settings_snapshot: { creditCost: 8 },
	}).select('id').single();
	if (inserted.error) throw inserted.error;
	const args = { p_job_id: inserted.data.id, p_user_id: userId, p_reason: 'Expected test failure' };
	const first = await admin.rpc('fail_creative_video_generation', args);
	const second = await admin.rpc('fail_creative_video_generation', args);
	if (first.error) throw first.error;
	if (second.error) throw second.error;
	assert.equal(first.data, true);
	assert.equal(second.data, false);
	const credits = await admin.from('creative_profiles').select('credits_remaining').eq('user_id', userId).single();
	if (credits.error) throw credits.error;
	assert.equal(credits.data.credits_remaining, 18);
	const job = await admin.from('creative_video_generations').select('status,settings_snapshot').eq('id', inserted.data.id).single();
	if (job.error) throw job.error;
	assert.equal(job.data.status, 'failed');
	assert.equal(job.data.settings_snapshot.creditRefunded, true);
	console.log('video-refund: duplicate failure refunded exactly once');
} finally {
	if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}
