-- Por qué se van.
--
-- La cancelación era un solo botón: se perdía la cuenta sin saber nunca el
-- motivo, que es justamente el dato que dice qué arreglar. Se guarda el motivo
-- elegido y el comentario libre, y si la persona se quedó tras la oferta de
-- retención.

create table if not exists public.creative_cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text,
  -- 'caro' | 'poco-uso' | 'calidad' | 'falta-funcion' | 'temporal' | 'otro'
  reason text not null,
  comment text,
  /** Si aceptó la oferta y se quedó, en vez de completar la baja. */
  retained boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists creative_cancellation_feedback_user_idx
  on public.creative_cancellation_feedback(user_id, created_at desc);
create index if not exists creative_cancellation_feedback_reason_idx
  on public.creative_cancellation_feedback(reason, created_at desc);

alter table public.creative_cancellation_feedback enable row level security;

-- Cada uno ve y escribe lo suyo; nadie lee el de otro.
drop policy if exists "cancellation_feedback_insert_own" on public.creative_cancellation_feedback;
create policy "cancellation_feedback_insert_own" on public.creative_cancellation_feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "cancellation_feedback_select_own" on public.creative_cancellation_feedback;
create policy "cancellation_feedback_select_own" on public.creative_cancellation_feedback
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.creative_cancellation_feedback from anon;
grant select, insert on public.creative_cancellation_feedback to authenticated;
grant select, insert, update on public.creative_cancellation_feedback to service_role;
