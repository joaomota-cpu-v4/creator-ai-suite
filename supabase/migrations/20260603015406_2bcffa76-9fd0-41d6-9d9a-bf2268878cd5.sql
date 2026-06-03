-- Permitir orders DRAFT sem sticker vinculado
ALTER TABLE public.orders ALTER COLUMN sticker_id DROP NOT NULL;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_sticker_id_fkey;