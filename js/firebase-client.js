import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    browserLocalPersistence,
    getAuth,
    onAuthStateChanged,
    setPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const SITE_CONFIG = window.REFLEX_SITE_CONFIG || {};
const FIREBASE_CONFIG = window.REFLEX_FIREBASE_CONFIG || {};
const REQUIRED_FIREBASE_FIELDS = ["apiKey", "authDomain", "databaseURL", "projectId"];

let clientPromise = null;

export const isFirebaseConfigured = () =>
    REQUIRED_FIREBASE_FIELDS.every((field) => Boolean(FIREBASE_CONFIG[field]));

export const isLocalHost = () => {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "" || host.endsWith(".local");
};

export const isAccountPage = () =>
    window.location.pathname.includes("account") || window.location.hostname.startsWith("account.");

export const accountHref = () => {
    const localAccount = SITE_CONFIG.routes?.accountLocal || "/account.html";
    const accountRoute = SITE_CONFIG.routes?.account || "/account";
    const siteUrl = SITE_CONFIG.urls?.site || window.location.origin;
    const target = isLocalHost()
        ? new URL(localAccount, window.location.origin)
        : new URL(accountRoute, siteUrl);

    if (!isAccountPage()) {
        target.searchParams.set("return", `${window.location.pathname}${window.location.search}${window.location.hash}`);
    }

    return target.toString();
};

export const getFirebaseClient = async () => {
    if (!isFirebaseConfigured()) {
        throw new Error("Account services are not configured.");
    }

    if (!clientPromise) {
        clientPromise = (async () => {
            const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
            const auth = getAuth(app);
            await setPersistence(auth, browserLocalPersistence);
            return {
                app,
                auth,
                db: getDatabase(app),
            };
        })();
    }

    return clientPromise;
};

export const watchAccountState = async (callback) => {
    if (!isFirebaseConfigured()) {
        window.reflexAccountUser = null;
        callback(null);
        return () => {};
    }

    const { auth } = await getFirebaseClient();
    return onAuthStateChanged(auth, (user) => {
        window.reflexAccountUser = user;
        document.dispatchEvent(new CustomEvent("reflex:account-user-changed", { detail: { user } }));
        callback(user);
    });
};
