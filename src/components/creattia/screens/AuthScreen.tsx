import { escucharVueltaALaPantalla } from '../../../lib/creattia/ingreso-en-curso';
import { isSupabaseConfigured, supabase } from '../../../lib/creattia/supabase-browser';
import { Icon } from '../Icon';
import { PROFILE_KEY, SESSION_KEY, defaultProfile, loadLocal, saveLocal } from '../app-storage';
import type { AppSession, DemoSession } from '../app-types';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
/** Login, registro y el estado de "no pudimos crear tu cuenta". */

export function authRedirectUrl() {
	// Volvemos siempre por una ruta propia que conserva el hash de Supabase y
	// luego nos lleva a la app. Mantener el host actual también evita mezclar
	// www.creattia.app con creattia.app en el allowlist de OAuth.
	return new URL('/auth/callback/', window.location.origin).toString();
}

export function AuthScreen({ onSession }: { onSession: (session: AppSession) => void }) {
	const [mode, setMode] = useState<'signup' | 'login'>('login');
	const [fullName, setFullName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	/**
	 * Un ingreso a la vez, y quién lo tiene tomado.
	 *
	 * Antes era un `loading` de sí o no compartido por los dos caminos. El de
	 * Google lo prendía y ya no volvía a ejecutarse nada acá —se va de la página—,
	 * así que quien abría Google y volvía atrás porque en realidad quería entrar
	 * con su correo se encontraba el botón "Ingresar" en gris para siempre.
	 *
	 * Sigue siendo un estado solo, a propósito: con uno por camino se podía
	 * mandar el ingreso con correo mientras Google ya estaba llevándose la
	 * página, y terminaban compitiendo dos sesiones. Lo que cambia es que ahora
	 * se sabe cuál está en curso, y el de Google se suelta al volver.
	 */
	const [enCurso, setEnCurso] = useState<'email' | 'google' | null>(null);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');

	// El del correo siempre termina en su `finally`; el de Google no termina
	// nunca de este lado, así que su única salida es que la persona vuelva.
	useEffect(() => {
		if (enCurso !== 'google') return;
		return escucharVueltaALaPantalla(() => setEnCurso(null), window);
	}, [enCurso]);

	async function submit(event: FormEvent) {
		event.preventDefault();
		// Enter en un campo con el botón deshabilitado no manda el formulario, pero
		// eso depende del navegador y el candado de verdad tiene que estar acá.
		if (enCurso) return;
		setError(''); setNotice(''); setEnCurso('email');
		try {
			if (isSupabaseConfigured && supabase) {
				if (mode === 'signup') {
					const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: authRedirectUrl() } });
					if (authError) throw authError;
					if (data.session) onSession(data.session);
					else setNotice('Revisá tu email para confirmar la cuenta y después ingresá.');
				} else {
					const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
					if (authError) throw authError;
					onSession(data.session);
				}
			} else {
				const demoSession: DemoSession = { user: { id: 'demo-user', email: email || 'demo@creattia.app' } };
				saveLocal(SESSION_KEY, demoSession);
				if (mode === 'signup') {
					const current = loadLocal(PROFILE_KEY, defaultProfile);
					saveLocal(PROFILE_KEY, { ...current, fullName });
				}
				onSession(demoSession);
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo ingresar.');
		} finally { setEnCurso(null); }
	}

	function enterDemo() {
		const demoSession: DemoSession = { user: { id: 'demo-user', email: 'demo@creattia.app' } };
		saveLocal(SESSION_KEY, demoSession);
		onSession(demoSession);
	}

	function changeMode(nextMode: 'signup' | 'login') {
		setMode(nextMode);
		setPassword('');
		setError('');
		setNotice('');
	}

	async function signInWithGoogle() {
		if (enCurso) return;
		setError(''); setNotice('');
		if (!isSupabaseConfigured || !supabase) {
			setError('El acceso con Google todavía no está disponible en esta demo.');
			return;
		}
		setEnCurso('google');
		try {
			const { error: authError } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: { redirectTo: authRedirectUrl() },
			});
			if (authError) throw authError;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo continuar con Google.');
			setEnCurso(null);
		}
	}

	return (
		<div className="studio-auth">
			<a href="/" className="studio-auth-logo"><span><img src="/images/creattia/avatar-nobg.webp" alt=""/></span><strong>Creattia</strong></a>
			<section className="studio-auth-panel">
				<div className="studio-auth-card">
					<div className="studio-auth-heading">
						{!isSupabaseConfigured && <span className="studio-demo-label"><i/> Modo demo local</span>}
						<h2>{mode === 'signup' ? 'Creá imágenes que venden en minutos' : 'Volvé a tu espacio creativo'}</h2>
						<p>{mode === 'signup' ? 'Tus primeras 3 imágenes son gratis. Sin tarjeta.' : 'Ingresá para seguir creando con tu marca.'}</p>
					</div>
						<button className="studio-google-button" type="button" onClick={signInWithGoogle} disabled={enCurso !== null}><img src="/images/creattia/google-g.svg" alt=""/>Continuar con Google</button>
						<div className="studio-auth-divider"><span>o</span></div>
						<form onSubmit={submit}>
							{mode === 'signup' && <label>Tu nombre<input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="¿Cómo te llamás?" autoComplete="name" required /></label>}
							<label>Correo electrónico<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tumail@gmail.com" autoComplete="email" required /></label>
							<label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required /></label>
							{error && <p className="studio-form-error">{error}</p>}
							{notice && <p className="studio-form-notice">{notice}</p>}
							<button className="studio-primary-button" disabled={enCurso !== null || !email.trim() || !password}>{enCurso === 'email' ? <span className="studio-spinner small"/> : <>{mode === 'signup' ? 'Crear cuenta gratis' : 'Ingresar'}<Icon name="arrow" size={18}/></>}</button>
						</form>
					{!isSupabaseConfigured && <button className="studio-demo-entry" onClick={enterDemo}>Entrar directo con la cuenta demo</button>}
					<small className="studio-terms">Al continuar aceptás los <a href="/terminos/">términos</a> y la <a href="/privacidad/">política de privacidad</a>.</small>
				</div>
				<p className="studio-auth-switch">{mode === 'signup' ? '¿Ya tenés una cuenta?' : '¿Todavía no tenés cuenta?'} <button onClick={() => changeMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Ingresar' : 'Crear cuenta gratis'}</button></p>
			</section>
			<div className="studio-auth-moki" aria-hidden="true"><span>Te guío paso a paso.</span><img src="/images/creattia/avatar-nobg.webp" alt=""/></div>
		</div>
	);
}

