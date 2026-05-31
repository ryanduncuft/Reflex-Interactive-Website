import {
    applyActionCode,
    createUserWithEmailAndPassword,
    reload,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    get,
    onValue,
    ref,
    set,
    update,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {
    authenticatedDownloadUrl,
    buildProfilePayload,
    currencyForCountry,
    ownedGameKey,
    safeKey,
    verificationActionSettings,
} from "./account-core.js";
import { getFirebaseClient, isFirebaseConfigured, watchAccountState } from "./firebase-client.js";

const SITE_CONFIG = window.REFLEX_SITE_CONFIG || {};
const GAMES_URL = SITE_CONFIG.urls?.games || "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json";
const DOWNLOADS_BASE_URL = SITE_CONFIG.urls?.downloads || "https://downloads.reflexinteractive.com";
const SITE_URL = SITE_CONFIG.urls?.site || "https://reflexinteractive.com";
const SITE_LOCALE = SITE_CONFIG.locale || "en-GB";
const DEFAULT_COUNTRY = SITE_CONFIG.defaultCountry || "GB";
const PAYMENT_PROVIDER = SITE_CONFIG.paymentProvider || "PayPal";
const LAUNCHER_RUNTIME = SITE_CONFIG.launcherRuntime || "win-x64";
const PAYPAL_CONFIG = window.REFLEX_PAYPAL_CONFIG || {};
const PURCHASES_DISABLED_MESSAGE = PAYPAL_CONFIG.disabledMessage || "Purchases are paused while checkout is being finalized.";

let auth = null;
let db = null;

const state = {
    mode: "signin",
    libraryUnsubscribe: null,
    paymentUnsubscribe: null,
    gamesCatalog: null,
    returnTo: "",
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
    securityVerify: document.getElementById("account-security-verify"),
    securityRefresh: document.getElementById("account-security-refresh"),
    securityMessage: document.getElementById("account-security-message"),
    sessionEmail: document.getElementById("account-session-email"),
    emailVerified: document.getElementById("account-email-verified"),
    libraryCount: document.getElementById("account-library-count"),
    idShort: document.getElementById("account-id-short"),
    lastSync: document.getElementById("account-last-sync"),
    paymentForm: document.getElementById("account-payment-form"),
    billingEmail: document.getElementById("account-billing-email"),
    billingCountry: document.getElementById("account-billing-country"),
    currency: document.getElementById("account-payment-currency"),
    savePaymentMethod: document.getElementById("account-save-payment-method"),
    paymentMessage: document.getElementById("account-payment-message"),
    paymentStatus: document.getElementById("account-payment-status"),
    paymentProviderLabel: document.getElementById("account-payment-provider-label"),
    orders: document.getElementById("account-orders"),
    restrictions: document.getElementById("account-game-restrictions"),
    continueLink: document.getElementById("account-continue-link"),
    closeConfirm: document.getElementById("account-close-confirm"),
    closeRequest: document.getElementById("account-close-request"),
    closeMessage: document.getElementById("account-close-message"),
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

const safeReturnPath = (value = "") => {
    if (!value || !value.startsWith("/")) return "";
    if (value.startsWith("//")) return "";
    return value.slice(0, 240);
};

state.returnTo = safeReturnPath(new URLSearchParams(window.location.search).get("return") || "");

const cleanActionParams = () => {
    const url = new URL(window.location.href);
    ["mode", "oobCode", "apiKey", "continueUrl", "lang"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};

const setBusy = (busy) => {
    if (el.submit) el.submit.disabled = busy;
    if (el.reset) el.reset.disabled = busy;
    if (el.submit) el.submit.textContent = busy ? "Working..." : state.mode === "signup" ? "Create Account" : "Sign In";
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
        case "auth/operation-not-allowed": return "Email/password sign-in is not enabled.";
        case "auth/weak-password": return "Password must be at least 6 characters.";
        default: return error.message || "Account request failed.";
    }
};

const profilePayload = async (user) => {
    const now = new Date().toISOString();
    const snapshot = await get(ref(db, `users/${user.uid}/profile`));
    const existing = snapshot.val() || {};

    return buildProfilePayload(user, { ...existing, lastLoginAtUtc: now });
};

const ensureProfile = async (user) => {
    const profileRef = ref(db, `users/${user.uid}/profile`);
    await set(profileRef, await profilePayload(user));
};

const createProfile = async (user) => {
    const profileRef = ref(db, `users/${user.uid}/profile`);
    await set(profileRef, await profilePayload(user));
};

const formatDate = (value = "") => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently added";
    return date.toLocaleDateString(SITE_LOCALE, { day: "2-digit", month: "short", year: "numeric" });
};

const formatStatus = (value = "") => {
    const status = String(value || "").trim();
    if (!status) return "Checkout paused";
    if (status === "configured") return "Ready";
    return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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

const gameDownloadInfo = (game = {}, runtime = LAUNCHER_RUNTIME) => {
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
    const type = owned.type === "paid" ? "paid" : "free";

    return {
        id: String(numericId || ownedId || currentId),
        numeric_id: String(numericId || ""),
        current_id: String(currentId || ""),
        title: catalogGame?.title || owned.title || currentId || "Untitled Game",
        type,
        addedAtUtc,
        acquiredAtUtc: owned.acquiredAtUtc || addedAtUtc,
    };
};

const migrateOwnedGames = async (user, games = {}, catalog = []) => {
    const normalized = new Map();

    Object.entries(games).forEach(([key, owned]) => {
        const catalogGame = resolveCatalogGame(owned, catalog);
        const game = normalizeOwnedGame(owned, catalogGame);
        const nextKey = ownedGameKey(game);
        normalized.set(nextKey, game);
    });

    return Array.from(normalized.values());
};

const libraryMeta = (game = {}) => {
    const type = game.type === "paid" ? "Paid" : game.type === "owned" ? "Owned" : "Free";
    return `${type} game`;
};

const renderLibraryItem = (owned = {}, catalog = []) => {
    const catalogGame = catalogGameForOwned(owned, catalog);
    const title = catalogGame?.title || owned.title || "Untitled Game";
    const slug = catalogGame?.id || owned.current_id || "";
    const detailsHref = slug ? localHref(`/game-details?id=${encodeURIComponent(slug)}`) : localHref("/games");
    const download = catalogGame ? gameDownloadInfo(catalogGame) : { url: "" };
    const canDownload = Boolean(download.url);

    return `
        <div class="account-library-item">
            <div>
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(libraryMeta(owned))} · Added ${escapeHtml(formatDate(owned.addedAtUtc))}</span>
            </div>
            <div class="account-library-actions">
                <a class="btn btn-outline-light btn-sm fw-bold" href="${detailsHref}">Details</a>
                ${canDownload ? `<a class="btn btn-danger btn-sm fw-bold" href="#" data-secure-download="${escapeHtml(download.url)}" download>Download</a>` : '<button class="btn btn-outline-light btn-sm fw-bold" type="button" disabled>Unavailable</button>'}
            </div>
        </div>
    `;
};

const renderPaymentProfile = (profile = {}) => {
    if (el.billingEmail) el.billingEmail.value = profile.billingEmail || auth?.currentUser?.email || "";
    const country = profile.country || DEFAULT_COUNTRY;
    const currency = profile.currency || currencyForCountry(country);
    if (el.billingCountry) el.billingCountry.value = country;
    if (el.currency) el.currency.value = currency;
    if (el.savePaymentMethod) el.savePaymentMethod.checked = Boolean(profile.savePaymentMethod);
    if (el.paymentStatus) el.paymentStatus.textContent = formatStatus(profile.status);
    if (el.paymentProviderLabel) el.paymentProviderLabel.textContent = PAYMENT_PROVIDER;
};

const renderOrders = (orders = {}) => {
    if (!el.orders) return;
    const list = Object.entries(orders || {})
        .map(([id, order]) => ({ id, ...order }))
        .sort((a, b) => String(b.createdAtUtc || "").localeCompare(String(a.createdAtUtc || "")));

    if (!list.length) {
        el.orders.innerHTML = `<div class="account-library-item"><div><strong>No orders yet</strong><span>${escapeHtml(PURCHASES_DISABLED_MESSAGE)}</span></div></div>`;
        return;
    }

    el.orders.innerHTML = list.map((order) => `
        <div class="account-library-item">
            <div>
                <strong>${escapeHtml(order.title || order.gameTitle || "Order")}</strong>
                <span>${escapeHtml(order.status || "Pending")} · ${escapeHtml(formatDate(order.createdAtUtc || order.updatedAtUtc))}</span>
            </div>
            <div class="account-library-actions">
                <span class="account-status-pill">${escapeHtml(formatStatus(order.provider || PAYMENT_PROVIDER))}</span>
            </div>
        </div>
    `).join("");
};

const renderRestrictions = (bans = {}) => {
    if (!el.restrictions) return;

    const now = Date.now();
    const active = Object.entries(bans || {})
        .map(([id, ban]) => ({ id, ...ban }))
        .filter((ban) => {
            if (ban.status !== "active") return false;
            const expiresAt = Date.parse(ban.expiresAtUtc || "");
            return Number.isNaN(expiresAt) || expiresAt > now;
        })
        .sort((a, b) => String(a.expiresAtUtc || "").localeCompare(String(b.expiresAtUtc || "")));

    if (!active.length) {
        el.restrictions.innerHTML = '<div class="account-library-item"><div><strong>No active restrictions</strong><span>Your game access is clear.</span></div></div>';
        return;
    }

    el.restrictions.innerHTML = active.map((ban) => `
        <div class="account-library-item">
            <div>
                <strong>${escapeHtml(ban.title || "Restricted game")}</strong>
                <span>Until ${escapeHtml(formatDate(ban.expiresAtUtc))} · ${escapeHtml(ban.reason || "No reason provided")}</span>
            </div>
            <div class="account-library-actions">
                <span class="account-status-pill">Restricted</span>
            </div>
        </div>
    `).join("");
};

const syncPayments = (user) => {
    if (state.paymentUnsubscribe) state.paymentUnsubscribe();
    state.paymentUnsubscribe = onValue(ref(db, `users/${user.uid}`), (snapshot) => {
        const value = snapshot.val() || {};
        renderPaymentProfile(value.paymentProfile || {});
        renderOrders(value.payments || {});
        renderRestrictions(value.gameBans || {});
    }, (error) => {
        console.warn("[Account] Payment profile unavailable", error);
        setPanelMessage(el.paymentMessage, "Payment details are temporarily unavailable.", "danger");
        renderPaymentProfile({});
        renderOrders({});
        renderRestrictions({});
    });
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
    if (el.emailVerified) el.emailVerified.textContent = "-";
    renderPaymentProfile({});
    renderOrders({});
    renderRestrictions({});
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
    if (state.paymentUnsubscribe) {
        state.paymentUnsubscribe();
        state.paymentUnsubscribe = null;
    }
};

const renderSignedIn = (user) => {
    const displayName = user.displayName || "Reflex Player";
    el.summary.textContent = `${displayName} · ${user.email}`;
    el.welcome.textContent = `Welcome back, ${displayName}.`;
    el.sessionState.textContent = "Signed in";
    el.sessionState.classList.add("is-online");
    el.sessionEmail.textContent = user.email || "Signed in";
    if (el.emailVerified) el.emailVerified.textContent = user.emailVerified ? "Verified" : "Verification needed";
    el.settingsDisplayName.value = user.displayName || "";
    el.settingsEmail.value = user.email || "";
    if (el.continueLink) {
        el.continueLink.classList.toggle("d-none", !state.returnTo);
        el.continueLink.href = state.returnTo || "/";
    }
    el.idShort.textContent = user.emailVerified ? "Verified" : "Action needed";
    el.lastSync.textContent = "Ready";
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
        el.lastSync.textContent = "Synced";
        if (!list.length) {
            el.library.innerHTML = `<div class="account-library-item"><div><strong>No owned games yet</strong><span>Free games you claim will appear here.</span></div><div class="account-library-actions"><a class="btn btn-danger btn-sm fw-bold" href="${localHref("/games")}">Browse</a></div></div>`;
            return;
        }

        el.library.innerHTML = list
            .sort((a, b) => String(a.title).localeCompare(String(b.title)))
            .map((game) => renderLibraryItem(game, catalog))
            .join("");
    });

    syncPayments(user);
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
    if (!auth || !db) {
        setMessage("Account services are still loading. Try again in a moment.", "muted");
        return;
    }

    setBusy(true);
    setMessage(state.mode === "signup" ? "Creating account..." : "Signing in...", "muted");

    try {
        const email = el.email.value.trim();
        const password = el.password.value;

        if (state.mode === "signup") {
            const displayName = el.displayName.value.trim().slice(0, 40);
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            if (displayName) await updateProfile(credential.user, { displayName });
            await createProfile(credential.user);
            await sendEmailVerification(credential.user, verificationActionSettings());
            setMessage("Account created. Check your email to verify your account.", "success");
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
    if (!auth) {
        setMessage("Account services are still loading. Try again in a moment.", "muted");
        return;
    }

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

    const displayName = el.settingsDisplayName.value.trim().slice(0, 40);
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

el.securityVerify?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    setPanelMessage(el.securityMessage, "Sending verification email...", "muted");
    try {
        await sendEmailVerification(user, verificationActionSettings());
        setPanelMessage(el.securityMessage, "Verification email sent.", "success");
    } catch (error) {
        setPanelMessage(el.securityMessage, friendlyError(error), "danger");
    }
});

el.securityRefresh?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    setPanelMessage(el.securityMessage, "Refreshing session...", "muted");
    try {
        await reload(user);
        renderSignedIn(auth.currentUser);
        setPanelMessage(el.securityMessage, auth.currentUser.emailVerified ? "Email is verified." : "Email is not verified yet.", auth.currentUser.emailVerified ? "success" : "muted");
    } catch (error) {
        setPanelMessage(el.securityMessage, friendlyError(error), "danger");
    }
});

