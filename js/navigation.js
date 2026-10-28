/* Shared site navigation and mobile menu behavior. */
(() => {
    "use strict";

    const isLocal = () => {
        const host = window.location.hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "" || host.endsWith(".local");
    };

    const isReflexHost = () => window.location.hostname === "reflexinteractive.com"
        || window.location.hostname.endsWith(".reflexinteractive.com");

    const initLinks = (config) => {
        const local = isLocal();
        const host = window.location.hostname;
        const appSubdomain = isReflexHost() && host !== "reflexinteractive.com" && host !== "www.reflexinteractive.com";

        document.querySelectorAll("a[href]").forEach((link) => {
            const subdomain = link.dataset.subdomain;
            const rawHref = link.getAttribute("href");
            if (!rawHref || rawHref === "#" || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;
            if (subdomain && config.subdomains[subdomain]) {
                link.href = local ? `/${subdomain}.html` : config.subdomains[subdomain];
                return;
            }
            if (!local && appSubdomain && rawHref.startsWith("/")) {
                link.href = `${config.siteUrl}${rawHref}`;
                return;
            }
            if (!local) return;
            const url = new URL(rawHref, window.location.href);
            if (url.origin !== window.location.origin) return;
            const localPath = config.localRoutes[url.pathname];
            if (localPath) link.href = `${localPath}${url.search}${url.hash}`;
        });
    };

    const init = (config) => {
        const nav = document.querySelector(".navbar-custom");
        if (!nav) return;
        initLinks(config);

        const desktop = window.matchMedia("(min-width: 768px)");
        const update = () => {
            const scrolled = desktop.matches && window.scrollY > config.navScrollY;
            nav.classList.toggle("scrolled", scrolled);
            document.body.classList.toggle("nav-collapsed", scrolled);
        };
        update();
        window.addEventListener("scroll", update, { passive: true });
        desktop.addEventListener("change", update);

        const current = window.location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
        document.querySelectorAll(".nav-link[href]").forEach((link) => {
            const href = new URL(link.href, window.location.origin).pathname.replace(/\/$/, "") || "/";
            link.classList.toggle("active", href === current);
        });

        const triggers = Array.from(document.querySelectorAll("[data-menu-trigger]"));
        const overlay = document.getElementById("mobile-menu-overlay");
        const close = document.getElementById("mobile-menu-close");
        if (!triggers.length || !overlay) return;
        const setOpen = (open) => {
            overlay.classList.toggle("active", open);
            overlay.setAttribute("aria-hidden", String(!open));
            triggers.forEach((trigger) => trigger.setAttribute("aria-expanded", String(open)));
            document.body.style.overflow = open ? "hidden" : "";
        };
        triggers.forEach((trigger) => trigger.addEventListener("click", () => setOpen(true)));
        close?.addEventListener("click", () => setOpen(false));
        overlay.querySelectorAll("a, [data-menu-close]").forEach((link) => link.addEventListener("click", () => setOpen(false)));
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") setOpen(false);
        });
    };

    window.ReflexNavigation = Object.freeze({ init, initLinks });
})();
