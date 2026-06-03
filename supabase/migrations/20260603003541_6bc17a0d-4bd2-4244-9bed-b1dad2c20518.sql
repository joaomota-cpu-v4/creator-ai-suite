
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'GEMINI',
  ADD COLUMN IF NOT EXISTS ai_fallback boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.ai_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id uuid,
  provider text NOT NULL,
  model text,
  success boolean NOT NULL DEFAULT false,
  duration_ms integer,
  error text,
  fallback_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_logs TO authenticated;
GRANT ALL ON public.ai_logs TO service_role;

ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view ai logs" ON public.ai_logs;
CREATE POLICY "Admins view ai logs" ON public.ai_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS ai_logs_created_idx ON public.ai_logs (created_at DESC);
