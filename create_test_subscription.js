// Test script to manually create a trial subscription for testing
// Run this with: node create_test_subscription.js

const { createClient } = require('@supabase/supabase-js');

// Replace with your actual Supabase credentials
const supabaseUrl = 'https://jptuanwflzknzhzruvab.supabase.co';
const supabaseServiceKey = 'YOUR_SERVICE_ROLE_KEY'; // You'll need to add this

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestSubscription() {
  try {
    // First, get the current user's customer_id
    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .single();

    if (customerError) {
      console.error('Customer error:', customerError);
      return;
    }

    if (!customer) {
      console.log('No customer found. Creating test customer...');
      // You'd need to create a customer first
      return;
    }

    // Create a test subscription record
    const { data, error } = await supabase
      .from('stripe_subscriptions')
      .upsert({
        customer_id: customer.customer_id,
        subscription_id: 'sub_test_' + Date.now(),
        price_id: 'price_1RddANKSNriwT6N669BShQb0', // Solo Developer Plan
        status: 'trialing',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor((Date.now() + 14 * 24 * 60 * 60 * 1000) / 1000), // 14 days from now
        cancel_at_period_end: false,
      }, {
        onConflict: 'customer_id'
      });

    if (error) {
      console.error('Subscription error:', error);
    } else {
      console.log('Test subscription created:', data);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

// Uncomment the line below and add your service key to run this
// createTestSubscription();

console.log('Test script ready. Add your service key and uncomment the last line to run.');