const PAYPAL_BASE_URLS = {
    live: "https://api-m.paypal.com",
    sandbox: "https://api-m.sandbox.paypal.com",
};

const paypalBaseUrl = () => PAYPAL_BASE_URLS[process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"];

const readJson = async (response) => {
    const text = await response.text();
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return { message: text.slice(0, 240) };
    }
};

const paypalAccessToken = async () => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("PayPal credentials are not configured");
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });

    const payload = await readJson(response);
    if (!response.ok || !payload.access_token) {
        throw new Error(payload.error_description || "Could not authenticate with PayPal");
    }

    return payload.access_token;
};

const paypalRequest = async (path, options = {}) => {
    const token = await paypalAccessToken();
    const response = await fetch(`${paypalBaseUrl()}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    const payload = await readJson(response);
    if (!response.ok) {
        throw new Error(payload.message || payload.error_description || "PayPal request failed");
    }

    return payload;
};

module.exports = {
    paypalAccessToken,
    paypalBaseUrl,
    paypalRequest,
};
