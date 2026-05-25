
-- Enum for roles
CREATE TYPE public.app_role AS ENUM ('admin');

-- Status enums
CREATE TYPE public.sticker_status AS ENUM ('draft','generated','paid','delivered');
CREATE TYPE public.order_status AS ENUM ('PENDING','CONFIRMED','FAILED','REFUNDED');
CREATE TYPE public.payment_method AS ENUM ('PIX','CREDIT_CARD');

-- Stickers
CREATE TABLE public.stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  data_nascimento DATE,
  clube TEXT,
  peso_kg NUMERIC,
  altura_cm NUMERIC,
  foto_original_path TEXT,
  figurinha_url TEXT,
  preview_url TEXT,
  status public.sticker_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id UUID NOT NULL REFERENCES public.stickers(id) ON DELETE CASCADE,
  asaas_payment_id TEXT UNIQUE,
  valor_centavos INTEGER NOT NULL DEFAULT 1290,
  metodo public.payment_method NOT NULL,
  status public.order_status NOT NULL DEFAULT 'PENDING',
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  invoice_url TEXT,
  cpf TEXT,
  telefone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_sticker ON public.orders(sticker_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_stickers_status ON public.stickers(status);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- has_role helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stickers_updated_at BEFORE UPDATE ON public.stickers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS: stickers — public flow uses server functions with admin client, so we only need admin policies
CREATE POLICY "Admins can view all stickers" ON public.stickers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS: orders
CREATE POLICY "Admins can view all orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS: user_roles
CREATE POLICY "Admins can view roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('user-photos', 'user-photos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('stickers', 'stickers', true);

-- Storage policies: stickers bucket is public read; writes go through server admin
CREATE POLICY "Public can read stickers bucket" ON storage.objects
  FOR SELECT USING (bucket_id = 'stickers');
