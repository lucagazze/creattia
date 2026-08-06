import { useState } from 'react';
import { supabase } from '../../../lib/creattia/supabase-browser';
import { subscriptionPlans } from '../../../lib/creattia/subscription-plans';
import type { AppProfile } from '../app-types';

/**
 * Baja de suscripción en tres pasos.
 *
 * Antes era un solo botón "Cancelar renovación": la cuenta se perdía sin saber
 * nunca por qué, que es justamente el dato que dice qué hay que arreglar. Y sin
 * ninguna instancia para ofrecer una alternativa a alguien que quizá solo
 * necesitaba gastar menos o pausar un mes.
 *
 * Los tres pasos son: por qué se va, una salida concreta para ese motivo, y la
 * confirmación con lo que realmente pasa al cancelar. La oferta cambia según el
 * motivo a propósito: ofrecer "bajá de plan" a quien se queja de la calidad es
 * no haber escuchado.
 */

type Motivo = {
	id: string;
	etiqueta: string;
	/** Qué se le ofrece a quien elige este motivo. */
	oferta: { titulo: string; texto: string; accion: string | null };
};

const MOTIVOS: Motivo[] = [
	{
		id: 'caro',
		etiqueta: 'Me sale caro para lo que uso',
		oferta: {
			titulo: 'Quizá te sirva un plan más chico',
			texto: 'En vez de cancelar podés bajar al plan Básico y seguir con la biblioteca completa por menos de la mitad. Los tokens que ya tenés no se pierden.',
			accion: 'Ver planes más chicos',
		},
	},
	{
		id: 'poco-uso',
		etiqueta: 'No lo estoy usando lo suficiente',
		oferta: {
			titulo: 'Los tokens no vencen',
			texto: 'Si el problema es el ritmo, bajar al plan Básico te deja la cuenta abierta gastando mucho menos, y los tokens que acumulaste siguen ahí para cuando los necesites.',
			accion: 'Ver planes más chicos',
		},
	},
	{
		id: 'calidad',
		etiqueta: 'Las imágenes no salen como esperaba',
		oferta: {
			titulo: 'Contanos qué salió mal',
			texto: 'Esto lo queremos saber en serio. Si nos decís qué anuncio no funcionó y qué esperabas, lo revisamos: la mayoría de los problemas de calidad son del prompt o de la referencia elegida, y se corrigen.',
			accion: null,
		},
	},
	{
		id: 'falta-funcion',
		etiqueta: 'Le falta algo que necesito',
		oferta: {
			titulo: '¿Qué te falta?',
			texto: 'Escribinos qué necesitabas y no encontraste. Es la clase de pedido que define qué construimos después.',
			accion: null,
		},
	},
	{
		id: 'temporal',
		etiqueta: 'Es algo temporal, vuelvo más adelante',
		oferta: {
			titulo: 'Podés volver cuando quieras',
			texto: 'Al cancelar conservás el acceso hasta que termine el período que ya pagaste, y tu cuenta, tus marcas y tus imágenes quedan guardadas. Volver es contratar de nuevo, sin cargar nada otra vez.',
			accion: null,
		},
	},
	{
		id: 'otro',
		etiqueta: 'Otro motivo',
		oferta: {
			titulo: 'Contanos qué pasó',
			texto: 'Cualquier cosa que nos digas sirve, aunque sea corta.',
			accion: null,
		},
	},
];

