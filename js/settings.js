/* Persistent accessibility and performance preferences. */
(() => {
    "use strict";

    const STORAGE_KEY = "reflex.settings.v1";
    const defaults = Object.freeze({
        reducedMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
        dataSaver: false,
        highContrast: false,
        largerText: false,
    });
    let preferences = { ...defaults };
    let returnFocus = null;
    let initialized = false;

    const persist = () => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
        } catch {
            // Settings still work for this visit if browser storage is unavailable.
        }
    };

    const read = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            return Object.fromEntries(Object.keys(defaults).map(key => [
                key,
                typeof saved[key] === "boolean" ? saved[key] : defaults[key],
            ]));
        } catch {
            return { ...defaults };
        }
    };

    const applyMediaPolicy = (root = document) => {
        root.querySelectorAll?.("video, iframe").forEach(media => {
            if (media.matches("video")) {
                if (preferences.dataSaver && !media.paused) media.pause();
                return;
            }
            if (preferences.dataSaver) {
                if (media.hasAttribute("src") && !media.dataset.settingsSrc) {
                    media.dataset.settingsSrc = media.getAttribute("src");
                }
                media.removeAttribute("src");
            } else if (media.dataset.settingsSrc) {
                media.setAttribute("src", media.dataset.settingsSrc);
                delete media.dataset.settingsSrc;
            }
        });
    };

    const apply = () => {
        const root = document.documentElement;
        root.dataset.motion = preferences.reducedMotion ? "reduced" : "full";
        root.dataset.dataSaver = String(preferences.dataSaver);
        root.dataset.contrast = preferences.highContrast ? "high" : "normal";
        root.dataset.textSize = preferences.largerText ? "large" : "normal";
        document.querySelectorAll("[data-setting]").forEach(input => {
            input.checked = Boolean(preferences[input.dataset.setting]);
        });
        applyMediaPolicy();
        document.dispatchEvent(new CustomEvent("reflex:settings-change", { detail: { ...preferences } }));
    };

    const render = () => {
        if (document.getElementById("settings-dialog")) return;
        const dialog = document.createElement("dialog");
        dialog.id = "settings-dialog";
        dialog.className = "settings-dialog";
        dialog.setAttribute("aria-labelledby", "settings-title");
        dialog.innerHTML = `
            <section class="settings-panel">
                <header class="settings-heading">
                    <div><p class="settings-eyebrow">Reflex Interactive</p><h2 id="settings-title">Settings</h2></div>
                    <button class="settings-close" type="button" data-settings-close aria-label="Close settings">&times;</button>
                </header>
                <div class="settings-options">
                    <label class="settings-option" for="setting-reduced-motion">
                        <span><strong>Reduced motion</strong><small>Limit animation and smooth scrolling.</small></span>
                        <input id="setting-reduced-motion" type="checkbox" data-setting="reducedMotion">
                    </label>
                    <label class="settings-option" for="setting-data-saver">
                        <span><strong>Data saver</strong><small>Pause video and reduce background effects.</small></span>
                        <input id="setting-data-saver" type="checkbox" data-setting="dataSaver">
                    </label>
                    <label class="settings-option" for="setting-high-contrast">
                        <span><strong>High contrast</strong><small>Strengthen text and interface contrast.</small></span>
                        <input id="setting-high-contrast" type="checkbox" data-setting="highContrast">
                    </label>
                    <label class="settings-option" for="setting-larger-text">
                        <span><strong>Larger text</strong><small>Increase the site's default text size.</small></span>
                        <input id="setting-larger-text" type="checkbox" data-setting="largerText">
                    </label>
                </div>
                <footer class="settings-footer">
                    <p class="settings-note">Preferences are saved on this device.</p>
                    <button class="settings-reset" type="button" data-settings-reset>Reset settings</button>
                </footer>
            </section>`;
        document.body.appendChild(dialog);
        dialog.addEventListener("click", event => {
            if (event.target === dialog || event.target.closest("[data-settings-close]")) close();
        });
        dialog.addEventListener("cancel", event => {
            event.preventDefault();
            close();
        });
        dialog.addEventListener("change", event => {
            const input = event.target.closest("[data-setting]");
            if (!input) return;
            preferences[input.dataset.setting] = input.checked;
            persist();
            apply();
        });
        dialog.addEventListener("click", event => {
            if (!event.target.closest("[data-settings-reset]")) return;
            preferences = { ...defaults };
            persist();
            apply();
        });
    };

    const close = () => {
        const dialog = document.getElementById("settings-dialog");
        if (!dialog?.open) return;
        dialog.classList.add("is-closing");
        window.setTimeout(() => {
            if (dialog.open) dialog.close();
            dialog.classList.remove("is-closing");
            if (returnFocus?.isConnected) returnFocus.focus();
        }, preferences.reducedMotion ? 0 : 140);
    };

    const open = trigger => {
        const dialog = document.getElementById("settings-dialog");
        if (!dialog || dialog.open) return;
        returnFocus = trigger;
        dialog.showModal();
        dialog.classList.remove("is-closing");
        dialog.querySelector("input")?.focus({ preventScroll: true });
    };

    const init = () => {
        if (initialized) return;
        initialized = true;
        preferences = read();
        render();
        apply();
        document.addEventListener("click", event => {
            const trigger = event.target.closest("[data-settings-open]");
            if (trigger) open(trigger);
        });
        if ("MutationObserver" in window) {
            const observer = new MutationObserver(mutations => mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        applyMediaPolicy(node.matches("video, iframe") ? node.parentElement || document : node);
                    }
                });
            }));
            observer.observe(document.body, { childList: true, subtree: true });
        }
    };

    window.ReflexSettings = Object.freeze({ init, get: () => ({ ...preferences }) });
})();
