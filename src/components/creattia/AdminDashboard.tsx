import { useEffect, useMemo, useState } from 'react';
import './admin-dashboard.css';

type AdminDashboardProps = { session: any };
type Section = 'overview' | 'users' | 'payments' | 'activity';

const planOptions = [
	{ code: 'creator', label: 'Básico', credits: 5, price: 9.99 },
	{ code: 'pro', label: 'Pro', credits: 60, price: 26.90 },
	{ code: 'scale', label: 'Scale', credits: 120, price: 49.90 },
	{ code: 'agency', label: 'Agency', credits: 300, price: 99.90 },
];

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

function money(value: number) {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0);
}

function shortNumber(value: number) {
	return new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export default function AdminDashboard({ session }: AdminDashboardProps) {
	const [section, setSection] = useState<Section>('overview');
	const [overview, setOverview] = useState<any>(null);
	const [detail, setDetail] = useState<any>(null);
	const [selectedUserId, setSelectedUserId] = useState('');
	const [search, setSearch] = useState('');
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

	useEffect(() => { void loadOverview(); }, []);

	const openUser = async (userId: string) => {
		setSelectedUserId(userId);
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

	const applyAction = async (action: string, extra: Record<string, unknown> = {}) => {
		if (!selectedUserId) return;
		setSaving(true); setError(''); setNotice('');
		try {
			await request('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ userId: selectedUserId, action, ...extra }) });
			await Promise.all([loadOverview(true), openUser(selectedUserId)]);
			setNotice('Cambio aplicado y registrado en la auditoría.');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo aplicar el cambio.');
		} finally {
			setSaving(false);
		}
	};

	const users = overview?.users || [];
	const filteredUsers = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return users;
		return users.filter((user: any) => `${user.email} ${user.fullName} ${user.brandName} ${user.planLabel}`.toLowerCase().includes(query));
	}, [users, search]);

	const metrics = overview?.metrics || {};

	return (
		<section className="admin-center">
			<header className="admin-hero">
				<div>
					<div className="admin-eyebrow"><span className="admin-live-dot" /> CONTROL CENTER · PRIVADO</div>
					<h1>Todo Creattia, en una sola vista.</h1>
					<p>Usuarios, ingresos, suscripciones y actividad real. Tomá decisiones rápido y mantené cada cambio bajo control.</p>
				</div>
				<div className="admin-hero-meta"><strong>ADMIN</strong><span>algoritmiadesarrollos@gmail.com</span><small>Actualizado {dateLabel(overview?.generatedAt)}</small></div>
			</header>

			<nav className="admin-tabs" aria-label="Secciones del centro admin">
				{([['overview', 'Resumen'], ['users', 'Usuarios'], ['payments', 'Pagos'], ['activity', 'Actividad']] as Array<[Section, string]>).map(([id, label]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>{label}</button>)}
				<button className="admin-refresh" onClick={() => void loadOverview()} disabled={loading}>↻ Actualizar</button>
			</nav>

			{error && <div className="admin-alert error">{error}</div>}
			{notice && <div className="admin-alert success">✓ {notice}</div>}
			{loading && !overview ? <div className="admin-loading"><span /> Cargando datos seguros…</div> : (
				<>
					<div className="admin-metric-grid">
						<Metric label="Usuarios registrados" value={shortNumber(metrics.users)} hint={`+${metrics.newUsers7d || 0} esta semana`} tone="blue" />
						<Metric label="Suscripciones activas" value={shortNumber(metrics.activeSubscriptions)} hint={`${metrics.activeToday || 0} activos hoy`} tone="violet" />
						<Metric label="MRR estimado" value={money(metrics.mrr)} hint="Planes autorizados" tone="orange" />
						<Metric label="Creativos generados" value={shortNumber(metrics.completedGenerations)} hint={`${metrics.generations || 0} trabajos totales`} tone="green" />
					</div>

					{section === 'overview' && <OverviewSection overview={overview} onOpenUser={openUser} />}
					{section === 'users' && <UsersSection users={filteredUsers} search={search} onSearch={setSearch} selectedUserId={selectedUserId} onOpenUser={openUser} />}
					{section === 'payments' && <PaymentsSection payments={overview?.recentPayments || []} />}
					{section === 'activity' && <ActivitySection activity={overview?.activity || []} onOpenUser={openUser} />}
				</>
			)}

			{selectedUserId && <UserDrawer detail={detail} loading={detailLoading} saving={saving} creditsDraft={creditsDraft} setCreditsDraft={setCreditsDraft} onClose={() => { setSelectedUserId(''); setDetail(null); }} onAction={applyAction} />}
		</section>
	);
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
	return <article className={`admin-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small><i /></article>;
}

function OverviewSection({ overview, onOpenUser }: { overview: any; onOpenUser: (id: string) => void }) {
	const topUsers = [...(overview.users || [])].sort((a: any, b: any) => (b.generationCount || 0) - (a.generationCount || 0)).slice(0, 6);
	return <div className="admin-overview-grid">
		<section className="admin-panel admin-funnel-panel"><PanelHeading kicker="LECTURA RÁPIDA" title="La salud del producto" /><div className="admin-funnel"><FunnelStep number="01" label="Cuentas creadas" value={overview.metrics.users} /><FunnelStep number="02" label="Suscripciones activas" value={overview.metrics.activeSubscriptions} /><FunnelStep number="03" label="Creativos terminados" value={overview.metrics.completedGenerations} /></div><div className="admin-mini-stat-row"><span><b>{overview.metrics.newUsers30d || 0}</b> altas en 30 días</span><span><b>{overview.metrics.totalPurchasedCredits || 0}</b> tokens vendidos</span><span><b>{overview.metrics.videos || 0}</b> videos creados</span></div></section>
		<section className="admin-panel"><PanelHeading kicker="USO INTENSIVO" title="Usuarios más activos" action="Ver usuarios" /><div className="admin-rank-list">{topUsers.length ? topUsers.map((user: any, index: number) => <button key={user.id} onClick={() => onOpenUser(user.id)}><span className="admin-rank-number">0{index + 1}</span><span className="admin-avatar">{(user.fullName || user.email || '?').slice(0, 1).toUpperCase()}</span><span className="admin-rank-copy"><strong>{user.fullName || user.email}</strong><small>{user.email}</small></span><b>{user.generationCount || 0}<em> creativos</em></b></button>) : <EmptyState label="Todavía no hay actividad de usuarios." />}</div></section>
		<section className="admin-panel admin-wide-panel"><PanelHeading kicker="ÚLTIMOS MOVIMIENTOS" title="Qué está pasando ahora" /><ActivityList activity={(overview.activity || []).slice(0, 8)} onOpenUser={onOpenUser} /></section>
	</div>;
}

function UsersSection({ users, search, onSearch, selectedUserId, onOpenUser }: { users: any[]; search: string; onSearch: (value: string) => void; selectedUserId: string; onOpenUser: (id: string) => void }) {
	return <section className="admin-panel admin-table-panel"><div className="admin-table-toolbar"><PanelHeading kicker="CUENTAS Y ACCESOS" title={`${users.length} usuarios visibles`} /><label className="admin-search"><span>⌕</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar por email, nombre o plan…" /></label></div><UserTable users={users} selectedUserId={selectedUserId} onOpenUser={onOpenUser} /></section>;
}

function UserTable({ users, selectedUserId, onOpenUser }: { users: any[]; selectedUserId: string; onOpenUser: (id: string) => void }) {
	return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Usuario</th><th>Alta</th><th>Plan</th><th>Tokens</th><th>Uso</th><th>Último acceso</th><th /></tr></thead><tbody>{users.map((user: any) => <tr key={user.id} className={selectedUserId === user.id ? 'selected' : ''}><td><button className="admin-user-cell" onClick={() => onOpenUser(user.id)}><span className="admin-avatar">{(user.fullName || user.email || '?').slice(0, 1).toUpperCase()}</span><span><strong>{user.fullName || 'Sin nombre'}</strong><small>{user.email}</small></span></button></td><td>{compactDate(user.createdAt)}</td><td><span className={`admin-plan-pill ${user.planCode}`}>{user.planLabel}</span>{user.override && <small className="admin-override-label">Override admin</small>}</td><td><b>{user.credits > 9000 ? '∞' : user.credits}</b><small>/{user.monthlyCredits > 9000 ? '∞' : user.monthlyCredits || 0}</small></td><td>{user.generationCount || 0} <small>generados</small></td><td>{compactDate(user.lastSignInAt)}</td><td><button className="admin-row-action" onClick={() => onOpenUser(user.id)}>Abrir →</button></td></tr>)}</tbody></table>{!users.length && <EmptyState label="No encontramos usuarios con esa búsqueda." />}</div>;
}

function PaymentsSection({ payments }: { payments: any[] }) {
	return <section className="admin-panel admin-table-panel"><PanelHeading kicker="INGRESOS Y TOKENS" title="Historial de compras" /><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Fecha</th><th>Usuario</th><th>Pago</th><th>Tokens</th><th>ID de pago</th></tr></thead><tbody>{payments.map((payment: any) => <tr key={payment.payment_id}><td>{dateLabel(payment.created_at)}</td><td><strong>{payment.email}</strong></td><td><b>{payment.amount ? `${payment.currency || 'USD'} ${payment.amount}` : '—'}</b></td><td>{payment.credits}</td><td><code>{payment.payment_id}</code></td></tr>)}</tbody></table>{!payments.length && <EmptyState label="Todavía no hay compras registradas." />}</div></section>;
}

function ActivitySection({ activity, onOpenUser }: { activity: any[]; onOpenUser: (id: string) => void }) {
	return <section className="admin-panel admin-table-panel"><PanelHeading kicker="AUDITORÍA DE PRODUCTO" title="Actividad reciente" /><ActivityList activity={activity} onOpenUser={onOpenUser} large /></section>;
}

function ActivityList({ activity, onOpenUser, large = false }: { activity: any[]; onOpenUser: (id: string) => void; large?: boolean }) {
	return <div className={`admin-activity-list ${large ? 'large' : ''}`}>{activity.map((item: any, index: number) => <button key={`${item.type}-${item.createdAt}-${index}`} onClick={() => item.userId && onOpenUser(item.userId)}><span className={`admin-activity-icon ${item.type}`}>{item.type === 'signup' ? '+' : item.type === 'payment' ? '$' : item.type === 'subscription' ? '◆' : '✦'}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><time>{dateLabel(item.createdAt)}</time></button>)}{!activity.length && <EmptyState label="Todavía no hay actividad para mostrar." />}</div>;
}

function UserDrawer({ detail, loading, saving, creditsDraft, setCreditsDraft, onClose, onAction }: { detail: any; loading: boolean; saving: boolean; creditsDraft: string; setCreditsDraft: (value: string) => void; onClose: () => void; onAction: (action: string, extra?: Record<string, unknown>) => Promise<void> }) {
	const [plan, setPlan] = useState('creator');
	useEffect(() => { if (detail?.override?.plan_code && detail.override.plan_code !== 'admin') setPlan(detail.override.plan_code); }, [detail]);
	if (loading && !detail) return <aside className="admin-drawer"><button className="admin-drawer-close" onClick={onClose}>×</button><div className="admin-loading"><span /> Cargando usuario…</div></aside>;
	const user = detail?.user;
	const profile = detail?.profile;
	const override = detail?.override;
	return <aside className="admin-drawer"><div className="admin-drawer-head"><div><span className="admin-eyebrow">PERFIL COMPLETO</span><h2>{profile?.full_name || user?.email || 'Usuario'}</h2><p>{user?.email}</p></div><button className="admin-drawer-close" onClick={onClose}>×</button></div><div className="admin-drawer-scroll"><div className="admin-drawer-status"><span className={`admin-plan-pill ${override?.access_mode === 'unlimited' ? 'admin' : (override?.plan_code || profile?.plan_code || 'trial')}`}>{override?.access_mode === 'unlimited' ? 'Admin infinito' : override?.plan_code || profile?.plan_code || 'Gratis'}</span><span>{override ? 'Acceso administrado manualmente' : profile?.subscription_status || 'trial'}</span></div><div className="admin-detail-facts"><div><small>Se registró</small><b>{dateLabel(user?.created_at)}</b></div><div><small>Último acceso</small><b>{dateLabel(user?.last_sign_in_at)}</b></div><div><small>Tokens actuales</small><b>{override?.access_mode === 'unlimited' ? '∞' : profile?.credits_remaining ?? 0}</b></div><div><small>Alta confirmada</small><b>{dateLabel(user?.email_confirmed_at)}</b></div></div><section className="admin-drawer-section"><h3>Control de acceso</h3><div className="admin-access-actions"><div className="admin-control-row"><label>Dar un plan<select value={plan} onChange={(event) => setPlan(event.target.value)}>{planOptions.map((item) => <option key={item.code} value={item.code}>{item.label} · {item.credits} tokens/mes</option>)}</select></label><button onClick={() => void onAction('set_plan', { planCode: plan })} disabled={saving}>Asignar</button></div><button className="admin-unlimited-button" onClick={() => void onAction('set_unlimited')} disabled={saving}>♾ Dar acceso infinito</button><div className="admin-control-row"><label>Fijar tokens manualmente<input type="number" min="0" max="99999" value={creditsDraft} onChange={(event) => setCreditsDraft(event.target.value)} /></label><button onClick={() => void onAction('set_credits', { credits: Number(creditsDraft) })} disabled={saving}>Guardar</button></div>{override && <button className="admin-revoke-button" onClick={() => void onAction('revoke_override')} disabled={saving}>Quitar override y restaurar estado anterior</button>}</div></section><section className="admin-drawer-section"><h3>Resumen de uso</h3><div className="admin-detail-counts"><span><b>{detail?.generations?.length || 0}</b> creativos</span><span><b>{detail?.videos?.length || 0}</b> videos</span><span><b>{detail?.purchases?.length || 0}</b> compras</span><span><b>{detail?.subscriptions?.length || 0}</b> suscripciones</span></div></section><DetailTable title="Pagos" rows={detail?.purchases || []} columns={['created_at', 'amount', 'credits', 'payment_id']} /><DetailTable title="Suscripciones" rows={detail?.subscriptions || []} columns={['created_at', 'plan_code', 'status', 'current_period_end']} /><DetailTable title="Últimos creativos" rows={detail?.generations || []} columns={['created_at', 'title', 'status']} /><DetailTable title="Auditoría admin" rows={detail?.audit || []} columns={['created_at', 'action']} /></div></aside>;
}

function DetailTable({ title, rows, columns }: { title: string; rows: any[]; columns: string[] }) {
	return <section className="admin-detail-table"><h3>{title} <small>{rows.length}</small></h3>{rows.slice(0, 8).map((row: any, index: number) => <div key={row.id || row.payment_id || index}><span>{columns.slice(0, 1).map((column) => compactDate(row[column]))}</span><strong>{columns.slice(1, 2).map((column) => row[column] || '—')}</strong><em>{columns.slice(2, 3).map((column) => row[column] || '—')}</em></div>)}{!rows.length && <p>Sin registros todavía.</p>}</section>;
}

function PanelHeading({ kicker, title, action }: { kicker: string; title: string; action?: string }) {
	return <header className="admin-panel-heading"><div><span>{kicker}</span><h2>{title}</h2></div>{action && <small>{action} ↗</small>}</header>;
}

function FunnelStep({ number, label, value }: { number: string; label: string; value: number }) {
	return <div className="admin-funnel-step"><span>{number}</span><div><strong>{shortNumber(value)}</strong><small>{label}</small></div></div>;
}

function EmptyState({ label }: { label: string }) { return <div className="admin-empty">{label}</div>; }
