import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { supabase } from '../../../lib/creattia/supabase-browser';
import type { AppProfile, AppSession } from '../app-types';
import { subscriptionPlans } from '../../../lib/creattia/subscription-plans';

/**
 * Historial de pagos y estado de la cuenta.
 *
 * En el menú había un "Historial de pagos" que mostraba siempre el mismo cartel
 * —"no tenés facturas todavía"— sin consultar nada: los cobros se guardaban
 * desde el webhook en dos tablas que nadie leía nunca, y encima tenían RLS
 * activo sin políticas, así que ni el propio usuario podía verlas.
 *
 * Se juntan las dos fuentes —cobros de la suscripción y compras sueltas de
 * tokens— en una sola línea de tiempo, que es como uno mira sus gastos.
 */

type Movimiento = {
	id: string;
	fecha: string;
	tipo: 'suscripcion' | 'tokens';
	detalle: string;
	monto: number;
	moneda: string;
	estado?: string;
};

function formatearFecha(valor: string) {
	try {
		return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(valor));
	} catch { return valor.slice(0, 10); }
}

export function Billing({ profile, session }: { profile: AppProfile; session: AppSession }) {
	const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
	const [cargando, setCargando] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let vigente = true;
		void (async () => {
			if (!supabase) { setCargando(false); return; }
			try {
				const [suscripciones, compras] = await Promise.all([
					supabase.from('creative_subscription_payments')
						.select('payment_id,plan_code,status,amount,currency,paid_at,created_at')
						.order('created_at', { ascending: false }).limit(100),
					supabase.from('creative_credit_purchases')
						.select('payment_id,credits,amount,currency,created_at')
						.order('created_at', { ascending: false }).limit(100),
				]);
				if (!vigente) return;
				if (suscripciones.error || compras.error) throw suscripciones.error || compras.error;

				const desdeSuscripciones: Movimiento[] = (suscripciones.data || []).map((fila: any) => ({
					id: `s-${fila.payment_id}`,
					fecha: fila.paid_at || fila.created_at,
					tipo: 'suscripcion',
					detalle: `Plan ${subscriptionPlans.find((plan) => plan.code === fila.plan_code)?.name || fila.plan_code}`,
					monto: Number(fila.amount || 0),
					moneda: fila.currency || 'USD',
					estado: fila.status,
				}));
				const desdeCompras: Movimiento[] = (compras.data || []).map((fila: any) => ({
					id: `c-${fila.payment_id}`,
					fecha: fila.created_at,
					tipo: 'tokens',
					detalle: `${fila.credits} ${fila.credits === 1 ? 'token' : 'tokens'}`,
					monto: Number(fila.amount || 0),
					moneda: fila.currency || 'USD',
				}));

				setMovimientos([...desdeSuscripciones, ...desdeCompras]
					.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
			} catch (causa) {
				if (vigente) setError(causa instanceof Error ? causa.message : 'No pudimos cargar tus pagos.');
			} finally {
				if (vigente) setCargando(false);
			}
		})();
		return () => { vigente = false; };
	}, [session]);

	const planActual = subscriptionPlans.find((plan) => plan.code === profile.planCode);

	return (
		<>
			<div className="studio-page-heading">
				<div>
					<p>CUENTA</p>
					<h1>Tu plan y tus pagos.</h1>
					<span>Todo lo que cobramos, cuándo y por qué concepto.</span>
				</div>
			</div>

			<div className="billing-summary">
				<div className="billing-card">
					<small>PLAN ACTUAL</small>
					<strong>{planActual?.name || 'Gratis'}</strong>
					<span>{profile.subscriptionStatus === 'authorized' ? 'Activo' : profile.subscriptionStatus === 'pending' ? 'Pago pendiente' : profile.subscriptionStatus === 'paused' ? 'En pausa' : 'Sin suscripción'}</span>
				</div>
				<div className="billing-card">
					<small>TOKENS DISPONIBLES</small>
					<strong>{profile.credits ?? 0}</strong>
					<span>{planActual?.credits ? `${planActual.credits} se renuevan cada mes` : 'Comprá tokens cuando los necesites'}</span>
				</div>
				<div className="billing-card">
					<small>PAGOS REGISTRADOS</small>
					<strong>{cargando ? '—' : movimientos.length}</strong>
					<span>Desde que creaste la cuenta</span>
				</div>
			</div>

			{error && <p className="studio-form-error">{error}</p>}

			{cargando ? (
				<div className="billing-loading"><span className="studio-spinner" aria-hidden="true" /><p>Buscando tus pagos…</p></div>
			) : movimientos.length === 0 ? (
				<div className="studio-empty large">
					<span>🧾</span>
					<h3>Todavía no hay ningún pago</h3>
					<p>Cuando contrates un plan o compres tokens, cada cobro va a aparecer acá con su fecha y su importe.</p>
				</div>
			) : (
				<ul className="billing-list">
					{movimientos.map((movimiento) => (
						<li key={movimiento.id}>
							<span className={`billing-icon ${movimiento.tipo}`} aria-hidden="true">
								<Icon name={movimiento.tipo === 'tokens' ? 'spark' : 'card'} size={15} />
							</span>
							<div className="billing-detail">
								<strong>{movimiento.detalle}</strong>
								<small>
									{formatearFecha(movimiento.fecha)}
									{movimiento.tipo === 'suscripcion' && movimiento.estado && movimiento.estado !== 'approved' ? ` · ${movimiento.estado}` : ''}
								</small>
							</div>
							<span className="billing-amount">
								{movimiento.moneda === 'ARS' ? '$' : 'USD '}{movimiento.monto.toFixed(2)}
							</span>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
