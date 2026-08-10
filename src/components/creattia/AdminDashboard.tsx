import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { nombreDePantalla } from '../../lib/creattia/presencia';
import { Activity, CalendarDays, CircleDollarSign, CreditCard, FileText, MailCheck, ReceiptText, ShieldCheck, UserRound, WalletCards, X } from 'lucide-react';
import './admin-dashboard.css';
import { MetricsSection } from './MetricsSection';
import { subscriptionPlans } from '../../lib/creattia/subscription-plans';
import { ADMIN_PLAN_CREDITS } from '../../lib/creattia/admin';

type AdminDashboardProps = { session: any };
type Section = 'overview' | 'metrics' | 'users' | 'payments' | 'activity';
type UserFilter = 'all' | 'active' | 'trial' | 'override' | 'unconfirmed';
type UserSort = 'recent' | 'created' | 'usage' | 'payments' | 'credits';
type ContextMenuState = { userId: string; x: number; y: number };

/**
 * Los planes que el panel puede asignar a mano, incluido el gratuito.
 *
 * Estaban copiados acá con los números de una escalera vieja: el menú ofrecía
 * "Agency · 300 tokens · $97.70/mes" cuando el plan que se cobra da 145 tokens
 * por USD 69.99. El servidor siempre acreditó lo correcto —lee la oferta real—,
 * así que lo único que pasaba es que el admin regalaba accesos a ciegas.
 *
 * Después quedó otro agujero por el filtro `plan.credits`: el plan Gratis no
 * declara ese campo —su token mensual no se cobra, así que no está en la tabla
 * que lee el webhook de Mercado Pago— y caía del menú sin que nadie lo hubiera
 * decidido. El efecto era que desde el panel se podía subir a cualquiera de plan
 * pero no bajarlo: para sacar un plan regalado había que quitar el override y
 * esperar a que el estado se resolviera solo. Los tokens salen de
 * `ADMIN_PLAN_CREDITS`, que es la misma tabla que aplica el servidor.
 */
const planOptions = subscriptionPlans
	.map((plan) => ({ code: plan.code, label: plan.name, credits: plan.credits ?? ADMIN_PLAN_CREDITS[plan.code] ?? 0, price: plan.price }));

