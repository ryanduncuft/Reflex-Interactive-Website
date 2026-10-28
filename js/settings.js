/* Lightweight, persistent accessibility and performance settings. */
(() => {
    "use strict";

    const STORAGE_KEY = "reflex.settings.v1";
    const defaults = {
        reducedMotion: Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
        dataSaver: false,
    };
    let settings = { ...defaults };
    let initialized = false;
    let lastTrigger = null;

    const read = () => {
        try {
            const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
            return {
                reducedMotion: typeof stored.reducedMotion === "boolean" ? stored.reducedMotion : defaults.reducedMotion,
                dataSaver: typeof stored.dataSaver === "boolean" ? stored.dataSaver : defaults.dataSaver,
            };
        } catch {
            return { ...defaults };
        }
    };

    const persist = () => {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage can be unavailable in private contexts. */ }
    };

    const applyMediaPolicy = (root = document) => {
        root.querySelectorAll?.("video, iframe").forEach((media) => {
            if (media.matches("video")) {
                if (settings.dataSaver) {
                    if (!media.paused) media.pause();
                    media.dataset.settingsPaused = "true";
                }
            } else if (settings.dataSaver) {
                if (media.getAttribute("src") && !media.dataset.settingsSrc) media.dataset.settingsSrc = media.getAttribute("src");
                if (media.hasAttribute("src")) media.removeAttribute("src");
            } else if (media.dataset.settingsSrc) {
                media.setAttribute("src", media.dataset.settingsSrc);
                delete media.dataset.settingsSrc;
            }
        });
    };

    const apply = () => {
        const root = document.documentElement;
        root.dataset.motion = settings.reducedMotion ? "reduced" : "full";
        root.dataset.dataSaver = String(settings.dataSaver);
        document.querySelectorAll("[data-setting]").forEach((input) => {
            input.checked = Boolean(settings[input.dataset.setting]);
        });
        applyMediaPolicy();
        document.dispatchEvent(new CustomEvent("reflex:settings-change", { detail: { ...settings } }));
    };

    const render = () => {
        if (document.getElementById("settings-dialog")) return;
        const dialog = document.createElement("dialog");
        dialog.id = "settings-dialog";
        dialog.className = "settings-dialog";
        dialog.setAttribute("aria-labelledby", "settings-title");
        dialog.innerHTML = `
            <div class="settings-panel">
                <div class="settings-heading">
                    <div><p class="settings-eyebrow">Reflex Interactive</p><h2 id="settings-title">Settings</h2></div>
                    <button class="settings-close" type="button" data-settings-close aria-label="Close settings">&times;</button>
                </div>
                <div class="settings-options">
                    <label class="settings-option" for="setting-reduced-motion">
                        <span><strong>Reduced motion</strong><small>Limit animation and smooth scrolling.</small></span>
                        <input id="setting-reduced-motion" type="checkbox" data-setting="reducedMotion">
                    </label>
                    <label class="settings-option" for="setting-data-saver">
                        <span><strong>Data saver</strong><small>Pause video and reduce visual effects.</small></span>
                        <input id="setting-data-saver" type="checkbox" data-setting="dataSaver">
                    </label>
                </div>
                <p class="settings-note">Your preferences are saved on this device.</p>
            </div>`;
        document.body.appendChild(dialog);
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) close(dialog);
        });
        dialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            close(dialog);
        });
        dialog.addEventListener("change", (event) => {
            const input = event.target.closest("[data-setting]");
            if (!input) return;
            settings[input.dataset.setting] = input.checked;
            persist();
            apply();
        });
    };

    const close = (dialog) => {
        if (!dialog?.open) return;
        dialog.classList.add("is-closing");
        window.setTimeout(() => {
            if (dialog.open) dialog.close();
            dialog.classList.remove("is-closing");
            if (lastTrigger?.isConnected) lastTrigger.focus();
        }, settings.reducedMotion ? 0 : 140);
    };

    const open = (trigger) => {
        const dialog = document.getElementById("settings-dialog");
        if (!dialog || dialog.open) return;
        lastTrigger = trigger;
        dialog.showModal();
        dialog.classList.remove("is-closing");
        dialog.querySelector("input")?.focus({ preventScroll: true });
    };

    const init = () => {
        if (initialized) return;
        initialized = true;
        settings = read();
        render();
        apply();
        document.addEventListener("click", (event) => {
            const trigger = event.target.closest("[data-settings-open]");
            if (trigger) open(trigger);
            if (event.target.closest("[data-settings-close]")) close(document.getElementById("settings-dialog"));
        });
        if ("MutationObserver" in window) {
            const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) applyMediaPolicy(node.matches("video, iframe") ? node.parentElement || document : node);
                });
            }));
            observer.observe(document.body, { childList: true, subtree: true });
        }
    };

    window.ReflexSettings = Object.freeze({ init });
})();
