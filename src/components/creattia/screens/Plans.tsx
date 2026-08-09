import { subscriptionPlans, yearlyPriceFor, yearlySavingsFor } from '../../../lib/creattia/subscription-plans';
import { isSupabaseConfigured, supabase } from '../../../lib/creattia/supabase-browser';
import { Icon } from '../Icon';
import { activeSubscriptionStatuses, getSessionId, getSessionToken, paidSubscriptionStatuses, planRank } from '../app-session';
import { resolverSuscripcion } from '../../../lib/creattia/subscription-state';
import { CancelFlow } from './CancelFlow';
import type { AppProfile, AppSession } from '../app-types';
import { useEffect, useState } from 'react';
/** Planes, compra de créditos y estado de la suscripción. */

/**
 * El importe tal como lo va a cerrar Mercado Pago, cuando no cobra en dólares.
 *
 * Con `style: 'currency'` a secas, es-AR imprime "$ 12.250,00" para pesos: el
 * mismo signo que el dólar del precio de lista, así que la aclaración de moneda
 * no aclaraba nada. Con el código adelante se lee "ARS 12.250,00" y no hay forma
 * de confundirlo con los USD de arriba.
 */
function importeDeCobro(monto: number, moneda: string) {
	// El peso chileno, el guaraní y el peso colombiano no aceptan centavos, y el
	// servidor ya redondea antes de crear la preferencia: mostrar ",00" acá sería
	// prometer una precisión que el cobro no tiene.
	const decimales = ['CLP', 'PYG', 'COP'].includes(moneda) ? 0 : 2;
	try {
		return new Intl.NumberFormat('es-AR', {
			style: 'currency', currency: moneda, currencyDisplay: 'code',
			minimumFractionDigits: decimales, maximumFractionDigits: decimales,
		}).format(monto);
	} catch {
		// Una moneda que Intl no conozca no puede dejar la pantalla sin el dato.
		return `${moneda} ${monto.toFixed(decimales)}`;
	}
}

