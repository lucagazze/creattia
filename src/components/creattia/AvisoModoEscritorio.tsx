import { useEffect, useState } from 'react';

/**
 * Aviso cuando el teléfono está en "sitio para computadora".
 *
 * En ese modo el navegador ignora a propósito el viewport y dibuja la página a
 * ~980px, después la achica para que entre: todo queda diminuto, hay que
 * arrastrar la pantalla de costado y las grillas salen en varias columnas. Se
 * ve exactamente como una app rota, pero no hay nada roto — y desde el código no
 * se puede desactivar, porque es una preferencia explícita de quien navega.
 *
 * Lo que sí se puede es reconocerlo: `screen.width` sigue informando el ancho
 * real del aparato aunque el viewport mienta. Si la pantalla física es de
 * teléfono y el viewport es de escritorio, es esto y no otra cosa.
 */
export function AvisoModoEscritorio() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const revisar = () => {
			const pantallaFisica = Math.min(window.screen?.width || 0, window.screen?.height || 0);
			const esTelefono = pantallaFisica > 0 && pantallaFisica <= 500;
			const viewportDeEscritorio = window.innerWidth >= 900;
			const yaAvisado = window.localStorage.getItem('creattia-aviso-escritorio') === 'visto';
			setVisible(esTelefono && viewportDeEscritorio && !yaAvisado);
		};
		revisar();
		window.addEventListener('resize', revisar);
		return () => window.removeEventListener('resize', revisar);
	}, []);

	if (!visible) return null;

	return (
		<div className="aviso-escritorio" role="status">
			<div>
				<strong>Estás viendo la versión de computadora</strong>
				<span>
					Tu navegador tiene activado <b>“Sitio para computadora”</b>. Desactivalo y la app se
					acomoda a tu pantalla: en Chrome está en el menú <b>⋮</b>, en Safari en <b>aA</b> →
					“Solicitar sitio para móviles”.
				</span>
			</div>
			<button
				type="button"
				onClick={() => {
					try { window.localStorage.setItem('creattia-aviso-escritorio', 'visto'); } catch { /* sin storage */ }
					setVisible(false);
				}}
				aria-label="Entendido"
			>
				Entendido
			</button>
		</div>
	);
}
