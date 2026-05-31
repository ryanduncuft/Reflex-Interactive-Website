const ALLOWED_ORIGINS = new Set([
    "https://reflexinteractive.com",
    "https://www.reflexinteractive.com",
    "https://account.reflexinteractive.com",
]);

const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const GAME_KEY_PREFIX = "game-files/";

const safeCorsOrigin = (request) => {
    const origin = request.headers.get("Origin") || "";
    return ALLOWED_ORIGINS.has(origin) ? origin : "https://reflexinteractive.com";
};

const corsHeaders = (request) => ({
    "Access-Control-Allow-Origin": safeCorsOrigin(request),
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
});

const textResponse = (request, body, status = 200) => new Response(body, {
    status,
    headers: {
        ...corsHeaders(request),
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    },
});

const fail = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
};

const base64UrlToBytes = (value = "") => {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

const decodeJwtSegment = (value = "") => {
    const bytes = base64UrlToBytes(value);
    return JSON.parse(new TextDecoder().decode(bytes));
};

const loadFirebaseJwk = async (kid, env, ctx) => {
    const cache = caches.default;
    const request = new Request(FIREBASE_JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
    let response = await cache.match(request);

    if (!response) {
        response = await fetch(request);
        if (!response.ok) fail(503, "Could not load token keys");
        ctx.waitUntil(cache.put(request, response.clone()));
    }

    const payload = await response.json();
    const key = (payload.keys || []).find((item) => item.kid === kid);
    if (!key) fail(401, "Invalid account token");
    return key;
};

const verifyFirebaseToken = async (token, env, ctx) => {
    const projectId = env.FIREBASE_PROJECT_ID;
    if (!projectId) fail(500, "Firebase project is not configured");

    const parts = token.split(".");
    if (parts.length !== 3) fail(401, "Missing account token");

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = decodeJwtSegment(encodedHeader);
    const payload = decodeJwtSegment(encodedPayload);

    if (header.alg !== "RS256" || !header.kid) fail(401, "Invalid account token");
    if (payload.aud !== projectId) fail(401, "Invalid account token");
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) fail(401, "Invalid account token");
    if (!payload.sub || String(payload.sub).length > 128) fail(401, "Invalid account token");

    const now = Math.floor(Date.now() / 1000);
    if (Number(payload.exp || 0) <= now) fail(401, "Account token expired");
    if (Number(payload.iat || 0) > now + 300) fail(401, "Invalid account token");
    if (payload.email_verified !== true) fail(403, "Verify your email before downloading");

    const jwk = await loadFirebaseJwk(header.kid, env, ctx);
    const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
    );

    const verified = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        base64UrlToBytes(encodedSignature),
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );

    if (!verified) fail(401, "Invalid account token");
    return payload;
};

const ownedRecordMatchesGame = (record = {}, gameId = "") => {
    const expected = String(gameId || "");
    return [
        record.id,
        record.numeric_id,
        record.current_id,
        record.catalog_id,
        record.slug,
    ].filter(Boolean).map(String).includes(expected);
};

const assertUserOwnsGame = async (env, token, uid, gameId) => {
    if (!env.FIREBASE_DATABASE_URL) fail(500, "Firebase database is not configured");

    const baseUrl = env.FIREBASE_DATABASE_URL.replace(/\/$/, "");
    const ownedUrl = `${baseUrl}/users/${encodeURIComponent(uid)}/ownedGames.json?auth=${encodeURIComponent(token)}`;
    const response = await fetch(ownedUrl, { headers: { Accept: "application/json" } });

    if (!response.ok) fail(403, "Could not verify library access");

    const ownedGames = await response.json();
    const ownsGame = Object.values(ownedGames || {}).some((record) => ownedRecordMatchesGame(record, gameId));
    if (!ownsGame) fail(403, "This game is not in your library");
};

const safeFilename = (value = "", fallback = "game.zip") => {
    const filename = String(value || fallback).split(/[\\/]/).pop().replace(/["\r\n]/g, "");
    return filename || fallback;
};

const assertSafeGameKey = (key = "") => {
    if (!key.startsWith(GAME_KEY_PREFIX)) fail(400, "Invalid download key");
    if (key.includes("..") || key.includes("\\") || key.endsWith("/")) fail(400, "Invalid download key");
};

export default {
    async fetch(request, env, ctx) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders(request) });
        }

        if (!["GET", "HEAD"].includes(request.method)) {
            return textResponse(request, "Method not allowed", 405);
        }

        try {
            const url = new URL(request.url);
            if (url.pathname !== "/download") {
                return textResponse(request, "Not found", 404);
            }

            const key = url.searchParams.get("key") || "";
            const gameId = url.searchParams.get("gameId") || "";
            const token = url.searchParams.get("token") || "";
            const filename = safeFilename(url.searchParams.get("filename") || "game.zip");

            if (!key || !gameId || !token) fail(400, "Missing download details");
            assertSafeGameKey(key);

            const decoded = await verifyFirebaseToken(token, env, ctx);
            await assertUserOwnsGame(env, token, decoded.sub, gameId);

            const object = await env.GAME_BUCKET.get(key);
            if (!object) {
                return textResponse(request, "File not found", 404);
            }

            const headers = new Headers(corsHeaders(request));
            object.writeHttpMetadata(headers);
            headers.set("Content-Type", object.httpMetadata?.contentType || "application/zip");
            headers.set("Content-Disposition", `attachment; filename="${filename}"`);
            headers.set("Cache-Control", "private, no-store");
            headers.set("ETag", object.httpEtag);
            headers.set("X-Content-Type-Options", "nosniff");

            return new Response(request.method === "HEAD" ? null : object.body, { headers });
        } catch (error) {
            return textResponse(request, error.message || "Download unavailable", error.statusCode || 500);
        }
    },
};