export function BuyCreditsSection({ session }: { session: AppSession }) {
	const [config, setConfig] = useState<any>(null);
	const [buying, setBuying] = useState(false);
	/**
	 * La cantidad se guarda como texto, no como número.
	 *
	 * Antes se forzaba a 1 en cada tecla —Math.max(1, ...)— así que el campo
	 * nunca podía quedar vacío: para escribir 3 había que borrar el 1 y no se
	 * podía, terminabas con 13 o 31. Ahora se deja escribir libremente y el valor
	 * se acota recién al calcular el total y al pagar.
	 *
	 * Arranca vacío y se completa con el mínimo que devuelve el servidor: dejarlo
	 * clavado en un número acá era volver a tener la regla escrita en dos lados.
	 */
	const [quantity, setQuantity] = useState('');
	const [error, setError] = useState('');

	useEffect(() => {
		let active = true;
		fetch('/api/creativos/buy-credits', {
			headers: { authorization: `Bearer ${getSessionToken(session)}` }
		})
		.then(r => r.json())
		.then(data => {
			if (!active) return;
			setConfig(data);
			// El campo arranca en el mínimo que manda el servidor. Dejarlo vacío
			// mostraría "Total a pagar" calculado sobre una cantidad que no está
			// escrita en ningún lado de la pantalla.
			setQuantity(String(Number(data?.minCredits) || 10));
		})
		.catch(() => null);
		return () => { active = false; };
	}, [session]);

	async function buy(quantity: number) {
		setBuying(true); setError('');
		try {
			const response = await fetch('/api/creativos/buy-credits', {
				method: 'POST',
				headers: { 
					authorization: `Bearer ${getSessionToken(session)}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ quantity })
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la compra.');
			window.location.href = payload.checkoutUrl;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Error al conectar con Mercado Pago.');
			setBuying(false);
		}
	}

	if (!config) return <div className="studio-loading-panel" style={{ marginTop: '36px', minHeight: '120px' }}><span className="studio-spinner" aria-hidden="true" /><p>Cargando opciones de pago…</p></div>;
	const unconfigured = !config.configured;
	const maxCredits = Number(config.maxCredits || 1000);
	const minCredits = Number(config.minCredits || 10);
	const creditStep = Math.max(1, Number(config.creditStep || 5));
	/**
	 * La cantidad que se va a mandar al checkout, ya redondeada a la regla.
	 *
	 * Los tokens sueltos se venden de a `creditStep` desde `minCredits`, y el
	 * servidor rechaza con un 400 cualquier otra cantidad. Si acá no se ajustara,
	 * escribir 13 en el campo terminaba en "Los tokens sueltos se compran de a
	 * 5…" recién después de tocar Continuar: el error llega al final, cuando la
	 * persona ya decidió pagar. Se acomoda al escalón más cercano hacia abajo
	 * —nunca se cobra más de lo que la persona escribió— y se acota al tope.
	 */
	const safeQuantity = (() => {
		const escrito = Math.floor(Number(quantity) || 0);
		if (escrito <= minCredits) return minCredits;
		const escalones = Math.floor((Math.min(maxCredits, escrito) - minCredits) / creditStep);
		return minCredits + escalones * creditStep;
	})();
	const unitPrice = Number(config.unitPrice || 0.3);
	const totalPrice = (unitPrice * safeQuantity).toFixed(2);
	// "USD 0.49" y no "u$s 0.49": el símbolo criollo se lee informal y encima
	// repetía la moneda dos veces en la misma frase.
	const symbol = config.currency === 'USD' ? 'USD ' : '$';
	/**
	 * La moneda con la que Mercado Pago cierra el pago, cuando no es el dólar.
	 *
	 * El endpoint devuelve `cobro` desde el primer día justamente para esto y la
	 * pantalla lo tiraba a la basura: se anunciaba "USD 24.50" y en el resumen de
	 * la tarjeta aparecía un importe en pesos que no se parecía en nada. No hay
	 * nada que haga abandonar un pago más rápido que un número que cambia entre
	 * la pantalla donde decidís y la pantalla donde pagás.
	 */
	const cobro = config.cobro && Number(config.cobro.monto) > 0
		? { monto: Number(config.cobro.monto), moneda: String(config.cobro.moneda) }
		: null;
	// Atajos para los tres volúmenes que se piden siempre. Escribir un número en
	// un campo vacío es una decisión más: quien entra acá ya descartó suscribirse
	// y hay que darle algo para tocar, no otro formulario.
	// El atajo de 5 quedó fuera de la regla cuando el mínimo pasó a 10: el botón
	// se veía, se podía tocar y el checkout lo rechazaba con un 400.
	const atajos = [10, 20, 50]
		.filter((cantidad) => cantidad >= minCredits && cantidad <= maxCredits && (cantidad - minCredits) % creditStep === 0);

	return (
		<div id="buy-credits-section" style={{ marginTop: '30px', padding: '24px', background: '#f5f2f9', border: '1px solid #e2dee8', borderRadius: '16px' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
				<span style={{ fontSize: '20px' }}>⚡</span>
				<h2 style={{ margin: 0, fontSize: '18px', color: '#19171d' }}>Tokens sueltos, sin suscripción</h2>
			</div>
			<p style={{ margin: '0 0 16px', fontSize: '13.5px', color: '#716d79', lineHeight: 1.5 }}>
				Comprá los tokens que necesites y usalos cuando quieras. Es un pago único: no se renueva, no queda una tarjeta guardada y cada token equivale a una imagen generada.
				{unconfigured ? (
					<strong> Muy pronto vas a poder comprarlos acá.</strong>
				) : (
					<> <strong>Cada token cuesta {symbol}{unitPrice.toFixed(2)}.</strong>{cobro && <> Se cobra en {cobro.moneda}: {importeDeCobro(cobro.monto, cobro.moneda)} por token.</>}</>
				)}
			</p>

			{error && <p style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 12px', fontWeight: 600 }}>{error}</p>}

			<div className="credit-checkout-grid">
				<div style={{ background: '#fff', border: '1px solid #e9e6ed', borderRadius: '12px', padding: '18px', boxShadow: '0 4px 12px rgba(25, 23, 29, 0.03)' }}>
					<label htmlFor="credit-quantity" style={{ display: 'block', marginBottom: '7px', color: '#19171d', fontSize: '15px', fontWeight: 800 }}>¿Cuántos tokens querés comprar?</label>
					<p style={{ margin: '0 0 14px', color: '#716d79', fontSize: '12.5px', lineHeight: 1.45 }}>Desde {minCredits} tokens, de a {creditStep}. Cada token equivale a una imagen generada.</p>
					{atajos.length > 0 && (
						<div className="credit-quick-picks">
							{atajos.map((cantidad) => (
								<button
									key={cantidad}
									type="button"
									className={safeQuantity === cantidad ? 'active' : ''}
									onClick={() => setQuantity(String(cantidad))}
								>{cantidad} tokens</button>
							))}
						</div>
					)}
					<div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
						<input
							id="credit-quantity"
							type="number"
							inputMode="numeric"
							min={minCredits}
							max={maxCredits}
							step={creditStep}
							value={quantity}
							onChange={(event) => {
								const escrito = event.target.value;
								// Se permite el campo vacío mientras se escribe; solo se
								// descartan las letras y los números fuera de rango. El
								// mínimo y el escalón NO se aplican acá: forzarlos en cada
								// tecla es el mismo problema de antes con otro número —para
								// llegar a 25 hay que pasar por el 2— así que se acomodan
								// recién al salir del campo.
								if (escrito === '') { setQuantity(''); return; }
								const numero = Number(escrito);
								if (!Number.isFinite(numero)) return;
								setQuantity(String(Math.min(maxCredits, Math.max(0, Math.floor(numero)))));
							}}
							onBlur={() => setQuantity(String(safeQuantity))}
							style={{ width: '140px', boxSizing: 'border-box', height: '46px', padding: '0 13px', border: '1px solid #d8cceb', borderRadius: '10px', color: '#19171d', fontSize: '20px', fontWeight: 800 }}
						/>
						<span style={{ color: '#716d79', fontSize: '13px' }}>tokens</span>
					</div>
					<small style={{ display: 'block', marginTop: '9px', color: '#8b8290', fontSize: '11px' }}>El mínimo es {minCredits} tokens y de ahí se suman de a {creditStep} ({minCredits}, {minCredits + creditStep}, {minCredits + creditStep * 2}…), hasta {maxCredits} en una sola operación.</small>
				</div>
				<div style={{ background: '#fff', border: '1px solid #d8c5fa', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 4px 16px rgba(116, 75, 222, 0.08)' }}>
					<div><span style={{ display: 'block', color: '#716d79', fontSize: '12px' }}>Total a pagar</span><strong style={{ display: 'block', marginTop: '5px', color: '#744bde', fontSize: '30px', letterSpacing: '-.03em' }}>{symbol}{totalPrice}</strong>{/* Estaba escrito a mano en 0.30 y el precio real venía del servidor: la
   pantalla decía "cada crédito cuesta 0.49" arriba y "0.30 por crédito"
   dos líneas más abajo, en la misma tarjeta. */}
									<small style={{ display: 'block', color: '#8b8290', fontSize: '11.5px' }}>{symbol}{unitPrice.toFixed(2)} por token</small>
									{cobro && <small style={{ display: 'block', marginTop: '6px', color: '#5c5568', fontSize: '11.5px', lineHeight: 1.4 }}>Mercado Pago te va a cobrar <strong>{importeDeCobro(cobro.monto * safeQuantity, cobro.moneda)}</strong>, que es este total al cambio de hoy.</small>}</div>
					<button onClick={() => void buy(safeQuantity)} disabled={buying || unconfigured} style={{ width: '100%', minHeight: '42px', marginTop: '16px', borderRadius: '10px', border: 0, background: 'linear-gradient(110deg, #744bde, #ec4492 65%, #f05427)', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer', opacity: buying ? 0.65 : 1 }}>{unconfigured ? 'Pago no disponible' : buying ? <><span className="studio-spinner small" aria-hidden="true" /> Abriendo Mercado Pago...</> : 'Continuar al pago'}</button>
				</div>
			</div>

		</div>
	);
}

export function Plans({ profile, session }: { profile: AppProfile; session: AppSession }) {
	const [billing, setBilling] = useState('');
	const [cancelling, setCancelling] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [pendingPlanChange, setPendingPlanChange] = useState<{ planCode: string; direction: 'up' | 'down' } | null>(null);
	const [confirmingCancel, setConfirmingCancel] = useState(false);
	/**
	 * Mensual, anual o tokens sueltos. Estaba clavado en 'monthly': el cobro anual
	 * existía en el servidor pero no había forma de llegar a él desde la pantalla.
	 *
	 * 'credits' entró después por el mismo motivo del otro lado: quien no quiere
	 * una suscripción hoy veía cinco planes con renovación mensual y nada más. La
	 * compra suelta vivía abajo de todo, después de la grilla y del cartel de
	 * cancelación, así que en el teléfono había que scrollear una pantalla y media
	 * para descubrir que existía. El que no quería suscribirse simplemente se iba.
	 */
	const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly' | 'credits'>('monthly');
	const comprandoTokens = billingCycle === 'credits';
	/**
	 * Cambia a la compra suelta y sube.
	 *
	 * A los tokens sueltos se llega también desde el pie de la grilla, y ahí la
	 * página está scrolleada cinco tarjetas para abajo. Cambiar la pestaña sin
	 * subir dejaba la pantalla en blanco: la grilla larga desaparece, el panel de
	 * compra entra arriba y quien tocó el botón se queda mirando el final vacío
	 * de la página sin entender qué pasó.
	 */
	function verTokensSueltos() {
		setBillingCycle('credits');
		if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
	}
	async function changePlan(planCode: string, direction: 'up' | 'down') {
		const targetPlan = subscriptionPlans.find((plan) => plan.code === planCode);
		if (!targetPlan) return;
		setPendingPlanChange({ planCode, direction });
		return;
	}
	/**
	 * Lo que hay que decirle al usuario sobre su plan hoy.
	 *
	 * La pantalla mostraba los planes pero nunca hasta cuándo vale el actual, así
	 * que después de cambiar o cancelar quedaba la duda de qué día se corta.
	 */
	const estadoDelPlan = (() => {
		const suscripcion = resolverSuscripcion(profile);
		const plan = subscriptionPlans.find((item) => item.code === profile.planCode);
		const hasta = profile.subscriptionPeriodEnd
			? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(profile.subscriptionPeriodEnd))
			: '';
		/**
		 * El período pagado ya terminó y no entró ninguna renovación.
		 *
		 * Este caso no se contemplaba: la cuenta quedaba mostrando el último estado
		 * conocido para siempre. Ahora se dice lo que pasó y qué hacer.
		 */
		if (suscripcion.vencida) {
			return {
				tono: 'aviso' as const,
				titulo: 'Tu plan terminó y la cuenta volvió a Gratis',
				detalle: hasta
					? `El período pagado terminó el ${hasta}. Tus tokens sin usar siguen disponibles; la biblioteca completa y la carga mensual se reactivan al contratar de nuevo.`
					: 'Tus tokens sin usar siguen disponibles. Contratá un plan para recuperar la biblioteca completa y la carga mensual de tokens.',
			};
		}
		if (suscripcion.enBaja && hasta) {
			return {
				tono: 'aviso' as const,
				titulo: `Tu plan ${plan?.name || ''} sigue activo hasta el ${hasta}`,
				detalle: 'Cancelaste la renovación, así que no se te vuelve a cobrar. Ese día la cuenta pasa a Gratis y tus imágenes y marcas se conservan.',
			};
		}
		if (profile.subscriptionStatus === 'pending') {
			return {
				tono: 'aviso' as const,
				titulo: 'Tu pago está pendiente de confirmación',
				detalle: 'Apenas Mercado Pago lo apruebe se activan los tokens del plan. Si dejaste el checkout a medias, podés retomarlo desde el plan que elegiste.',
			};
		}
		if (suscripcion.activa && plan) {
			return {
				tono: 'ok' as const,
				titulo: `Tenés el plan ${plan.name} activo`,
				/**
				 * Se dice explícitamente que el cobro sigue solo: es la pregunta que
				 * más se hace en una suscripción y no estaba contestada en ningún lado.
				 *
				 * La carga de tokens y el cobro se cuentan por separado a propósito.
				 * Antes se decía "se renueva el {fecha} y se te cargan N tokens", con
				 * la fecha del próximo cobro: en el plan anual esa fecha está a un año,
				 * así que le prometía a quien pagó el año que sus tokens se cargan
				 * recién en 2027. Los tokens entran todos los meses en los dos planes;
				 * lo que cambia es cada cuánto se cobra.
				 */
				detalle: hasta
					? `Se te cargan ${plan.credits} tokens nuevos cada mes y el próximo cobro es el ${hasta}. Se sigue cobrando hasta que canceles. Podés cambiar de plan cuando quieras: el precio nuevo se aplica en esa fecha.`
					: `Se te cargan ${plan.credits} tokens nuevos cada mes, y se sigue cobrando hasta que canceles.`,
			};
		}
		return null;
	})();

	const returnedFromCheckout = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('subscription') === 'return';

	useEffect(() => {
		if (!returnedFromCheckout) return;
		setNotice('Volviste de Mercado Pago. Tu plan se activará automáticamente cuando se confirme el pago.');
		window.history.replaceState({}, '', `${window.location.pathname}?plan=1`);
	}, [returnedFromCheckout]);

	async function subscribe(planCode: string, changeCurrent = false) {
		if (!isSupabaseConfigured || !supabase) { setError('Para activar pagos faltan las credenciales de Supabase y Mercado Pago.'); return; }
		if (activeSubscriptionStatuses.includes(profile.subscriptionStatus) && !changeCurrent) {
			setError('Elegí “Subir de plan” o “Bajar de plan” para modificar tu suscripción sin duplicar el cobro.');
			return;
		}
		setBilling(planCode); setError('');
		try {
			const response = await fetch('/api/creativos/subscribe', {
				method: 'POST',
				headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
				// 'credits' es una vista de esta pantalla, no una modalidad de
				// suscripción: si se filtrara en el cuerpo, el endpoint contesta 400
				// "La modalidad de cobro no es válida" y el checkout no abre.
				body: JSON.stringify({ planCode, billingCycle: billingCycle === 'yearly' ? 'yearly' : 'monthly', changeCurrent }),
			});
			const payload = await response.json();
			if (payload.changed) {
				setNotice(`Listo: tu suscripción ahora es ${subscriptionPlans.find((plan) => plan.code === planCode)?.name || planCode}. No se creó un segundo cobro.`);
				setBilling('');
				window.setTimeout(() => window.location.reload(), 800);
				return;
			}
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la suscripción.');
			if (typeof payload.checkoutUrl !== 'string' || !payload.checkoutUrl) throw new Error('Mercado Pago no devolvió un enlace de checkout válido.');
			window.location.assign(payload.checkoutUrl);
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el pago.'); setBilling(''); }
	}

	async function cancelSubscription() {
		setConfirmingCancel(false);
		setCancelling(true); setError(''); setNotice('');
		try {
			const response = await fetch('/api/creativos/subscribe', {
				method: 'DELETE',
				headers: { authorization: `Bearer ${getSessionToken(session)}` },
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo cancelar la suscripción.');
			// Se dice hasta cuándo, que es lo único que la persona quiere saber en ese
			// momento. Antes el aviso hablaba de los créditos y no de la fecha.
			const hastaCuando = profile.subscriptionPeriodEnd
				? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long' }).format(new Date(profile.subscriptionPeriodEnd))
				: '';
			setNotice(hastaCuando
				? `Listo, no se te vuelve a cobrar. Seguís con tu plan completo hasta el ${hastaCuando} y después la cuenta pasa a Gratis.`
				: 'Listo, no se te vuelve a cobrar. Seguís con tu plan hasta que termine el período que ya pagaste.');
			window.setTimeout(() => window.location.reload(), 1400);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo cancelar la suscripción.');
			setCancelling(false);
		}
	}

	return <><div className="studio-page-heading"><div><p>PLANES Y ACCESO</p><h1>Desbloqueá la biblioteca que te inspira.</h1><span>Elegí el volumen de tokens que necesitás. Todos los planes pagos incluyen la biblioteca completa, estáticos y carruseles.</span></div></div>
		
		{/* Qué pasa con tu plan y cuándo. Sin esto, después de cambiar o cancelar
		    no quedaba a la vista hasta qué día seguía valiendo lo que pagaste. */}
		{estadoDelPlan && (
			<div className={`plan-status plan-status-${estadoDelPlan.tono}`} role="status">
				<strong>{estadoDelPlan.titulo}</strong>
				<span>{estadoDelPlan.detalle}</span>
			</div>
		)}

		{/* Mensual o anual. Antes no existía la opción y el anual era inalcanzable.
		    La tercera opción es la salida para el que no quiere suscribirse. */}
		<div className="billing-switch" role="radiogroup" aria-label="Modalidad de cobro">
			<button
				type="button" role="radio" aria-checked={billingCycle === 'monthly'}
				className={billingCycle === 'monthly' ? 'active' : ''}
				onClick={() => setBillingCycle('monthly')}
			>Mensual</button>
			<button
				type="button" role="radio" aria-checked={billingCycle === 'yearly'}
				className={billingCycle === 'yearly' ? 'active' : ''}
				onClick={() => setBillingCycle('yearly')}
			>Anual <em>2 meses gratis</em></button>
			<button
				type="button" role="radio" aria-checked={comprandoTokens}
				className={comprandoTokens ? 'active' : ''}
				onClick={() => setBillingCycle('credits')}
			>Tokens sueltos</button>
		</div>

		{error && <p className="studio-form-error">{error}</p>}
		{notice && <p className="studio-form-notice">{notice}</p>}
		{comprandoTokens ? <BuyCreditsSection session={session} /> : <>
		<div className="studio-plans-grid">{subscriptionPlans.map((plan) => {
			const isFreePlan = plan.code === 'free';
			const hasPaidSubscription = activeSubscriptionStatuses.includes(profile.subscriptionStatus);
			// Un checkout abierto y sin pagar: no es un plan vigente, es un pago a
			// medio terminar. Se ofrece retomarlo en vez de bloquear el botón.
			const pagoPendiente = profile.subscriptionStatus === 'pending' && profile.planCode === plan.code;
			const currentPlan = isFreePlan
				? (!hasPaidSubscription && (!profile.planCode || profile.planCode === 'trial' || profile.planCode === 'free'))
				: hasPaidSubscription && profile.planCode === plan.code;
			const isPlanChange = hasPaidSubscription && !currentPlan;
			const direction = planRank(plan.code) > planRank(profile.planCode) ? 'up' : 'down';
			// En anual se muestra el equivalente por mes —que es como la gente
			// compara— y aparte lo que se cobra de una y cuánto se ahorra.
			const esAnual = billingCycle === 'yearly' && !isFreePlan;
			const precioMensualEquivalente = esAnual ? yearlyPriceFor(plan.price) / 12 : plan.price;
			const price = isFreePlan ? '0.00' : precioMensualEquivalente.toFixed(2);
			const frequencyText = isFreePlan ? '' : '/mes';
			const ahorroAnual = esAnual ? yearlySavingsFor(plan.price) : 0;

			const handleButtonClick = () => {
				if (isFreePlan) {
					if (hasPaidSubscription) setConfirmingCancel(true);
					// La compra suelta ya no está más abajo en la misma página, así que
					// un scrollIntoView contra un id que no está montado no hacía nada:
					// el botón del plan Gratis quedaba muerto. Ahora cambia de pestaña.
					else verTokensSueltos();
				} else if (pagoPendiente) {
					// changeCurrent limpia el checkout viejo antes de abrir el nuevo.
					void subscribe(plan.code, true);
				} else if (isPlanChange) {
					void changePlan(plan.code, direction);
				} else {
					subscribe(plan.code);
				}
			};

			const actionLabel = pagoPendiente
				? (billing === plan.code ? 'Abriendo pago…' : 'Terminar el pago')
				: currentPlan
				? 'Plan actual'
				: isFreePlan
					? (hasPaidSubscription ? 'Bajar a Gratis' : 'Explorar gratis')
					: hasPaidSubscription
						? (direction === 'up' ? 'Subir a ' : 'Bajar a ') + plan.name
						: (billing === plan.code ? 'Abriendo pago…' : 'Elegir ' + plan.name);

			if (actionLabel) return <article key={plan.code} className={plan.featured ? 'featured' : ''}>
				{plan.featured && <span className="most-popular-badge">MÁS ELEGIDO</span>}
				<h3>{plan.name}</h3>
				<small className="plan-description">{plan.description}</small>
				<div className="plan-price-row">
					<span className="plan-price-val"><b>$</b>{price}</span>
					<span className="plan-price-freq">{frequencyText}</span>
				</div>
				{/* Decía "recibís 480 tokens de una" y dejó de ser cierto: el anual se
				    cobra una vez pero entrega los tokens mes a mes, igual que el
				    mensual. Aparte de la exactitud, "480 tokens de una" se vendía
				    peor: suena a un stock que hay que administrar, cuando lo que se
				    contrata es la misma producción mensual con dos meses de regalo. */}
				{esAnual && (
					<p className="plan-yearly-note">
						<strong>${yearlyPriceFor(plan.price).toFixed(2)} una vez al año</strong>
						<span>Ahorrás ${ahorroAnual.toFixed(2)} · <strong>{plan.tokensLabel}</strong> nuevos cada mes</span>
					</p>
				)}
				{/* Los tokens del mes, resaltados y sin el precio por unidad al lado.
				    Esa cuenta —"$0.62 por token"— se leía contra los $0.49 del token
				    suelto y hacía parecer que el plan era el negocio caro, cuando lo
				    que compra un plan es la biblioteca entera más el volumen. */}
				{!esAnual && (
					<p className="plan-yearly-note plan-unit-note">
						<span><strong>{plan.tokensLabel}</strong> por mes</span>
					</p>
				)}
				<button
					className="plan-subscribe-btn"
					style={{ background: plan.featured ? 'linear-gradient(104deg, rgb(62, 134, 198) 0%, rgb(166, 102, 170) 22%, rgb(236, 68, 146) 50%, rgb(238, 68, 84) 76%, rgb(240, 84, 39) 100%)' : '#744bde' }}
					onClick={handleButtonClick}
					disabled={Boolean(billing) || Boolean(cancelling) || (currentPlan && !pagoPendiente)}
				>
					{actionLabel}
				</button>
				<ul>{plan.features.map((f, i) => <li key={i} className={f.active ? 'active-feature' : 'inactive-feature'}>{f.active ? <Icon name="check" size={14}/> : <Icon name="close" size={14}/>} {f.name}</li>)}</ul>
			</article>;

		})}</div>
		{/* La salida para el que llegó hasta acá y ninguna suscripción le cierra.
		    Sin este renglón la única puerta a los tokens sueltos es una pestaña
		    arriba de todo, que en el teléfono ya quedó fuera de pantalla. */}
		<p className="studio-plan-note plan-note-tokens">¿No querés una suscripción? <button type="button" onClick={verTokensSueltos}>Comprá tokens sueltos</button> y usalos cuando quieras.</p>
		</>}
		{['authorized', 'pending', 'paused'].includes(profile.subscriptionStatus) && <button className="studio-cancel-subscription" onClick={() => setConfirmingCancel(true)} disabled={cancelling}>{cancelling ? <><span className="studio-spinner small" aria-hidden="true" /> Cancelando…</> : 'Cancelar renovación'}</button>}

		{pendingPlanChange && (() => {
			const target = subscriptionPlans.find((plan) => plan.code === pendingPlanChange.planCode);
			if (!target) return null;
			const isUpgrade = pendingPlanChange.direction === 'up';
			return <div className="studio-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingPlanChange(null); }}><section className="studio-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="plan-change-title"><div className="studio-confirm-icon" aria-hidden="true">{isUpgrade ? '↑' : '↓'}</div><p className="studio-confirm-kicker">CAMBIO DE PLAN</p><h2 id="plan-change-title">{isUpgrade ? 'Subir' : 'Bajar'} al plan {target.name}</h2><p>Tu suscripción actual se va a actualizar sin crear un segundo cobro. Vas a conservar el acceso y los créditos que correspondan al nuevo plan.</p><div className="studio-confirm-actions"><button type="button" className="studio-confirm-secondary" onClick={() => setPendingPlanChange(null)}>Cancelar</button><button type="button" className="studio-confirm-primary" onClick={() => { setPendingPlanChange(null); void subscribe(target.code, true); }}>{isUpgrade ? 'Subir de plan' : 'Bajar de plan'}</button></div></section></div>;
		})()}
		{confirmingCancel && (
			<CancelFlow
				profile={profile}
				userId={getSessionId(session)}
				periodEnd={profile.subscriptionPeriodEnd}
				onClose={() => setConfirmingCancel(false)}
				onConfirm={cancelSubscription}
				onVerPlanes={() => { setConfirmingCancel(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
			/>
		)}
	</>;
}

// Escáner de marcas: pegás la URL principal y la IA completa todo
// (colores, tipografía, voz, botones, logo). Límite de marcas según plan.
