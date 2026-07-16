// Pure JavaScript/DOM Confetti Particle Emitter (Buttery smooth, zero dependencies)

export function triggerConfetti() {
	if (typeof document === 'undefined') return;
	const colors = ['#744bde', '#ec4492', '#3e86c6', '#a666aa', '#f05427', '#38b989', '#f59e0b'];
	const container = document.createElement('div');
	container.style.position = 'fixed';
	container.style.inset = '0';
	container.style.pointerEvents = 'none';
	container.style.zIndex = '99999';
	container.style.overflow = 'hidden';
	document.body.appendChild(container);

	const count = 120;
	for (let i = 0; i < count; i++) {
		const particle = document.createElement('div');
		const size = Math.random() * 8 + 6;
		particle.style.position = 'absolute';
		particle.style.width = `${size}px`;
		particle.style.height = `${size * (Math.random() > 0.5 ? 1.5 : 1)}px`;
		particle.style.background = colors[Math.floor(Math.random() * colors.length)];
		particle.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
		particle.style.left = '0';
		particle.style.top = '0';
		particle.style.opacity = '1';

		// Launch parameters
		const angle = Math.PI * 1.5 + (Math.random() - 0.5) * Math.PI * 0.7; // upwards arc
		const velocity = Math.random() * 15 + 8;
		let vx = Math.cos(angle) * velocity;
		let vy = Math.sin(angle) * velocity - 4;

		let x = window.innerWidth / 2;
		let y = window.innerHeight * 0.5;
		let rotation = Math.random() * 360;
		let rotVelocity = (Math.random() - 0.5) * 25;

		container.appendChild(particle);

		let lastTime = performance.now();
		const anim = (now: number) => {
			const dt = Math.min(3, (now - lastTime) / 16.666);
			lastTime = now;

			vy += 0.45 * dt; // gravity
			vx *= Math.pow(0.97, dt); // horizontal air resistance
			vy *= Math.pow(0.98, dt); // vertical air resistance

			x += vx * dt;
			y += vy * dt;
			rotation += rotVelocity * dt;

			particle.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
			
			// Fade out near bottom of screen
			if (y > window.innerHeight * 0.8) {
				const currentOpacity = parseFloat(particle.style.opacity || '1');
				particle.style.opacity = `${currentOpacity - 0.04 * dt}`;
			}

			if (parseFloat(particle.style.opacity || '1') > 0 && y < window.innerHeight + 100) {
				requestAnimationFrame(anim);
			} else {
				particle.remove();
			}
		};
		requestAnimationFrame(anim);
	}

	setTimeout(() => {
		container.remove();
	}, 4500);
}
