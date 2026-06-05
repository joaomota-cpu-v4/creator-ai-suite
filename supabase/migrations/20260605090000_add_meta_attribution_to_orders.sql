alter table public.orders
  add column if not exists meta_fbc text,
  add column if not exists meta_fbp text,
  add column if not exists meta_user_agent text;
