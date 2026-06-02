## Plano de atualização completa: pacotes, entrega, webhooks e admin

Vou implementar em **fases** para manter o sistema operacional durante a migração. Abaixo o escopo total e como será dividido.

---

### Fase 1 — Banco de dados (migration única)

**Tabela `plans`** (id, name, slug, quantity, price_centavos, active, sort_order, timestamps)
- Seed automático: Individual (1 / R$12,90), Família (3 / R$29,90), Time (5 / R$44,90), Torcida (10 / R$79,90)
- RLS: leitura pública, escrita só admin

**Alterações em `orders`**
- `plan_id uuid` (FK lógica → plans)
- `quantity int default 1`
- Backfill: orders existentes recebem o plano "Individual"

**Alterações em `stickers`**
- `order_id uuid` (vincula figurinha ao pedido — hoje é o inverso)
- Backfill via orders.sticker_id atual

**Tabela `webhook_logs`** (id, order_id, event_type, webhook_url, request_payload jsonb, response_status, response_body, success, attempts, next_retry_at, created_at, last_attempt_at)
- RLS: admin only

**Tabela `app_settings`** — adicionar `webhook_secret` (opcional, gerado se vazio)

---

### Fase 2 — Backend (server functions)

- `plans.functions.ts`: `listPlans` (público), `listAllPlans`, `upsertPlan`, `deletePlan` (admin)
- `asaas.functions.ts`: aceitar `planId` no checkout, calcular valor a partir do plano, salvar `plan_id` + `quantity` na order
- `sticker.functions.ts`: 
  - `createStickerForOrder(orderId)` valida `count(stickers where order_id) < order.quantity`
  - `listStickersByOrder(orderId)` para área do cliente
- `delivery.server.ts` (refatorar):
  - busca **todas** as stickers do pedido
  - monta payload com array `stickers[]`
  - envia webhook com header `X-Webhook-Signature` (HMAC SHA256 de `WEBHOOK_SECRET`)
  - registra em `webhook_logs` (sucesso ou falha + tentativa)
  - envia e-mail (Resend) listando todas as figurinhas
- `webhooks.functions.ts` (admin):
  - `listWebhookLogs(filter)`, `resendWebhook(orderId)`, `resendAllFailed(range)`, `testWebhook()`
- `retry.server.ts`: função `processRetries()` chamada por endpoint cron `/api/public/webhook-retry` (com `WEBHOOK_SECRET` no header) — varre logs com `success=false` e `attempts<5` cujo `next_retry_at <= now()`. Backoff: 1m, 5m, 15m, 1h, 4h.
- ZIP download: rota `/api/zip/$orderId` — server route que stream-monta um zip das figurinhas (usa `jszip`).

---

### Fase 3 — Frontend cliente

- **`/`**: seção de planos (cards lado a lado) carregando de `plans`
- **`/criar`**: ao entrar exige `?plan=slug` (ou seletor no topo). Mostra contador "X/Y figurinhas geradas". Botão "Gerar nova" bloqueia ao atingir limite. Botão "Finalizar e pagar" → `/oferta/:orderId`
- **`/oferta/:orderId`** (upsell): se plano atual < Torcida, mostra comparação com economia (preço/figurinha) e botão "Trocar para plano X". Aplica upgrade via `updateOrderPlan(orderId, planId)` antes do checkout
- **`/checkout/:orderId`** e **`/sucesso/:orderId`**: usa valor do plano da order, lista todas as figurinhas, botão **"Baixar todas (ZIP)"** + downloads individuais
- **`/meus-pedidos`** (nova): área do cliente autenticada listando pedidos pagos com figurinhas

---

### Fase 4 — Admin

- **Admin > Configurações de Planos**: CRUD completo (nome, qty, preço, ativo, ordem)
- **Admin > Webhooks**: tabela com filtros (todos/sucesso/falha + período), botões "Reenviar", "Reenviar todos com falha", "Testar webhook"
- O editor de preço único atual é substituído pelo CRUD de planos

---

### Fase 5 — Segurança e e-mail

- `WEBHOOK_SECRET`: se não existir, gerar e salvar em `app_settings` automaticamente
- Header `X-Webhook-Signature: sha256=<hex>` em todo POST
- E-mail Resend: template HTML com lista de figurinhas + botões download. Falha silenciosa (só log).

---

### Compatibilidade / migração

- Orders antigas viram plano "Individual" com `quantity=1`
- Stickers antigas ganham `order_id` baseado em `orders.sticker_id`
- Endpoints públicos antigos (`/sucesso/:stickerId`) continuam funcionando — resolvem o `order_id` via sticker
- Nada quebra: o fluxo de 1 figurinha vira caso particular do fluxo de N

---

### Secrets necessários

Já configurados: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `LOVABLE_API_KEY`, `WEBHOOK_URL`

A pedir (opcional):
- `WEBHOOK_SECRET` (auto-gerado se ausente)
- `RESEND_API_KEY` + `EMAIL_FROM` (e-mail desativado se ausentes)

---

### Aviso de escopo

Isso é uma reescrita de ~15 arquivos + 1 migration grande + 3 novas tabelas + nova rota ZIP + nova área do cliente. Vou executar em sequência, validando após cada fase. Pode levar várias rodadas de edição.

**Confirma para eu começar pela Fase 1 (migration do banco)?** Ou prefere ajustar algo no escopo antes (ex: preços iniciais dos planos, remover área do cliente, etc.)?
