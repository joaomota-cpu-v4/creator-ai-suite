INSERT INTO public.plans (name, slug, quantity, price_centavos, sort_order, active)
VALUES
  ('Individual', 'individual', 1, 1290, 1, true),
  ('Família', 'familia', 3, 2990, 2, true),
  ('Time', 'time', 5, 4490, 3, true),
  ('Torcida', 'torcida', 10, 7990, 4, true)
ON CONFLICT (slug) DO NOTHING;
