/**
 * @fileoverview Reflex Interactive Core Engine
 * @version 1.2.1
 * @description Stable vanilla JS runtime for routing, data rendering, components, and interaction. Optimised for performance, accessibility, and SEO with minimal dependencies. Implemented 3d elements and interactivity.
 */
(() => {
    "use strict";

    const CONFIG = {
        api: {
            news: "https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json",
            games: "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json",
        },
        siteUrl: "https://reflexinteractive.com",
        logo: "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png",
        revealDelay: 70,
        navScrollY: 24,
        railRatio: 0.86,
        subdomains: {
            support: "https://support.reflexinteractive.com/",
            careers: "https://careers.reflexinteractive.com/",
            account: "https://account.reflexinteractive.com/",
        },
        localRoutes: {
            "/about": "/about.html",
            "/account": "/account.html",
            "/careers": "/careers.html",
            "/game-details": "/game-details.html",
            "/games": "/games.html",
            "/newswire": "/newswire.html",
            "/newswire-details": "/newswire-details.html",
            "/privacy": "/privacy.html",
            "/support": "/support.html",
            "/tos": "/tos.html",
        },
    };

    const state = {
        cache: new Map(),
        revealObserver: null,
        supportHost: window.location.hostname.startsWith("support."),
    };

    const dom = {
        qs: (selector, root = document) => root.querySelector(selector),
        qsa: (selector, root = document) => Array.from(root.querySelectorAll(selector)),
        id: (id) => document.getElementById(id),
        setText: (id, value = "") => {
            const node = dom.id(id);
            if (node) node.textContent = value || "";
        },
        setHTML: (id, value = "") => {
            const node = dom.id(id);
            if (node) node.innerHTML = value || "";
        },
        setMeta: (selector, value = "") => {
            const node = dom.qs(selector);
            if (node && value) node.setAttribute("content", value);
        },
        setCanonical: (href) => {
            const node = dom.qs('link[rel="canonical"]');
            if (node && href) node.setAttribute("href", href);
        },
    };

    const utils = {
        escape: (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[char])),

        clampDescription: (value = "") => String(value).replace(/\s+/g, " ").trim().slice(0, 158),

        normalizeMedia: (url = "", width = 1200) => {
            if (!url) return "";
            if (url.includes("cloudinary.com") && !url.includes("q_auto")) {
                return url.replace("/upload/", `/upload/q_auto,f_auto,w_${width}/`);
            }
            if (/^https?:\/\//i.test(url)) return url;
            const clean = url.replace(/\\/g, "/");
            return clean.startsWith("/") ? clean : `/${clean}`;
        },

        isLocal: () => {
            const host = window.location.hostname;
            return host === "localhost" || host === "127.0.0.1" || host === "" || host.endsWith(".local");
        },

        isReflexHost: () => window.location.hostname === "reflexinteractive.com" || window.location.hostname.endsWith(".reflexinteractive.com"),

        routeHref: (path) => {
            if (!utils.isLocal()) return path;
            const url = new URL(path, window.location.origin);
            const localPath = CONFIG.localRoutes[url.pathname];
            if (!localPath) return path;
            return `${localPath}${url.search}${url.hash}`;
        },

        detailHref: (page, id) => utils.routeHref(`/${page}?id=${encodeURIComponent(id)}`),

        newestFirst: (items = []) => [...items].sort((a, b) => {
            const at = Date.parse(a.date || a.release_date || "");
            const bt = Date.parse(b.date || b.release_date || "");
            if (Number.isNaN(at) || Number.isNaN(bt)) return 0;
            return bt - at;
        }),

        textToHTML: (value = "") => {
            const normalized = String(value)
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/&lt;br\s*\/?&gt;/gi, "\n")
                .replace(/\r\n/g, "\n")
                .trim();

            if (!normalized) return "";

            return normalized
                .split(/\n{2,}/)
                .map((block) => `<p>${utils.escape(block).replace(/\n/g, "<br>")}</p>`)
                .join("");
        },

        parseJSON: (value, fallback = {}) => {
            try {
                return JSON.parse(value || "{}");
            } catch {
                return fallback;
            }
        },

        throttle: (fn, wait = 80) => {
            let last = 0;
            return (...args) => {
                const now = performance.now();
                if (now - last < wait) return;
                last = now;
                fn(...args);
            };
        },

        spinner: (id, show) => dom.id(id)?.classList.toggle("d-none", !show),
    };

    const data = {
        json: async (url) => {
            if (state.cache.has(url)) return state.cache.get(url);
            const response = await fetch(url, { headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            state.cache.set(url, payload);
            return payload;
        },

        component: async (id, path, callback) => {
            const target = dom.id(id);
            if (!target) return null;

            try {
                const response = await fetch(path);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                target.innerHTML = await response.text();
                callback?.(target);
                return target;
            } catch (error) {
                console.error(`[Component] ${path}`, error);
                return null;
            }
        },

        games: async () => utils.newestFirst(await data.json(CONFIG.api.games)),
        news: async () => utils.newestFirst(await data.json(CONFIG.api.news)),
    };

    const templates = {
        arrow: '<span aria-hidden="true">></span>',

        newsCard: (article) => `
            <article class="card modern-card news-card h-100">
                <a href="${utils.detailHref("newswire-details", article.id)}" class="d-flex h-100 flex-column">
                    <img src="${utils.normalizeMedia(article.image_url, 900)}" alt="${utils.escape(article.title)}" width="900" height="506" class="modern-card-img" loading="lazy" decoding="async">
                    <div class="card-body d-flex flex-column">
                        <time class="modern-card-date" datetime="${utils.escape(article.date)}">${utils.escape(article.date)}</time>
                        <h3 class="modern-card-title">${utils.escape(article.title)}</h3>
                        <p class="modern-card-summary">${utils.escape(article.summary)}</p>
                        <span class="modern-card-cta mt-auto">Read More ${templates.arrow}</span>
                    </div>
                </a>
            </article>
        `,

        gameCard: (game) => `
            <article class="card modern-game-card h-100">
                <a href="${utils.detailHref("game-details", game.id)}" class="modern-game-card-anchor" aria-label="Explore ${utils.escape(game.title)}">
                    <img src="${utils.normalizeMedia(game.image_url, 900)}" alt="${utils.escape(game.title)} cover art" width="900" height="506" class="modern-game-card-img" loading="lazy" decoding="async">
                    <div class="modern-game-card-overlay">
                        <h3 class="modern-game-card-title">${utils.escape(game.title)}</h3>
                        <p class="modern-game-card-desc">${utils.escape(game.description)}</p>
                        <span class="modern-game-card-link">Explore Game ${templates.arrow}</span>
                    </div>
                </a>
            </article>
        `,

        navGame: (game) => `
            <a class="navbar-game-tile" href="${utils.detailHref("game-details", game.id)}">
                <img src="${utils.normalizeMedia(game.image_url, 480)}" alt="${utils.escape(game.title)}" width="480" height="270" loading="lazy" decoding="async">
                <span>${utils.escape(game.title)}</span>
            </a>
        `,

        supportGame: (game) => `
            <a href="#contact-section" class="card modern-card h-100 text-decoration-none">
                <img src="${utils.normalizeMedia(game.image_url, 700)}" alt="${utils.escape(game.title)} support category" width="700" height="394" class="modern-game-card-img support-tile-img" loading="lazy" decoding="async">
                <div class="card-img-overlay d-flex align-items-center justify-content-center">
                    <h3 class="text-white fw-bold m-0 text-shadow-lg">${utils.escape(game.title)}</h3>
                </div>
            </a>
        `,
    };

    const ui = {
        initNav: () => {
            const nav = dom.qs(".navbar-custom");
            if (!nav) return;

            ui.initEnvironmentLinks();

            const update = () => nav.classList.toggle("scrolled", window.scrollY > CONFIG.navScrollY);
            update();
            window.addEventListener("scroll", utils.throttle(update, 40), { passive: true });

            const current = window.location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
            dom.qsa(".nav-link[href]").forEach((link) => {
                const href = new URL(link.getAttribute("href"), window.location.origin).pathname.replace(/\/$/, "") || "/";
                link.classList.toggle("active", href === current);
            });

            ui.initMegaMenu();
        },

        initEnvironmentLinks: () => {
            const local = utils.isLocal();
            const host = window.location.hostname;
            const appSubdomain = utils.isReflexHost() && host !== "reflexinteractive.com" && host !== "www.reflexinteractive.com";

            dom.qsa("a[href]").forEach((link) => {
                const subdomain = link.dataset.subdomain;
                const rawHref = link.getAttribute("href");
                if (!rawHref || rawHref === "#" || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;

                if (subdomain && CONFIG.subdomains[subdomain]) {
                    link.href = local ? `/${subdomain}.html` : CONFIG.subdomains[subdomain];
                    return;
                }

                if (!local && appSubdomain && rawHref.startsWith("/")) {
                    link.href = `${CONFIG.siteUrl}${rawHref}`;
                    return;
                }

                if (!local) return;

                const url = new URL(rawHref, window.location.href);
                if (url.origin !== window.location.origin) return;
                const localPath = CONFIG.localRoutes[url.pathname];
                if (localPath) link.href = `${localPath}${url.search}${url.hash}`;
            });
        },

        initMegaMenu: () => {
            const trigger = dom.id("nav-games-toggle");
            const menu = dom.id("nav-games-menu");
            if (!trigger || !menu) return;

            let closeTimer = 0;
            const setOpen = (open) => {
                window.clearTimeout(closeTimer);
                menu.classList.toggle("is-open", open);
                trigger.setAttribute("aria-expanded", String(open));
            };
            const queueClose = () => {
                closeTimer = window.setTimeout(() => setOpen(false), 140);
            };

            trigger.addEventListener("click", () => setOpen(!menu.classList.contains("is-open")));
            trigger.addEventListener("mouseenter", () => setOpen(true));
            trigger.addEventListener("focus", () => setOpen(true));
            trigger.addEventListener("mouseleave", queueClose);
            menu.addEventListener("mouseenter", () => setOpen(true));
            menu.addEventListener("mouseleave", queueClose);
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") setOpen(false);
            });
            document.addEventListener("click", (event) => {
                if (!menu.contains(event.target) && !trigger.contains(event.target)) setOpen(false);
            });
        },

        initMobileMenu: () => {
            const trigger = dom.id("mobile-menu-trigger");
            const overlay = dom.id("mobile-menu-overlay");
            const close = dom.id("mobile-menu-close");
            if (!trigger || !overlay) return;

            const setOpen = (open) => {
                overlay.classList.toggle("active", open);
                overlay.setAttribute("aria-hidden", String(!open));
                trigger.setAttribute("aria-expanded", String(open));
                document.body.style.overflow = open ? "hidden" : "";
            };

            trigger.addEventListener("click", () => setOpen(true));
            close?.addEventListener("click", () => setOpen(false));
            dom.qsa("a", overlay).forEach((link) => link.addEventListener("click", () => setOpen(false)));
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") setOpen(false);
            });
        },

        initDownloadButtons: () => {
            const buttons = dom.qsa(".launcher-download-btn");
            if (!buttons.length) return;

            const ua = navigator.userAgent.toLowerCase();
            const platform = navigator.platform.toLowerCase();
            let runtime = "win-x64";

            if (ua.includes("mac") || platform.includes("mac")) runtime = navigator.maxTouchPoints > 0 || ua.includes("arm64") ? "osx-arm64" : "osx-x64";
            else if (ua.includes("linux")) runtime = "linux-x64";
            else if (ua.includes("win")) runtime = ua.includes("win64") || ua.includes("wow64") || ua.includes("x64") || platform.includes("x64") ? "win-x64" : "win-x86";

            buttons.forEach((button) => {
                button.href = `https://cdn.reflexinteractive.com/launcher-files/${runtime}/launcher-latest.zip`;
                button.download = "ReflexLauncher.zip";
            });
        },

        initReveal: () => {
            const revealables = ".reveal-on-scroll, .reveal-on-load, .hero-entry, .card, .feature-card";

            if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                dom.qsa(revealables).forEach((node) => node.classList.add("visible"));
                return;
            }

            state.revealObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const node = entry.target;
                    const siblings = Array.from(node.parentElement?.children || []);
                    const index = Math.max(siblings.indexOf(node), 0);
                    node.style.transitionDelay = `${Math.min(index, 6) * CONFIG.revealDelay}ms`;
                    node.classList.add("visible");
                    state.revealObserver.unobserve(node);
                });
            }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

            dom.qsa(revealables).forEach((node) => state.revealObserver.observe(node));
            dom.qsa(".hero-entry, .reveal-on-load").forEach((node, index) => {
                window.setTimeout(() => node.classList.add("visible"), 90 + index * CONFIG.revealDelay);
            });
        },

        observe: (node) => {
            if (!node) return;
            node.classList.add("reveal-on-scroll");
            if (state.revealObserver) state.revealObserver.observe(node);
        },

        scrollRail: (id, direction) => {
            const rail = dom.id(id);
            if (!rail) return;
            rail.scrollBy({ left: direction * Math.max(rail.clientWidth * CONFIG.railRatio, 280), behavior: "smooth" });
        },

        initBackToTop: () => {
            const button = document.createElement("button");
            button.className = "scroll-to-top";
            button.type = "button";
            button.setAttribute("aria-label", "Back to top");
            button.textContent = "^";
            document.body.appendChild(button);

            const update = () => button.classList.toggle("visible", window.scrollY > 520);
            button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
            window.addEventListener("scroll", utils.throttle(update, 100), { passive: true });
            update();
        },

        initDepthInteraction: () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

            const root = document.documentElement;
            const updatePointer = utils.throttle((event) => {
                const x = (event.clientX / window.innerWidth - 0.5).toFixed(4);
                const y = (event.clientY / window.innerHeight - 0.5).toFixed(4);
                root.style.setProperty("--pointer-x", x);
                root.style.setProperty("--pointer-y", y);
            }, 16);

            window.addEventListener("pointermove", updatePointer, { passive: true });

            const targets = ".card, .featured-game, .surface-panel, .feature-card";
            dom.qsa(targets).forEach((node) => node.classList.add("depth-card"));

            document.addEventListener("pointermove", (event) => {
                const card = event.target.closest(targets);
                if (!card) return;

                const rect = card.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width;
                const y = (event.clientY - rect.top) / rect.height;
                const rotateY = (x - 0.5) * 4;
                const rotateX = (0.5 - y) * 4;

                card.style.setProperty("--tilt-x", `${rotateY.toFixed(2)}deg`);
                card.style.setProperty("--tilt-y", `${rotateX.toFixed(2)}deg`);
                card.style.setProperty("--shine-x", `${(x * 100).toFixed(1)}%`);
                card.style.setProperty("--shine-y", `${(y * 100).toFixed(1)}%`);
                card.classList.add("is-tilting");
            }, { passive: true });

            document.addEventListener("pointerout", (event) => {
                const card = event.target.closest(targets);
                if (!card || card.contains(event.relatedTarget)) return;
                card.classList.remove("is-tilting");
                card.style.removeProperty("--tilt-x");
                card.style.removeProperty("--tilt-y");
            }, { passive: true });
        },
    };

    const render = {
        collection: async ({ containerId, spinnerId, loader, template, empty, limit = null }) => {
            const container = dom.id(containerId);
            if (!container) return;

            utils.spinner(spinnerId, true);

            try {
                const items = await loader();
                const visible = limit ? items.slice(0, limit) : items;
                const isRail = container.classList.contains("content-rail");
                const fragment = document.createDocumentFragment();

                visible.forEach((item) => {
                    const wrapper = document.createElement("div");
                    wrapper.className = isRail ? "rail-item" : "col";
                    wrapper.innerHTML = template(item);
                    ui.observe(wrapper.firstElementChild);
                    fragment.appendChild(wrapper);
                });

                container.replaceChildren(fragment);
            } catch (error) {
                console.error(`[Render] ${containerId}`, error);
                container.innerHTML = `<div class="text-center text-danger py-5">${utils.escape(empty)}</div>`;
            } finally {
                utils.spinner(spinnerId, false);
            }
        },

        newsList: (containerId) => render.collection({
            containerId,
            spinnerId: containerId.includes("latest") ? "homepage-loading-spinner" : "loading-spinner",
            loader: data.news,
            template: templates.newsCard,
            empty: "Newswire is temporarily unavailable.",
            limit: containerId.includes("latest") ? 6 : null,
        }).then(() => render.newsSchema(containerId)),

        gameList: (containerId) => render.collection({
            containerId,
            spinnerId: containerId.includes("latest") ? "homepage-games-loading-spinner" : "games-loading-spinner",
            loader: data.games,
            template: templates.gameCard,
            empty: "Game catalog is temporarily unavailable.",
            limit: containerId.includes("latest") ? 6 : null,
        }).then(() => render.gamesSchema(containerId)),

        gamesSchema: async (containerId) => {
            if (containerId !== "full-games-container") return;
            const schema = dom.id("games-schema");
            if (!schema) return;

            try {
                const games = await data.games();
                const payload = utils.parseJSON(schema.text, {});
                payload.mainEntity = {
                    "@type": "ItemList",
                    numberOfItems: games.length,
                    itemListElement: games.map((game, index) => ({
                        "@type": "ListItem",
                        position: index + 1,
                        url: `${CONFIG.siteUrl}${utils.detailHref("game-details", game.id)}`,
                        name: game.title,
                    })),
                };
                schema.text = JSON.stringify(payload);
            } catch (error) {
                console.warn("[Schema] games", error);
            }
        },

        newsSchema: async (containerId) => {
            if (containerId !== "news-container") return;
            const schema = dom.id("news-schema");
            if (!schema) return;

            try {
                const articles = await data.news();
                const payload = utils.parseJSON(schema.text, {});
                payload.blogPost = articles.map((article) => ({
                    "@type": "BlogPosting",
                    headline: article.title,
                    url: `${CONFIG.siteUrl}${utils.detailHref("newswire-details", article.id)}`,
                    datePublished: article.date,
                    image: utils.normalizeMedia(article.image_url, 1200),
                    description: utils.clampDescription(article.summary),
                }));
                schema.text = JSON.stringify(payload);
            } catch (error) {
                console.warn("[Schema] news", error);
            }
        },

        navGames: async () => {
            const rail = dom.id("navbar-games-rail");
            if (!rail) return;

            try {
                const games = await data.games();
                rail.innerHTML = games.slice(0, 8).map(templates.navGame).join("");
            } catch (error) {
                console.error("[Render] nav games", error);
                rail.innerHTML = '<p class="text-danger mb-0">Games unavailable.</p>';
            }
        },

        supportGames: () => render.collection({
            containerId: "support-game-grid",
            loader: data.games,
            template: templates.supportGame,
            empty: "Support categories are temporarily unavailable.",
        }),

        featuredGame: async () => {
            const slot = dom.id("featured-game-slot");
            if (!slot) return;

            try {
                const [game] = await data.games();
                const image = utils.normalizeMedia(game.hero_image_url || game.image_url, 1400);
                slot.innerHTML = `
                    <div class="row g-0 align-items-stretch">
                        <div class="col-12 col-lg-7">
                            <div class="featured-media">
                                <img src="${image}" alt="${utils.escape(game.title)} key art" width="1400" height="788" loading="lazy" decoding="async">
                            </div>
                        </div>
                        <div class="col-12 col-lg-5">
                            <div class="featured-body">
                                <p class="section-kicker mb-3">Featured Game</p>
                                <h3 class="display-5 fw-bold mb-3">${utils.escape(game.title)}</h3>
                                <p class="text-muted mb-4">${utils.escape(game.description)}</p>
                                <div class="d-flex flex-wrap gap-3">
                                    <a href="${utils.detailHref("game-details", game.id)}" class="btn btn-danger">Explore</a>
                                    <a href="/games" class="btn btn-outline-light">View All</a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error("[Render] featured game", error);
                slot.innerHTML = '<div class="featured-body text-center text-muted">Featured game unavailable.</div>';
            }
        },

        articleDetail: async (id) => {
            if (!id) return app.message("Article not found.", "/newswire", "Back to Newswire");

            try {
                const articles = await data.news();
                const article = articles.find((item) => String(item.id) === String(id));
                if (!article) throw new Error("Article not found");

                const url = `${CONFIG.siteUrl}${utils.detailHref("newswire-details", article.id)}`;
                const image = utils.normalizeMedia(article.image_url, 1400);
                const description = utils.clampDescription(article.summary);
                const title = `${article.title} | Reflex Interactive`;

                document.title = title;
                dom.setCanonical(url);
                dom.setMeta('meta[name="description"]', description);
                dom.setMeta('meta[property="og:title"]', title);
                dom.setMeta('meta[property="og:description"]', description);
                dom.setMeta('meta[property="og:image"]', image);
                dom.setMeta('meta[property="og:url"]', url);
                dom.setMeta('meta[name="twitter:title"]', title);
                dom.setMeta('meta[name="twitter:description"]', description);
                dom.setMeta('meta[name="twitter:image"]', image);

                const schema = dom.id("news-schema");
                if (schema) {
                    schema.text = JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "NewsArticle",
                        mainEntityOfPage: url,
                        headline: article.title,
                        description,
                        image,
                        datePublished: article.date,
                        dateModified: article.date,
                        author: { "@type": "Organization", name: "Reflex Interactive" },
                        publisher: {
                            "@type": "Organization",
                            name: "Reflex Interactive",
                            logo: { "@type": "ImageObject", url: CONFIG.logo },
                        },
                    });
                }

                dom.setText("article-title", article.title);
                dom.setText("article-date", article.date);
                dom.setHTML("article-content", utils.textToHTML(article.content));

                const img = dom.id("article-image");
                if (img) {
                    img.src = image;
                    img.alt = `Newswire key art for ${article.title}`;
                }
            } catch (error) {
                console.error("[Render] article detail", error);
                app.message("Failed to load article.", "/newswire", "Back to Newswire");
            }
        },

        gameDetail: async (id) => {
            if (!id) return app.message("Game not found.", "/games", "Back to Games");

            try {
                const games = await data.games();
                const game = games.find((item) => String(item.id) === String(id));
                if (!game) throw new Error("Game not found");

                const image = utils.normalizeMedia(game.image_url, 1200);
                const hero = utils.normalizeMedia(game.hero_image_url || game.image_url, 1800);
                const url = `${CONFIG.siteUrl}${utils.detailHref("game-details", game.id)}`;
                const description = utils.clampDescription(game.description);
                const title = `${game.title} | Reflex Interactive`;

                document.title = title;
                dom.setCanonical(url);
                dom.setMeta('meta[name="description"]', description);
                dom.setMeta('meta[property="og:title"]', title);
                dom.setMeta('meta[property="og:description"]', description);
                dom.setMeta('meta[property="og:image"]', image);
                dom.setMeta('meta[property="og:url"]', url);
                dom.setMeta('meta[name="twitter:title"]', title);
                dom.setMeta('meta[name="twitter:description"]', description);
                dom.setMeta('meta[name="twitter:image"]', image);

                const schema = dom.id("game-json-ld");
                if (schema) {
                    const payload = utils.parseJSON(schema.text);
                    Object.assign(payload, {
                        name: game.title,
                        description,
                        genre: game.genre,
                        image,
                        url,
                        offers: {
                            "@type": "Offer",
                            price: Number(game.price || 0).toFixed(2),
                            priceCurrency: "USD",
                            availability: "https://schema.org/InStock",
                        },
                    });
                    schema.text = JSON.stringify(payload);
                }

                const heroNode = dom.id("game-hero");
                if (heroNode) heroNode.style.backgroundImage = `url('${hero}')`;

                const cover = dom.id("game-detail-cover");
                if (cover) {
                    cover.src = image;
                    cover.alt = `${game.title} official cover art`;
                }

                dom.setText("game-detail-title", game.title);
                dom.setText("game-detail-developer", game.developer || "Reflex Interactive");
                dom.setText("game-detail-publisher", game.publisher || "Reflex Interactive");
                dom.setText("game-detail-genre", game.genre || "Action");
                dom.setText("game-detail-description", game.description);
                dom.setText("game-detail-price", Number(game.price) === 0 ? "Free" : `$${Number(game.price || 0).toFixed(2)}`);

                const cta = dom.id("purchase-download-btn");
                if (cta) {
                    const downloadable = Number(game.price) === 0 && game.download_url;
                    cta.textContent = downloadable ? "Download Now" : "Purchase Coming Soon";
                    cta.href = downloadable ? game.download_url : "#";
                    cta.classList.toggle("opacity-50", !downloadable);
                    cta.classList.toggle("cursor-not-allowed", !downloadable);
                    if (downloadable) cta.setAttribute("download", "");
                    else cta.removeAttribute("download");
                }

                render.gameMedia(game);
            } catch (error) {
                console.error("[Render] game detail", error);
                app.message("Failed to load game details.", "/games", "Back to Games");
            }
        },

        gameMedia: (game) => {
            const media = dom.id("game-detail-screenshots");
            if (!media) return;

            const fragment = document.createDocumentFragment();

            if (game.trailer_url) {
                const col = document.createElement("div");
                col.className = "col-12";
                col.innerHTML = `<iframe src="${utils.escape(game.trailer_url)}" class="w-100 rounded-lg shadow-md aspect-video mb-2" title="${utils.escape(game.title)} trailer" loading="lazy" allowfullscreen></iframe>`;
                fragment.appendChild(col);
            }

            if (Array.isArray(game.screenshots)) {
                game.screenshots.forEach((shot) => {
                    const src = utils.normalizeMedia(shot.url || shot, 900);
                    const col = document.createElement("div");
                    col.className = "col";
                    col.innerHTML = `<img src="${src}" alt="${utils.escape(shot.caption || `${game.title} screenshot`)}" width="900" height="506" class="img-fluid rounded-lg shadow-md" loading="lazy" decoding="async">`;
                    fragment.appendChild(col);
                });
            }

            media.replaceChildren(fragment);
        },
    };

    const events = {
        init: () => {
            document.addEventListener("click", events.click);
            const newsletter = dom.id("newsletter-form");
            newsletter?.addEventListener("submit", events.submit);
        },

        click: (event) => {
            const prev = event.target.closest("[data-rail-prev]");
            const next = event.target.closest("[data-rail-next]");
            const hash = event.target.closest('a[href^="#"]');
            const clear = event.target.closest("#clear-cache-link");

            if (prev || next) {
                event.preventDefault();
                const control = prev || next;
                ui.scrollRail(control.dataset.railPrev || control.dataset.railNext, prev ? -1 : 1);
                return;
            }

            if (hash) {
                const href = hash.getAttribute("href");
                if (href && href !== "#") {
                    const target = dom.qs(href);
                    if (target) {
                        event.preventDefault();
                        target.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                }
            }

            if (clear) events.clearCache(event);
        },

        submit: async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const button = form.querySelector('button[type="submit"]');
            if (button) {
                button.disabled = true;
                button.textContent = "Sending...";
            }

            try {
                const response = await fetch(form.action, {
                    method: form.method,
                    body: new FormData(form),
                    headers: { Accept: "application/json" },
                });
                form.innerHTML = `<p class="text-${response.ok ? "success" : "danger"} fw-bold text-center">${response.ok ? "Message sent." : "Error sending message."}</p>`;
            } catch {
                form.innerHTML = '<p class="text-danger fw-bold text-center">Something went wrong.</p>';
            }
        },

        clearCache: (event) => {
            event.preventDefault();
            localStorage.clear();
            sessionStorage.clear();
            if ("serviceWorker" in navigator) {
                navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((reg) => reg.unregister()));
            }
            window.location.reload();
        },
    };

    const router = {
        run: () => {
            const path = window.location.pathname.replace(/\/$/, "") || "/";
            const params = new URLSearchParams(window.location.search);
            const id = params.get("id");

            if (path.includes("game-details") || (id && dom.id("game-hero"))) return render.gameDetail(id);
            if (path.includes("newswire-details") || (id && dom.id("article-detail"))) return render.articleDetail(id);
            if (path.includes("games")) return render.gameList("full-games-container");
            if (path.includes("newswire")) return render.newsList("news-container");
            if (state.supportHost || path.includes("support")) return render.supportGames();

            if (path === "/" || path.endsWith("index.html")) {
                render.newsList("latest-news-container");
                render.featuredGame();
                render.gameList("latest-games-container");
            }
        },
    };

    const app = {
        init: async () => {
            await Promise.all([
                data.component("navbar", "/components/navbar.html", () => {
                    ui.initNav();
                    ui.initMobileMenu();
                    ui.initDownloadButtons();
                    render.navGames();
                }),
                data.component("footer", "/components/footer.html"),
            ]);

            ui.initEnvironmentLinks();
            ui.initReveal();
            ui.initBackToTop();
            ui.initDepthInteraction();
            events.init();
            router.run();
        },

        message: (message, href = "/", label = "Return Home") => {
            const main = dom.qs("main");
            if (!main) return;
            main.innerHTML = `
                <section class="container text-center py-5">
                    <p class="section-kicker mb-3">${utils.escape(message)}</p>
                    <a class="btn btn-danger" href="${href}">${utils.escape(label)}</a>
                </section>
            `;
        },
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", app.init, { once: true });
    } else {
        app.init();
    }
})();
