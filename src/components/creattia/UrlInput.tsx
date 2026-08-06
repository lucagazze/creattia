import React, { useEffect, useRef, useState } from 'react';

/**
 * Input de URL con botón de pegar.
 *
 * Casi todo el flujo empieza pegando un link, y en el celular eso significa
 * mantener apretado, esperar el menú y acertarle a "Pegar" — el paso donde más
 * gente se caía. El botón lo resuelve de un toque.
 *
 * Había uno solo, escrito a mano en la sección de lotes; el resto de los inputs
 * de URL no lo tenían. Acá se unifica para que se comporten todos igual.
 *
 * El portapapeles no siempre se puede leer: Firefox no implementa `readText` y
 * en el resto el permiso se puede denegar. Cuando no se puede, el botón no se
 * dibuja en vez de quedar visible y no hacer nada.
 */

/** Acepta links completos y también dominios sueltos (`mitienda.com/x`). */
function looksLikeUrl(text: string): boolean {
	const clean = text.trim();
	if (!clean || clean.length > 2000 || /\s/.test(clean)) return false;
	return /^https?:\/\//i.test(clean) || /^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(clean);
}

export default function UrlInput({
	value,
	onChange,
	placeholder = 'https://mitienda.com/productos/...',
	className = '',
	inputClassName = '',
	ariaLabel,
	disabled,
	name,
	id,
	onEnter,
	children,
	style,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
	/** Para conservar la clase del input en pantallas con estilos propios. */
	inputClassName?: string;
	ariaLabel?: string;
	disabled?: boolean;
	name?: string;
	id?: string;
	/** Enter suele significar "analizá esto ya". */
	onEnter?: () => void;
	/** Acción a la derecha del campo (por ejemplo "Leer" o "Analizar"). */
	children?: React.ReactNode;
	style?: React.CSSProperties;
}) {
	const [canPaste, setCanPaste] = useState(false);
	const [state, setState] = useState<'idle' | 'ok' | 'empty'>('idle');
	const inputRef = useRef<HTMLInputElement>(null);
	const timer = useRef<ReturnType<typeof setTimeout>>();

	// En SSR no hay navigator, y el permiso solo se conoce en el navegador.
	useEffect(() => {
		setCanPaste(typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function');
		return () => clearTimeout(timer.current);
	}, []);

	function flash(next: 'ok' | 'empty') {
		setState(next);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setState('idle'), 1800);
	}

	async function paste() {
		try {
			const text = (await navigator.clipboard.readText()).trim();
			if (!looksLikeUrl(text)) {
				// Sin esto el botón parecía roto: se tocaba y no pasaba nada.
				flash('empty');
				inputRef.current?.focus();
				return;
			}
			onChange(text);
			flash('ok');
			inputRef.current?.focus();
		} catch {
			// Permiso denegado: que al menos quede el cursor puesto para pegar a mano.
			setCanPaste(false);
			inputRef.current?.focus();
		}
	}

	return (
		<div className={`url-field${className ? ` ${className}` : ''}`} style={style}>
			<div className="url-field-box">
				<span className="url-field-icon" aria-hidden="true">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
						<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
						<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
					</svg>
				</span>
				<input
					ref={inputRef}
					type="url"
					inputMode="url"
					autoComplete="url"
					spellCheck={false}
					className={`url-field-input${inputClassName ? ` ${inputClassName}` : ''}`}
					value={value}
					name={name}
					id={id}
					disabled={disabled}
					placeholder={placeholder}
					aria-label={ariaLabel}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && onEnter) { event.preventDefault(); onEnter(); }
					}}
				/>
				{canPaste && !disabled && (
					<button
						type="button"
						className={`url-field-paste${state !== 'idle' ? ` is-${state}` : ''}`}
						onClick={() => void paste()}
						title="Pegar del portapapeles"
					>
						{state === 'ok' ? '¡Listo!' : state === 'empty' ? 'Sin link' : 'Pegar'}
					</button>
				)}
			</div>
			{children}
		</div>
	);
}
