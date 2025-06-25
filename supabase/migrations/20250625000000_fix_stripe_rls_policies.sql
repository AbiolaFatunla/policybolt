-- Add missing RLS policies for stripe_subscriptions table

-- Allow users to insert their own subscription data
CREATE POLICY "Users can insert their own subscription data"
    ON stripe_subscriptions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        customer_id IN (
            SELECT customer_id
            FROM stripe_customers
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

-- Allow users to update their own subscription data
CREATE POLICY "Users can update their own subscription data"
    ON stripe_subscriptions
    FOR UPDATE
    TO authenticated
    USING (
        customer_id IN (
            SELECT customer_id
            FROM stripe_customers
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
        AND deleted_at IS NULL
    )
    WITH CHECK (
        customer_id IN (
            SELECT customer_id
            FROM stripe_customers
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

-- Also add policies for stripe_customers table if they're missing
CREATE POLICY IF NOT EXISTS "Users can insert their own customer data"
    ON stripe_customers
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Users can update their own customer data"
    ON stripe_customers
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() AND deleted_at IS NULL)
    WITH CHECK (user_id = auth.uid());