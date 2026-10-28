"use strict";

const Stripe = require("stripe");

const SITE_URL = "https://reflexinteractive.com";
const DEFAULT_IMAGE = "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532765/Reflex_Interactive_f3zylo.png";
const TRUE = value => String(value || "").toLowerCase() === "true";

let stripeClient;
const getStripe = () => {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
    if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    return stripeClient;
};

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
}[character]));

const safeJson = value => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const truthyTag = (product, price, key) => TRUE(product.metadata?.[key]) || TRUE(price?.metadata?.[key]);
const asUrl = value => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.href : "";
    } catch {
        return "";
    }
};

const getPrice = async (stripe, productId) => {
    const result = await stripe.prices.list({ product: productId, active: true, type: "one_time", limit: 100 });
    return result.data.find(price => Number.isInteger(price.unit_amount)) || null;
};

const normalizeProduct = (product, price) => {
    const game = truthyTag(product, price, "game");
    const apparel = truthyTag(product, price, "apparel") || truthyTag(product, price, "merch");
    if (game === apparel) return null;

    const status = String(product.metadata?.coming_soon || product.metadata?.status || "").toLowerCase();
    const comingSoon = status === "true" || status === "coming_soon";
    if (!price && !comingSoon) return null;
    const images = [...new Set([
        ...(product.images || []).map(asUrl),
        ...Object.entries(product.metadata || {}).filter(([key]) => /^image_\d+$/i.test(key)).map(([, value]) => asUrl(value)),
    ].filter(Boolean))];

    return {
        id: product.id,
        name: product.name || (game ? "Reflex Interactive Game" : "Reflex Interactive Merchandise"),
        description: product.description || "",
        image: images[0] || DEFAULT_IMAGE,
        images,
        metadata: product.metadata || {},
        priceId: price?.id || "",
        unitAmount: price?.unit_amount ?? 0,
        currency: (price?.currency || "gbp").toLowerCase(),
        game,
        apparel,
        comingSoon,
        available: Boolean(price) && !comingSoon,
    };
};

const listCatalog = async (stripe, catalog) => {
    const stripeProducts = [];
    for await (const product of stripe.products.list({ active: true, limit: 100 })) stripeProducts.push(product);

    const products = [];
    const batchSize = 8;
    for (let index = 0; index < stripeProducts.length; index += batchSize) {
        const batch = stripeProducts.slice(index, index + batchSize);
        const normalized = await Promise.all(batch.map(async product => normalizeProduct(product, await getPrice(stripe, product.id))));
        products.push(...normalized.filter(item => item && (catalog === "games" ? item.game : item.apparel)));
    }
    return products;
};

const findProduct = async (stripe, productId, catalog) => {
    if (!/^prod_[a-zA-Z0-9]{10,64}$/.test(productId || "")) return null;
    const product = await stripe.products.retrieve(productId);
    if (!product.active) return null;
    const price = await getPrice(stripe, product.id);
    const item = normalizeProduct(product, price);
    if (!item || !(catalog === "games" ? item.game : item.apparel)) return null;
    return item;
};

const money = product => product.comingSoon
    ? "Coming soon"
    : product.unitAmount === 0
        ? "Free"
        : new Intl.NumberFormat("en-GB", { style: "currency", currency: product.currency.toUpperCase() }).format(product.unitAmount / 100);

const productSchema = (product, catalog, url) => {
    const common = {
        "@context": "https://schema.org",
        name: product.name,
        description: product.description,
        image: product.images.length ? product.images : [product.image],
        url,
        brand: { "@type": "Brand", name: "Reflex Interactive" },
        ...(product.priceId ? { offers: {
            "@type": "Offer",
            url,
            priceCurrency: product.currency.toUpperCase(),
            price: (product.unitAmount / 100).toFixed(2),
            availability: product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@type": "Organization", name: "Reflex Interactive" },
        } } : {}),
    };

    if (catalog === "games") {
        return {
            ...common,
            "@type": "SoftwareApplication",
            applicationCategory: "GameApplication",
            operatingSystem: product.metadata.operating_system || "Windows",
            publisher: { "@type": "Organization", name: product.metadata.publisher || "Reflex Interactive" },
            ...(product.metadata.genre ? { genre: product.metadata.genre } : {}),
        };
    }
    return { ...common, "@type": "Product", category: product.metadata.category || "Apparel & Accessories" };
};

const routeFor = (catalog, id) => catalog === "games"
    ? `/game-details?id=${encodeURIComponent(id)}`
    : `/shop?id=${encodeURIComponent(id)}`;

