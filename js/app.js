/**
 * @fileoverview Reflex Interactive Core Engine
 * @version 1.2.0
 * @description Stable vanilla JS runtime for routing, data rendering, components, and interaction.
 */

(() => {
    "use strict";

    const Config = {
        API: {
            NEWS: "https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json",
            GAMES: "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json",
        },
        UI: {
            REVEAL_DELAY_MS: 80,
            NAV_SCROLL_Y: 50,
            BACK_TO_TOP_Y: 400,
            RAIL_SCROLL_RATIO: 0.85,
        },
        SYSTEM: {
            CACHE_BUST_COMPONENTS: false,
        },
    };

    const State = {
        cache: new Map(),
        revealObserver: null,
        isSupportSubdomain: window.location.hostname.startsWith("support."),
    };

    const DOM = {
        qs: (selector, root = document) => root.querySelector(selector),
        qsa: (selector, root = document) => Array.from(root.querySelectorAll(selector)),
        byId: (id) => id ? document.getElementById(id) : null,
        setText: (id, value = "") => {
            const el = DOM.byId(id);
            if (el) el.textContent = value || "";
        },
        setHTML: (id, value = "") => {
            const el = DOM.byId(id);
            if (el) el.innerHTML = value || "";
        },
        setMeta: (selector, value = "") => {
            const el = DOM.qs(selector);
            if (el) el.setAttribute("content", value || "");
        },
        setCanonical: (value = "") => {
            const el = DOM.qs('link[rel="canonical"]');
            if (el) el.setAttribute("href", value || "");
        },
    };

    const Utils = {
        withCacheBust: (url) => {
            if (!Config.SYSTEM.CACHE_BUST_COMPONENTS) return url;
            const joiner = url.includes("?") ? "&" : "?";
            return `${url}${joiner}t=${Date.now()}`;
        },

        escapeHTML: (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[char])),

        textToHTML: (value = "") => {
            const normalized = String(value)
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/&lt;br\s*\/?&gt;/gi, "\n")
                .replace(/\r\n/g, "\n")
                .trim();

            if (!normalized) return "";

            return normalized
                .split(/\n{2,}/)
                .map((block) => `<p>${Utils.escapeHTML(block).replace(/\n/g, "<br>")}</p>`)
                .join("");
        },

        normalizeMediaUrl: (url = "") => {
            if (!url) return "";
            if (url.includes("cloudinary.com") && !url.includes("q_auto")) {
                return url.replace("/upload/", "/upload/q_auto,f_auto/");
            }
            if (/^https?:\/\//i.test(url)) return url;

            const cleaned = url.replace(/\\/g, "/");
            return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
        },

        detailHref: (page, id) => `/${page}?id=${encodeURIComponent(id)}`,

        sortNewestFirst: (items = []) => [...items].sort((a, b) => {
            const aTime = Date.parse(a.date || a.release_date || "");
            const bTime = Date.parse(b.date || b.release_date || "");
            if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
            return bTime - aTime;
        }),

        parseJSON: (value, fallback = {}) => {
            try {
                return JSON.parse(value || "{}");
            } catch (error) {
                console.warn("[JSON] Invalid embedded schema", error);
                return fallback;
            }
        },

        throttle: (fn, waitMs = 100) => {
            let lastRun = 0;
            return (...args) => {
                const now = Date.now();
                if (now - lastRun < waitMs) return;
                lastRun = now;
                fn(...args);
            };
        },

        toggleSpinner: (id, show) => DOM.byId(id)?.classList.toggle("d-none", !show),
    };

    const Data = {
        fetchJSON: async (url) => {
            if (State.cache.has(url)) return State.cache.get(url);

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);

            const data = await response.json();
            State.cache.set(url, data);
            return data;
        },

        loadComponent: async (placeholderId, path, onLoad) => {
            const placeholder = DOM.byId(placeholderId);
            if (!placeholder) return null;

            try {
                const response = await fetch(Utils.withCacheBust(path));
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                placeholder.innerHTML = await response.text();
                onLoad?.(placeholder);
                return placeholder;
            } catch (error) {
                console.error(`[Component] Failed to load ${path}`, error);
                return null;
            }
        },

        games: async () => Utils.sortNewestFirst(await Data.fetchJSON(Config.API.GAMES)),
        news: async () => Utils.sortNewestFirst(await Data.fetchJSON(Config.API.NEWS)),
    };

    const Templates = {
        newsCard: (article) => `
            <article class="card modern-card news-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll">
                <a href="${Utils.detailHref("newswire-details", article.id)}" class="text-decoration-none d-block h-100 d-flex flex-column">
                    <img src="${Utils.escapeHTML(article.image_url)}" alt="${Utils.escapeHTML(article.title)}" class="card-img-top modern-card-img" loading="lazy">
                    <div class="card-body d-flex flex-column flex-grow-1">
                        <p class="card-text modern-card-date">${Utils.escapeHTML(article.date)}</p>
                        <h3 class="card-title modern-card-title">${Utils.escapeHTML(article.title)}</h3>
                        <p class="card-text modern-card-summary">${Utils.escapeHTML(article.summary)}</p>
                        <span class="modern-card-cta mt-auto">Read More <span class="ms-2" aria-hidden="true">&rarr;</span></span>
                    </div>
                </a>
            </article>
        `,

        gameCard: (game) => `
            <div class="card modern-card modern-game-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll">
                <img src="${Utils.normalizeMediaUrl(game.image_url)}" alt="${Utils.escapeHTML(game.title)}" class="modern-game-card-img" loading="lazy">
                <div class="modern-game-card-overlay">
                    <h3 class="modern-game-card-title">${Utils.escapeHTML(game.title)}</h3>
                    <p class="modern-game-card-desc">${Utils.escapeHTML(game.description)}</p>
                    <a href="${Utils.detailHref("game-details", game.id)}" class="modern-game-card-link">Learn More <span class="ms-2" aria-hidden="true">&rarr;</span></a>
                </div>
            </div>
        `,

        navbarGame: (game) => `
            <a class="navbar-game-tile text-decoration-none" href="${Utils.detailHref("game-details", game.id)}">
                <img src="${Utils.normalizeMediaUrl(game.image_url)}" alt="${Utils.escapeHTML(game.title)}" loading="lazy">
                <span class="text-white fw-bold text-uppercase">${Utils.escapeHTML(game.title)}</span>
            </a>
        `,

        supportGame: (game) => `
            <a href="#contact-section" class="card modern-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll text-decoration-none">
                <img src="${Utils.normalizeMediaUrl(game.image_url)}" alt="${Utils.escapeHTML(game.title)}" class="modern-game-card-img support-tile-img" loading="lazy">
                <div class="card-img-overlay d-flex align-items-center justify-content-center">
                    <h3 class="text-white text-uppercase fw-bold m-0" style="text-shadow: 2px 2px 10px rgba(0,0,0,1);">${Utils.escapeHTML(game.title)}</h3>
                </div>
            </a>
        `,
    };

    const UI = {
        observeReveal: (element) => {
            if (!element || element.closest(".navbar")) return;
            element.classList.add("reveal-on-scroll");
            State.revealObserver?.observe(element);
        },

        initScrollReveal: () => {
            const selectors = [
                ".reveal-on-scroll",
                ".card",
                ".row .col",
                ".display-4",
                ".display-1",
                "h1",
                "h2",
                "h3",
                ".hero-section h1",
                ".hero-section p",
                ".btn",
                ".navbar-brand",
            ];

            if (!("IntersectionObserver" in window)) {
                DOM.qsa(".reveal-on-scroll, .reveal-on-load, .hero-entry").forEach((el) => el.classList.add("visible"));
                return;
            }

            State.revealObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;

                    const el = entry.target;
                    const siblings = Array.from(el.parentElement?.children || []).filter((child) => child.tagName === el.tagName);
                    const index = Math.max(siblings.indexOf(el), 0);

                    el.style.transitionDelay = `${index * Config.UI.REVEAL_DELAY_MS}ms`;
                    el.classList.add("visible");
                    State.revealObserver.unobserve(el);
                });
            }, { threshold: 0.08 });

            DOM.qsa(selectors.join(", ")).forEach(UI.observeReveal);

            requestAnimationFrame(() => {
                DOM.qsa(".reveal-on-load, .hero-entry").forEach((el, index) => {
                    const baseDelay = el.classList.contains("hero-entry") ? 120 : 0;
                    window.setTimeout(() => el.classList.add("visible"), baseDelay + index * Config.UI.REVEAL_DELAY_MS);
                });
            });
        },

        initNavbar: () => {
            const header = DOM.qs(".navbar");
            if (!header) return;

            const update = () => header.classList.toggle("scrolled", window.scrollY > Config.UI.NAV_SCROLL_Y);
            window.addEventListener("scroll", Utils.throttle(update, 40), { passive: true });
            update();
        },

        initMobileMenu: () => {
            const trigger = DOM.byId("mobile-menu-trigger");
            const overlay = DOM.byId("mobile-menu-overlay");
            if (!trigger || !overlay) return;

            const setOpen = (isOpen) => {
                overlay.classList.toggle("active", isOpen);
                overlay.setAttribute("aria-hidden", String(!isOpen));
                document.body.style.overflow = isOpen ? "hidden" : "";
            };

            trigger.addEventListener("click", () => setOpen(true));
            DOM.byId("mobile-menu-close")?.addEventListener("click", () => setOpen(false));
            DOM.qsa(".mobile-nav-link", overlay).forEach((link) => link.addEventListener("click", () => setOpen(false)));
        },

        initDownloadButtons: () => {
            const buttons = DOM.qsa(".launcher-download-btn");
            if (!buttons.length) return;

            const userAgent = navigator.userAgent.toLowerCase();
            const platform = navigator.platform.toLowerCase();
            let runtime = "win-x64";

            if (userAgent.includes("mac") || platform.includes("mac")) {
                runtime = navigator.maxTouchPoints > 0 || userAgent.includes("arm64") ? "osx-arm64" : "osx-x64";
            } else if (userAgent.includes("linux")) {
                runtime = "linux-x64";
            } else if (userAgent.includes("win")) {
                runtime = userAgent.includes("win64") || userAgent.includes("wow64") || userAgent.includes("x64") || platform.includes("x64") ? "win-x64" : "win-x86";
            }

            const href = `https://cdn.reflexinteractive.com/launcher-files/${runtime}/launcher-latest.zip`;
            buttons.forEach((button) => {
                button.href = href;
                button.setAttribute("download", "ReflexLauncher.zip");
            });
        },

        initBackToTop: () => {
            const button = DOM.byId("scroll-to-top");
            if (!button) return;

            const update = () => button.classList.toggle("visible", window.scrollY > Config.UI.BACK_TO_TOP_Y);
            window.addEventListener("scroll", Utils.throttle(update, 100), { passive: true });
            button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
            update();
        },

        initCounters: () => {
            const counters = DOM.qsa("[data-count]");
            if (!counters.length || !("IntersectionObserver" in window)) return;

            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    UI.animateCount(entry.target, Number(entry.target.dataset.count || "0"));
                    observer.unobserve(entry.target);
                });
            }, { threshold: 0.4 });

            counters.forEach((counter) => {
                counter.textContent = "0";
                observer.observe(counter);
            });
        },

        animateCount: (element, target) => {
            const start = performance.now();
            const duration = 900;

            const step = (now) => {
                const progress = Math.min((now - start) / duration, 1);
                element.textContent = Math.floor(target * progress).toString();
                if (progress < 1) requestAnimationFrame(step);
            };

            requestAnimationFrame(step);
        },

        scrollRail: (railId, direction) => {
            const rail = DOM.byId(railId);
            if (!rail) return;

            const distance = Math.max(rail.clientWidth * Config.UI.RAIL_SCROLL_RATIO, 280);
            rail.scrollBy({ left: direction * distance, behavior: "smooth" });
        },
    };

    const Render = {
        collection: async ({ containerId, spinnerId, loader, template, emptyMessage, limit = null }) => {
            const container = DOM.byId(containerId);
            if (!container) return;

            Utils.toggleSpinner(spinnerId, true);

            try {
                const items = await loader();
                const visibleItems = limit ? items.slice(0, limit) : items;
                const isRail = container.classList.contains("content-rail");
                const fragment = document.createDocumentFragment();

                visibleItems.forEach((item) => {
                    const wrapper = document.createElement("div");
                    wrapper.className = isRail ? "rail-item" : "col";
                    wrapper.innerHTML = template(item);
                    UI.observeReveal(wrapper.firstElementChild);
                    fragment.appendChild(wrapper);
                });

                container.replaceChildren(fragment);
            } catch (error) {
                console.error(`[Render] ${containerId}`, error);
                container.innerHTML = `<div class="text-center text-danger py-5">${emptyMessage}</div>`;
            } finally {
                Utils.toggleSpinner(spinnerId, false);
            }
        },

        newsList: (containerId) => Render.collection({
            containerId,
            spinnerId: containerId.includes("latest") ? "homepage-loading-spinner" : "loading-spinner",
            loader: Data.news,
            template: Templates.newsCard,
            emptyMessage: "Failed to load news.",
        }),

        gameList: (containerId) => Render.collection({
            containerId,
            spinnerId: containerId.includes("latest") ? "homepage-games-loading-spinner" : "games-loading-spinner",
            loader: Data.games,
            template: Templates.gameCard,
            emptyMessage: "Failed to load games.",
        }),

        navbarGameRail: async () => {
            const rail = DOM.byId("navbar-games-rail");
            if (!rail) return;

            try {
                const games = await Data.games();
                rail.innerHTML = games.map(Templates.navbarGame).join("");
            } catch (error) {
                console.error("[Render] navbar games", error);
                rail.innerHTML = '<p class="text-danger mb-0">Games unavailable.</p>';
            }
        },

        supportGameList: async () => Render.collection({
            containerId: "support-game-grid",
            loader: Data.games,
            template: Templates.supportGame,
            emptyMessage: "Failed to load game categories.",
        }),

        featuredGame: async () => {
            const slot = DOM.byId("featured-game-slot");
            if (!slot) return;

            try {
                const [game] = await Data.games();
                if (!game) throw new Error("No games found");

                const image = Utils.normalizeMediaUrl(game.hero_image_url || game.image_url);
                slot.innerHTML = `
                    <div class="row g-0 align-items-stretch">
                        <div class="col-12 col-lg-6">
                            <div class="featured-media" style="background-image: url('${image}');"></div>
                        </div>
                        <div class="col-12 col-lg-6">
                            <div class="featured-body">
                                <p class="section-kicker mb-3">Featured Game</p>
                                <h3 class="display-6 fw-bold text-uppercase mb-3">${Utils.escapeHTML(game.title)}</h3>
                                <p class="text-muted mb-4">${Utils.escapeHTML(game.description)}</p>
                                <div class="d-flex flex-wrap gap-3">
                                    <a href="${Utils.detailHref("game-details", game.id)}" class="btn btn-danger text-uppercase fw-bold">Explore</a>
                                    <a href="/games" class="btn btn-outline-light text-uppercase fw-bold">View All</a>
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
            if (!id) {
                App.showMessage("Article not found.", "/newswire", "Back to Newswire");
                return;
            }

            try {
                const articles = await Data.news();
                const article = articles.find((item) => String(item.id) === String(id));
                if (!article) throw new Error("Article not found");

                const title = `${article.title} | Reflex Interactive`;
                const url = Utils.detailHref("newswire-details", article.id);
                const absoluteUrl = `https://reflexinteractive.com${url}`;
                document.title = title;
                DOM.setCanonical(absoluteUrl);
                DOM.setMeta('meta[name="description"]', article.summary?.slice(0, 160));
                DOM.setMeta('meta[property="og:title"]', title);
                DOM.setMeta('meta[property="og:description"]', article.summary?.slice(0, 160));
                DOM.setMeta('meta[property="og:image"]', article.image_url);
                DOM.setMeta('meta[property="og:url"]', absoluteUrl);
                DOM.setMeta('meta[name="twitter:title"]', title);
                DOM.setMeta('meta[name="twitter:description"]', article.summary?.slice(0, 160));
                DOM.setMeta('meta[name="twitter:image"]', article.image_url);

                const schema = DOM.byId("news-schema");
                if (schema) {
                    schema.text = JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "NewsArticle",
                        mainEntityOfPage: absoluteUrl,
                        headline: article.title,
                        datePublished: article.date,
                        image: article.image_url,
                        description: article.summary,
                        author: { "@type": "Organization", name: "Reflex Interactive" },
                        publisher: {
                            "@type": "Organization",
                            name: "Reflex Interactive",
                            logo: {
                                "@type": "ImageObject",
                                url: "https://res.cloudinary.com/dvju1xiaw/image/upload/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png",
                            },
                        },
                    });
                }

                DOM.setText("article-title", article.title);
                DOM.setText("article-date", article.date);
                DOM.setHTML("article-content", Utils.textToHTML(article.content));

                const image = DOM.byId("article-image");
                if (image) {
                    image.src = article.image_url;
                    image.alt = `Newswire: ${article.title}`;
                }
            } catch (error) {
                console.error("[Render] article detail", error);
                App.showMessage("Failed to load article.", "/newswire", "Back to Newswire");
            }
        },

        gameDetail: async (id) => {
            if (!id) {
                App.showMessage("Game not found.", "/games", "Back to Games");
                return;
            }

            try {
                const games = await Data.games();
                const game = games.find((item) => String(item.id) === String(id));
                if (!game) throw new Error("Game not found");

                const imageUrl = Utils.normalizeMediaUrl(game.image_url);
                const title = `${game.title} | Reflex Interactive`;
                const url = Utils.detailHref("game-details", game.id);
                const absoluteUrl = `https://reflexinteractive.com${url}`;
                document.title = title;
                DOM.setCanonical(absoluteUrl);

                DOM.setMeta('meta[name="description"]', game.description?.slice(0, 160));
                DOM.setMeta('meta[property="og:title"]', title);
                DOM.setMeta('meta[property="og:description"]', game.description?.slice(0, 160));
                DOM.setMeta('meta[property="og:image"]', imageUrl);
                DOM.setMeta('meta[property="og:url"]', absoluteUrl);
                DOM.setMeta('meta[name="twitter:title"]', title);
                DOM.setMeta('meta[name="twitter:description"]', game.description?.slice(0, 160));
                DOM.setMeta('meta[name="twitter:image"]', imageUrl);

                const schema = DOM.byId("game-json-ld");
                if (schema) {
                    const data = Utils.parseJSON(schema.text);
                    Object.assign(data, {
                        name: game.title,
                        description: game.description,
                        genre: game.genre,
                        image: imageUrl,
                        url: absoluteUrl,
                    });
                    schema.text = JSON.stringify(data);
                }

                const hero = DOM.byId("game-hero");
                if (hero) hero.style.backgroundImage = `url('${Utils.normalizeMediaUrl(game.hero_image_url || game.image_url)}')`;

                const cover = DOM.byId("game-detail-cover");
                if (cover) {
                    cover.src = imageUrl;
                    cover.alt = `${game.title} Official Cover Art`;
                }

                DOM.setText("game-detail-title", game.title);
                DOM.setText("game-detail-developer", game.developer);
                DOM.setText("game-detail-publisher", game.publisher);
                DOM.setText("game-detail-genre", game.genre);
                DOM.setText("game-detail-description", game.description);
                DOM.setText("game-detail-price", Number(game.price) === 0 ? "FREE" : `$${Number(game.price || 0).toFixed(2)}`);

                const button = DOM.byId("purchase-download-btn");
                if (button) {
                    const isFreeDownload = Number(game.price) === 0 && game.download_url;
                    button.textContent = isFreeDownload ? "Download Now" : "Purchase Now";
                    button.href = isFreeDownload ? game.download_url : "#";
                    button.classList.toggle("opacity-50", !isFreeDownload);
                    button.classList.toggle("cursor-not-allowed", !isFreeDownload);
                    if (isFreeDownload) button.setAttribute("download", "");
                    else button.removeAttribute("download");
                }

                Render.gameMedia(game);
            } catch (error) {
                console.error("[Render] game detail", error);
                App.showMessage(`Failed to load game details: ${error.message}`, "/games", "Back to Games");
            }
        },

        gameMedia: (game) => {
            const media = DOM.byId("game-detail-screenshots");
            if (!media) return;

            const fragment = document.createDocumentFragment();

            if (game.trailer_url) {
                const iframe = document.createElement("iframe");
                iframe.src = game.trailer_url;
                iframe.className = "col-12 w-100 rounded-lg shadow-md aspect-video mb-4";
                iframe.setAttribute("allowfullscreen", "");
                iframe.title = `${game.title} trailer`;
                fragment.appendChild(iframe);
            }

            if (Array.isArray(game.screenshots)) {
                game.screenshots.forEach((screenshot) => {
                    const col = document.createElement("div");
                    const img = document.createElement("img");
                    const src = screenshot.url || screenshot;

                    col.className = "col";
                    img.src = Utils.normalizeMediaUrl(src);
                    img.className = "img-fluid rounded-lg shadow-md";
                    img.alt = screenshot.caption || `${game.title} Screenshot`;
                    img.loading = "lazy";

                    col.appendChild(img);
                    fragment.appendChild(col);
                });
            }

            media.replaceChildren(fragment);
        },
    };

    const Router = {
        get route() {
            const path = window.location.pathname.replace(/\/$/, "") || "/";
            const params = new URLSearchParams(window.location.search);
            return { path, id: params.get("id") };
        },

        run: () => {
            const { path, id } = Router.route;
            const hasGameHero = Boolean(DOM.byId("game-hero"));
            const hasArticleDetail = Boolean(DOM.byId("article-detail"));

            if (path.includes("game-details") || (id && hasGameHero)) {
                Render.gameDetail(id);
                return;
            }

            if (path.includes("newswire-details") || (id && hasArticleDetail)) {
                Render.articleDetail(id);
                return;
            }

            if (path.includes("games")) {
                Render.gameList("full-games-container");
                return;
            }

            if (path.includes("newswire")) {
                Render.newsList("news-container");
                return;
            }

            if ((path === "/" || path.endsWith("index.html")) && !State.isSupportSubdomain) {
                Render.newsList("latest-news-container");
                Render.featuredGame();
                Render.gameList("latest-games-container");
            }

            if (State.isSupportSubdomain || path.includes("support")) {
                Render.supportGameList();
            }
        },
    };

    const Events = {
        init: () => {
            document.addEventListener("click", Events.handleDocumentClick);

            const newsletter = DOM.byId("newsletter-form");
            if (newsletter) newsletter.addEventListener("submit", Events.handleFormSubmit);
        },

        handleDocumentClick: (event) => {
            const hashLink = event.target.closest('a[href^="#"]');
            const prevRail = event.target.closest("[data-rail-prev]");
            const nextRail = event.target.closest("[data-rail-next]");
            const cacheButton = event.target.closest("#clear-cache-link");

            if (prevRail || nextRail) {
                event.preventDefault();
                const control = prevRail || nextRail;
                UI.scrollRail(control.dataset.railPrev || control.dataset.railNext, prevRail ? -1 : 1);
                return;
            }

            if (hashLink) {
                Events.handleHashLink(event, hashLink);
                return;
            }

            if (cacheButton) {
                Events.clearSiteCache(event);
            }
        },

        handleHashLink: (event, link) => {
            const href = link.getAttribute("href");
            if (!href || href === "#") return;

            try {
                const target = DOM.qs(href);
                if (!target) return;
                event.preventDefault();
                target.scrollIntoView({ behavior: "smooth" });
            } catch (error) {
                console.warn("[Navigation] Invalid hash target", href);
            }
        },

        handleFormSubmit: async (event) => {
            event.preventDefault();

            const form = event.currentTarget;
            const button = form.querySelector('button[type="submit"]');
            if (!button) return;

            button.disabled = true;
            button.textContent = "Sending...";

            try {
                const response = await fetch(form.action, {
                    method: form.method,
                    body: new FormData(form),
                    headers: { Accept: "application/json" },
                });

                form.innerHTML = `<p class="text-${response.ok ? "success" : "danger"} fw-bold text-center">${response.ok ? "Message sent!" : "Error sending message."}</p>`;
            } catch (error) {
                console.error("[Form] Submit failed", error);
                form.innerHTML = '<p class="text-danger fw-bold text-center">Something went wrong.</p>';
            }
        },

        clearSiteCache: (event) => {
            event.preventDefault();

            try {
                localStorage.clear();
                sessionStorage.clear();
            } catch (error) {
                console.warn("[Cache] Storage clear failed", error);
            }

            if ("serviceWorker" in navigator) {
                navigator.serviceWorker.getRegistrations()
                    .then((registrations) => registrations.forEach((registration) => registration.unregister()))
                    .catch((error) => console.warn("[Cache] Service worker clear failed", error));
            }

            const url = new URL(window.location.href);
            url.searchParams.set("nocache", Date.now());
            alert("Local site cache cleared. The page will now reload with the latest version.");
            window.location.replace(url.toString());
        },
    };

    const App = {
        init: async () => {
            await Promise.all([
                Data.loadComponent("navbar", "/components/navbar.html", () => {
                    UI.initNavbar();
                    UI.initMobileMenu();
                    UI.initDownloadButtons();
                    Render.navbarGameRail();
                }),
                Data.loadComponent("footer", "/components/footer.html"),
            ]);

            UI.initScrollReveal();
            UI.initBackToTop();
            UI.initCounters();
            Events.init();
            Router.run();
        },

        showMessage: (message, href = "/", label = "Return Home") => {
            const main = DOM.qs("main");
            if (!main) return;

            main.innerHTML = `
                <div class="container text-center py-5">
                    <p class="text-danger fw-bold text-uppercase">${Utils.escapeHTML(message)}</p>
                    <a class="btn btn-danger text-uppercase fw-bold" href="${href}">${Utils.escapeHTML(label)}</a>
                </div>
            `;
        },
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", App.init, { once: true });
    } else {
        App.init();
    }
})();
