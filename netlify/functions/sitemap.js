"use strict";

const Stripe = require("stripe");

const SITE_URL = "https://reflexinteractive.com";
const STATIC_ROUTES = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/games", changefreq: "weekly", priority: "0.9" },
    { path: "/newswire", changefreq: "daily", priority: "0.8" },
    { path: "/shop", changefreq: "monthly", priority: "0.8" },
    { path: "/support", changefreq: "monthly", priority: "0.6" },
    { path: "/privacy", changefreq: "yearly", priority: "0.3" },
    { path: "/terms", changefreq: "yearly", priority: "0.3" },
    { path: "/returns", changefreq: "yearly", priority: "0.4" },
];

const escapeXml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
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

const isTrue = value => String(value || "").toLowerCase() === "true";

const routeXml = (loc, changefreq, priority) => `  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

const generateSitemap = async stripe => {
    const productList = await stripe.products.list({ active: true, limit: 100 });
    const routes = STATIC_ROUTES.map(({ path, changefreq, priority }) =>
        routeXml(escapeXml(`${SITE_URL}${path}`), changefreq, priority));

    for (const product of productList.data) {
        const isGame = isTrue(product.metadata?.game);
        const isApparel = isTrue(product.metadata?.apparel) || isTrue(product.metadata?.merch);
        if (isGame === isApparel) continue;

        const path = isGame ? "/game-details" : "/shop";
        const changefreq = isGame ? "weekly" : "monthly";
        const priority = isGame ? "0.85" : "0.75";
        routes.push(routeXml(`${SITE_URL}${path}?id=${escapeXml(product.id)}`, changefreq, priority));
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.join("\n")}
</urlset>`;
};

const xmlResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
    },
    body,
});

exports.handler = async event => {
    if (event.httpMethod !== "GET") return xmlResponse(405, "Method not allowed");

    try {
        return xmlResponse(200, await generateSitemap(getStripe()));
    } catch (error) {
        console.error("Sitemap generation failed", error);
        return xmlResponse(500, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><error>Sitemap generation failed</error>");
    }
};
