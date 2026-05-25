
# Figurinha Personalizada da Copa — App Completo

App de venda de figurinhas personalizadas estilo Panini Copa, geradas por IA, com checkout via Asaas, entrega por e-mail e painel admin.

## Fluxo do usuário (frontend)

1. **Landing** (`/`) — fundo amarelo, headline "Transforme seu filho em uma figurinha personalizada da Copa do Mundo", mockup com 3 figurinhas sobrepostas, prova social ("+2.500 figurinhas já criadas"), CTA "Iniciar".
2. **Quiz 4 passos** (`/criar`) com barra de progresso:
   - Passo 1 (25%): Nome do craque + upload da foto do rosto
   - Passo 2 (50%): Data de nascimento + e-mail
   - Passo 3 (75%): Clube do coração + peso + altura
   - Passo 4 (100%): "Gerando sua figurinha" — chama IA, mostra prévia borrada com marca d'água
3. **Oferta** (`/oferta/:id`) — prévia da figurinha em destaque, "GOOLL! Sua figurinha está pronta", preço R$ 12,90 (de R$ 29,90), CTA "Receber minha figurinha".
4. **Checkout** (`/checkout/:id`) — dados pessoais (CPF, telefone), escolha de Cartão ou Pix, integração Asaas.
5. **Sucesso** (`/sucesso/:id`) — confirma envio por e-mail e mostra QR Pix se aplicável.

## Backend (Lovable Cloud + server functions)

### Banco de dados
- `stickers` — id, nome, data_nasc, email, clube, peso, altura, foto_original_url, figurinha_url, preview_url, status (`draft`/`generated`/`paid`/`delivered`), created_at
- `orders` — id, sticker_id, asaas_payment_id, valor, metodo (`PIX`/`CREDIT_CARD`), status (`PENDING`/`CONFIRMED`/`FAILED`), pix_qr, pix_copy_paste, created_at
- `user_roles` — id, user_id, role (`admin`) — para painel
- Storage bucket `stickers` (público para preview, privado para alta-res)

### Server functions / rotas
- `generateSticker` (serverFn) — recebe dados do quiz + foto base64 → chama Lovable AI (`google/gemini-3.1-flash-image-preview`) com prompt detalhado de figurinha Panini Copa → salva imagem no storage → retorna URL da prévia (com marca d'água) e id.
- `createAsaasPayment` (serverFn) — cria cobrança no Asaas (PIX ou cartão) e retorna `paymentId` + dados Pix.
- `/api/public/asaas-webhook` (rota servidor) — recebe webhook do Asaas, valida token, marca pedido como `CONFIRMED`, dispara entrega por e-mail com link da figurinha em alta resolução.
- `sendDelivery` — usa Lovable Emails para enviar a figurinha final.

### Asaas
- Secret `ASAAS_API_KEY` solicitado via add_secret (sandbox por padrão; fácil trocar pra produção).
- Secret `ASAAS_WEBHOOK_TOKEN` para validar callbacks.
- URL do webhook (`project--<id>.lovable.app/api/public/asaas-webhook`) será mostrada no chat pra você colar no painel Asaas.

### IA
- Lovable AI Gateway (`LOVABLE_API_KEY` auto-provisionado).
- Modelo: `google/gemini-3.1-flash-image-preview` via `/v1/chat/completions` com `modalities: ["image","text"]`.
- Prompt construído com: nome, idade calculada, clube, peso, altura, foto → "card colecionável estilo Panini Copa do Mundo 2026, criança vestindo camisa da seleção brasileira, escudo da FIFA, faixa azul com nome, dados na parte inferior, fundo holográfico verde-amarelo".

### E-mail
- Usa Lovable Emails (configura domínio no fluxo). Envia HTML com link para download da figurinha em alta resolução após pagamento confirmado.

## Painel Admin (`/admin`)

- Login com e-mail/senha (Lovable Cloud Auth).
- Tabela `user_roles` com função `has_role()` security definer (padrão seguro, sem privilege escalation).
- Dashboard com: total de figurinhas geradas, total de vendas, conversão quiz→pagamento, lista de pedidos com filtros por status, link pra reenviar e-mail.
- Rota `/admin` protegida por layout `_authenticated` + checagem de role admin.

## Design

- Paleta: amarelo `#FFD60A` (fundo), azul royal `#0033A0` (textos e botões), verde `#00A859` (preço), branco para cards.
- Tipografia: heading com fonte pesada estilo esportivo (Bebas Neue / Archivo Black), corpo em Inter.
- Cards brancos com sombra suave, cantos arredondados, barra de progresso azul.
- Animações sutis nas transições de passo + reveal da figurinha gerada.

## Ordem de implementação

1. Habilitar Lovable Cloud + AI Gateway
2. Migration: tabelas + storage + roles
3. Design system (`styles.css`) + componentes base
4. Landing + Quiz (4 passos com state)
5. Server function `generateSticker` (IA)
6. Tela de oferta + checkout
7. Server functions Asaas + webhook público
8. Configuração de e-mail (Lovable Emails) + entrega
9. Auth + painel admin
10. Pedir secret `ASAAS_API_KEY` e mostrar URL do webhook

## Notas

- Asaas funciona em sandbox sem precisar de conta verificada; recomendo começar em sandbox.
- Cada figurinha gerada consome créditos de IA do seu workspace Lovable.
- Para domínio próprio de e-mail (ex: `notify@suamarca.com.br`) você poderá configurar depois — começo enviando pelo domínio padrão Lovable.
