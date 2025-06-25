import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  appInfo: {
    name: 'PolicyBolt Trial Creation',
    version: '1.0.0',
  },
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Function to sync subscription data to database
async function syncSubscriptionFromStripe(customerId: string, subscription: Stripe.Subscription) {
  try {
    const { error } = await supabase.from('stripe_subscriptions').upsert(
      {
        customer_id: customerId,
        subscription_id: subscription.id,
        price_id: subscription.items.data[0].price.id,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        ...(subscription.default_payment_method && typeof subscription.default_payment_method !== 'string'
          ? {
              payment_method_brand: subscription.default_payment_method.card?.brand ?? null,
              payment_method_last4: subscription.default_payment_method.card?.last4 ?? null,
            }
          : {}),
        status: subscription.status,
      },
      {
        onConflict: 'customer_id',
      },
    );

    if (error) {
      console.error('Error syncing subscription:', error);
    } else {
      console.log('Subscription synced successfully');
    }
  } catch (error) {
    console.error('Error in syncSubscriptionFromStripe:', error);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }

  try {
    // Get the authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: getUserError } = await supabase.auth.getUser(token);

    if (getUserError || !user) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    const { setup_intent_id, price_id } = await req.json();

    console.log(`Creating trial subscription for user ${user.id} with setup intent ${setup_intent_id}`);

    // Get the customer record for this user
    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .single();

    if (customerError || !customer) {
      console.error('Customer error:', customerError);
      return new Response(JSON.stringify({ error: 'Customer not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // Retrieve the setup intent to get the payment method
    const setupIntent = await stripe.setupIntents.retrieve(setup_intent_id);
    
    if (setupIntent.status !== 'succeeded') {
      return new Response(JSON.stringify({ error: 'Setup intent not succeeded' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    if (!setupIntent.payment_method) {
      return new Response(JSON.stringify({ error: 'No payment method found' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // Create actual Stripe subscription with trial period
    const subscription = await stripe.subscriptions.create({
      customer: customer.customer_id,
      items: [{ price: price_id }],
      default_payment_method: setupIntent.payment_method as string,
      trial_period_days: 14,
      expand: ['default_payment_method'],
    });

    console.log('Stripe subscription created successfully:', subscription.id);

    // The webhook will handle updating our database
    // But let's also sync immediately to avoid delays
    await syncSubscriptionFromStripe(customer.customer_id, subscription);

    return new Response(JSON.stringify({ 
      success: true, 
      subscription: {
        id: subscription.id,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error creating trial subscription:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
});