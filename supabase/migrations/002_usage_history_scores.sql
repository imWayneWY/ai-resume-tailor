-- Add score columns to usage_history for tracking improvement
ALTER TABLE public.usage_history
  ADD COLUMN IF NOT EXISTS before_score INTEGER,
  ADD COLUMN IF NOT EXISTS after_score INTEGER;

-- Update deduct_credit to accept and store scores
CREATE OR REPLACE FUNCTION deduct_credit(
  p_jd_snippet TEXT DEFAULT NULL,
  p_before_score INTEGER DEFAULT NULL,
  p_after_score INTEGER DEFAULT NULL
)
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

  -- Log usage with scores
  INSERT INTO public.usage_history (user_id, credits_used, jd_snippet, before_score, after_score)
  VALUES (v_user_id, 1, p_jd_snippet, p_before_score, p_after_score);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
