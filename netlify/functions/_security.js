const DEFAULT_TRUSTED_ORIGINS = [
    "https://reflexinteractive.com",
    "https://www.reflexinteractive.com",
    "https://account.reflexinteractive.com",
];

const trustedOrigins = () => {
    const configured = (process.env.TRUSTED_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    return new Set([...DEFAULT_TRUSTED_ORIGINS, ...configured]);
};

const header = (headers = {}, name = "") => {
    const lower = name.toLowerCase();
    const key = Object.keys(headers).find((item) => item.toLowerCase() === lower);
    return key ? headers[key] : "";
};

const requestOrigin = (event) => {
    const origin = header(event.headers, "origin");
    if (origin) return origin;

    const referer = header(event.headers, "referer");
    if (!referer) return "";

    try {
        const url = new URL(referer);
        return url.origin;
    } catch {
        return "";
    }
};

const assertTrustedOrigin = (event) => {
    const origin = requestOrigin(event);
    if (!origin || trustedOrigins().has(origin)) return;
    throw new Error("Untrusted request origin");
};

const parseJsonBody = (event, maxBytes = 4096) => {
    const body = event.body || "";
    const byteLength = Buffer.byteLength(body, event.isBase64Encoded ? "base64" : "utf8");
    if (byteLength > maxBytes) {
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        throw error;
    }

    try {
        return JSON.parse(event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body || "{}");
    } catch {
        const error = new Error("Invalid JSON");
        error.statusCode = 400;
        throw error;
    }
};

module.exports = {
    assertTrustedOrigin,
    header,
    parseJsonBody,
};
