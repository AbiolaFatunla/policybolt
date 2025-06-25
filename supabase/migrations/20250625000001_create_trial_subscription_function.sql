-- Create a secure function to create trial subscriptions
-- This bypasses RLS by using SECURITY DEFINER

CREATE OR REPLACE FUNCTION create_trial_subscription(
  p_user_id UUID,
  p_setup_intent_id TEXT,
  p_price_id TEXT DEFAULT 'price_1RddANKSNriwT6N669BShQb0'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
AS $$
DECLARE
  v_customer_id TEXT;
  v_subscription_record stripe_subscriptions%ROWTYPE;
  v_result JSON;
BEGIN
  -- Get the customer_id for this user
  SELECT customer_id INTO v_customer_id
  FROM stripe_customers
  WHERE user_id = p_user_id AND deleted_at IS NULL;
  
  -- Check if customer exists
  IF v_customer_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Customer not found for user'
    );
  END IF;
  
  -- Create or update the trial subscription
  INSERT INTO stripe_subscriptions (
    customer_id,
    subscription_id,
    price_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    payment_method_last4,
    payment_method_brand
  ) VALUES (
    v_customer_id,
    'sub_trial_' || p_setup_intent_id,
    p_price_id,
    'trialing'::stripe_subscription_status,
    extract(epoch from now())::bigint,
    extract(epoch from now() + interval '14 days')::bigint,
    false,
    '4242',
    'visa'
  ) 
  ON CONFLICT (customer_id) DO UPDATE SET
    subscription_id = EXCLUDED.subscription_id,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    price_id = EXCLUDED.price_id,
    updated_at = now()
  RETURNING * INTO v_subscription_record;
  
  -- Return success response
  RETURN json_build_object(
    'success', true,
    'subscription', row_to_json(v_subscription_record)
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Return error response
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_trial_subscription(UUID, TEXT, TEXT) TO authenticated;