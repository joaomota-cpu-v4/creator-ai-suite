ALTER TABLE public.app_settings
  ALTER COLUMN ai_provider SET DEFAULT 'OPENAI',
  ALTER COLUMN ai_fallback SET DEFAULT false;

UPDATE public.app_settings
SET ai_provider = 'OPENAI',
    ai_fallback = false
WHERE id = true;
