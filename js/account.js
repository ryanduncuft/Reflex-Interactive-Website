import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    createUserWithEmailAndPassword,
    getAuth,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    getDatabase,
    onValue,
    ref,
    set,
    update,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = window.REFLEX_FIREBASE_CONFIG;
const GAMES_URL = "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json";
const DOWNLOADS_BASE_URL = "https://downloads.reflexinteractive.com";
const SITE_URL = "https://reflexinteractive.com";

if (!firebaseConfig?.apiKey || !firebaseConfig?.databaseURL || !firebaseConfig?.projectId) {
    throw new Error("Missing Reflex Firebase web config. Create js/firebase-config.js from js/firebase-config.example.js.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const state = {
    mode: "signin",
    libraryUnsubscribe: null,
    gamesCatalog: null,
};

const el = {
    form: document.getElementById("account-auth-form"),
    signInMode: document.getElementById("account-mode-signin"),
    signUpMode: document.getElementById("account-mode-signup"),
    displayWrap: document.getElementById("account-display-wrap"),
    displayName: document.getElementById("account-display-name"),
    email: document.getElementById("account-email"),
    password: document.getElementById("account-password"),
    submit: document.getElementById("account-submit"),
    message: document.getElementById("account-auth-message"),
    reset: document.getElementById("account-reset-password"),
    summary: document.getElementById("account-profile-summary"),
    library: document.getElementById("account-library"),
    signOut: document.getElementById("account-signout"),
    authColumn: document.getElementById("account-auth-column"),
    dashboardColumn: document.getElementById("account-dashboard-column"),
    dashboard: document.getElementById("account-dashboard"),
    signedOutPanel: document.getElementById("account-signed-out-panel"),
    welcome: document.getElementById("account-welcome"),
    sessionState: document.getElementById("account-session-state"),
    profileForm: document.getElementById("account-profile-form"),
    settingsDisplayName: document.getElementById("account-settings-display-name"),
    settingsEmail: document.getElementById("account-settings-email"),
    profileMessage: document.getElementById("account-profile-message"),
    securityReset: document.getElementById("account-security-reset"),
    securitySignOut: document.getElementById("account-security-signout"),
    securityMessage: document.getElementById("account-security-message"),
    sessionEmail: document.getElementById("account-session-email"),
    libraryCount: document.getElementById("account-library-count"),
    idShort: document.getElementById("account-id-short"),
    lastSync: document.getElementById("account-last-sync"),
};

const setMessage = (message, type = "muted") => {
    if (!el.message) return;
    el.message.textContent = message;
    el.message.className = `small fw-bold text-${type}`;
};

const setPanelMessage = (node, message, type = "muted") => {
    if (!node) return;
    node.textContent = message;
    node.className = `small fw-bold text-${type}`;
};

const setBusy = (busy) => {
    el.submit.disabled = busy;
    el.reset.disabled = busy;
    el.submit.textContent = busy ? "Working..." : state.mode === "signup" ? "Create Account" : "Sign In";
};

const setMode = (mode) => {
    state.mode = mode;
    const isSignup = mode === "signup";
    el.displayWrap.classList.toggle("d-none", !isSignup);
    el.submit.textContent = isSignup ? "Create Account" : "Sign In";
    el.signInMode.className = isSignup ? "btn btn-outline-light flex-fill" : "btn btn-danger flex-fill";
    el.signUpMode.className = isSignup ? "btn btn-danger flex-fill" : "btn btn-outline-light flex-fill";
    setMessage("");
};

const friendlyError = (error) => {
    switch (error.code) {
        case "auth/email-already-in-use": return "That email address is already registered.";
        case "auth/invalid-email": return "Enter a valid email address.";
        case "auth/invalid-credential": return "The email or password is incorrect.";
        case "auth/operation-not-allowed": return "Email/password sign-in is not enabled in Firebase.";
        case "auth/weak-password": return "Password must be at least 6 characters.";
        default: return error.message || "Account request failed.";
    }
};

const ensureProfile = async (user) => {
    const profileRef = ref(db, `users/${user.uid}/profile`);
    const now = new Date().toISOString();
    await set(profileRef, {
        localId: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        createdAtUtc: now,
        lastLoginAtUtc: now,
    });
};

const createProfile = async (user) => {
    const profileRef = ref(db, `users/${user.uid}/profile`);
    const now = new Date().toISOString();
    await set(profileRef, {
        localId: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        createdAtUtc: now,
        lastLoginAtUtc: now,
    });
};

const safeKey = (value = "") => String(value || "game").replace(/[.#$/[\]]/g, "_");

const ownedGameKey = (game = {}) => {
    const stableId = game.numeric_id || game.id;
    const prefix = game.numeric_id || /^\d+$/.test(String(stableId)) ? "game" : "slug";
    return safeKey(`${prefix}_${stableId}`);
};

const formatDate = (value = "") => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently added";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const localHref = (path) => {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        const url = new URL(path, window.location.origin);
        if (url.pathname === "/game-details") return `/game-details.html${url.search}`;
        if (url.pathname === "/games") return "/games.html";
    }
    return path.startsWith("http") ? path : `${SITE_URL}${path}`;
};

const protectedDownloadUrl = (key = "", filename = "", game = {}) => {
    const url = new URL(`${DOWNLOADS_BASE_URL.replace(/\/$/, "")}/download`);
    url.searchParams.set("key", key);
    url.searchParams.set("gameId", String(game.numeric_id || game.id || ""));
    if (filename) url.searchParams.set("filename", filename);
    return url.toString();
};

const gameDownloadInfo = (game = {}, runtime = "win-x64") => {
    const platformDownload = game.downloads?.[runtime] || game.downloads?.windows || game.downloads?.win64;
    const platformFile = Array.isArray(platformDownload?.files) ? platformDownload.files[0] : null;
    const protectedKey = platformFile?.key || platformDownload?.key || platformDownload?.r2_key || platformDownload?.r2Key;
    const explicit = platformFile?.url || platformDownload?.zip_url || platformDownload?.url || game.zip_url || game.download_url;

    if (protectedKey) {
        return {
            url: protectedDownloadUrl(protectedKey, platformFile?.name || platformDownload?.filename || "", game),
            protected: true,
        };
    }
    if (explicit) return { url: explicit, protected: false };
    return { url: "", protected: false };
};

const authenticatedDownloadUrl = async (url, user) => {
    const token = await user.getIdToken();
    const downloadUrl = new URL(url, window.location.origin);
    downloadUrl.searchParams.set("token", token);
    return downloadUrl.toString();
};

const loadGamesCatalog = async () => {
    if (state.gamesCatalog) return state.gamesCatalog;

    try {
        const response = await fetch(GAMES_URL, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.gamesCatalog = await response.json();
    } catch (error) {
        console.warn("[Account] Game catalog unavailable", error);
        state.gamesCatalog = [];
    }

    return state.gamesCatalog;
};

const resolveCatalogGame = (owned = {}, catalog = []) => {
    const numericId = String(owned.numeric_id || "").trim();
    if (numericId) {
        const match = catalog.find((game) => String(game.numeric_id || "") === numericId);
        if (match) return match;
    }

    const ids = [owned.current_id, owned.catalog_id, owned.slug, owned.id]
        .filter(Boolean)
        .map((value) => String(value));
    const idMatch = catalog.find((game) => ids.includes(String(game.id)));
    if (idMatch) return idMatch;

    const title = String(owned.title || "").trim().toLowerCase();
    if (!title) return null;
    return catalog.find((game) => String(game.title || "").trim().toLowerCase() === title) || null;
};

const catalogGameForOwned = (owned = {}, catalog = []) => {
    const byNumeric = catalog.find((game) => String(game.numeric_id || "") === String(owned.id || owned.numeric_id || ""));
    return byNumeric || resolveCatalogGame(owned, catalog);
};

const normalizeOwnedGame = (owned = {}, catalogGame = null) => {
    const ownedId = String(owned.id || "");
    const numericId = String(catalogGame?.numeric_id || owned.numeric_id || (/^\d+$/.test(ownedId) ? ownedId : ""));
    const currentId = String(catalogGame?.id || owned.current_id || owned.catalog_id || owned.slug || (numericId ? "" : ownedId));
    const addedAtUtc = owned.addedAtUtc || owned.acquiredAtUtc || new Date().toISOString();

    return {
        id: String(numericId || ownedId || currentId),
        title: catalogGame?.title || owned.title || currentId || "Untitled Game",
        addedAtUtc,
    };
};

const migrateOwnedGames = async (user, games = {}, catalog = []) => {
    const updates = {};
    const normalized = new Map();

    Object.entries(games).forEach(([key, owned]) => {
        const catalogGame = resolveCatalogGame(owned, catalog);
        const game = normalizeOwnedGame(owned, catalogGame);
        const nextKey = ownedGameKey(game);
        normalized.set(nextKey, game);

        const changed = key !== nextKey
            || String(owned.id || "") !== game.id
            || String(owned.title || "") !== game.title
            || String(owned.addedAtUtc || "") !== game.addedAtUtc;

        if (!changed) return;
        updates[nextKey] = game;
        if (key !== nextKey) updates[key] = null;
    });

    if (Object.keys(updates).length) {
        await update(ref(db, `users/${user.uid}/ownedGames`), updates);
    }

    return Array.from(normalized.values());
};

const libraryMeta = (game = {}) => {
    return `#${game.id}`;
};

const renderLibraryItem = (owned = {}, catalog = []) => {
    const catalogGame = catalogGameForOwned(owned, catalog);
    const title = catalogGame?.title || owned.title || "Untitled Game";
    const slug = catalogGame?.id || owned.current_id || "";
    const detailsHref = slug ? localHref(`/game-details?id=${encodeURIComponent(slug)}`) : localHref("/games");
    const download = catalogGame ? gameDownloadInfo(catalogGame) : { url: "" };
    const canDownload = Number(catalogGame?.price || 0) === 0 && Boolean(download.url);

    return `
        <div class="account-library-item">
            <div>
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(libraryMeta(owned))} · Added ${escapeHtml(formatDate(owned.addedAtUtc))}</span>
            </div>
            <div class="account-library-actions">
                <a class="btn btn-outline-light btn-sm text-uppercase fw-bold" href="${detailsHref}">Details</a>
                ${canDownload ? `<a class="btn btn-danger btn-sm text-uppercase fw-bold" href="#" data-secure-download="${escapeHtml(download.url)}" download>Download</a>` : '<button class="btn btn-outline-light btn-sm text-uppercase fw-bold" type="button" disabled>Locked</button>'}
            </div>
        </div>
    `;
};

const renderSignedOut = () => {
    el.summary.textContent = "Not signed in.";
    el.library.textContent = "Sign in to view your owned games.";
    el.welcome.textContent = "Sign in to manage your profile, security, and game library.";
    el.sessionState.textContent = "Signed out";
    el.sessionState.classList.remove("is-online");
    el.sessionEmail.textContent = "No active session.";
    el.libraryCount.textContent = "0";
    el.idShort.textContent = "-";
    el.lastSync.textContent = "-";
    el.dashboard?.classList.add("d-none");
    el.signedOutPanel?.classList.remove("d-none");
    el.authColumn?.classList.remove("d-none");
    el.dashboardColumn?.classList.remove("col-xl-12");
    el.dashboardColumn?.classList.add("col-xl-8");
    el.signOut.disabled = true;
    if (state.libraryUnsubscribe) {
        state.libraryUnsubscribe();
        state.libraryUnsubscribe = null;
    }
};

const renderSignedIn = (user) => {
    const displayName = user.displayName || "Reflex Player";
    el.summary.textContent = `${displayName} · ${user.email}`;
    el.welcome.textContent = `Welcome back, ${displayName}.`;
    el.sessionState.textContent = "Signed in";
    el.sessionState.classList.add("is-online");
    el.sessionEmail.textContent = user.email || "Signed in";
    el.settingsDisplayName.value = user.displayName || "";
    el.settingsEmail.value = user.email || "";
    el.idShort.textContent = user.uid.slice(0, 8);
    el.lastSync.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    el.dashboard?.classList.remove("d-none");
    el.signedOutPanel?.classList.add("d-none");
    el.authColumn?.classList.add("d-none");
    el.dashboardColumn?.classList.remove("col-xl-8");
    el.dashboardColumn?.classList.add("col-xl-12");
    el.signOut.disabled = false;

    if (state.libraryUnsubscribe) state.libraryUnsubscribe();
    state.libraryUnsubscribe = onValue(ref(db, `users/${user.uid}/ownedGames`), async (snapshot) => {
        const games = snapshot.val();
        const catalog = await loadGamesCatalog();
        const list = games ? await migrateOwnedGames(user, games, catalog) : [];
        el.libraryCount.textContent = String(list.length);
        el.lastSync.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        if (!list.length) {
            el.library.innerHTML = `<div class="account-library-item"><div><strong>No owned games yet</strong><span>Free games you claim will appear here.</span></div><div class="account-library-actions"><a class="btn btn-danger btn-sm text-uppercase fw-bold" href="${localHref("/games")}">Browse</a></div></div>`;
            return;
        }

        el.library.innerHTML = list
            .sort((a, b) => String(a.title).localeCompare(String(b.title)))
            .map((game) => renderLibraryItem(game, catalog))
            .join("");
    });
};

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
}[char]));

