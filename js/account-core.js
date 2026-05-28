const SITE_CONFIG = window.REFLEX_SITE_CONFIG || {};

export const CURRENCY_BY_COUNTRY = {
    AU: "AUD",
    CA: "CAD",
    DE: "EUR",
    FR: "EUR",
    GB: "GBP",
    IE: "EUR",
    NL: "EUR",
    US: "USD",
};

export const currencyForCountry = (country = SITE_CONFIG.defaultCountry || "GB") =>
    CURRENCY_BY_COUNTRY[String(country).toUpperCase()] || SITE_CONFIG.defaultCurrency || "GBP";

export const safeKey = (value = "") => String(value || "game").replace(/[.#$/[\]]/g, "_");

export const ownedGameKey = (game = {}) => {
    const stableId = game.numeric_id || game.id;
    const prefix = game.numeric_id || /^\d+$/.test(String(stableId)) ? "game" : "slug";
    return safeKey(`${prefix}_${stableId}`);
};

export const accountActionUrl = () => {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return `${window.location.origin}/account.html?action=verified`;
    }

    return `${(SITE_CONFIG.urls?.account || "https://reflexinteractive.com/account").replace(/\/$/, "")}?action=verified`;
};

export const verificationActionSettings = () => ({
    url: accountActionUrl(),
    handleCodeInApp: false,
});

export const buildProfilePayload = (user, existing = {}) => {
    const now = new Date().toISOString();
    return {
        localId: user.uid,
        email: user.email || existing.email || "",
        displayName: user.displayName || existing.displayName || "",
        createdAtUtc: existing.createdAtUtc || now,
        lastLoginAtUtc: now,
    };
};

export const authenticatedDownloadUrl = async (url, user) => {
    const token = await user.getIdToken();
    const downloadUrl = new URL(url, window.location.origin);
    downloadUrl.searchParams.set("token", token);
    return downloadUrl.toString();
};

export const ownedRecordMatchesGame = (record = {}, game = {}) => {
    const numericId = String(game.numeric_id || "");
    const currentId = String(game.id || "");

    if (numericId && String(record.numeric_id || record.id || "") === numericId) return true;
    if (currentId && [record.current_id, record.catalog_id, record.slug, record.id].map(String).includes(currentId)) return true;

    return false;
};

const banRecordMatchesGame = (record = {}, game = {}) => {
    const numericId = String(game.numeric_id || "");
    const currentId = String(game.id || "");
    const ids = [record.gameId, record.numeric_id, record.current_id].filter(Boolean).map(String);
    return (numericId && ids.includes(numericId)) || (currentId && ids.includes(currentId));
};

export const activeBanForGame = (records = {}, game = {}) => {
    const now = Date.now();
    return Object.values(records || {}).find((record) => {
        if (record.status !== "active" || !banRecordMatchesGame(record, game)) return false;
        const expiresAt = Date.parse(record.expiresAtUtc || "");
        return Number.isNaN(expiresAt) || expiresAt > now;
    }) || null;
};
