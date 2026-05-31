import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendEmailVerification,
    signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    get,
    onValue,
    ref,
    set,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {
    activeBanForGame,
    authenticatedDownloadUrl,
    buildProfilePayload,
    gameDownloadInfo,
    gameHasDownload,
    ownedRecordMatchesGame,
    verificationActionSettings,
} from "./account-core.js";
import { getFirebaseClient, isFirebaseConfigured } from "./firebase-client.js";

const SITE_CONFIG = window.REFLEX_SITE_CONFIG || {};
const CLAIM_ENDPOINT = SITE_CONFIG.endpoints?.claimFreeGame || "/.netlify/functions/claim-free-game";
const LAUNCHER_RUNTIME = SITE_CONFIG.launcherRuntime || "win-x64";
const cta = document.getElementById("game-access-btn");

if (!cta) {
    throw new Error("Game download button is missing.");
}

const state = {
    auth: null,
    db: null,
    game: null,
    owned: false,
    ownershipLoaded: false,
    bansLoaded: false,
    ownershipUnsubscribe: null,
    bansUnsubscribe: null,
    ban: null,
    user: null,
    busy: false,
    ready: isFirebaseConfigured(),
};

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

const boolFromDataset = (value = "") => {
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return null;
    return !["0", "false", "no"].includes(normalized);
};

const gameFromButton = () => {
    const downloadFlag = boolFromDataset(cta.dataset.gameHasDownload);
    return {
        id: cta.dataset.gameId || "",
        numeric_id: cta.dataset.gameNumericId || "",
        title: cta.dataset.gameTitle || "Game",
        download_url: cta.dataset.downloadUrl || "",
        download_name: cta.dataset.downloadName || "",
        exe_name: cta.getAttribute("download") || "",
        hasDownload: downloadFlag === null ? true : downloadFlag,
    };
};

const currentDownloadInfo = () => {
    const game = state.game || gameFromButton();
    if (game.download_url && gameHasDownload(game, LAUNCHER_RUNTIME)) {
        return {
            url: game.download_url,
            filename: game.download_name || game.exe_name || "",
            available: true,
            message: "",
        };
    }

    return gameDownloadInfo(game, LAUNCHER_RUNTIME);
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

    if (!state.auth || !state.db) {
        setStatus("Account services are still loading. Try again in a moment.", "muted");
        return;
    }

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
        await ensureProfile(credential.user);
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
        case "auth/network-request-failed": return "Could not reach account services. Check your connection and try again.";
        case "auth/operation-not-allowed": return "Email/password sign-in is not enabled.";
        case "auth/too-many-requests": return "Too many attempts. Wait a moment, then try again.";
        case "auth/unauthorized-domain": return "This account domain is not authorized in Firebase. Add this domain in Firebase Authentication settings.";
        case "auth/weak-password": return "Password must be at least 6 characters.";
        default: return error.message || "Account request failed.";
    }
};

const friendlyDatabaseError = (error) => {
    if (error.code === "PERMISSION_DENIED" || /permission/i.test(error.message || "")) {
        return "Your account library could not be updated. Please sign in again and try once more.";
    }

    return error.message || "Could not update your library.";
};

const syncOwnership = () => {
    if (state.ownershipUnsubscribe) {
        state.ownershipUnsubscribe();
        state.ownershipUnsubscribe = null;
    }
    if (state.bansUnsubscribe) {
        state.bansUnsubscribe();
        state.bansUnsubscribe = null;
    }

    state.owned = false;
    state.ownershipLoaded = false;
    state.bansLoaded = false;
    state.ban = null;

    if (!state.user || !state.db || !state.game) {
        state.ownershipLoaded = true;
        state.bansLoaded = true;
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

    state.bansUnsubscribe = onValue(ref(state.db, `users/${state.user.uid}/gameBans`), (snapshot) => {
        state.ban = activeBanForGame(snapshot.val() || {}, state.game);
        state.bansLoaded = true;
        renderDownloadState();
    }, (error) => {
        console.warn("[Downloads] Could not read game restrictions", error);
        state.ban = null;
        state.bansLoaded = true;
        renderDownloadState();
    });
};

const claimGame = async () => {
    if (!state.user || !state.db || (!state.game?.numeric_id && !state.game?.id)) return;

    const idToken = await state.user.getIdToken();
    const response = await fetch(CLAIM_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            idToken,
            gameId: state.game.id || state.game.numeric_id || "",
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not add this game to your library.");
};

const ensureProfile = async (user) => {
    if (!user || !state.db) return;

    const now = new Date().toISOString();
    const profileRef = ref(state.db, `users/${user.uid}/profile`);
    const snapshot = await get(profileRef);
    const existing = snapshot.val() || {};
    const profile = buildProfilePayload(user, { ...existing, lastLoginAtUtc: now });

    await set(profileRef, profile);
};

const renderDownloadState = () => {
    const game = state.game || gameFromButton();
    state.game = game;

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

    if (!state.bansLoaded) {
        setCta({ label: "Checking Access..." });
        return;
    }

    if (state.ban) {
        setCta({ label: "Access Restricted" });
        setStatus(`This account is restricted from ${game.title}.`, "danger");
        setPanelOpen(false);
        return;
    }

    if (!state.owned) {
        setCta({ label: state.busy ? "Adding..." : "Get Game", enabled: !state.busy });
        setStatus("Free games are added securely to your Reflex account.", "muted");
        return;
    }

    const download = currentDownloadInfo();
    if (!download.url) {
        setCta({ label: download.available === false ? "In Library" : "Download Coming Soon" });
        setStatus(download.message || `${game.title} is in your library. Download files are not ready yet.`, "muted");
        setPanelOpen(false);
        return;
    }

    setCta({
        label: "Download",
        href: "#",
        enabled: true,
        download: download.filename || game.download_name || game.exe_name || "",
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

    if (!state.ownershipLoaded || !state.bansLoaded || state.busy) {
        event.preventDefault();
        return;
    }

    if (state.ban) {
        event.preventDefault();
        setStatus(`This account is restricted from ${game.title}.`, "danger");
        return;
    }

    if (!state.owned) {
        event.preventDefault();
        state.busy = true;
        renderDownloadState();
        try {
            await claimGame();
            state.owned = true;
            const download = currentDownloadInfo();
            setStatus(
                download.url
                    ? `${game.title} has been added to your library.`
                    : download.message || `${game.title} is now in your library. Download files are not ready yet.`,
                "success");
        } catch (error) {
            console.warn("[Downloads] Could not add game to library", error);
            setStatus(friendlyDatabaseError(error), "danger");
        } finally {
            state.busy = false;
            renderDownloadState();
        }
        return;
    }

    const download = currentDownloadInfo();
    if (!download.url) {
        event.preventDefault();
        setStatus(download.message || "Download files are not ready yet.", "muted");
        return;
    }

    event.preventDefault();
    setStatus("Preparing secure download...");

    try {
        window.location.href = await authenticatedDownloadUrl(download.url, state.user);
    } catch (error) {
        console.warn("[Downloads] Could not prepare secure download", error);
        setStatus("Could not prepare the download. Please sign in again.", "danger");
    }
});

const initDownloads = async () => {
    if (!state.ready) {
        renderDownloadState();
        return;
    }

    try {
        const client = await getFirebaseClient();
        state.auth = client.auth;
        state.db = client.db;
        onAuthStateChanged(state.auth, (user) => {
            state.user = user;
            syncOwnership();
        });
    } catch (error) {
        console.warn("[Downloads] Account services unavailable", error);
        state.ready = false;
        renderDownloadState();
    }
};

initDownloads();