el.paymentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    const now = new Date().toISOString();
    const country = (el.billingCountry?.value || DEFAULT_COUNTRY).trim().slice(0, 2).toUpperCase();
    const payload = {
        billingEmail: (el.billingEmail?.value || user.email || "").trim().slice(0, 254),
        country,
        currency: currencyForCountry(country),
        provider: PAYMENT_PROVIDER.toLowerCase(),
        savePaymentMethod: Boolean(el.savePaymentMethod?.checked),
        status: "checkout_paused",
        updatedAtUtc: now,
    };

    setPanelMessage(el.paymentMessage, "Saving payment profile...", "muted");
    try {
        await update(ref(db, `users/${user.uid}/paymentProfile`), payload);
        setPanelMessage(el.paymentMessage, "Checkout preferences saved. Purchases are paused for now.", "success");
    } catch (error) {
        console.warn("[Account] Could not save payment profile", error);
        setPanelMessage(el.paymentMessage, "Payment profile could not be saved. Please try again.", "danger");
    }
});

el.billingCountry?.addEventListener("change", () => {
    if (el.currency) el.currency.value = currencyForCountry(el.billingCountry.value);
});

el.closeRequest?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    if (!el.closeConfirm?.checked) {
        setPanelMessage(el.closeMessage, "Confirm that you understand the account closure request first.", "danger");
        return;
    }

    const now = new Date().toISOString();
    const requestId = safeKey(`${Date.now()}_${user.uid.slice(0, 8)}`);
    setPanelMessage(el.closeMessage, "Submitting closure request...", "muted");

    try {
        await set(ref(db, `users/${user.uid}/accountClosureRequests/${requestId}`), {
            id: requestId,
            status: "requested",
            email: user.email || "",
            requestedAtUtc: now,
            reason: "user_requested",
        });
        setPanelMessage(el.closeMessage, "Closure request submitted. You will receive follow-up by email.", "success");
    } catch (error) {
        console.warn("[Account] Could not submit closure request", error);
        setPanelMessage(el.closeMessage, "Account closure request could not be submitted. Please contact support.", "danger");
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

const signOutCurrentUser = () => auth ? signOut(auth) : Promise.resolve();

const handleEmailAction = async () => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const code = params.get("oobCode");

    if (mode !== "verifyEmail" || !code) return;

    setMessage("Verifying your email...", "muted");

    try {
        await applyActionCode(auth, code);
        if (auth.currentUser) await reload(auth.currentUser);
        cleanActionParams();
        setMessage("Email verified. You can now claim free games and download owned games.", "success");
    } catch (error) {
        if (auth.currentUser) {
            await reload(auth.currentUser).catch(() => {});
            if (auth.currentUser.emailVerified) {
                cleanActionParams();
                setMessage("Email is already verified.", "success");
                return;
            }
        }

        console.warn("[Account] Email verification failed", error);
        setMessage("This verification link is invalid or has already been used. Send a new verification email from Security.", "danger");
    }
};

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

setMode("signin");
renderSignedOut();

const initAccount = async () => {
    if (!isFirebaseConfigured()) {
        setMessage("Account services are temporarily unavailable.", "danger");
        return;
    }

    try {
        const client = await getFirebaseClient();
        auth = client.auth;
        db = client.db;
        await handleEmailAction();

        await watchAccountState(async (user) => {
            if (!user) {
                renderSignedOut();
                return;
            }

            await ensureProfile(user);
            renderSignedIn(user);
        });
    } catch (error) {
        console.warn("[Account] Could not initialise account services", error);
        setMessage("Account services are temporarily unavailable.", "danger");
    }
};

initAccount();
