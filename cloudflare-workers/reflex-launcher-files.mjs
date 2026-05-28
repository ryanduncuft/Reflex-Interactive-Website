const ALLOWED_ORIGINS = new Set([
    "https://reflexinteractive.com",
    "https://www.reflexinteractive.com",
    "https://account.reflexinteractive.com",
]);

const ALLOWED_KEYS = new Set([
    "launcher-files/version.json",
    "launcher-files/Reflex Interactive Launcher.msi",
]);

const APP_FILE_PREFIX = "launcher-files/app/";

const safeCorsOrigin = (request) => {
    const origin = request.headers.get("Origin") || "";
    return ALLOWED_ORIGINS.has(origin) ? origin : "https://reflexinteractive.com";
};

const corsHeaders = (request) => ({
    "Access-Control-Allow-Origin": safeCorsOrigin(request),
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
});

const textResponse = (request, body, status = 200) => new Response(body, {
    status,
    headers: {
        ...corsHeaders(request),
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
    },
});

const contentTypeForKey = (key) => {
    if (key.endsWith(".json")) return "application/json; charset=utf-8";
    if (key.endsWith(".msi")) return "application/x-msi";
    if (key.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
    if (key.endsWith(".dll")) return "application/octet-stream";
    return "application/octet-stream";
};

const isAllowedKey = (key) => {
    if (ALLOWED_KEYS.has(key)) return true;
    if (!key.startsWith(APP_FILE_PREFIX)) return false;
    if (key.includes("..") || key.includes("\\") || key.endsWith("/")) return false;
    return true;
};

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders(request) });
        }

        if (!["GET", "HEAD"].includes(request.method)) {
            return textResponse(request, "Method not allowed", 405);
        }

        const url = new URL(request.url);
        if (!url.pathname.startsWith("/launcher-files/")) {
            return textResponse(request, "Not found", 404);
        }

        const key = decodeURIComponent(url.pathname.slice(1));
        if (!isAllowedKey(key)) {
            return textResponse(request, "Not found", 404);
        }

        const object = await env.GAME_BUCKET.get(key);
        if (!object) {
            return textResponse(request, "File not found", 404);
        }

        const headers = new Headers(corsHeaders(request));
        object.writeHttpMetadata(headers);
        headers.set("Content-Type", contentTypeForKey(key));
        headers.set("Cache-Control", key.endsWith(".json") ? "public, max-age=60, must-revalidate" : "public, max-age=300, must-revalidate");
        headers.set("ETag", object.httpEtag);
        headers.set("X-Content-Type-Options", "nosniff");

        if (key.endsWith(".msi")) {
            headers.set("Content-Disposition", 'attachment; filename="Reflex Interactive Launcher.msi"');
        }

        return new Response(request.method === "HEAD" ? null : object.body, { headers });
    },
};
