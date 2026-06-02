
-- =========================================================
-- FASE 1: Pacotes, vínculo sticker-order, webhook logs
-- =========================================================

-- 1) Tabela plans
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  quantity integer NOT NULL CHECK (quantity > 0),
  price_centavos integer NOT NULL CHECK (price_centavos >= 100),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans" ON public.plans
  FOR SELECT USING (true);
CREATE POLICY "Admins manage plans" ON public.plans
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed dos 4 planos
INSERT INTO public.plans (name, slug, quantity, price_centavos, sort_order) VALUES
  ('Individual', 'individual', 1, 1290, 1),
  ('Família',    'familia',    3, 2990, 2),
  ('Time',       'time',       5, 4490, 3),
  ('Torcida',    'torcida',   10, 7990, 4);

-- 2) orders: plan_id + quantity
ALTER TABLE public.orders
  ADD COLUMN plan_id uuid REFERENCES public.plans(id),
  ADD COLUMN quantity integer NOT NULL DEFAULT 1;

-- Backfill: orders existentes ganham plano Individual
UPDATE public.orders
SET plan_id = (SELECT id FROM public.plans WHERE slug = 'individual'),
    quantity = 1
WHERE plan_id IS NULL;

-- 3) stickers: vínculo direto com order
ALTER TABLE public.stickers
  ADD COLUMN order_id uuid;

CREATE INDEX idx_stickers_order_id ON public.stickers(order_id);

-- Backfill: para cada order existente, vincula a sticker apontada
UPDATE public.stickers s
SET order_id = o.id
FROM public.orders o
WHERE o.sticker_id = s.id AND s.order_id IS NULL;

-- 4) Permitir leitura pública de stickers pagas (área do cliente sem login)
-- Uma figurinha vinculada a uma order CONFIRMED pode ser lida por qualquer um que tenha o id
CREATE POLICY "Public read paid stickers" ON public.stickers
  FOR SELECT USING (status = 'paid');

-- 5) webhook_logs
CREATE TABLE public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  event_type text NOT NULL DEFAULT 'purchase',
  webhook_url text NOT NULL,
  request_payload jsonb NOT NULL,
  response_status integer,
  response_body text,
  success boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 1,
  next_retry_at timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_logs_order ON public.webhook_logs(order_id);
CREATE INDEX idx_webhook_logs_retry ON public.webhook_logs(success, next_retry_at)
  WHERE success = false;

GRANT ALL ON public.webhook_logs TO service_role;
GRANT SELECT ON public.webhook_logs TO authenticated;

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view webhook logs" ON public.webhook_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6) app_settings: webhook_secret
ALTER TABLE public.app_settings
  ADD COLUMN webhook_secret text;

-- Gera um secret aleatório se ainda não houver
UPDATE public.app_settings
SET webhook_secret = encode(gen_random_bytes(32), 'hex')
WHERE webhook_secret IS NULL;
