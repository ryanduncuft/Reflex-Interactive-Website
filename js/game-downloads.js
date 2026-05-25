import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    browserLocalPersistence,
    createUserWithEmailAndPassword,
    getAuth,
    onAuthStateChanged,
    sendEmailVerification,
    setPersistence,
    signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    getDatabase,
    get,
    onValue,
    ref,
    set,
    update,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = window.REFLEX_FIREBASE_CONFIG;
const cta = document.getElementById("purchase-download-btn");

if (!cta) {
    throw new Error("Game download button is missing.");
}

const state = {
    auth: null,
    db: null,
    game: null,
    owned: false,
    ownershipLoaded: false,
    ownershipUnsubscribe: null,
    user: null,
    busy: false,
    ready: Boolean(firebaseConfig?.apiKey && firebaseConfig?.databaseURL && firebaseConfig?.projectId),
};

const safeKey = (value = "") => String(value || "game").replace(/[.#$/[\]]/g, "_");

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

const localeCountry = () => {
    const locale = navigator.languages?.[0] || navigator.language || "en-GB";
    const region = locale.split("-")[1];
    return region ? region.toUpperCase() : "GB";
};

const currencyForCountry = (country = "GB") => CURRENCY_BY_COUNTRY[String(country).toUpperCase()] || "GBP";

const accountActionUrl = () => {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return `${window.location.origin}/account.html?action=verified`;
    }

    return "https://account.reflexinteractive.com/?action=verified";
};

const verificationActionSettings = () => ({
    url: accountActionUrl(),
    handleCodeInApp: false,
});

const ensureStatusNode = () => {
    let node = document.getElementById("game-download-status");
    if (node) return node;

    node = document.createElement("p");
    node.id = "game-download-status";
    node.className = "game-download-status small fw-bold text-muted mb-0 mt-3";
    node.setAttribute("role", "status");
    cta.insertAdjacentElement("afterend", node);
    return node;
};

const setStatus = (message, type = "muted") => {
    const nodes = [
        ensureStatusNode(),
        document.getElementById("download-auth-status"),
    ].filter(Boolean);

    nodes.forEach((node) => {
        node.textContent = message;
        node.className = node.id === "game-download-status"
            ? `game-download-status small fw-bold text-${type} mb-0 mt-3`
            : `small fw-bold text-${type} mb-0`;
    });
};

const gameFromButton = () => ({
    id: cta.dataset.gameId || "",
    numeric_id: cta.dataset.gameNumericId || "",
    title: cta.dataset.gameTitle || "Game",
    price: parseFloat(cta.dataset.gamePrice) || 0,
    download_url: cta.dataset.downloadUrl || "",
    download_name: cta.dataset.downloadName || "",
    exe_name: cta.getAttribute("download") || "",
});

const authenticatedDownloadUrl = async (url) => {
    const token = await state.user.getIdToken();
    const downloadUrl = new URL(url, window.location.origin);
    downloadUrl.searchParams.set("token", token);
    return downloadUrl.toString();
};

const ownedGameKey = (game = {}) => {
    const stableId = game.numeric_id || game.id;
    const prefix = game.numeric_id ? "game" : "slug";
    return safeKey(`${prefix}_${stableId}`);
};

const setCta = ({ label, href = "#", enabled = false, download = "" }) => {
    cta.textContent = label;
    cta.href = href;
    cta.classList.toggle("opacity-50", !enabled);
    cta.classList.toggle("cursor-not-allowed", !enabled);
    cta.setAttribute("aria-disabled", String(!enabled));

    if (download) cta.setAttribute("download", download);
    else cta.removeAttribute("download");
};

const ensureAuthPanel = () => {
    let panel = document.getElementById("download-auth-panel");
    if (panel) return panel;

    panel = document.createElement("form");
    panel.id = "download-auth-panel";
    panel.className = "download-auth-panel d-none mt-3";
    panel.innerHTML = `
        <label class="form-label small fw-bold text-muted" for="download-auth-email">Email Address</label>
        <input type="email" class="form-control bg-dark text-white border-secondary mb-2" id="download-auth-email" autocomplete="email" required>
        <label class="form-label small fw-bold text-muted" for="download-auth-password">Password</label>
        <input type="password" class="form-control bg-dark text-white border-secondary mb-3" id="download-auth-password" autocomplete="current-password" required>
        <div class="d-grid gap-2">
            <button type="submit" class="btn btn-danger fw-bold">Sign In</button>
            <button type="button" class="btn btn-outline-light fw-bold" id="download-auth-create">Create Account</button>
        </div>
        <p id="download-auth-status" class="small fw-bold text-muted mb-0" role="status"></p>
    `;
    cta.insertAdjacentElement("afterend", panel);

    panel.addEventListener("submit", async (event) => {
        event.preventDefault();
        await submitAuth("signin");
    });

    panel.querySelector("#download-auth-create")?.addEventListener("click", async () => {
        await submitAuth("signup");
    });

    return panel;
};

const setPanelOpen = (open) => {
    const panel = document.getElementById("download-auth-panel") || (open ? ensureAuthPanel() : null);
    if (!panel) return;
    panel.classList.toggle("d-none", !open);
    if (open) panel.querySelector("input")?.focus();
};

const submitAuth = async (mode) => {
    const panel = ensureAuthPanel();
    const buttons = Array.from(panel.querySelectorAll("button"));
    const email = panel.querySelector("#download-auth-email")?.value.trim();
    const password = panel.querySelector("#download-auth-password")?.value || "";

    if (!email || !password) {
        setStatus("Enter your email and password first.", "danger");
        return;
    }

    buttons.forEach((button) => {
        button.disabled = true;
    });
    setStatus(mode === "signup" ? "Creating account..." : "Signing in...");

    try {
        const credential = mode === "signup"
            ? await createUserWithEmailAndPassword(state.auth, email, password)
            : await signInWithEmailAndPassword(state.auth, email, password);
        await ensureProfile(credential.user, mode === "signup");
        if (mode === "signup") await sendEmailVerification(credential.user, verificationActionSettings());

        panel.querySelector("#download-auth-password").value = "";
        setStatus(mode === "signup" ? "Account created. Check your email to verify before downloading." : "Signed in. Checking your library.", mode === "signup" ? "muted" : "success");
        setPanelOpen(false);
    } catch (error) {
        setStatus(friendlyError(error), "danger");
    } finally {
        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
};

const friendlyError = (error) => {
    switch (error.code) {
        case "auth/email-already-in-use": return "That email address is already registered. Sign in instead.";
        case "auth/invalid-email": return "Enter a valid email address.";
        case "auth/invalid-credential": return "The email or password is incorrect.";
        case "auth/operation-not-allowed": return "Email/password sign-in is not enabled in Firebase.";
        case "auth/weak-password": return "Password must be at least 6 characters.";
        default: return error.message || "Account request failed.";
    }
};

const friendlyDatabaseError = (error) => {
    if (error.code === "PERMISSION_DENIED" || /permission/i.test(error.message || "")) {
        return `Firebase blocked the library update (${error.code || "permission denied"}: ${error.message || "no details"}).`;
    }

    return error.message || "Could not update your library.";
};

const ownedRecordMatchesGame = (record = {}, game = {}) => {
    const numericId = String(game.numeric_id || "");
    const currentId = String(game.id || "");

    if (numericId && String(record.numeric_id || record.id || "") === numericId) return true;
    if (currentId && [record.current_id, record.catalog_id, record.slug, record.id].map(String).includes(currentId)) return true;

    return false;
};

const syncOwnership = () => {
    if (state.ownershipUnsubscribe) {
        state.ownershipUnsubscribe();
        state.ownershipUnsubscribe = null;
    }

    state.owned = false;
    state.ownershipLoaded = false;

    if (!state.user || !state.db || !state.game) {
        state.ownershipLoaded = true;
        renderDownloadState();
        return;
    }

    state.ownershipUnsubscribe = onValue(ref(state.db, `users/${state.user.uid}/ownedGames`), (snapshot) => {
        const games = snapshot.val() || {};
        state.owned = Object.values(games).some((record) => ownedRecordMatchesGame(record, state.game));
        state.ownershipLoaded = true;
        renderDownloadState();
    }, (error) => {
        console.warn("[Downloads] Could not read library", error);
        state.owned = false;
        state.ownershipLoaded = true;
        renderDownloadState();
    });
};

const claimGame = async () => {
    if (!state.user || !state.db || (!state.game?.numeric_id && !state.game?.id)) return;

    const stableId = state.game.numeric_id || state.game.id;
    const gameKey = ownedGameKey(state.game);
    const now = new Date().toISOString();
    await update(ref(state.db, `users/${state.user.uid}/ownedGames/${gameKey}`), {
        id: String(stableId),
        numeric_id: String(state.game.numeric_id || ""),
        current_id: String(state.game.id || ""),
        title: state.game.title,
        type: state.game.price > 0 ? "paid" : "free",
        addedAtUtc: now,
        acquiredAtUtc: now,
    });
};

const createCheckoutRequest = async () => {
    if (!state.user || !state.db || !state.game?.id) return;

    const now = new Date().toISOString();
    const requestId = safeKey(`${Date.now()}_${state.game.numeric_id || state.game.id}`);
    const profileSnapshot = await get(ref(state.db, `users/${state.user.uid}/paymentProfile`));
    const profile = profileSnapshot.val() || {};
    const country = profile.country || localeCountry();
    const currency = profile.currency || currencyForCountry(country);

    await set(ref(state.db, `users/${state.user.uid}/checkoutRequests/${requestId}`), {
        id: requestId,
        gameId: String(state.game.id || ""),
        numeric_id: String(state.game.numeric_id || ""),
        title: String(state.game.title || "Game").slice(0, 120),
        provider: "stripe",
        country: String(country).slice(0, 2).toUpperCase(),
        currency,
        savePaymentMethod: Boolean(profile.savePaymentMethod),
        status: "requested",
        returnUrl: `${window.location.pathname}${window.location.search}`,
        createdAtUtc: now,
    });
};

const ensureProfile = async (user) => {
    if (!user || !state.db) return;

    const now = new Date().toISOString();
    const profileRef = ref(state.db, `users/${user.uid}/profile`);
    const snapshot = await get(profileRef);
    const existing = snapshot.val() || {};
    const profile = {
        localId: user.uid,
        email: user.email || existing.email || "",
        displayName: user.displayName || existing.displayName || "",
        createdAtUtc: existing.createdAtUtc || now,
        lastLoginAtUtc: now,
    };

    await set(profileRef, profile);
};

const renderDownloadState = () => {
    const game = state.game || gameFromButton();
    state.game = game;

    if (game.price > 0) {
        if (!state.ready) {
            setCta({ label: "Purchase Unavailable" });
            setStatus("Account sign-in is not configured for this page.", "danger");
            return;
        }

        if (!state.user) {
            setCta({ label: "Sign In To Purchase", enabled: true });
            ensureAuthPanel();
            setStatus("");
            return;
        }

        if (!state.user.emailVerified) {
            setCta({ label: "Verify Email", enabled: true });
            setStatus("Verify your email before starting a purchase.", "muted");
            setPanelOpen(false);
            return;
        }

        setCta({ label: state.busy ? "Creating Request..." : "Request Purchase", enabled: !state.busy });
        setStatus("Payment provider is not connected yet. This creates a checkout request for later processing.", "muted");
        return;
    }

    if (!state.ready) {
        setCta({ label: "Sign In Unavailable" });
        setStatus("Account sign-in is not configured for this page.", "danger");
        return;
    }

    if (!state.user) {
        setCta({ label: "Sign In To Get", enabled: true });
        ensureAuthPanel();
        setStatus("");
        return;
    }

    if (!state.user.emailVerified) {
        setCta({ label: "Verify Email", enabled: true });
        setStatus("Verify your email before claiming or downloading this game.", "muted");
        setPanelOpen(false);
        return;
    }

    if (!state.ownershipLoaded) {
        setCta({ label: "Checking Library..." });
        return;
    }

    if (!state.owned) {
        setCta({ label: state.busy ? "Adding..." : "Get Free Game", enabled: !state.busy });
        return;
    }

    if (!game.download_url) {
        setCta({ label: "Download Coming Soon" });
        setPanelOpen(false);
        return;
    }

    setCta({
        label: "Download",
        href: "#",
        enabled: true,
        download: game.download_name || game.exe_name || "",
    });
    setStatus(`${game.title} is in your library.`, "success");
    setPanelOpen(false);
};

document.addEventListener("reflex:game-detail-ready", (event) => {
    state.game = event.detail?.game || gameFromButton();
    syncOwnership();
    renderDownloadState();
});

cta.addEventListener("click", async (event) => {
    const game = state.game || gameFromButton();

    if (game.price > 0) {
        event.preventDefault();
        if (!state.ready) {
            setStatus("Account sign-in is not configured for this page.", "danger");
            return;
        }

        if (!state.user) {
            setPanelOpen(true);
            setStatus(`Sign in to purchase ${game.title}.`);
            return;
        }

        if (!state.user.emailVerified) {
            setStatus("Sending verification email...");
            try {
                await sendEmailVerification(state.user, verificationActionSettings());
                setStatus("Verification email sent. Refresh this page after verifying.", "success");
            } catch (error) {
                setStatus(friendlyError(error), "danger");
            }
            return;
        }

        state.busy = true;
        renderDownloadState();
        try {
            await createCheckoutRequest();
            state.busy = false;
            renderDownloadState();
            setStatus("Purchase request saved. Connect a payment provider to turn this into checkout.", "success");
        } catch (error) {
            console.warn("[Downloads] Could not create checkout request", error);
            state.busy = false;
            renderDownloadState();
            setStatus("Firebase rules need checkoutRequests write access before purchases can start.", "danger");
        }
        return;
    }

    if (!state.ready) {
        event.preventDefault();
        setPanelOpen(true);
        setStatus("Account sign-in is not configured for this page.", "danger");
        return;
    }

    if (!state.user) {
        event.preventDefault();
        setPanelOpen(true);
        setStatus(`Sign in to get ${game.title}.`);
        return;
    }

    if (!state.user.emailVerified) {
        event.preventDefault();
        setStatus("Sending verification email...");
        try {
                await sendEmailVerification(state.user, verificationActionSettings());
            setStatus("Verification email sent. Refresh this page after verifying.", "success");
        } catch (error) {
            setStatus(friendlyError(error), "danger");
        }
        return;
    }

    if (!state.ownershipLoaded) {
        event.preventDefault();
        return;
    }

    if (state.busy) {
        event.preventDefault();
        return;
    }

    if (!state.owned) {
        event.preventDefault();
        state.busy = true;
        renderDownloadState();
        try {
            await claimGame();
            state.owned = true;
            setStatus(`${game.title} has been added to your library.`, "success");
        } catch (error) {
            console.warn("[Downloads] Could not add game to library", error);
            setStatus(friendlyDatabaseError(error), "danger");
        } finally {
            state.busy = false;
            renderDownloadState();
        }
        return;
    }

    if (!game.download_url) {
        event.preventDefault();
        return;
    }

    event.preventDefault();
    setStatus("Preparing secure download...");

    try {
        window.location.href = await authenticatedDownloadUrl(game.download_url);
    } catch (error) {
        console.warn("[Downloads] Could not prepare secure download", error);
        setStatus("Could not prepare the download. Please sign in again.", "danger");
    }
});

if (state.ready) {
    const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    state.auth = getAuth(firebaseApp);
    state.db = getDatabase(firebaseApp);
    setPersistence(state.auth, browserLocalPersistence).catch((error) => {
        console.warn("[Downloads] Could not set auth persistence", error);
    });

    onAuthStateChanged(state.auth, (user) => {
        state.user = user;
        syncOwnership();
    });
} else {
    renderDownloadState();
}
