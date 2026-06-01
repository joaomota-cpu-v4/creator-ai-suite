ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS email text;