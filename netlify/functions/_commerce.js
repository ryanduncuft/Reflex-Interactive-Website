const GAMES_URL = "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json";

const CURRENCY_BY_COUNTRY = {
    AU: "AUD",
    CA: "CAD",
    DE: "EUR",
    FR: "EUR",
    GB: "GBP",
    IE: "EUR",
    NL: "EUR",
    US: "USD",
};

const json = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(body),
});

const redirect = (location) => ({
    statusCode: 302,
    headers: {
        Location: location,
        "Cache-Control": "no-store",
    },
    body: "",
});

const safeKey = (value = "") => String(value || "game").replace(/[.#$/[\]]/g, "_");

const safeReturnPath = (value = "") => {
    if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
    return value.slice(0, 240);
};

const loadGame = async (id = "") => {
    const response = await fetch(GAMES_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Game catalog unavailable: HTTP ${response.status}`);
    const games = await response.json();
    return games.find((game) => String(game.id) === String(id) || String(game.numeric_id || "") === String(id));
};

const resolvePrice = (game = {}, requestedCurrency = "GBP") => {
    const currency = String(requestedCurrency || "GBP").toUpperCase();
    const explicit = game.prices?.[currency] || game.prices?.[currency.toLowerCase()];

    if (explicit) {
        return {
            currency,
            amount: Number(explicit),
        };
    }

    return {
        currency: "GBP",
        amount: Number(game.price || 0),
    };
};

const amountToMinorUnits = (value = 0) => Math.round(Number(value || 0) * 100);

const captureMatchesOrder = (capture = {}, order = {}) => {
    const amount = capture.amount || {};
    const currency = String(amount.currency_code || "").toUpperCase();
    const capturedMinor = amountToMinorUnits(amount.value);
    return currency === String(order.currency || "").toUpperCase() &&
        capturedMinor === Number(order.amountTotal || 0);
};

const activeBanForGame = (bans = {}, game = {}) => {
    const now = Date.now();
    return Object.values(bans || {}).find((ban) => {
        const ids = [ban.gameId, ban.numeric_id, ban.current_id].filter(Boolean).map(String);
        const matches = ids.includes(String(game.id)) || ids.includes(String(game.numeric_id || ""));
        if (!matches || ban.status !== "active") return false;
        const expiresAt = Date.parse(ban.expiresAtUtc || "");
        return Number.isNaN(expiresAt) || expiresAt > now;
    });
};

const ownedKeyForGame = (game = {}) => safeKey(`${game.numeric_id ? "game" : "slug"}_${game.numeric_id || game.id}`);

const fulfillPaidGame = async ({ admin, uid, paymentId, provider, status, gameId, numericId, title, amountTotal, currency }) => {
    const ownedKey = safeKey(`${numericId ? "game" : "slug"}_${numericId || gameId}`);
    const now = new Date().toISOString();
    const paymentSnapshot = await admin.database().ref(`users/${uid}/payments/${paymentId}`).get();
    if (paymentSnapshot.exists()) return;

    const updates = {};
    updates[`users/${uid}/payments/${paymentId}`] = {
        id: paymentId,
        provider,
        status,
        gameId,
        numeric_id: numericId || "",
        title,
        amountTotal,
        currency,
        createdAtUtc: now,
        updatedAtUtc: now,
    };
    updates[`users/${uid}/ownedGames/${ownedKey}`] = {
        id: String(numericId || gameId),
        numeric_id: String(numericId || ""),
        current_id: String(gameId || ""),
        title,
        type: "paid",
        addedAtUtc: now,
        acquiredAtUtc: now,
    };

    await admin.database().ref().update(updates);
};

module.exports = {
    CURRENCY_BY_COUNTRY,
    activeBanForGame,
    captureMatchesOrder,
    fulfillPaidGame,
    json,
    loadGame,
    ownedKeyForGame,
    redirect,
    resolvePrice,
    safeReturnPath,
};
