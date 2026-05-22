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
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = window.REFLEX_FIREBASE_CONFIG;

if (!firebaseConfig?.apiKey || !firebaseConfig?.databaseURL || !firebaseConfig?.projectId) {
    throw new Error("Missing Reflex Firebase web config. Create js/firebase-config.js from js/firebase-config.example.js.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const state = {
    mode: "signin",
    libraryUnsubscribe: null,
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
};

const setMessage = (message, type = "muted") => {
    if (!el.message) return;
    el.message.textContent = message;
    el.message.className = `small fw-bold text-${type}`;
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

const renderSignedOut = () => {
    el.summary.textContent = "Not signed in.";
    el.library.textContent = "Sign in to view your owned games.";
    el.signOut.disabled = true;
    if (state.libraryUnsubscribe) {
        state.libraryUnsubscribe();
        state.libraryUnsubscribe = null;
    }
};

const renderSignedIn = (user) => {
    el.summary.textContent = `${user.displayName || "Reflex Player"} · ${user.email}`;
    el.signOut.disabled = false;

    if (state.libraryUnsubscribe) state.libraryUnsubscribe();
    state.libraryUnsubscribe = onValue(ref(db, `users/${user.uid}/ownedGames`), (snapshot) => {
        const games = snapshot.val();
        const list = games ? Object.values(games) : [];
        if (!list.length) {
            el.library.textContent = "No owned games yet.";
            return;
        }

        el.library.innerHTML = list
            .sort((a, b) => String(a.title).localeCompare(String(b.title)))
            .map((game) => `<div class="account-library-item"><strong>${escapeHtml(game.title)}</strong><span>${escapeHtml(game.id)}</span></div>`)
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

el.signOut?.addEventListener("click", () => signOut(auth));

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