el.signInMode?.addEventListener("click", () => setMode("signin"));
el.signUpMode?.addEventListener("click", () => setMode("signup"));

el.form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(state.mode === "signup" ? "Creating account..." : "Signing in...", "muted");

    try {
        const email = el.email.value.trim();
        const password = el.password.value;

        if (state.mode === "signup") {
            const displayName = el.displayName.value.trim();
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            if (displayName) await updateProfile(credential.user, { displayName });
            await createProfile(credential.user);
            setMessage("Account created. Your Reflex library is ready.", "success");
        } else {
            const credential = await signInWithEmailAndPassword(auth, email, password);
            await ensureProfile(credential.user);
            setMessage("Signed in. Your library is synced.", "success");
        }

        el.password.value = "";
    } catch (error) {
        setMessage(friendlyError(error), "danger");
    } finally {
        setBusy(false);
    }
});

el.reset?.addEventListener("click", async () => {
    const email = el.email.value.trim();
    if (!email) {
        setMessage("Enter your email first.", "danger");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        setMessage("Password reset email sent.", "success");
    } catch (error) {
        setMessage(friendlyError(error), "danger");
    }
});

el.profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const displayName = el.settingsDisplayName.value.trim();
    setPanelMessage(el.profileMessage, "Saving...", "muted");

    try {
        await updateProfile(user, { displayName });
        await ensureProfile(auth.currentUser);
        setPanelMessage(el.profileMessage, "Profile updated.", "success");
        renderSignedIn(auth.currentUser);
    } catch (error) {
        setPanelMessage(el.profileMessage, friendlyError(error), "danger");
    }
});

