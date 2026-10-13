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

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") {
        return json(405, { error: "Method not allowed" });
    }

    try {
        const stripe = getStripe();
        const productList = await stripe.products.list({ active: true, limit: 100 });

        const products = (await Promise.all(productList.data.map(async product => {
            const prices = await stripe.prices.list({
                product: product.id,
                active: true,
                type: "one_time",
                limit: 100
            });

            const price = prices.data.find(item => Number.isInteger(item.unit_amount));
            if (!price) return null;

            const metadataComingSoon = String(product.metadata.coming_soon || product.metadata.status || "").toLowerCase();
            const comingSoon = metadataComingSoon === "true" || metadataComingSoon === "coming_soon";

            return {
                id: product.id,
                priceId: price.id,
                name: product.name,
                description: product.description || "",
                image: product.images[0] || "",
                type: product.metadata.category || product.metadata.type || "Game",
                unitAmount: price.unit_amount,
                currency: price.currency,
                comingSoon,
                available: product.active && price.active && !comingSoon,
                metadata: product.metadata || {} 
            };
        }))).filter(Boolean);

        return json(200, { products });
    } catch (error) {
        console.error("Unable to load Stripe products", error);
        return json(500, { error: "Unable to load products" });
    }
};