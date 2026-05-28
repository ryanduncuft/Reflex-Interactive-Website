const GAMES_URL = "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json";

const json = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(body),
});

const safeKey = (value = "") => String(value || "game").replace(/[.#$/[\]]/g, "_");

const loadGame = async (id = "") => {
    const response = await fetch(GAMES_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Game catalog unavailable: HTTP ${response.status}`);
    const games = await response.json();
    return games.find((game) => String(game.id) === String(id) || String(game.numeric_id || "") === String(id));
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

module.exports = {
    activeBanForGame,
    json,
    loadGame,
    ownedKeyForGame,
};
