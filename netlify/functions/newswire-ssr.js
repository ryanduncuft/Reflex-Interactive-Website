"use strict";

const SITE_URL = "https://reflexinteractive.com";
const NEWS_URL = "https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json";
const FALLBACK_IMAGE = "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532765/Reflex_Interactive_f3zylo.png";
const CACHE_MS = 5 * 60 * 1000;

let newsCache;

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

const safeJson = value => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const safeImage = value => {
    try {
        const image = new URL(value || FALLBACK_IMAGE);
        return image.protocol === "https:" ? image.href : FALLBACK_IMAGE;
    } catch {
        return FALLBACK_IMAGE;
    }
};

const articleText = article => {
    const content = Array.isArray(article.content) ? article.content : [article.content || article.summary || ""];
    return content.map(block => {
        if (typeof block === "string") return block;
        if (Array.isArray(block?.items)) return block.items.join("\n");
        return block?.text || block?.heading || "";
    }).join("\n\n").trim();
};

const contentHtml = article => articleText(article).split(/\n{2,}/).filter(Boolean)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");

const getArticles = async () => {
    if (newsCache && newsCache.expires > Date.now()) return newsCache.articles;
    const response = await fetch(NEWS_URL, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(`Newswire feed returned HTTP ${response.status}`);
    const payload = await response.json();
    const articles = Array.isArray(payload) ? payload : payload.articles || payload.news || payload.posts || [];
    if (!Array.isArray(articles)) throw new Error("Newswire feed has an invalid format");
    newsCache = { articles, expires: Date.now() + CACHE_MS };
    return articles;
};

const pageShell = ({ title, description, canonical, image, body, schema, noindex = false }) => `<!doctype html>
<html lang="en-GB"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description.slice(0, 160))}">
    <meta name="robots" content="${noindex ? "noindex,follow" : "index,follow,max-image-preview:large"}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="${schema["@type"] === "NewsArticle" ? "article" : "website"}">
    <meta property="og:site_name" content="Reflex Interactive"><meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description.slice(0, 160))}">
    <meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description.slice(0, 160))}">
    <meta name="twitter:image" content="${escapeHtml(image)}">
    <link rel="icon" href="https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.ico">
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700;800&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="/css/styles.css"><script type="application/ld+json">${safeJson(schema)}</script>
</head><body class="bg-black text-white overflow-x-hidden" data-ssr-page="true">
    <div id="navbar"></div><main id="main-content" class="container pt-4 pt-md-5 flex-grow-1 w-100">${body}</main>
    <div id="footer"></div><script src="/js/site-config.js"></script><script src="/js/navigation.js" defer></script>
    <script src="/js/stripe.js" defer></script><script src="/js/settings.js" defer></script><script src="/js/core.js" defer></script>
</body></html>`;

const archivePage = articles => {
    const sorted = [...articles].sort((left, right) => Date.parse(right.date || "") - Date.parse(left.date || ""));
    const cards = sorted.map(article => {
        const id = encodeURIComponent(String(article.id || ""));
        const title = article.title || "Newswire update";
        const description = article.summary || article.description || articleText(article).slice(0, 180);
        const image = safeImage(article.image_url || article.image);
        const date = article.date || "";
        return `<article class="card modern-card news-card h-100"><a href="/newswire-details?id=${id}" class="d-flex h-100 flex-column">
            <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" width="720" height="405" class="modern-card-img" loading="lazy" decoding="async">
            <div class="card-body d-flex flex-column"><time class="modern-card-date" datetime="${escapeHtml(date)}">${escapeHtml(date)}</time>
                <h2 class="modern-card-title">${escapeHtml(title)}</h2><p class="text-muted">${escapeHtml(description)}</p>
                <span class="modern-card-cta mt-auto">Read more &gt;</span></div></a></article>`;
    }).join("");
    const description = "Studio updates, release notes, development news, and announcements from Reflex Interactive.";
    const body = `<section class="page-hero py-5" aria-labelledby="newswire-heading"><header class="page-intro mx-auto mb-5 text-center">
        <p class="section-kicker">Newswire</p><h1 id="newswire-heading" class="display-3 fw-bold">Latest News</h1>
        <p class="fs-5 text-muted">${description}</p></header>
        <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">${cards || '<p>No newswire posts are available right now.</p>'}</div></section>`;
    const schema = { "@context": "https://schema.org", "@type": "Blog", name: "Reflex Interactive Newswire", url: `${SITE_URL}/newswire` };
    return pageShell({ title: "Newswire | Reflex Interactive", description, canonical: `${SITE_URL}/newswire`, image: FALLBACK_IMAGE, body, schema });
};

const detailPage = article => {
    const title = `${article.title || "Newswire Article"} | Reflex Interactive`;
    const description = String(article.summary || article.description || articleText(article) || title).replace(/\s+/g, " ").trim();
    const canonical = `${SITE_URL}/newswire-details?id=${encodeURIComponent(String(article.id))}`;
    const image = safeImage(article.image_url || article.image);
    const body = `<article class="news-detail"><img src="${escapeHtml(image)}" alt="${escapeHtml(article.title || "Newswire article artwork")}" class="news-detail-background" aria-hidden="true" loading="eager">
        <div class="container py-4"><a href="/newswire" class="detail-back-link">&larr; Back to Newswire</a></div>
        <header class="news-detail-header mx-auto py-5"><p class="section-kicker text-danger">Newswire</p>
        <time class="news-detail-date text-muted" datetime="${escapeHtml(article.date || "")}">${escapeHtml(article.date || "")}</time>
        <h1 class="display-3 fw-bold">${escapeHtml(article.title || "Newswire Article")}</h1></header>
        <div class="news-detail-body mx-auto pb-5">${contentHtml(article)}</div></article>`;
    const schema = {
        "@context": "https://schema.org", "@type": "NewsArticle", mainEntityOfPage: canonical,
        headline: article.title || "Newswire Article", description: description.slice(0, 300), image: [image],
        ...(article.date ? { datePublished: article.date, dateModified: article.date } : {}),
        inLanguage: "en-GB", author: { "@type": "Organization", name: "Reflex Interactive" },
        publisher: { "@type": "Organization", name: "Reflex Interactive", logo: { "@type": "ImageObject", url: "https://res.cloudinary.com/dvju1xiaw/image/upload/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png" } },
    };
    return pageShell({ title, description, canonical, image, body, schema });
};

const response = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": statusCode === 200 ? "public, max-age=0, s-maxage=300, stale-while-revalidate=600" : "no-store",
        "X-Content-Type-Options": "nosniff",
    },
    body,
});

exports.handler = async event => {
    if (event.httpMethod !== "GET") return response(405, "Method not allowed");
    try {
        const articles = await getArticles();
        const id = event.queryStringParameters?.id;
        if (!id) return response(200, archivePage(articles));
        const article = articles.find(item => String(item.id) === String(id));
        if (!article) return response(404, pageShell({
            title: "Article Not Found | Reflex Interactive", description: "This Newswire article could not be found.",
            canonical: `${SITE_URL}/newswire`, image: FALLBACK_IMAGE,
            body: '<section class="container text-center py-5"><h1>Article not found</h1><a href="/newswire">Return to Newswire</a></section>',
            schema: { "@context": "https://schema.org", "@type": "WebPage" }, noindex: true,
        }));
        return response(200, detailPage(article));
    } catch (error) {
        console.error("Newswire SSR request failed", error);
        return response(503, '<!doctype html><html lang="en"><head><title>Newswire temporarily unavailable | Reflex Interactive</title><meta name="robots" content="noindex"></head><body><main><h1>Newswire temporarily unavailable</h1><p>Please try again shortly.</p><a href="/">Return home</a></main></body></html>');
    }
};
