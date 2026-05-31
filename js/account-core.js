const SITE_CONFIG = window.REFLEX_SITE_CONFIG || {};

const DOWNLOADS_BASE_URL = SITE_CONFIG.urls?.downloads || "https://downloads.reflexinteractive.com";
const DEFAULT_RUNTIME = SITE_CONFIG.launcherRuntime || "win-x64";

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

export const gameHasDownload = (game = {}, runtime = DEFAULT_RUNTIME) => {
    const platformDownload = game.downloads?.[runtime] || game.downloads?.windows || game.downloads?.win64 || {};
    const flags = [
        game.hasDownload,
        game.has_download,
        game["has-download"],
        game.downloadAvailable,
        game.download_available,
        game["download-available"],
        platformDownload.hasDownload,
        platformDownload.has_download,
        platformDownload["has-download"],
        platformDownload.available,
        platformDownload.isAvailable,
        platformDownload.is_available,
    ];

    return !flags.some((value) => value === false || String(value).toLowerCase() === "false");
};

export const protectedDownloadUrl = (key = "", filename = "", game = {}) => {
    const url = new URL(`${DOWNLOADS_BASE_URL.replace(/\/$/, "")}/download`);
    url.searchParams.set("key", key);
    url.searchParams.set("gameId", String(game.numeric_id || game.id || ""));
    if (filename) url.searchParams.set("filename", filename);
    return url.toString();
};

export const gameDownloadInfo = (game = {}, runtime = DEFAULT_RUNTIME) => {
    if (!gameHasDownload(game, runtime)) {
        return {
            url: "",
            filename: "",
            available: false,
            message: "This game is in your library. The download will unlock when the release files are ready.",
        };
    }

    const platformDownload = game.downloads?.[runtime] || game.downloads?.windows || game.downloads?.win64;
    const platformFile = Array.isArray(platformDownload?.files) ? platformDownload.files[0] : null;
    const protectedKey = platformFile?.key
        || platformDownload?.key
        || platformDownload?.r2_key
        || platformDownload?.r2Key
        || game.download_key
        || game.downloadKey;

    const filename = platformFile?.name
        || platformDownload?.filename
        || game.download_name
        || "";

    if (protectedKey) {
        return {
            url: protectedDownloadUrl(protectedKey, filename, game),
            filename,
            available: true,
            protected: true,
            message: "",
        };
    }

    const explicit = platformFile?.url
        || platformDownload?.zip_url
        || platformDownload?.zipUrl
        || platformDownload?.archive_url
        || platformDownload?.archiveUrl
        || platformDownload?.url
        || game.zip_url
        || game.zipUrl
        || game.archive_url
        || game.archiveUrl
        || game.download_url
        || game.downloadUrl
        || game.installer_url
        || game.installerUrl;

    if (explicit) {
        return {
            url: explicit,
            filename: filename || downloadFilename(explicit),
            available: true,
            protected: false,
            message: "",
        };
    }

    return {
        url: "",
        filename: "",
        available: true,
        protected: false,
        message: "Download files are not configured yet.",
    };
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

const downloadFilename = (url = "", fallback = "game.zip") => {
    try {
        const path = new URL(url, window.location.origin).pathname;
        return decodeURIComponent(path.split("/").filter(Boolean).pop() || fallback);
    } catch {
        return fallback;
    }
};
