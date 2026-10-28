"use strict";

const Stripe = require("stripe");

const SITE_URL = "https://reflexinteractive.com";
const STATIC_ROUTES = [
    ["/", "weekly", "1.0"],
    ["/games", "weekly", "0.9"],
    ["/newswire", "daily", "0.8"],
    ["/shop", "monthly", "0.8"],
    ["/support", "monthly", "0.6"],
    ["/privacy", "yearly", "0.3"],
    ["/tos", "yearly", "0.3"],
];
const isTrue = value => String(value || "").toLowerCase() === "true";
const xmlEscape = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
}[character]));

let stripeClient;
const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
    if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    return stripeClient;
};

const listProductRoutes = async stripe => {
    const products = [];
    for await (const product of stripe.products.list({ active: true, limit: 100 })) products.push(product);

    const routes = [];
    const batchSize = 8;
    for (let index = 0; index < products.length; index += batchSize) {
        const batch = products.slice(index, index + batchSize);
        const entries = await Promise.all(batch.map(async product => {
            const prices = await stripe.prices.list({ product: product.id, active: true, type: "one_time", limit: 100 });
            return { product, price: prices.data.find(item => Number.isInteger(item.unit_amount)) || null };
        }));

        entries.forEach(({ product, price }) => {
            const game = isTrue(product.metadata?.game) || isTrue(price?.metadata?.game);
            const apparel = isTrue(product.metadata?.apparel) || isTrue(product.metadata?.merch)
                || isTrue(price?.metadata?.apparel) || isTrue(price?.metadata?.merch);
            const status = String(product.metadata?.coming_soon || product.metadata?.status || "").toLowerCase();
            const comingSoon = status === "true" || status === "coming_soon";
            if ((!price && !comingSoon) || game === apparel) return;

            const catalogPath = game ? "/game-details" : "/shop";
            const lastmod = product.updated ? new Date(product.updated * 1000).toISOString() : "";
            routes.push({
                loc: `${SITE_URL}${catalogPath}?id=${encodeURIComponent(product.id)}`,
                lastmod,
                priority: game ? "0.75" : "0.65",
            });
        });
    }
    return routes;
};

const response = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "X-Content-Type-Options": "nosniff",
    },
    body,
});

exports.handler = async event => {
    if (event.httpMethod !== "GET") return response(405, "Method not allowed");

    try {
        const dynamicRoutes = await listProductRoutes(getStripe());
        const staticEntries = STATIC_ROUTES.map(([path, changefreq, priority]) => ({ loc: `${SITE_URL}${path}`, changefreq, priority }));
        const entries = [...staticEntries, ...dynamicRoutes].map(route => `    <url>
        <loc>${xmlEscape(route.loc)}</loc>${route.lastmod ? `
        <lastmod>${xmlEscape(route.lastmod)}</lastmod>` : ""}
        <changefreq>${route.changefreq || "weekly"}</changefreq>
        <priority>${route.priority}</priority>
    </url>`).join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
        return response(200, xml);
    } catch (error) {
        console.error("Sitemap generation failed", error);
        return response(503, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><error>Sitemap temporarily unavailable</error>");
    }
};
