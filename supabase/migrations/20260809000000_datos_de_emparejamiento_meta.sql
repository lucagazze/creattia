-- Las compras llegaban a Meta sin con qué emparejarlas.
--
-- La API de Conversiones atribuye una conversión a la campaña que la generó
-- usando cuatro datos del navegador: IP, user-agent y las cookies `_fbp` y
-- `_fbc` que planta el píxel. La `_fbc` es la que importa de verdad, porque ES
-- el clic en el anuncio. Sin ella Meta se entera de que hubo una compra pero no
-- de dónde salió: se paga la conversión, no figura en el panel, y el algoritmo
-- optimiza contra la mitad de los datos.
--
-- El problema es CUÁNDO se confirma la compra. El pago lo avisa Mercado Pago
-- llamando a nuestro webhook desde su servidor: ese pedido no tiene ni IP, ni
-- user-agent, ni cookies del comprador — la persona hace rato que no está del
-- otro lado. Así que el evento más caro de todos, Purchase, era justamente el
-- único que salía pelado.
--
-- Esta tabla es el puente: se escribe cuando la persona abre el checkout, que sí
-- pasa por su navegador, y el webhook la lee por usuario cuando el pago se
-- confirma. Entre las dos cosas pasan minutos y la `_fbc` vive noventa días, así
-- que es el mismo clic.
--
-- Va aparte de `creative_profiles` y no como cuatro columnas más: el navegador
-- lee el perfil con `select('*')`, y estos datos no tienen por qué viajar al
-- cliente. Tampoco va en `creative_events`, que es una fila por evento y a
-- propósito no guarda nada personal; acá alcanza con el último estado conocido.

create table if not exists public.creative_meta_identity (
	user_id uuid primary key references auth.users(id) on delete cascade,
	-- Los cuatro se guardan tal como llegan: Meta los espera sin hashear, y
	-- guardarlos ya hasheados sería romperlos antes de usarlos.
	client_ip_address text,
	client_user_agent text,
	fbp text,
	fbc text,
	updated_at timestamptz not null default now()
);

alter table public.creative_meta_identity enable row level security;

-- Nadie toca esto desde el navegador. Si el cliente pudiera escribir acá podría
-- inyectar la `_fbc` de otra persona y hacernos atribuir compras a campañas que
-- no las generaron, que es peor que no medir nada.
revoke all on public.creative_meta_identity from anon, authenticated;
grant select, insert, update on public.creative_meta_identity to service_role;

comment on table public.creative_meta_identity is
	'Últimos datos de emparejamiento (IP, user-agent, _fbp, _fbc) vistos en el navegador de cada usuario. Los usa el webhook de Mercado Pago, que no los recibe en su propio pedido, para que el Purchase llegue atribuible a Meta.';
