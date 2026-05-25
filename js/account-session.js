import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    browserLocalPersistence,
    getAuth,
    onAuthStateChanged,
    setPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const config = window.REFLEX_FIREBASE_CONFIG;

const isConfigured = () => Boolean(config?.apiKey && config?.authDomain && config?.projectId);

const isLocal = () => {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "" || host.endsWith(".local");
};

const accountHref = () => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = isLocal()
        ? new URL("/account.html", window.location.origin)
        : new URL("https://account.reflexinteractive.com/");

    if (!window.location.pathname.includes("account")) {
        target.searchParams.set("return", returnTo);
    }

    return target.toString();
};

const updateLinks = (user = null) => {
    document.querySelectorAll("[data-account-link]").forEach((link) => {
        link.href = accountHref();
        link.textContent = user ? "Dashboard" : "Account";
        link.setAttribute("aria-label", user ? "Open your Reflex account dashboard" : "Sign in to your Reflex account");
    });
};

const init = async () => {
    updateLinks();
    document.addEventListener("reflex:components-ready", () => updateLinks(window.reflexAccountUser || null));

    if (!isConfigured()) return;

    try {
        const app = getApps().length ? getApps()[0] : initializeApp(config);
        const auth = getAuth(app);
        await setPersistence(auth, browserLocalPersistence);
        onAuthStateChanged(auth, (user) => {
            window.reflexAccountUser = user;
            updateLinks(user);
        });
    } catch (error) {
        console.warn("[AccountSession] Account status unavailable", error);
    }
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}
