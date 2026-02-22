-- Credits table: tracks each user's credit balance
CREATE TABLE IF NOT EXISTS public.credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usage history: logs each tailor request
CREATE TABLE IF NOT EXISTS public.usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_used INTEGER NOT NULL DEFAULT 1,
  jd_snippet TEXT, -- first 100 chars of JD for reference
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_history_user_id ON public.usage_history(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_history_created_at ON public.usage_history(created_at DESC);

-- Auto-update updated_at on credits table
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credits_updated_at
  BEFORE UPDATE ON public.credits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Give 1 free credit when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.credits (user_id, balance)
  VALUES (NEW.id, 1)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_credits();

-- Row Level Security
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_history ENABLE ROW LEVEL SECURITY;

-- Users can only read their own credits
CREATE POLICY "Users can read own credits"
  ON public.credits FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only read their own usage history
CREATE POLICY "Users can read own usage"
  ON public.usage_history FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert credits (signup trigger handles it)
-- Authenticated users can decrement their own balance via RPC function

-- Deduct credit function — atomic, prevents race conditions
-- Uses auth.uid() to prevent cross-account manipulation
CREATE OR REPLACE FUNCTION deduct_credit(p_jd_snippet TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_balance INTEGER;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Lock the row and check balance
  SELECT balance INTO v_balance
  FROM public.credits
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < 1 THEN
    RETURN FALSE;
  END IF;

  -- Deduct
  UPDATE public.credits
  SET balance = balance - 1
  WHERE user_id = v_user_id;

  -- Log usage
  INSERT INTO public.usage_history (user_id, credits_used, jd_snippet)
  VALUES (v_user_id, 1, p_jd_snippet);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