const pageShell = ({ title, description, image, canonical, catalog, body, schema }) => `<!doctype html>
<html lang="en-GB">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description.replace(/\s+/g, " ").trim().slice(0, 160))}">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="${catalog === "games" ? "product" : "website"}">
    <meta property="og:site_name" content="Reflex Interactive">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description.replace(/\s+/g, " ").trim().slice(0, 160))}">
    <meta property="og:image" content="${escapeHtml(image)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description.replace(/\s+/g, " ").trim().slice(0, 160))}">
    <meta name="twitter:image" content="${escapeHtml(image)}">
    <link rel="icon" href="https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.ico">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700;800&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="/css/styles.css">
    <script type="application/ld+json">${safeJson(schema)}</script>
</head>
<body class="bg-black text-white overflow-x-hidden" data-catalog="${catalog}" data-ssr-catalog="true">
    <div id="navbar"></div>
    <main id="main-content" class="container pt-4 pt-md-5 flex-grow-1 w-100">${body}</main>
    <div id="footer"></div>
    <script src="/js/site-config.js"></script>
    <script src="/js/navigation.js" defer></script>
    <script src="/js/stripe.js" defer></script>
    <script src="/js/settings.js" defer></script>
    <script src="/js/core.js" defer></script>
</body>
</html>`;

const listingPage = (catalog, products) => {
    const isGames = catalog === "games";
    const pageTitle = isGames ? "Games | Reflex Interactive" : "Shop | Reflex Interactive";
    const description = isGames
        ? "Explore and buy Reflex Interactive games, with release information, pricing, and availability."
        : "Shop official Reflex Interactive apparel and physical merchandise, with current prices and availability.";
    const canonical = `${SITE_URL}/${isGames ? "games" : "shop"}`;
    const cards = products.map(product => {
        return `<div class="col"><article class="card modern-card store-card h-100">
            <a class="d-block" href="${escapeHtml(routeFor(catalog, product.id))}" aria-label="View ${escapeHtml(product.name)}">
                <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" width="720" height="405" class="modern-card-img" loading="lazy" decoding="async">
            </a>
            <div class="card-body d-flex flex-column">
                <span class="badge bg-secondary mb-2 align-self-start">${escapeHtml(product.metadata.category || (isGames ? "Game" : "Apparel"))}</span>
                <h2 class="modern-card-title h4"><a class="text-white text-decoration-none" href="${escapeHtml(routeFor(catalog, product.id))}">${escapeHtml(product.name)}</a></h2>
                ${product.metadata.genre ? `<p class="small text-muted mb-1">${escapeHtml(product.metadata.genre)}</p>` : ""}
                ${product.metadata.release_date ? `<p class="small text-muted mb-2">Release: ${escapeHtml(product.metadata.release_date)}</p>` : ""}
                <p class="text-muted small mb-3">${escapeHtml(product.description)}</p>
                <div class="d-flex align-items-center justify-content-between gap-2 mt-auto">
                    <span class="fs-5 fw-bold text-white">${escapeHtml(money(product))}</span>
                    ${product.available
                        ? `<button type="button" class="btn btn-danger btn-sm" data-checkout-product="${escapeHtml(product.id)}" data-checkout-price="${escapeHtml(product.priceId)}" data-checkout-catalog="${catalog}">${isGames ? "Buy Game" : "Buy Merch"}</button>`
                        : `<button type="button" class="btn btn-outline-secondary btn-sm" disabled>Coming Soon</button>`}
                </div>
            </div>
        </article></div>`;
    }).join("");
    const body = `<section id="store-catalog" class="py-5 page-hero" aria-labelledby="store-heading">
        <div class="page-intro mx-auto mb-5 text-center"><p class="section-kicker mb-3">${isGames ? "Games" : "Official Shop"}</p>
            <h1 id="store-heading" class="display-3 fw-bold">${isGames ? "Reflex Interactive Games" : "Reflex Interactive Shop"}</h1>
            <p class="fs-5 text-muted mb-0">${escapeHtml(description)}</p>
        </div>
        <div id="store-loading-spinner" class="d-none" aria-hidden="true"></div>
        <div id="store-products-container" class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">${cards || `<p class="col-12 text-center text-muted">No ${isGames ? "games" : "merchandise"} are available right now.</p>`}</div>
    </section>`;
    const schema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: isGames ? "Reflex Interactive Games" : "Reflex Interactive Shop",
        itemListElement: products.map((product, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item: productSchema(product, catalog, `${SITE_URL}${routeFor(catalog, product.id)}`),
        })),
    };
    return pageShell({ title: pageTitle, description, image: DEFAULT_IMAGE, canonical, catalog, body, schema });
};

