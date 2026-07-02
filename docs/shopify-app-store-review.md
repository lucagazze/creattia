# Shopify App Store — Guía de re-submission (app "Algoritmia")

Rechazo anterior (ref. 119561): 403 en secciones + dashboards vacíos (2.1.1), screencast insuficiente (4.5.3), billing (1.2.1/1.2.2). Suspensión venció el 29/06/2026 — ya se puede reenviar.

## Qué se arregló en el código (ya deployado)

1. **Causa raíz del 403 + dashboard vacío**: la app lee `orders.json` con datos de clientes. Las apps públicas SIN aprobación de **Protected Customer Data** reciben **403** de Shopify en ese endpoint, y el código hacía `if (!res.ok) break;` — se tragaba el error y devolvía un dashboard vacío. Ahora:
   - Si Shopify devuelve 403, se reintenta automáticamente excluyendo los campos protegidos (`fields=` sin customer/email/direcciones) → el dashboard funciona igual (solo se degradan las métricas de clientes recurrentes).
   - Si aun así falla (401/403), se devuelve un error claro en pantalla en lugar de un dashboard vacío.
2. **Onboarding desde el App Store**: al llegar con `?shop=`, el login arranca en "Crear cuenta" con un banner que avisa que la tienda se conecta sola al terminar. El registro ahora es instantáneo (sin confirmación de email).

## Pasos OBLIGATORIOS en el Partner Dashboard (manual)

### 1. Protected Customer Data (elimina el 403 de raíz)
Partner Dashboard → Apps → Algoritmia → **API access** → sección **Protected customer data access**:
- Solicitar **Protected customer data** (Level 1) y marcar los campos: *Name, Email, Phone, Address*.
- Justificación sugerida (inglés): *"The app displays the merchant's own order history and customer purchase metrics (new vs. returning customers, order details) inside the merchant's private dashboard. Data is never shared with third parties."*
- Completar el cuestionario de protección de datos (encriptación en tránsito: sí — TLS; retención: se elimina al desinstalar vía webhooks shop/redact ya implementados).

### 2. Billing (reglas 1.2.1 y 1.2.2) — usar Managed Pricing
La landing muestra planes de USD 9 / 20 / 50. Para distribuir en el App Store, el cobro DEBE pasar por Shopify:
- Partner Dashboard → Apps → Algoritmia → **Distribution** → **Pricing** → elegir **Managed pricing**.
- Crear los 3 planes espejando la landing: Starter USD 9/mes, Corporativo USD 20/mes (con free trial de 7 o 14 días), Agencia USD 50/mes. Agregar un plan **Free** si se quiere permitir uso gratuito.
- Con managed pricing NO hace falta código de Billing API: Shopify muestra la selección de plan al instalar y maneja aprobación/rechazo/reinstalación (cumple 1.2.2).
- IMPORTANTE: nunca dirigir a merchants de Shopify a un checkout externo (MercadoPago, tarjeta, etc.).

### 3. Verificar URLs del listing
- App URL: `https://app.algoritmiadesarrollos.com.ar` (responde 200 ✓)
- Privacy: `/privacy.html` ✓ · Terms: `/terms.html` ✓
- Webhooks GDPR ya configurados en shopify.app.toml ✓

## Screencast (regla 4.5.3) — guion en inglés

Grabar en 1920×1080, con cursor visible, sin cortes bruscos. Duración ideal: 3-5 minutos. Audio en inglés o subtítulos en inglés (abajo hay texto listo para usar como subtítulos/voz).

**Preparación previa**: tener una development store con productos y pedidos de prueba recientes (crear 4-5 pedidos el mismo día de la grabación para que el dashboard muestre datos en "Últimos 14 días").

| # | Acción en pantalla | Subtítulo / narración (EN) |
|---|---|---|
| 1 | Shopify admin → App Store listing → click **Install** | "We start by installing Algoritmia from the Shopify App Store." |
| 2 | Aprobar los permisos de Shopify (scopes de lectura) | "Shopify asks for read-only permissions: orders, products, customers and inventory. We approve." |
| 3 | Llega al login con el banner verde de la tienda detectada → click **Registrarse**, completar email y contraseña | "The app detects our store automatically. We create an account with email and password — no email confirmation needed." |
| 4 | Redirige a Integraciones → OAuth de Shopify se dispara solo → aprobar | "Right after signup, the app connects our store automatically via Shopify OAuth." |
| 5 | Integraciones muestra Shopify con estado verde "Conectado" | "The integrations page confirms the store is connected and verified live against the API." |
| 6 | Ir a **Dashboard** → mostrar ingresos, pedidos, ticket promedio y el gráfico diario | "The dashboard now shows revenue, orders and average order value synced from our store, with a daily chart." |
| 7 | Cambiar el rango de fechas (ej. Últimos 30 días) | "We can filter any date range and metrics recalculate instantly." |
| 8 | Ir a **Pedidos** → abrir un pedido | "The orders section lists every order with its details." |
| 9 | Ir a **Inventario** / **Análisis de productos** | "Inventory and product analytics come straight from the connected catalog." |
| 10 | Ir a **Costos** → asignar costo unitario a un producto → volver al Dashboard → mostrar "Facturación neta" | "We assign product costs, and the dashboard immediately shows net revenue after costs." |
| 11 | (Opcional) Cerebro IA → mostrar sugerencia de IA | "The AI brain analyzes the business and suggests replies and insights." |
| 12 | Cierre en el Dashboard | "That's the full setup — from install to a working analytics dashboard in under three minutes." |

**Checklist antes de subir el video:**
- [ ] Se ve la instalación DESDE Shopify (no empezar con sesión ya iniciada).
- [ ] Se ve la creación de cuenta completa (paso que el reviewer necesita replicar).
- [ ] El dashboard muestra DATOS REALES de la dev store (no vacío).
- [ ] Subtítulos o voz en inglés de principio a fin.

## Cómo probar antes de reenviar
1. Crear una development store nueva con pedidos de prueba del día.
2. Instalar la app desde el link de instalación del Partner Dashboard.
3. Verificar: registro → conexión automática → dashboard con datos (sin 403 en la pestaña Network).
4. Reenviar desde Partner Dashboard → Distribution → Submit for review.