el.securityReset?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user?.email) return;

    setPanelMessage(el.securityMessage, "Sending password reset...", "muted");
    try {
        await sendPasswordResetEmail(auth, user.email);
        setPanelMessage(el.securityMessage, "Password reset email sent.", "success");
    } catch (error) {
        setPanelMessage(el.securityMessage, friendlyError(error), "danger");
    }
});

const signOutCurrentUser = () => signOut(auth);

el.signOut?.addEventListener("click", signOutCurrentUser);
el.securitySignOut?.addEventListener("click", signOutCurrentUser);

el.library?.addEventListener("click", async (event) => {
    const link = event.target.closest("[data-secure-download]");
    if (!link) return;

    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
        setMessage("Sign in again before downloading.", "danger");
        return;
    }

    const originalLabel = link.textContent;
    link.textContent = "Preparing...";
    link.classList.add("disabled");

    try {
        window.location.href = await authenticatedDownloadUrl(link.dataset.secureDownload, user);
    } catch (error) {
        console.warn("[Account] Could not prepare secure download", error);
        setMessage("Could not prepare the download. Please sign in again.", "danger");
        link.textContent = originalLabel;
        link.classList.remove("disabled");
    }
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        renderSignedOut();
        return;
    }

    await ensureProfile(user);
    renderSignedIn(user);
});

setMode("signin");
renderSignedOut();
