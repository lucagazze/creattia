import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { concatenateVideoBuffers, splitVideoBuffer, verifyVideoBuffer } from '../src/lib/creattia/video-media.ts';

const execFileAsync = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'creattia-media-test-'));
try {
	assert.ok(ffmpegPath, 'FFmpeg binary must be available');
	const sample = join(directory, 'sample.mp4');
	await execFileAsync(ffmpegPath, [
		'-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=24',
		'-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '4', '-c:v', 'libx264',
		'-pix_fmt', 'yuv420p', '-c:a', 'aac', sample,
	], { windowsHide: true });
	const source = await readFile(sample);
	const clips = await splitVideoBuffer(source, [
		{ index: 0, start: 0, end: 2, duration: 2 },
		{ index: 1, start: 2, end: 4, duration: 2 },
	]);
	assert.equal(clips.length, 2);
	assert.ok(clips.every((clip) => clip.length > 1_000));
	const combined = await concatenateVideoBuffers(clips);
	assert.ok(combined.length > 1_000);
	assert.equal(await verifyVideoBuffer(combined), true);
	console.log(`video-media: split, concat and validation passed (${combined.length} bytes)`);
} finally {
	await rm(directory, { recursive: true, force: true });
}
