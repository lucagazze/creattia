import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import type { VideoSegment } from './video-pipeline';

const execFileAsync = promisify(execFile);

function ffmpegPath() {
	const value = process.env.FFMPEG_PATH || ffmpegStatic;
	if (!value) throw new Error('FFmpeg no está disponible en este entorno.');
	return value;
}

async function runFfmpeg(args: string[]) {
	await execFileAsync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
		maxBuffer: 8 * 1024 * 1024,
		windowsHide: true,
	});
}

export async function splitVideoBuffer(buffer: Buffer, segments: VideoSegment[], size?: '720x1280' | '1280x720') {
	if (!buffer.length) throw new Error('El video de referencia está vacío.');
	const directory = await mkdtemp(join(tmpdir(), 'creattia-video-split-'));
	try {
		const inputPath = join(directory, 'reference.mp4');
		await writeFile(inputPath, buffer);
		const outputs: Buffer[] = [];
		for (const segment of segments) {
			const outputPath = join(directory, `segment-${segment.index}.mp4`);
			const videoFilter = size === '1280x720'
				? 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720'
				: size === '720x1280'
					? 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280'
					: '';
			await runFfmpeg([
				'-ss', String(segment.start), '-i', inputPath, '-t', String(segment.duration),
				'-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast',
				...(videoFilter ? ['-vf', videoFilter] : []),
				'-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
				'-movflags', '+faststart', outputPath,
			]);
			const output = await readFile(outputPath);
			if (!output.length) throw new Error(`No se pudo preparar el segmento ${segment.index + 1}.`);
			outputs.push(output);
		}
		return outputs;
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

export async function concatenateVideoBuffers(buffers: Buffer[]) {
	if (!buffers.length) throw new Error('No hay segmentos para unir.');
	if (buffers.length === 1) return buffers[0];
	const directory = await mkdtemp(join(tmpdir(), 'creattia-video-concat-'));
	try {
		const list: string[] = [];
		for (const [index, buffer] of buffers.entries()) {
			const path = join(directory, `generated-${index}.mp4`);
			await writeFile(path, buffer);
			list.push(`file '${path.replace(/'/g, "'\\''")}'`);
		}
		const listPath = join(directory, 'segments.txt');
		const outputPath = join(directory, 'final.mp4');
		await writeFile(listPath, list.join('\n'), 'utf8');
		await runFfmpeg([
			'-f', 'concat', '-safe', '0', '-i', listPath,
			'-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast',
			'-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
			'-movflags', '+faststart', outputPath,
		]);
		return await readFile(outputPath);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

export async function verifyVideoBuffer(buffer: Buffer, options: { requireAudio?: boolean } = {}) {
	const directory = await mkdtemp(join(tmpdir(), 'creattia-video-verify-'));
	try {
		const inputPath = join(directory, 'video.mp4');
		await writeFile(inputPath, buffer);
		await runFfmpeg(['-i', inputPath, '-map', '0:v:0', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null']);
		if (options.requireAudio) {
			await runFfmpeg(['-i', inputPath, '-map', '0:a:0', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null']);
		}
		return true;
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