export function CancelFlow({ profile, userId, periodEnd, onClose, onConfirm, onVerPlanes }: {
	profile: AppProfile;
	userId: string;
	/** Hasta cuándo sigue teniendo el plan ya pagado. */
	periodEnd?: string;
	onClose: () => void;
	onConfirm: () => void | Promise<void>;
	onVerPlanes: () => void;
}) {
	const [paso, setPaso] = useState<1 | 2 | 3>(1);
	const [motivo, setMotivo] = useState<Motivo | null>(null);
	const [comentario, setComentario] = useState('');
	const [enviando, setEnviando] = useState(false);

	const planActual = subscriptionPlans.find((plan) => plan.code === profile.planCode);
	const hasta = periodEnd
		? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(periodEnd))
		: null;

	async function guardarMotivo(sequedo: boolean) {
		if (!motivo || !supabase) return;
		try {
			await supabase.from('creative_cancellation_feedback').insert({
				user_id: userId,
				plan_code: profile.planCode || null,
				reason: motivo.id,
				comment: comentario.trim() || null,
				retained: sequedo,
			});
		} catch { /* el motivo es información nuestra: nunca puede frenar la baja */ }
	}

	async function confirmar() {
		setEnviando(true);
		await guardarMotivo(false);
		await onConfirm();
	}

	async function quedarse() {
		await guardarMotivo(true);
		onClose();
	}

	return (
		<div className="studio-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !enviando) onClose(); }}>
			<section className="studio-confirm-modal cancel-flow" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
				<p className="studio-confirm-kicker">PASO {paso} DE 3</p>

				{paso === 1 && (
					<>
						<h2 id="cancel-title">¿Por qué querés cancelar?</h2>
						<p>Elegí lo que más se parezca. Nos sirve de verdad para saber qué mejorar.</p>
						<div className="cancel-reasons" role="radiogroup" aria-label="Motivo">
							{MOTIVOS.map((opcion) => (
								<button
									key={opcion.id}
									type="button"
									role="radio"
									aria-checked={motivo?.id === opcion.id}
									className={motivo?.id === opcion.id ? 'active' : ''}
									onClick={() => setMotivo(opcion)}
								>
									{opcion.etiqueta}
								</button>
							))}
						</div>
						<div className="studio-confirm-actions">
							<button type="button" className="studio-confirm-secondary" onClick={onClose}>Mejor me quedo</button>
							<button type="button" className="studio-confirm-primary" disabled={!motivo} onClick={() => setPaso(2)}>Continuar</button>
						</div>
					</>
				)}

				{paso === 2 && motivo && (
					<>
						<h2 id="cancel-title">{motivo.oferta.titulo}</h2>
						<p>{motivo.oferta.texto}</p>
						<label className="cancel-comment">
							<span>¿Algo más que quieras contarnos? <em>(opcional)</em></span>
							<textarea
								value={comentario}
								onChange={(event) => setComentario(event.target.value)}
								rows={3}
								maxLength={600}
								placeholder="Lo que sea, aunque sea una línea."
							/>
						</label>
						<div className="studio-confirm-actions">
							{motivo.oferta.accion ? (
								<button type="button" className="studio-confirm-primary" onClick={() => { void quedarse(); onVerPlanes(); }}>
									{motivo.oferta.accion}
								</button>
							) : (
								<button type="button" className="studio-confirm-secondary" onClick={() => void quedarse()}>Mejor me quedo</button>
							)}
							<button type="button" className="studio-confirm-secondary" onClick={() => setPaso(3)}>Seguir con la baja</button>
						</div>
					</>
				)}

				{paso === 3 && (
					<>
						<h2 id="cancel-title">Confirmá la cancelación</h2>
						<ul className="cancel-consequences">
							<li>
								<strong>Seguís con el plan {planActual?.name || 'actual'}{hasta ? ` hasta el ${hasta}` : ' hasta que termine el período pagado'}.</strong>
								<span>No perdés nada de lo que ya pagaste.</span>
							</li>
							<li>
								<strong>Tus tokens actuales siguen disponibles.</strong>
								<span>Lo que no se renueva es la carga mensual.</span>
							</li>
							<li>
								<strong>Después pasás al plan Gratis.</strong>
								<span>La biblioteca completa se bloquea y quedan las 50 de muestra. Tus imágenes y marcas se conservan.</span>
							</li>
						</ul>
						<div className="studio-confirm-actions">
							<button type="button" className="studio-confirm-secondary" onClick={() => void quedarse()} disabled={enviando}>Mejor me quedo</button>
							<button type="button" className="studio-confirm-danger" onClick={() => void confirmar()} disabled={enviando}>
								{enviando ? 'Cancelando…' : 'Confirmar cancelación'}
							</button>
						</div>
					</>
				)}
			</section>
		</div>
	);
}