export function AccountSetupError({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
	const missingSchema = /creative_|schema cache|does not exist|relation/i.test(message);
	return <div className="studio-account-error">
		<a href="/" className="studio-auth-logo"><span><img src="/images/creattia/avatar-nobg.webp" alt=""/></span><strong>Creattia</strong></a>
		<section>
			<img className="studio-account-error-logo" src="/images/creattia/avatar-nobg.webp" alt="Creattia" />
			<h1>{missingSchema ? 'Estamos preparando tu espacio.' : 'No pudimos cargar tu cuenta.'}</h1>
			<p>{missingSchema ? 'Tu acceso ya funciona. Falta terminar la configuración segura de tu espacio antes de guardar productos e imágenes.' : 'Reintentá en unos segundos. Si el problema continúa, volvé a ingresar.'}</p>
			<div><button onClick={onRetry}>Reintentar</button><button onClick={onLogout}>Cerrar sesión</button></div>
		</section>
	</div>;
}

// Página Descubrir: mazo tipo Tinder a pantalla completa. Deslizá o tocá —
// corazón guarda (con sonido y confetti), cruz pasa, rayo lo usa para crear.
// Inicio dopamínico: 4 ganadores a tamaño real. Corazón guarda, cruz pasa
// (entra el siguiente del mazo), rayo lo usa ya. Link al modo swipe completo.
