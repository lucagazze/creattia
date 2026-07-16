// Premium SFX Synthesizer using Web Audio API (Zero dependencies, instant synthesis)

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!audioCtx) {
		const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
		if (AudioContextClass) {
			audioCtx = new AudioContextClass();
		}
	}
	// Resume if suspended (browser security policy)
	if (audioCtx && audioCtx.state === 'suspended') {
		void audioCtx.resume();
	}
	return audioCtx;
}

export const sfx = {
	playClick() {
		const ctx = getAudioContext();
		if (!ctx) return;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.type = 'sine';
		// Sutil pop frequency decay
		osc.frequency.setValueAtTime(140, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.08);

		gain.gain.setValueAtTime(0.12, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

		osc.start();
		osc.stop(ctx.currentTime + 0.08);
	},

	playWhoosh() {
		const ctx = getAudioContext();
		if (!ctx) return;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.type = 'triangle';
		osc.frequency.setValueAtTime(180, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.2);

		gain.gain.setValueAtTime(0.01, ctx.currentTime);
		gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.1);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

		osc.start();
		osc.stop(ctx.currentTime + 0.2);
	},

	playDock() {
		const ctx = getAudioContext();
		if (!ctx) return;

		const osc1 = ctx.createOscillator();
		const osc2 = ctx.createOscillator();
		const gain = ctx.createGain();

		osc1.connect(gain);
		osc2.connect(gain);
		gain.connect(ctx.destination);

		osc1.type = 'sine';
		osc1.frequency.setValueAtTime(160, ctx.currentTime);
		osc1.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.12);

		osc2.type = 'triangle';
		osc2.frequency.setValueAtTime(320, ctx.currentTime);
		osc2.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);

		gain.gain.setValueAtTime(0.08, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

		osc1.start();
		osc2.start();
		osc1.stop(ctx.currentTime + 0.12);
		osc2.stop(ctx.currentTime + 0.12);
	},

	playSuccess() {
		const ctx = getAudioContext();
		if (!ctx) return;

		// Play a beautiful arpeggio chime (C5 -> E5 -> G5 -> C6)
		const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
		const now = ctx.currentTime;

		notes.forEach((freq, idx) => {
			const time = now + idx * 0.09;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const filter = ctx.createBiquadFilter();

			osc.connect(filter);
			filter.connect(gain);
			gain.connect(ctx.destination);

			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, time);

			// Soft vibrato
			const lfo = ctx.createOscillator();
			const lfoGain = ctx.createGain();
			lfo.frequency.value = 8;
			lfoGain.gain.value = 4;
			lfo.connect(lfoGain);
			lfoGain.connect(osc.frequency);
			lfo.start(time);
			lfo.stop(time + 0.35);

			filter.type = 'lowpass';
			filter.frequency.setValueAtTime(1500, time);

			gain.gain.setValueAtTime(0, time);
			gain.gain.linearRampToValueAtTime(0.08, time + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

			osc.start(time);
			osc.stop(time + 0.35);
		});
	}
};