const detailPage = (catalog, product) => {
    const isGame = catalog === "games";
    const canonical = `${SITE_URL}${routeFor(catalog, product.id)}`;
    const title = `${product.name} | Reflex Interactive`;
    const description = product.description || `${product.name} by Reflex Interactive. View details, availability and pricing.`;
    const schema = productSchema(product, catalog, canonical);
    const action = product.available
        ? `<button id="game-access-btn" type="button" class="btn btn-danger w-100 py-3 fw-bold" data-checkout-product="${escapeHtml(product.id)}" data-checkout-price="${escapeHtml(product.priceId)}" data-checkout-catalog="${catalog}">${product.unitAmount === 0 ? "Get Free" : `Buy Now · ${escapeHtml(money(product))}`}</button>`
        : `<button type="button" class="btn btn-secondary w-100 py-3 fw-bold" disabled>Coming Soon</button>`;
    const body = `<section class="page-hero py-5" aria-labelledby="product-heading">
        <p class="section-kicker mb-3">${isGame ? "Game Details" : "Official Merchandise"}</p>
        <h1 id="product-heading" class="display-3 fw-bold mb-4">${escapeHtml(product.name)}</h1>
        <div class="row g-5 align-items-start">
            <div class="col-12 col-lg-5"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} official ${isGame ? "game artwork" : "product image"}" width="1200" height="675" class="img-fluid rounded-xl mb-4" fetchpriority="high"></div>
            <div class="col-12 col-lg-7"><article class="surface-panel p-4 p-md-5">
                <p class="section-kicker">${escapeHtml(product.metadata.category || (isGame ? "Game" : "Apparel"))}</p>
                <p class="fs-5 text-light lh-lg">${escapeHtml(description)}</p>
                ${isGame ? `<dl class="row mt-4">
                    <dt class="col-sm-4 text-muted">Developer</dt><dd class="col-sm-8">${escapeHtml(product.metadata.developer || "Reflex Interactive")}</dd>
                    <dt class="col-sm-4 text-muted">Publisher</dt><dd class="col-sm-8">${escapeHtml(product.metadata.publisher || "Reflex Interactive")}</dd>
                    ${product.metadata.genre ? `<dt class="col-sm-4 text-muted">Genre</dt><dd class="col-sm-8">${escapeHtml(product.metadata.genre)}</dd>` : ""}
                    ${product.metadata.release_date ? `<dt class="col-sm-4 text-muted">Release date</dt><dd class="col-sm-8">${escapeHtml(product.metadata.release_date)}</dd>` : ""}
                </dl>` : ""}
                <p class="display-6 fw-bold mt-4">${escapeHtml(money(product))}</p>${action}
                <p class="small text-muted mt-3 mb-0">Secure checkout powered by Stripe.</p>
            </article></div>
        </div>
    </section>`;
    return pageShell({ title, description, image: product.image, canonical, catalog, body, schema });
};

const response = (statusCode, body, extraHeaders = {}) => ({
    statusCode,
    headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": statusCode === 200 ? "public, max-age=300, s-maxage=900" : "no-store",
        "X-Content-Type-Options": "nosniff",
        ...extraHeaders,
    },
    body,
});

exports.handler = async event => {
    if (event.httpMethod !== "GET") return response(405, "Method not allowed", { Allow: "GET" });

    const query = event.queryStringParameters || {};
    const catalog = query.catalog === "shop" ? "shop" : "games";
    const productId = typeof query.id === "string" ? query.id.trim() : "";

    try {
        const stripe = getStripe();
        if (productId) {
            const product = await findProduct(stripe, productId, catalog);
            if (!product) return response(404, "<!doctype html><html lang=\"en\"><head><title>Product not found | Reflex Interactive</title><meta name=\"robots\" content=\"noindex\"></head><body><main><h1>Product not found</h1><a href=\"/\">Return home</a></main></body></html>");
            return response(200, detailPage(catalog, product));
        }
        const products = await listCatalog(stripe, catalog);
        return response(200, listingPage(catalog, products));
    } catch (error) {
        console.error("Store SSR request failed", error);
        return response(503, "<!doctype html><html lang=\"en\"><head><title>Catalog temporarily unavailable | Reflex Interactive</title><meta name=\"robots\" content=\"noindex\"></head><body><main><h1>Catalog temporarily unavailable</h1><p>Please try again shortly.</p><a href=\"/\">Return home</a></main></body></html>", { "Retry-After": "60" });
    }
};
