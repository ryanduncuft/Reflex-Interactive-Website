"use strict";

const Stripe = require("stripe");

const json = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
});

let stripeClient;
const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    return stripeClient;
};

const getSiteUrl = () => {
    const siteUrl = process.env.SITE_URL || process.env.URL;
    if (!siteUrl) throw new Error("SITE_URL is not configured");
    return siteUrl.replace(/\/$/, "");
};

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") {
        return json(405, { error: "Method not allowed" });
    }

    let request;
    try {
        request = JSON.parse(event.body || "{}");
    } catch {
        return json(400, { error: "Invalid JSON body" });
    }

    const productId = typeof request.productId === "string" ? request.productId.trim() : "";
    const priceId = typeof request.priceId === "string" ? request.priceId.trim() : "";
    if (!productId || !priceId) {
        return json(400, { error: "Product and price IDs are required" });
    }

    try {
        const stripe = getStripe();

        const price = await stripe.prices.retrieve(priceId);
        if (!price.active || price.type !== "one_time" || !Number.isInteger(price.unit_amount)) {
            return json(400, { error: "This item is not available" });
        }

        const stripeProductId = typeof price.product === "string" ? price.product : price.product.id;
        if (stripeProductId !== productId) {
            return json(400, { error: "Product and price do not match" });
        }

        const product = await stripe.products.retrieve(productId);
        if (!product.active) return json(400, { error: "This item is not available" });

        const siteUrl = getSiteUrl();
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{ price: price.id, quantity: 1 }],
            
            // Digital storefront - collecting customer email for receipts/future account linking
            customer_creation: "always",
            phone_number_collection: { enabled: false },

            success_url: `${siteUrl}/store.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${siteUrl}/store.html?checkout=cancel`,
            metadata: { 
                productId: product.id, 
                priceId: price.id 
            }
        });

        if (!session.url) throw new Error("Stripe did not return a checkout URL");
        return json(200, { url: session.url });
    } catch (error) {
        console.error("Unable to create Stripe Checkout Session", error);
        return json(500, { error: "Unable to start checkout" });
    }
};