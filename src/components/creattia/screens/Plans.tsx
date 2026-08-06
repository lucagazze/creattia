import { subscriptionPlans, yearlyPriceFor, yearlySavingsFor } from '../../../lib/creattia/subscription-plans';
import { isSupabaseConfigured, supabase } from '../../../lib/creattia/supabase-browser';
import { Icon } from '../Icon';
import { activeSubscriptionStatuses, getSessionId, getSessionToken, paidSubscriptionStatuses, planRank } from '../app-session';
import { CancelFlow } from './CancelFlow';
import type { AppProfile, AppSession } from '../app-types';
import { useEffect, useState } from 'react';
/** Planes, compra de créditos y estado de la suscripción. */

export function BuyCreditsSection({ session }: { session: AppSession }) {
	const [config, setConfig] = useState<any>(null);
	const [buying, setBuying] = useState(false);
	const [quantity, setQuantity] = useState(1);
	const [error, setError] = useState('');

	useEffect(() => {
		let active = true;
		fetch('/api/creativos/buy-credits', {
			headers: { authorization: `Bearer ${getSessionToken(session)}` }
		})
		.then(r => r.json())
		.then(data => {
			if (active) setConfig(data);
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
	const safeQuantity = Math.min(maxCredits, Math.max(1, Math.floor(quantity)));
	const unitPrice = Number(config.unitPrice || 0.3);
	const totalPrice = (unitPrice * safeQuantity).toFixed(2);
	const symbol = config.currency === 'USD' ? 'u$s' : '$';

	return (
		<div id="buy-credits-section" style={{ marginTop: '36px', padding: '24px', background: '#f5f2f9', border: '1px solid #e2dee8', borderRadius: '16px' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
				<span style={{ fontSize: '20px' }}>⚡</span>
				<h2 style={{ margin: 0, fontSize: '18px', color: '#19171d' }}>Pago único (Sin suscripción)</h2>
			</div>
			<p style={{ margin: '0 0 16px', fontSize: '13.5px', color: '#716d79', lineHeight: 1.5 }}>
				¿Querés probar una imagen rápida o no querés una membresía mensual? Comprá créditos individuales y usalos cuando quieras.
				{unconfigured ? (
					<strong> Muy pronto vas a poder comprarlos acá.</strong>
				) : (
					<strong> Cada crédito cuesta {symbol}{unitPrice.toFixed(2)} {config.currency}.</strong>
				)}
			</p>
			
			{error && <p style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 12px', fontWeight: 600 }}>{error}</p>}

			<div className="credit-checkout-grid">
				<div style={{ background: '#fff', border: '1px solid #e9e6ed', borderRadius: '12px', padding: '18px', boxShadow: '0 4px 12px rgba(25, 23, 29, 0.03)' }}>
					<label htmlFor="credit-quantity" style={{ display: 'block', marginBottom: '7px', color: '#19171d', fontSize: '15px', fontWeight: 800 }}>¿Cuántos créditos querés comprar?</label>
					<p style={{ margin: '0 0 14px', color: '#716d79', fontSize: '12.5px', lineHeight: 1.45 }}>Elegí cualquier cantidad. Cada crédito equivale a una imagen generada.</p>
					<div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
						<input id="credit-quantity" type="number" min={1} max={maxCredits} step={1} value={quantity} onChange={(event) => setQuantity(Math.min(maxCredits, Math.max(1, Number(event.target.value) || 1)))} style={{ width: '140px', boxSizing: 'border-box', height: '46px', padding: '0 13px', border: '1px solid #d8cceb', borderRadius: '10px', color: '#19171d', fontSize: '20px', fontWeight: 800 }} />
						<span style={{ color: '#716d79', fontSize: '13px' }}>créditos</span>
					</div>
					<small style={{ display: 'block', marginTop: '9px', color: '#8b8290', fontSize: '11px' }}>Podés comprar de 1 a {maxCredits} créditos en una sola operación.</small>
				</div>
				<div style={{ background: '#fff', border: '1px solid #d8c5fa', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 4px 16px rgba(116, 75, 222, 0.08)' }}>
					<div><span style={{ display: 'block', color: '#716d79', fontSize: '12px' }}>Total a pagar</span><strong style={{ display: 'block', marginTop: '5px', color: '#744bde', fontSize: '30px', letterSpacing: '-.03em' }}>{symbol}{totalPrice}</strong>{/* Estaba escrito a mano en 0.30 y el precio real venía del servidor: la
   pantalla decía "cada crédito cuesta 0.49" arriba y "0.30 por crédito"
   dos líneas más abajo, en la misma tarjeta. */}
									<small style={{ color: '#8b8290', fontSize: '11.5px' }}>{symbol}{unitPrice.toFixed(2)} por crédito</small></div>
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
	 * Mensual o anual. Estaba clavado en 'monthly': el cobro anual existía en el
	 * servidor pero no había forma de llegar a él desde la pantalla.
	 */
	const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
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
		const plan = subscriptionPlans.find((item) => item.code === profile.planCode);
		const hasta = profile.subscriptionPeriodEnd
			? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(profile.subscriptionPeriodEnd))
			: '';
		if (profile.subscriptionStatus === 'cancelled' && hasta) {
			return {
				tono: 'aviso' as const,
				titulo: `Tu plan ${plan?.name || ''} sigue activo hasta el ${hasta}`,
				detalle: 'Cancelaste la renovación. Ese día la cuenta pasa a Gratis y tus imágenes y marcas se conservan.',
			};
		}
		if (profile.subscriptionStatus === 'pending') {
			return {
				tono: 'aviso' as const,
				titulo: 'Tu pago está pendiente de confirmación',
				detalle: 'Apenas Mercado Pago lo apruebe se activan los tokens del plan. Si dejaste el checkout a medias, podés retomarlo desde el plan que elegiste.',
			};
		}
		if (profile.subscriptionStatus === 'authorized' && plan) {
			return {
				tono: 'ok' as const,
				titulo: `Tenés el plan ${plan.name} activo`,
				detalle: hasta
					? `Se renueva el ${hasta} con ${plan.credits} tokens. Podés cambiar de plan cuando quieras: el nuevo precio se aplica en esa fecha.`
					: `Se renueva cada mes con ${plan.credits} tokens. Podés cambiar de plan cuando quieras.`,
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
				body: JSON.stringify({ planCode, billingCycle, changeCurrent }),
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
			setNotice('Renovación cancelada. Tus créditos actuales siguen disponibles.');
			window.setTimeout(() => window.location.reload(), 700);
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

		{/* Mensual o anual. Antes no existía la opción y el anual era inalcanzable. */}
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
		</div>

		{error && <p className="studio-form-error">{error}</p>}
		{notice && <p className="studio-form-notice">{notice}</p>}
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
					else {
						const el = document.getElementById('buy-credits-section');
						if (el) el.scrollIntoView({ behavior: 'smooth' });
					}
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
				{esAnual && (
					<p className="plan-yearly-note">
						<strong>${yearlyPriceFor(plan.price).toFixed(2)} una vez al año</strong>
						<span>Ahorrás ${ahorroAnual.toFixed(2)} · recibís {(plan.credits || 0) * 12} tokens de una</span>
					</p>
				)}
				{!isFreePlan && !esAnual && plan.credits ? (
					<p className="plan-yearly-note plan-unit-note">
						<span>{plan.credits} tokens por mes · ${(plan.price / plan.credits).toFixed(2)} por token</span>
					</p>
				) : null}
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
		<p className="studio-plan-note">Pago seguro con Mercado Pago. Los tokens de tu plan se renuevan cada mes y podés cancelar cuando quieras.</p>
		{['authorized', 'pending', 'paused'].includes(profile.subscriptionStatus) && <button className="studio-cancel-subscription" onClick={() => setConfirmingCancel(true)} disabled={cancelling}>{cancelling ? <><span className="studio-spinner small" aria-hidden="true" /> Cancelando…</> : 'Cancelar renovación'}</button>}
		
		<BuyCreditsSection session={session} />
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