function authHeaders(session: any) {
	const token = session?.access_token || '';
	return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

function dateLabel(value?: string | null) {
	if (!value) return '—';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function compactDate(value?: string | null) {
	if (!value) return '—';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date);
}

function money(value: number, currency = 'USD') {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
}

function shortNumber(value: number) {
	return new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function isRecentlyActive(value?: string | null) {
	return Boolean(value && Date.now() - new Date(value).getTime() <= 10 * 60 * 1000);
}

function planPrice(code?: string | null) {
	return planOptions.find((item) => item.code === code)?.price || 0;
}

export default function AdminDashboard({ session }: AdminDashboardProps) {
	const [section, setSection] = useState<Section>('overview');
	const [overview, setOverview] = useState<any>(null);
	const [detail, setDetail] = useState<any>(null);
	const [selectedUserId, setSelectedUserId] = useState('');
	const [loading, setLoading] = useState(true);
	const [detailLoading, setDetailLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [creditsDraft, setCreditsDraft] = useState('');

	const request = async (url: string, init?: RequestInit) => {
		const response = await fetch(url, { ...init, headers: { ...authHeaders(session), ...(init?.headers || {}) } });
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación.');
		return payload;
	};

	const loadOverview = async (silent = false) => {
		if (!silent) setLoading(true);
		setError('');
		try {
			const payload = await request('/api/admin/overview');
			setOverview(payload);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo cargar el centro admin.');
		} finally {
			if (!silent) setLoading(false);
		}
	};

	useEffect(() => {
		void loadOverview();
		const interval = window.setInterval(() => void loadOverview(true), 60_000);
		return () => window.clearInterval(interval);
	}, []);

	const openUser = async (userId: string) => {
		const switchingUser = selectedUserId !== userId;
		setSelectedUserId(userId);
		if (switchingUser) setDetail(null);
		setDetailLoading(true);
		setError('');
		try {
			const payload = await request(`/api/admin/users?userId=${encodeURIComponent(userId)}`);
			setDetail(payload);
			setCreditsDraft(String(payload.override?.credits_override ?? payload.profile?.credits_remaining ?? 0));
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo cargar el usuario.');
		} finally {
			setDetailLoading(false);
		}
	};

	const applyAction = async (userId: string, action: string, extra: Record<string, unknown> = {}) => {
		if (!userId) return;
		setSaving(true); setError(''); setNotice('');
		try {
			const result = await request('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ userId, action, ...extra }) });
			await loadOverview(true);
			if (selectedUserId === userId) await openUser(userId);
			setNotice(result.planCode ? `Plan ${result.planCode} asignado. El usuario y la ficha se actualizaron automáticamente.` : 'Cambio aplicado y registrado en la auditoría.');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo aplicar el cambio.');
		} finally {
			setSaving(false);
		}
	};

	const users = overview?.users || [];
	const metrics = overview?.metrics || {};

	return (
		<section className="admin-center">
			<nav className="admin-tabs" aria-label="Secciones del centro admin">
				{([['overview', 'Resumen'], ['metrics', 'Métricas'], ['users', 'Usuarios'], ['payments', 'Pagos'], ['activity', 'Actividad']] as Array<[Section, string]>).map(([id, label]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>{label}</button>)}
				<button className="admin-refresh" onClick={() => void loadOverview()} disabled={loading}>↻ Actualizar</button>
			</nav>

			{error && <div className="admin-alert error">{error}</div>}
			{notice && <div className="admin-alert success">✓ {notice}</div>}
			{loading && !overview ? <div className="admin-loading"><span /> Cargando datos seguros…</div> : (
				<>
					<div className="admin-metric-grid">
						{/* Lo de HOY primero: es lo que se mira mientras corre una campana.
						    "+N esta semana" no sirve para eso — el dia que empezas a pautar,
						    siete dias de historia tapan justamente lo que queres ver. */}
						<Metric label="Usuarios registrados" value={shortNumber(metrics.users)} hint={`+${metrics.newUsersToday || 0} hoy · +${metrics.newUsers7d || 0} esta semana`} tone="blue" />
						<Metric label="Personas activas ahora" value={shortNumber(metrics.activeUsers)} hint="Últimos 10 minutos" tone="green" live />
						<Metric label="Suscripciones activas" value={shortNumber(metrics.activeSubscriptions)} hint={`${metrics.activeToday || 0} activos hoy`} tone="violet" />
						<Metric label="MRR estimado" value={money(metrics.mrr)} hint="Planes autorizados" tone="orange" />
						<Metric label="Creativos generados" value={shortNumber(metrics.completedGenerations)} hint={`${metrics.generations || 0} trabajos totales`} tone="blue" />
						{/* El primer escalon del embudo: gente que llego a la home sin tener
						    cuenta. Antes la medicion arrancaba en "abrio la app", asi que de
						    cuanta gente llega y NO entra no quedaba ningun rastro. */}
						<Metric label="Visitantes de la landing hoy" value={shortNumber(metrics.landingVisitorsToday)} hint={`${metrics.landingViewsToday || 0} visitas en total`} tone="violet" />
						{/* Personas distintas, no aperturas: una sola que entra ocho veces no
						    son ocho visitantes. */}
						<Metric label="Entraron a la app hoy" value={shortNumber(metrics.appVisitorsToday)} hint={`personas distintas · ${metrics.appViewsToday || 0} aperturas`} tone="green" />
					</div>

					{section === 'overview' && <OverviewSection overview={overview} onOpenUser={openUser} />}
					{section === 'metrics' && <MetricsSection session={session} />}
					{section === 'users' && <UsersSection users={users} selectedUserId={selectedUserId} onOpenUser={openUser} onQuickAction={applyAction} onNotice={setNotice} />}
					{section === 'payments' && <PaymentsSection payments={overview?.recentPayments || []} />}
					{section === 'activity' && <ActivitySection activity={overview?.activity || []} onOpenUser={openUser} />}
				</>
			)}

			{selectedUserId && <UserDrawer detail={detail} loading={detailLoading} saving={saving} creditsDraft={creditsDraft} setCreditsDraft={setCreditsDraft} onClose={() => { setSelectedUserId(''); setDetail(null); }} onAction={(action, extra) => applyAction(selectedUserId, action, extra)} />}
		</section>
	);
}

function Metric({ label, value, hint, tone, live = false }: { label: string; value: string; hint: string; tone: string; live?: boolean }) {
	return <article className={`admin-metric ${tone}`}>{live && <span className="admin-metric-live"><i /> EN VIVO</span>}<span>{label}</span><strong>{value}</strong><small>{hint}</small><i /></article>;
}

function ActiveUsersPanel({ users, onOpenUser }: { users: any[]; onOpenUser: (id: string) => void }) {
	const activeUsers = users.filter((user) => user.activeNow || isRecentlyActive(user.lastActivityAt)).slice(0, 8);
	return <section className="admin-panel admin-active-panel"><PanelHeading kicker="PRESENCIA EN TIEMPO REAL" title="Personas activas ahora" action="Se actualiza cada minuto" /><div className="admin-active-users">{activeUsers.length ? activeUsers.map((user) => <button type="button" key={user.id} onClick={() => onOpenUser(user.id)}><span className="admin-avatar">{(user.fullName || user.email || '?').slice(0, 1).toUpperCase()}</span><span><strong>{user.fullName || user.email}</strong><small>{user.pantalla ? <em className="admin-donde-esta">{nombreDePantalla(user.pantalla.vista, user.pantalla.detalle)}</em> : user.email}</small></span><i className="admin-presence-dot online" title="Online ahora" /></button>) : <EmptyState label="No hay personas activas en los últimos 10 minutos." />}</div></section>;
}

function OverviewSection({ overview, onOpenUser }: { overview: any; onOpenUser: (id: string) => void }) {
	const topUsers = [...(overview.users || [])].sort((a: any, b: any) => (b.generationCount || 0) - (a.generationCount || 0)).slice(0, 6);
	return <div className="admin-overview-grid">
		<ActiveUsersPanel users={overview.users || []} onOpenUser={onOpenUser} />
		<section className="admin-panel admin-funnel-panel"><PanelHeading kicker="LECTURA RÁPIDA" title="La salud del producto" /><div className="admin-funnel"><FunnelStep number="01" label="Cuentas creadas" value={overview.metrics.users} /><FunnelStep number="02" label="Suscripciones activas" value={overview.metrics.activeSubscriptions} /><FunnelStep number="03" label="Creativos terminados" value={overview.metrics.completedGenerations} /></div><div className="admin-mini-stat-row"><span><b>{overview.metrics.newUsers30d || 0}</b> altas en 30 días</span><span><b>{overview.metrics.totalPurchasedCredits || 0}</b> tokens vendidos</span><span><b>{overview.metrics.videos || 0}</b> videos creados</span></div></section>
		<section className="admin-panel"><PanelHeading kicker="USO INTENSIVO" title="Usuarios más activos" action="Ver usuarios" /><div className="admin-rank-list">{topUsers.length ? topUsers.map((user: any, index: number) => <button key={user.id} onClick={() => onOpenUser(user.id)}><span className="admin-rank-number">0{index + 1}</span><span className="admin-avatar">{(user.fullName || user.email || '?').slice(0, 1).toUpperCase()}</span><span className="admin-rank-copy"><strong>{user.fullName || user.email}</strong><small>{user.email}</small></span><b>{user.generationCount || 0}<em> creativos</em></b></button>) : <EmptyState label="Todavía no hay actividad de usuarios." />}</div></section>
		<section className="admin-panel admin-wide-panel"><PanelHeading kicker="ÚLTIMOS MOVIMIENTOS" title="Qué está pasando ahora" /><ActivityList activity={(overview.activity || []).slice(0, 8)} onOpenUser={onOpenUser} /></section>
	</div>;
}

function UsersSection({ users, selectedUserId, onOpenUser, onQuickAction, onNotice }: { users: any[]; selectedUserId: string; onOpenUser: (id: string) => void; onQuickAction: (userId: string, action: string, extra?: Record<string, unknown>) => Promise<void>; onNotice: (message: string) => void }) {
	const [search, setSearch] = useState('');
	const [filter, setFilter] = useState<UserFilter>('all');
	const [sort, setSort] = useState<UserSort>('recent');
	const query = search.trim().toLowerCase();
	const filteredUsers = useMemo(() => {
		const result = users.filter((user: any) => {
			const matchesSearch = !query || `${user.email} ${user.fullName} ${user.brandName} ${user.planLabel}`.toLowerCase().includes(query);
			const matchesFilter = filter === 'all' || (filter === 'active' && (user.activeNow || isRecentlyActive(user.lastActivityAt))) || (filter === 'trial' && user.subscriptionStatus === 'trial') || (filter === 'override' && Boolean(user.override)) || (filter === 'unconfirmed' && !user.emailConfirmed);
			return matchesSearch && matchesFilter;
		});
		return [...result].sort((left: any, right: any) => {
			if (sort === 'usage') return (right.generationCount || 0) - (left.generationCount || 0);
			if (sort === 'payments') return (right.paidAmount || 0) - (left.paidAmount || 0);
			if (sort === 'credits') return (right.credits || 0) - (left.credits || 0);
			const leftDate = new Date(sort === 'created' ? left.createdAt : left.lastSignInAt || left.createdAt).getTime();
			const rightDate = new Date(sort === 'created' ? right.createdAt : right.lastSignInAt || right.createdAt).getTime();
			return rightDate - leftDate;
		});
	}, [users, query, filter, sort]);
	const counts = {
		all: users.length,
		active: users.filter((user: any) => user.activeNow || isRecentlyActive(user.lastActivityAt)).length,
		trial: users.filter((user: any) => user.subscriptionStatus === 'trial').length,
		override: users.filter((user: any) => user.override).length,
	};
	return <section className="admin-panel admin-table-panel"><div className="admin-table-toolbar admin-users-toolbar"><div><PanelHeading kicker="CUENTAS Y ACCESOS" title={`${filteredUsers.length} usuarios visibles`} /><p className="admin-table-hint"><span className="admin-live-legend"><i /> Online ahora: {counts.active}</span> · clic derecho para administrar el acceso.</p></div><div className="admin-table-controls"><label className="admin-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar email, nombre o plan…" /></label><select value={filter} onChange={(event) => setFilter(event.target.value as UserFilter)} aria-label="Filtrar usuarios"><option value="all">Todos ({counts.all})</option><option value="active">Online ahora ({counts.active})</option><option value="trial">En prueba ({counts.trial})</option><option value="override">Con override ({counts.override})</option><option value="unconfirmed">Email pendiente</option></select><select value={sort} onChange={(event) => setSort(event.target.value as UserSort)} aria-label="Ordenar usuarios"><option value="recent">Último acceso</option><option value="created">Más nuevos</option><option value="usage">Más uso</option><option value="payments">Más ingresos</option><option value="credits">Más tokens</option></select></div></div><UserTable users={filteredUsers} selectedUserId={selectedUserId} onOpenUser={onOpenUser} onQuickAction={onQuickAction} onNotice={onNotice} /></section>;
}

function UserTable({ users, selectedUserId, onOpenUser, onQuickAction, onNotice }: { users: any[]; selectedUserId: string; onOpenUser: (id: string) => void; onQuickAction: (userId: string, action: string, extra?: Record<string, unknown>) => Promise<void>; onNotice: (message: string) => void }) {
	const [menu, setMenu] = useState<ContextMenuState | null>(null);
	const menuUser = users.find((user) => user.id === menu?.userId);
	useEffect(() => {
		if (!menu) return undefined;
		const close = () => setMenu(null);
		const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
		document.addEventListener('click', close);
		document.addEventListener('keydown', closeOnEscape);
		window.addEventListener('scroll', close, true);
		return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', closeOnEscape); window.removeEventListener('scroll', close, true); };
	}, [menu]);
	const openMenu = (event: MouseEvent<HTMLTableRowElement>, userId: string) => {
		event.preventDefault();
		setMenu({ userId, x: Math.min(event.clientX, window.innerWidth - 274), y: Math.min(event.clientY, window.innerHeight - 375) });
	};
	const quickAction = (action: string, extra?: Record<string, unknown>) => {
		if (!menuUser) return;
		const userId = menuUser.id;
		setMenu(null);
		void onQuickAction(userId, action, extra);
	};
	const copyEmail = async () => {
		if (!menuUser) return;
		try { await navigator.clipboard.writeText(menuUser.email); onNotice('Email copiado al portapapeles.'); } catch { onNotice('No se pudo copiar el email.'); }
		setMenu(null);
	};
	return <div className="admin-table-wrap"><table className="admin-table admin-users-table"><thead><tr><th>Usuario</th><th>Estado</th><th>Plan</th><th>Acceso</th><th>Tokens</th><th>Creativos</th><th>Pagos</th><th>Alta</th><th>Último acceso</th><th>Renovación</th><th /></tr></thead><tbody>{users.map((user: any) => <tr key={user.id} className={selectedUserId === user.id ? 'selected' : ''} onContextMenu={(event) => openMenu(event, user.id)}><td><button className="admin-user-cell" onClick={() => onOpenUser(user.id)}><span className="admin-avatar">{(user.fullName || user.email || '?').slice(0, 1).toUpperCase()}</span><span><strong>{user.fullName || 'Sin nombre'}</strong><small>{user.email}</small>{user.brandName && <small className="admin-brand-line">{user.brandName}</small>}</span></button></td><td><span className={`admin-status-pill ${user.subscriptionStatus}`}>{user.statusLabel}</span><small className="admin-cell-muted">{user.emailConfirmed ? 'Email confirmado' : 'Email pendiente'}</small></td><td><span className={`admin-plan-pill ${user.planCode}`}>{user.planLabel}</span>{planPrice(user.planCode) > 0 && user.planCode !== 'admin' && <small className="admin-cell-muted">{money(planPrice(user.planCode))}/mes</small>}</td><td><span className={`admin-access-badge ${user.override?.accessMode === 'unlimited' || user.planCode === 'admin' ? 'unlimited' : user.override ? 'manual' : 'standard'}`}>{user.override?.accessMode === 'unlimited' || user.planCode === 'admin' ? '∞ Infinito' : user.override ? 'Manual' : 'Normal'}</span>{user.override && <small className="admin-cell-muted">Override admin</small>}</td><td><div className="admin-number-cell"><b>{user.credits > 9000 ? '∞' : user.credits}</b><small>de {user.monthlyCredits > 9000 ? '∞' : user.monthlyCredits || 0} mensuales</small><em>{user.purchasedCredits || 0} comprados</em></div></td><td><div className="admin-number-cell"><b>{user.generationCount || 0}</b><small>{user.completedGenerations || 0} terminados</small><em>{user.videoCount || 0} videos</em></div></td><td><div className="admin-number-cell"><b>{user.purchaseCount || 0}</b><small>{user.lastPaymentAt ? compactDate(user.lastPaymentAt) : 'Sin pagos'}</small>{user.lastPaymentAmount && <em>{money(Number(user.lastPaymentAmount), user.lastPaymentCurrency || 'USD')}</em>}</div></td><td><div className="admin-date-cell"><b>{compactDate(user.createdAt)}</b><small>{user.emailConfirmed ? 'Cuenta confirmada' : 'Pendiente'}</small></div></td><td><div className="admin-date-cell"><b>{compactDate(user.lastSignInAt)}</b><small>{user.lastSignInAt ? dateLabel(user.lastSignInAt).split(', ').pop() : 'Nunca ingresó'}</small></div></td><td><div className="admin-date-cell"><b>{compactDate(user.subscriptionPeriodEnd)}</b><small>{user.subscriptionPeriodEnd ? 'Próximo cobro' : 'Sin renovación'}</small></div></td><td><button className="admin-row-action" onClick={() => onOpenUser(user.id)} aria-label={`Abrir acciones de ${user.email}`}>⋯</button></td></tr>)}</tbody></table>{!users.length && <EmptyState label="No encontramos usuarios con esos filtros." />}{menu && menuUser && <UserContextMenu user={menuUser} x={menu.x} y={menu.y} onOpen={() => { setMenu(null); onOpenUser(menuUser.id); }} onCopy={copyEmail} onAction={quickAction} />}</div>;
}

function UserContextMenu({ user, x, y, onOpen, onCopy, onAction }: { user: any; x: number; y: number; onOpen: () => void; onCopy: () => void; onAction: (action: string, extra?: Record<string, unknown>) => void }) {
	const protectedUser = user.planCode === 'admin';
	return <div className="admin-context-menu" style={{ left: x, top: y }} onClick={(event) => event.stopPropagation()}><div className="admin-context-head"><span className="admin-avatar">{(user.fullName || user.email || '?').slice(0, 1).toUpperCase()}</span><div><strong>{user.fullName || 'Sin nombre'}</strong><small>{user.email}</small></div></div><button onClick={onOpen}>⌁ Abrir ficha completa</button><button onClick={onCopy}>▣ Copiar email</button>{protectedUser ? <div className="admin-context-protected">Cuenta administradora protegida</div> : <><div className="admin-context-divider">ASIGNAR ACCESO</div>{planOptions.map((plan) => <button key={plan.code} onClick={() => onAction('set_plan', { planCode: plan.code })}>{plan.price ? '↗ Dar plan ' : '↓ Bajar a '}{plan.label}<small>{plan.credits} {plan.credits === 1 ? 'token' : 'tokens'} · {plan.price ? `${money(plan.price)}/mes` : 'sin cargo'}</small></button>)}<button className="admin-context-dark" onClick={() => onAction('set_unlimited')}>∞ Dar acceso infinito</button>{user.override && <button className="admin-context-danger" onClick={() => onAction('revoke_override')}>↺ Quitar override admin</button>}</>}</div>;
}

function PaymentsSection({ payments }: { payments: any[] }) {
	return <section className="admin-panel admin-table-panel"><PanelHeading kicker="INGRESOS Y TOKENS" title="Historial de compras" /><div className="admin-table-wrap"><table className="admin-table admin-payments-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Pago</th><th>Tokens</th><th>Proveedor</th><th>ID de pago</th></tr></thead><tbody>{payments.map((payment: any) => <tr key={`${payment.payment_id}-${payment.paidAt}`}><td>{dateLabel(payment.paidAt || payment.created_at)}</td><td><strong>{payment.email}</strong></td><td><span className={`admin-payment-type ${payment.paymentType}`}>{payment.paymentType === 'subscription' ? 'Suscripción' : 'Tokens'}</span></td><td><b>{payment.amount ? money(Number(payment.amount), payment.currency || 'USD') : '—'}</b></td><td>{payment.credits || '—'}</td><td>{payment.provider_subscription_id ? 'Mercado Pago' : 'Mercado Pago'}</td><td><code>{payment.payment_id}</code></td></tr>)}</tbody></table>{!payments.length && <EmptyState label="Todavía no hay compras registradas." />}</div></section>;
}

function ActivitySection({ activity, onOpenUser }: { activity: any[]; onOpenUser: (id: string) => void }) {
	return <section className="admin-panel admin-table-panel"><PanelHeading kicker="AUDITORÍA DE PRODUCTO" title="Actividad reciente" /><ActivityList activity={activity} onOpenUser={onOpenUser} large /></section>;
}

/**
 * Las decisiones de una generación, dichas como las leería una persona.
 *
 * En la base son códigos —'winner', 'upload', 'quitar'— que no dicen nada a
 * quien mira el panel. Y traducirlas en el JSX las dejaba mezcladas con el
 * dibujo, que es como se terminan escribiendo dos veces distinto.
 */
const COMO_SE_LEE: Record<string, Record<string, string>> = {
	alcance: { product: 'Un producto', service: 'Un servicio', saas: 'Un software', brand: 'La marca', catalog: 'La tienda entera' },
	colores: { winner: 'Los del ganador', url: 'Los de la web', brand: 'Los de Mi marca' },
	tipografia: { winner: 'La del ganador', url: 'La de la web', brand: 'La de Mi marca' },
	marca: { none: 'Sin marca', url: 'La de la web', mine: 'Mi marca' },
	firma: { texto: 'El nombre escrito', imagen: 'El archivo del logo', nada: 'Sin firma' },
	persona: { none: 'No aparece nadie', ai: 'La elige el modelo', described: 'Descripta por el usuario', upload: 'Fotos de un avatar' },
	prensa: { quitar: 'Se sacó el bloque', texto: 'Medios propios, escritos', logos: 'Medios propios, con logo' },
	idioma: { es: 'Español', en: 'Inglés', pt: 'Portugués', it: 'Italiano', fr: 'Francés', de: 'Alemán' },
};

function ComoSePidio({ item }: { item: any }) {
	const d = item.decisiones || {};
	const filas: Array<[string, string]> = [];
	const poner = (etiqueta: string, clave: string, valor: any) => {
		if (!valor) return;
		filas.push([etiqueta, COMO_SE_LEE[clave]?.[String(valor)] || String(valor)]);
	};
	poner('Alcance', 'alcance', d.alcance);
	poner('Idioma', 'idioma', d.idioma);
	poner('Colores', 'colores', d.colores);
	poner('Tipografía', 'tipografia', d.tipografia);
	poner('Identidad', 'marca', d.marca);
	poner('Firma', 'firma', d.firma);
	poner('Persona', 'persona', d.persona);
	if (d.personaDescripta) filas.push(['Cómo es', d.personaDescripta]);
	poner('Fila de medios', 'prensa', d.prensa);
	if (d.prensaItems?.length) filas.push(['Medios declarados', d.prensaItems.join(', ')]);
	if (item.format) filas.push(['Formato', item.format]);
	if (d.preset) filas.push(['Preset', d.preset]);
	// Que sea una rehecha explica por qué se parece tanto a otra del feed.
	if (d.rehechaDe) filas.push(['Rehecha de', 'otra generación']);
	if (!filas.length && !item.brief) return null;
	return (
		<div className="visor-creativo-pedido">
			{/* Lo que escribió la persona va primero y separado: es lo único de acá
			    que no eligió de una lista, y es lo que más explica el resultado. */}
			{item.brief && (
				<div className="visor-creativo-brief">
					<span>Indicaciones que escribió</span>
					<p>{item.brief}</p>
				</div>
			)}
			{filas.length > 0 && (
				<dl>
					{filas.map(([etiqueta, valor]) => (
						<div key={etiqueta}><dt>{etiqueta}</dt><dd>{valor}</dd></div>
					))}
				</dl>
			)}
		</div>
	);
}

/**
 * Un bloque del visor: una imagen grande y, si hay más, las miniaturas debajo.
 *
 * Antes se apilaban las diez del mismo tamaño en una grilla con scroll: se veía
 * todo chico y ninguna se podía mirar de verdad. Y cada una abría una pestaña
 * nueva, que saca del panel para volver con el botón de atrás.
 *
 * Ahora se toca una miniatura y pasa a ser la grande, sin salir de acá.
 */
function BloqueDeImagenes({ bloque, conFlecha }: { bloque: { urls: string[]; etiqueta: string; pie: string }; conFlecha: boolean }) {
	const [elegida, setElegida] = useState(0);
	// Si cambia el creativo que se está mirando, se vuelve a la primera: dejar la
	// cuarta seleccionada sobre otro producto muestra algo que no se pidió.
	useEffect(() => { setElegida(0); }, [bloque.urls[0]]);
	const principal = bloque.urls[elegida] || bloque.urls[0];
	return (
		<figure className={bloque.urls.length > 1 ? 'es-galeria' : ''}>
			<div className="visor-creativo-principal">
				<img src={principal} alt={bloque.etiqueta} />
			</div>
			{bloque.urls.length > 1 && (
				<div className="visor-creativo-tiras" role="tablist" aria-label={bloque.etiqueta}>
					{bloque.urls.map((url, indice) => (
						<button
							key={url}
							type="button" role="tab" aria-selected={indice === elegida}
							className={indice === elegida ? 'activa' : ''}
							onClick={() => setElegida(indice)}
							title={`Foto ${indice + 1} de ${bloque.urls.length}`}
						>
							<img src={url} alt="" loading="lazy" decoding="async" />
						</button>
					))}
				</div>
			)}
			<figcaption>
				<span>{bloque.etiqueta}</span>
				{bloque.pie && <small>{bloque.pie}</small>}
			</figcaption>
			{conFlecha && <i className="visor-creativo-flecha" aria-hidden="true">→</i>}
		</figure>
	);
}

/**
 * Qué entró y qué salió, en grande y sin salir del panel.
 *
 * Las miniaturas abrían la imagen firmada en una pestaña nueva: se perdía el
 * lugar del feed, y sobre todo se veía UNA sola cosa suelta, cuando lo que hay
 * que mirar para entender un creativo es la comparación —el ganador que se
 * quiso copiar, el producto que se puso, y en qué terminó—.
 */
function VisorDeCreativo({ item, onClose }: { item: any; onClose: () => void }) {
	// Tres bloques, en el orden en que se leen. El del medio puede traer varias
	// fotos: de una url se bajan varias vistas del mismo producto y son las que
	// el modelo mira para reconstruirlo, así que van todas y no solo la primera.
	const fotosDelProducto: string[] = item.productUrls || [];
	const bloques = [
		item.referenceUrl && { urls: [item.referenceUrl], etiqueta: 'Anuncio ganador elegido', pie: item.referenceName || '' },
		fotosDelProducto.length && {
			urls: fotosDelProducto,
			etiqueta: fotosDelProducto.length > 1 ? `Fotos del producto (${fotosDelProducto.length})` : 'Foto del producto',
			pie: (item.productNames || []).join(' + '),
		},
		item.thumbUrl && { urls: [item.thumbUrl], etiqueta: 'Resultado', pie: item.title || '' },
	].filter(Boolean) as Array<{ urls: string[]; etiqueta: string; pie: string }>;

	// Escape cierra: es lo primero que se prueba cuando algo tapa la pantalla.
	useEffect(() => {
		const alTeclear = (evento: KeyboardEvent) => { if (evento.key === 'Escape') onClose(); };
		window.addEventListener('keydown', alTeclear);
		return () => window.removeEventListener('keydown', alTeclear);
	}, [onClose]);

	return (
		<div className="visor-creativo" role="dialog" aria-modal="true" aria-label="Qué se usó para este creativo" onClick={onClose}>
			<div className="visor-creativo-caja" onClick={(evento) => evento.stopPropagation()}>
				<header>
					<div>
						<strong>{item.title || 'Creativo'}</strong>
						<small>{item.name || item.email}{item.sourceUrl ? ' · ' : ''}
							{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceUrl}</a>}
						</small>
					</div>
					<button type="button" onClick={onClose} aria-label="Cerrar">✕</button>
				</header>
				<div className="visor-creativo-piezas">
					{bloques.map((bloque, indice) => (
						<BloqueDeImagenes
							key={bloque.urls[0]}
							bloque={bloque}
							// La flecha va ENTRE bloques, no después del último.
							conFlecha={indice < bloques.length - 1}
						/>
					))}
					{!bloques.length && <EmptyState label="Esta generación no guardó imágenes." />}
				</div>
				<ComoSePidio item={item} />
			</div>
		</div>
	);
}

/**
 * Con qué se hizo cada creativo, sin salir del feed.
 *
 * Mostraba solo el resultado, así que para saber de qué anuncio ganador salió o
 * qué url había puesto la persona había que ir a buscarlo a mano a la base. Que
 * es justo lo que uno mira cuando quiere entender por qué una imagen salió como
 * salió.
 *
 * La fila dejó de ser un <button>: adentro ahora hay cosas que se abren por su
 * cuenta —cada miniatura, la url del producto— y un botón no puede contener
 * otro. El área de texto sigue abriendo la ficha del usuario.
 */
function ActivityList({ activity, onOpenUser, large = false }: { activity: any[]; onOpenUser: (id: string) => void; large?: boolean }) {
	const dominio = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
	// Cuál se está mirando en grande. Abrir en pestaña nueva perdía el lugar del
	// feed y además mostraba una sola imagen suelta, cuando lo que sirve es la
	// comparación entre las tres.
	const [mirando, setMirando] = useState<any>(null);
	return (
		<div className={`admin-activity-list ${large ? 'large' : ''}`}>
			{mirando && <VisorDeCreativo item={mirando} onClose={() => setMirando(null)} />}
			{activity.map((item: any, index: number) => (
				<div className="admin-activity-row" key={`${item.type}-${item.createdAt}-${index}`}>
					{/* Referencia → resultado, en ese orden y con una flecha en el medio:
					    es la lectura que uno hace, de qué salió y en qué terminó. */}
					<span className="admin-activity-par">
						{item.referenceUrl
							? <button type="button" className="admin-activity-thumb-link" onClick={() => setMirando(item)} title={item.referenceName || 'Anuncio ganador elegido'}>
								<img className="admin-activity-thumb is-ref" src={item.referenceUrl} alt="" loading="lazy" decoding="async" />
								<em>ref</em>
							</button>
							: null}
						{item.referenceUrl && item.thumbUrl ? <i className="admin-activity-flecha" aria-hidden="true">→</i> : null}
						{item.thumbUrl
							? <button type="button" className="admin-activity-thumb-link" onClick={() => setMirando(item)} title="Ver qué se usó y cómo salió">
								<img className="admin-activity-thumb" src={item.thumbUrl} alt="" loading="lazy" decoding="async" />
								{/* Cuántas fotos de producto había: se ven todas al abrir. */}
								{item.productUrls?.length ? <em className="es-producto">+{item.productUrls.length}</em> : null}
							</button>
							: !item.referenceUrl
								? <span className={`admin-activity-icon ${item.type}`}>{item.type === 'signup' ? '+' : item.type === 'payment' ? '$' : item.type === 'subscription' ? '◆' : item.type === 'video' ? '▶' : '✦'}</span>
								: null}
					</span>
					<button type="button" className="admin-activity-copy" onClick={() => item.userId && onOpenUser(item.userId)}>
						<strong>{item.title}</strong>
						<small>
							{/* Quién lo hizo: antes había que abrir la ficha para saberlo. */}
							{item.email && <span className="admin-activity-author">{item.name || item.email}</span>}
							{item.description}
						</small>
						{/* De qué ganador salió, dicho con palabras: la miniatura sola no
						    alcanza para reconocerlo entre cincuenta parecidos. */}
						{item.referenceName && <small className="admin-activity-ref-nombre">Ref: {item.referenceName}</small>}
					</button>
					<span className="admin-activity-meta">
						{/* La url que pasó la persona, abrible. Es el otro lado del par:
						    la referencia dice de dónde salió la forma y ésta el producto. */}
						{item.sourceUrl && (
							<a className="admin-activity-url" href={item.sourceUrl} target="_blank" rel="noreferrer" title={item.sourceUrl}>{dominio(item.sourceUrl)}</a>
						)}
						{item.format && <em className="admin-activity-format">{item.format}</em>}
						{item.status && <em className={`admin-activity-state is-${item.status}`}>{item.status === 'completed' ? 'listo' : item.status === 'failed' ? 'falló' : item.status}</em>}
						<time>{dateLabel(item.createdAt)}</time>
					</span>
				</div>
			))}
			{!activity.length && <EmptyState label="Todavía no hay actividad para mostrar." />}
		</div>
	);
}

function UserDrawer({ detail, loading, saving, creditsDraft, setCreditsDraft, onClose, onAction }: { detail: any; loading: boolean; saving: boolean; creditsDraft: string; setCreditsDraft: (value: string) => void; onClose: () => void; onAction: (action: string, extra?: Record<string, unknown>) => Promise<void> }) {
	const [plan, setPlan] = useState('creator');
	const [tab, setTab] = useState<'summary' | 'payments' | 'activity'>('summary');
	useEffect(() => {
		if (!detail?.user?.id) return;
		const nextPlan = detail.override?.plan_code && detail.override.plan_code !== 'admin' ? detail.override.plan_code : detail.profile?.plan_code && detail.profile.plan_code !== 'trial' ? detail.profile.plan_code : 'creator';
		setPlan(nextPlan);
		setTab('summary');
	}, [detail?.user?.id]);
	if (loading && !detail) return <aside className="admin-drawer" aria-busy="true"><button className="admin-drawer-close" onClick={onClose} aria-label="Cerrar ficha"><X size={17} /></button><div className="admin-loading"><span /> Cargando usuario...</div></aside>;
	const user = detail?.user;
	const profile = detail?.profile || {};
	const override = detail?.override;
	const isUnlimited = override?.access_mode === 'unlimited' || profile.plan_code === 'admin';
	const planCode = isUnlimited ? 'admin' : override?.plan_code || profile.plan_code || 'trial';
	const planLabel = isUnlimited ? 'Admin infinito' : planOptions.find((item) => item.code === planCode)?.label || (planCode === 'trial' ? 'Gratis' : planCode);
	const allPayments = [...(detail?.purchases || []).map((row: any) => ({ ...row, paymentType: 'credits', paidAt: row.created_at })), ...(detail?.subscriptionPayments || []).map((row: any) => ({ ...row, paymentType: 'subscription', paidAt: row.paid_at || row.created_at }))].sort((left: any, right: any) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime());
	const totalPaid = allPayments.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
	const provider = user?.app_metadata?.provider || user?.identities?.[0]?.provider || 'email';
	const displayName = profile.full_name || user?.user_metadata?.full_name || user?.email || 'Usuario';
	return <aside className="admin-drawer" aria-label={`Ficha de ${displayName}`}><div className="admin-drawer-head"><div><span className="admin-eyebrow"><UserRound size={12} /> PERFIL COMPLETO</span><h2>{displayName}</h2><p>{user?.email || 'Sin email'}</p></div><button className="admin-drawer-close" onClick={onClose} aria-label="Cerrar ficha"><X size={17} /></button></div><div className="admin-drawer-scroll"><div className="admin-drawer-status"><span className={`admin-plan-pill ${isUnlimited ? 'admin' : planCode}`}>{planLabel}</span><span>{override ? 'Acceso administrado manualmente' : profile.subscription_status || 'trial'}</span>{loading && <span className="admin-drawer-sync">Actualizando...</span>}</div><div className="admin-drawer-tabs" role="tablist" aria-label="Informacion del usuario"><button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')} role="tab" aria-selected={tab === 'summary'}><FileText size={14} /> Resumen</button><button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')} role="tab" aria-selected={tab === 'payments'}><CreditCard size={14} /> Pagos <b>{allPayments.length}</b></button><button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')} role="tab" aria-selected={tab === 'activity'}><Activity size={14} /> Actividad</button></div>{tab === 'summary' && <><div className="admin-detail-facts"><div><CalendarDays size={14} /><small>Se registro</small><b>{compactDate(user?.created_at)}</b></div><div><Activity size={14} /><small>Ultimo acceso</small><b>{compactDate(user?.last_sign_in_at)}</b></div><div><WalletCards size={14} /><small>Tokens actuales</small><b>{isUnlimited ? '∞' : profile.credits_remaining ?? 0}</b></div><div><MailCheck size={14} /><small>Email</small><b>{user?.email_confirmed_at ? 'Confirmado' : 'Pendiente'}</b></div></div><section className="admin-drawer-section"><h3><ShieldCheck size={15} /> Control de acceso</h3><div className="admin-access-actions"><div className="admin-control-row"><label>Asignar plan<select value={plan} onChange={(event) => setPlan(event.target.value)}>{planOptions.map((item) => <option key={item.code} value={item.code}>{item.label} · {item.credits} tokens/mes</option>)}</select></label><button onClick={() => void onAction('set_plan', { planCode: plan })} disabled={saving}>Asignar</button></div><button className="admin-unlimited-button" onClick={() => void onAction('set_unlimited')} disabled={saving}>∞ Dar acceso infinito</button><div className="admin-control-row"><label>Fijar tokens manualmente<input type="number" min="0" max="99999" value={creditsDraft} onChange={(event) => setCreditsDraft(event.target.value)} /></label><button onClick={() => void onAction('set_credits', { credits: Number(creditsDraft) })} disabled={saving}>Guardar</button></div>{override && <button className="admin-revoke-button" onClick={() => void onAction('revoke_override')} disabled={saving}>Quitar override y restaurar estado anterior</button>}</div></section><section className="admin-drawer-section"><h3><Activity size={15} /> Resumen de uso</h3><div className="admin-detail-counts"><span><b>{detail?.generations?.length || 0}</b> creativos</span><span><b>{detail?.videos?.length || 0}</b> videos</span><span><b>{detail?.purchases?.length || 0}</b> compras</span><span><b>{detail?.subscriptions?.length || 0}</b> suscripciones</span></div></section><section className="admin-drawer-section"><h3><FileText size={15} /> Datos de cuenta</h3><div className="admin-account-grid"><div><small>Proveedor</small><b>{provider === 'google' ? 'Google' : provider}</b></div><div><small>Marca</small><b>{profile.brand_name || 'Sin marca'}</b></div><div><small>ID de usuario</small><b title={user?.id}>{user?.id ? `${user.id.slice(0, 8)}...` : '—'}</b></div><div><small>Web</small><b>{profile.website_url || 'Sin URL'}</b></div></div></section></>}{tab === 'payments' && <><div className="admin-payment-summary"><div><CircleDollarSign size={15} /><small>Total registrado</small><b>{money(totalPaid)}</b></div><div><ReceiptText size={15} /><small>Movimientos</small><b>{allPayments.length}</b></div><div><CreditCard size={15} /><small>Ultimo pago</small><b>{allPayments[0] ? compactDate(allPayments[0].paidAt) : 'Sin pagos'}</b></div></div><DetailTable title="Compras de tokens" rows={detail?.purchases || []} columns={['created_at', 'amount', 'credits', 'payment_id']} /><DetailTable title="Pagos de suscripcion" rows={detail?.subscriptionPayments || []} columns={['paid_at', 'plan_code', 'amount', 'payment_id']} /><DetailTable title="Suscripciones" rows={detail?.subscriptions || []} columns={['created_at', 'plan_code', 'status', 'current_period_end']} /></>}{tab === 'activity' && <><DetailTable title="Ultimos creativos" rows={detail?.generations || []} columns={['created_at', 'title', 'status']} /><DetailTable title="Videos" rows={detail?.videos || []} columns={['created_at', 'title', 'status']} /><DetailTable title="Auditoria admin" rows={detail?.audit || []} columns={['created_at', 'action']} /></>}</div></aside>;
}

function LegacyUserDrawer({ detail, loading, saving, creditsDraft, setCreditsDraft, onClose, onAction }: { detail: any; loading: boolean; saving: boolean; creditsDraft: string; setCreditsDraft: (value: string) => void; onClose: () => void; onAction: (action: string, extra?: Record<string, unknown>) => Promise<void> }) {
	const [plan, setPlan] = useState('creator');
	useEffect(() => { if (detail?.override?.plan_code && detail.override.plan_code !== 'admin') setPlan(detail.override.plan_code); }, [detail]);
	if (loading && !detail) return <aside className="admin-drawer"><button className="admin-drawer-close" onClick={onClose}>×</button><div className="admin-loading"><span /> Cargando usuario…</div></aside>;
	const user = detail?.user;
	const profile = detail?.profile;
	const override = detail?.override;
	return <aside className="admin-drawer"><div className="admin-drawer-head"><div><span className="admin-eyebrow">PERFIL COMPLETO</span><h2>{profile?.full_name || user?.email || 'Usuario'}</h2><p>{user?.email}</p></div><button className="admin-drawer-close" onClick={onClose}>×</button></div><div className="admin-drawer-scroll"><div className="admin-drawer-status"><span className={`admin-plan-pill ${override?.access_mode === 'unlimited' ? 'admin' : (override?.plan_code || profile?.plan_code || 'trial')}`}>{override?.access_mode === 'unlimited' ? 'Admin infinito' : override?.plan_code || profile?.plan_code || 'Gratis'}</span><span>{override ? 'Acceso administrado manualmente' : profile?.subscription_status || 'trial'}</span></div><div className="admin-detail-facts"><div><small>Se registró</small><b>{dateLabel(user?.created_at)}</b></div><div><small>Último acceso</small><b>{dateLabel(user?.last_sign_in_at)}</b></div><div><small>Tokens actuales</small><b>{override?.access_mode === 'unlimited' ? '∞' : profile?.credits_remaining ?? 0}</b></div><div><small>Email confirmado</small><b>{user?.email_confirmed_at ? 'Sí' : 'Pendiente'}</b></div></div><section className="admin-drawer-section"><h3>Control de acceso</h3><div className="admin-access-actions"><div className="admin-control-row"><label>Dar un plan<select value={plan} onChange={(event) => setPlan(event.target.value)}>{planOptions.map((item) => <option key={item.code} value={item.code}>{item.label} · {item.credits} tokens/mes</option>)}</select></label><button onClick={() => void onAction('set_plan', { planCode: plan })} disabled={saving}>Asignar</button></div><button className="admin-unlimited-button" onClick={() => void onAction('set_unlimited')} disabled={saving}>∞ Dar acceso infinito</button><div className="admin-control-row"><label>Fijar tokens manualmente<input type="number" min="0" max="99999" value={creditsDraft} onChange={(event) => setCreditsDraft(event.target.value)} /></label><button onClick={() => void onAction('set_credits', { credits: Number(creditsDraft) })} disabled={saving}>Guardar</button></div>{override && <button className="admin-revoke-button" onClick={() => void onAction('revoke_override')} disabled={saving}>Quitar override y restaurar estado anterior</button>}</div></section><section className="admin-drawer-section"><h3>Resumen de uso</h3><div className="admin-detail-counts"><span><b>{detail?.generations?.length || 0}</b> creativos</span><span><b>{detail?.videos?.length || 0}</b> videos</span><span><b>{detail?.purchases?.length || 0}</b> compras</span><span><b>{detail?.subscriptions?.length || 0}</b> suscripciones</span></div></section><DetailTable title="Pagos" rows={detail?.purchases || []} columns={['created_at', 'amount', 'credits', 'payment_id']} /><DetailTable title="Pagos de suscripción" rows={detail?.subscriptionPayments || []} columns={['paid_at', 'plan_code', 'amount', 'payment_id']} /><DetailTable title="Suscripciones" rows={detail?.subscriptions || []} columns={['created_at', 'plan_code', 'status', 'current_period_end']} /><DetailTable title="Últimos creativos" rows={detail?.generations || []} columns={['created_at', 'title', 'status']} /><DetailTable title="Auditoría admin" rows={detail?.audit || []} columns={['created_at', 'action']} /></div></aside>;
}

function formatDetailValue(row: any, column: string) {
	const value = row?.[column];
	if (value === null || value === undefined || value === '') return '—';
	if (column === 'amount') return money(Number(value), row.currency || 'USD');
	if (column === 'credits') return `${value} tokens`;
	if (column === 'plan_code') return planOptions.find((item) => item.code === value)?.label || value;
	if (column === 'current_period_end') return compactDate(value);
	if (column === 'payment_id') return `ID ${String(value).slice(0, 12)}...`;
	return String(value);
}

function LegacyDetailTableOriginal({ title, rows, columns }: { title: string; rows: any[]; columns: string[] }) {
	return <section className="admin-detail-table"><h3>{title} <small>{rows.length}</small></h3>{rows.slice(0, 8).map((row: any, index: number) => <div key={row.id || row.payment_id || index}><span>{compactDate(row[columns[0]])}</span><strong>{formatDetailValue(row, columns[1])}</strong><em>{formatDetailValue(row, columns[2])}{columns[3] ? ` · ${formatDetailValue(row, columns[3])}` : ''}</em></div>)}{!rows.length && <p>Sin registros todavia.</p>}</section>;
}

function DetailTable({ title, rows, columns }: { title: string; rows: any[]; columns: string[] }) {
	return <section className="admin-detail-table"><h3>{title} <small>{rows.length}</small></h3>{rows.slice(0, 8).map((row: any, index: number) => <div key={row.id || row.payment_id || index} className={row.image_url ? 'admin-detail-row-with-image' : ''}>{row.image_url && <AdminImagePreview url={row.image_url} title={row.title || 'Imagen generada'} />}<span>{compactDate(row[columns[0]])}</span><strong>{formatDetailValue(row, columns[1])}</strong><em>{formatDetailValue(row, columns[2])}{columns[3] ? ` · ${formatDetailValue(row, columns[3])}` : ''}</em></div>)}{!rows.length && <p>Sin registros todavía.</p>}</section>;
}

function AdminImagePreview({ url, title }: { url: string; title: string }) {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		if (!open) return undefined;
		const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
		document.addEventListener('keydown', closeOnEscape);
		return () => document.removeEventListener('keydown', closeOnEscape);
	}, [open]);
	return <><button type="button" className="admin-generated-thumb" onClick={() => setOpen(true)} aria-label={`Ver ${title}`}><img src={url} alt={title} loading="lazy" /></button>{open && <div className="admin-image-lightbox" role="dialog" aria-modal="true" aria-label={title} onClick={() => setOpen(false)}><button type="button" className="admin-image-lightbox-close" onClick={() => setOpen(false)} aria-label="Cerrar vista previa"><X size={18} /></button><img src={url} alt={title} onClick={(event) => event.stopPropagation()} /></div>}</>;
}

function LegacyDetailTable({ title, rows, columns }: { title: string; rows: any[]; columns: string[] }) {
	return <section className="admin-detail-table"><h3>{title} <small>{rows.length}</small></h3>{rows.slice(0, 8).map((row: any, index: number) => <div key={row.id || row.payment_id || index}><span>{compactDate(row[columns[0]])}</span><strong>{row[columns[1]] || '—'}</strong><em>{row[columns[2]] || '—'}</em></div>)}{!rows.length && <p>Sin registros todavía.</p>}</section>;
}

void LegacyUserDrawer;
void LegacyDetailTable;
void LegacyDetailTableOriginal;

function PanelHeading({ kicker, title, action }: { kicker: string; title: string; action?: string }) {
	return <header className="admin-panel-heading"><div><span>{kicker}</span><h2>{title}</h2></div>{action && <small>{action} ↗</small>}</header>;
}

function FunnelStep({ number, label, value }: { number: string; label: string; value: number }) {
	return <div className="admin-funnel-step"><span>{number}</span><div><strong>{shortNumber(value)}</strong><small>{label}</small></div></div>;
}

function EmptyState({ label }: { label: string }) { return <div className="admin-empty">{label}</div>; }
