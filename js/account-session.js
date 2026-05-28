import { accountHref, isFirebaseConfigured, watchAccountState } from "./firebase-client.js";

const updateLinks = (user = null) => {
    document.querySelectorAll("[data-account-link]").forEach((link) => {
        link.href = accountHref();
        link.textContent = user ? "Dashboard" : "Account";
        link.setAttribute("aria-label", user ? "Open your Reflex account dashboard" : "Sign in to your Reflex account");
    });
};

const init = async () => {
    updateLinks(window.reflexAccountUser || null);
    document.addEventListener("reflex:components-ready", () => updateLinks(window.reflexAccountUser || null));
    document.addEventListener("reflex:account-user-changed", (event) => updateLinks(event.detail?.user || null));

    if (!isFirebaseConfigured()) return;

    try {
        await watchAccountState(updateLinks);
    } catch (error) {
        console.warn("[AccountSession] Account status unavailable", error);
    }
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}
