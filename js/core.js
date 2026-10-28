/**
 * @fileoverview Reflex Interactive Core Engine
 * @version v2.0.0
 * @description Core site interactions, content rendering, and launcher presentation.
 */
(() => {
    "use strict";

    const SITE_CONFIG = window.REFLEX_SITE_CONFIG || {};

    const CONFIG = {
        api: {
            news: SITE_CONFIG.urls?.news || "https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json",
            games: SITE_CONFIG.urls?.games || "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json",
            products: SITE_CONFIG.api?.products || "/.netlify/functions/products",
            createCheckout: SITE_CONFIG.api?.createCheckout || "/.netlify/functions/create-checkout-session",
        },
        siteUrl: SITE_CONFIG.urls?.site || "https://reflexinteractive.com",
        logo: SITE_CONFIG.urls?.logo || "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png",
        locale: SITE_CONFIG.locale || "en-GB",
        defaultCurrency: SITE_CONFIG.defaultCurrency || "GBP",
        launcherRuntime: SITE_CONFIG.launcherRuntime || "win-x64",
        navScrollY: SITE_CONFIG.ui?.navScrollY || 24,
        subdomains: {
            support: SITE_CONFIG.urls?.support || "https://support.reflexinteractive.com/",
            careers: SITE_CONFIG.urls?.careers || "https://careers.reflexinteractive.com/",
        },
        launcher: {
            baseUrl: SITE_CONFIG.urls?.launcherFiles || "https://cdn.reflexinteractive.com/launcher-files",
            versionUrl: SITE_CONFIG.urls?.launcherVersion || "https://cdn.reflexinteractive.com/launcher-files/version.json",
        },
        localRoutes: {
            "/careers": "/careers.html",
            "/game-details": "/game-details.html",
            "/games": "/games.html",
            "/newswire": "/newswire.html",
            "/newswire-details": "/newswire-details.html",
            "/privacy": "/privacy.html",
            "/returns": "/returns.html",
            "/shop": "/store.html",
            "/store": "/store.html",
            "/support": "/support.html",
            "/terms": "/terms.html",
            "/tos": "/terms.html",
        },
    };

    const state = {
        cache: new Map(),
        supportHost: window.location.hostname.startsWith("support."),
        support: {
            articles: [],
            games: [],
            selectedCategory: "",
            selectedGame: "",
            selectedGameTitle: "",
            query: "",
        },
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
            // Do not rewrite Stripe hosted files or external non-cloudinary URLs
            if (url.includes("files.stripe.com") || url.includes("stripe.com")) {
                return url;
            }
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

        linkedDetailId: (game = {}) => {
            if (!game.link) return "";
            try {
                return new URL(game.link, window.location.origin).searchParams.get("id") || "";
            } catch {
                return "";
            }
        },

        gameMatchesId: (game = {}, id = "") => {
            const value = String(id);
            if (String(game.id) === value || String(game.numeric_id) === value) return true;
            if (utils.linkedDetailId(game) === value) return true;
            if (Array.isArray(game.aliases) && game.aliases.map(String).includes(value)) return true;
            return false;
        },

        isMobileDevice: () => {
            const ua = navigator.userAgent.toLowerCase();
            return /android|iphone|ipad|ipod|iemobile|mobile|tablet/.test(ua);
        },

        currentLauncherRuntime: () => {
            if (utils.isMobileDevice()) return "";

            const ua = navigator.userAgent.toLowerCase();
            const uaDataPlatform = navigator.userAgentData?.platform || "";
            const platform = `${uaDataPlatform} ${navigator.platform || ""}`.toLowerCase();

            if (!ua.includes("win") && !platform.includes("win")) return "";
            if (ua.includes("arm") || platform.includes("arm")) return "";
            return CONFIG.launcherRuntime;
        },

        launcherPackageUrl: (packageInfo = {}) => {
            const explicit = packageInfo.url || packageInfo.download_url || packageInfo.downloadUrl;
            if (explicit) return explicit;

            const relative = packageInfo.installer || packageInfo.filename || packageInfo.path || packageInfo.key || packageInfo.file || "";
            if (!relative) return "";

            try {
                return new URL(relative, `${CONFIG.launcher.baseUrl.replace(/\/$/, "")}/`).toString();
            } catch {
                return "";
            }
        },

        newestFirst: (items = []) => [...items].sort((a, b) => {
            const at = Date.parse(a.date || a.release_date || a.updated || "");
            const bt = Date.parse(b.date || b.release_date || b.updated || "");
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
            let timer = 0;
            let frame = 0;
            let latestArgs;

            return (...args) => {
                latestArgs = args;
                if (timer || frame) return;

                const run = () => {
                    frame = requestAnimationFrame(() => {
                        frame = 0;
                        last = performance.now();
                        fn(...latestArgs);
                    });
                };
                const delay = Math.max(0, wait - (performance.now() - last));

                if (delay) {
                    timer = window.setTimeout(() => {
                        timer = 0;
                        run();
                    }, delay);
                    return;
                }

                run();
            };
        },

        spinner: (id, show) => dom.id(id)?.classList.toggle("d-none", !show),

        categoryLabel: (value = "general") => ({
            technical: "Technical",
            "bug-report": "Bug Report",
            downloads: "Downloads",
            general: "General",
        }[value] || String(value).replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())),

        articleText: (article = {}) => {
            const blocks = Array.isArray(article.content) ? article.content : [article.content || ""];
            return blocks.map((block) => {
                if (typeof block === "string") return block;
                if (Array.isArray(block.items)) return block.items.join(" ");
                return block.text || "";
            }).join(" ");
        },
    };

    const data = {
        json: async (url) => {
            const cached = state.cache.get(url);
            if (cached) return cached;

            const request = fetch(url, { headers: { Accept: "application/json" } })
                .then((response) => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.json();
                });

            state.cache.set(url, request);

            try {
                return await request;
            } catch (error) {
                state.cache.delete(url);
                throw error;
            }
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

        // Fetch games directly from Stripe product endpoint instead of Gists
        games: async () => {
            try {
                const response = await fetch(`${CONFIG.api.products}?catalog=games`, { headers: { Accept: "application/json" } });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const payload = await response.json();
                let products = payload.products || [];

                // Sort globally: Missing or future dates first (highest priority at top), then newest to oldest past dates
                products.sort((a, b) => {
                    const dateA = a.releaseDate ? Date.parse(a.releaseDate) : NaN;
                    const dateB = b.releaseDate ? Date.parse(b.releaseDate) : NaN;
                    const now = Date.now();

                    const isFutureOrMissingA = Number.isNaN(dateA) || dateA > now;
                    const isFutureOrMissingB = Number.isNaN(dateB) || dateB > now;

                    if (isFutureOrMissingA && !isFutureOrMissingB) return -1;
                    if (!isFutureOrMissingA && isFutureOrMissingB) return 1;
                    if (isFutureOrMissingA && isFutureOrMissingB) return 0;

                    // If both are past release dates, sort newest first
                    return dateB - dateA;
                });

                return products.map(product => ({
                    id: product.id,
                    numeric_id: product.id,
                    title: product.name,
                    description: product.description,
                    image_url: product.image || "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532765/Reflex_Interactive_f3zylo.png",
                    hero_image_url: product.image || "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532765/Reflex_Interactive_f3zylo.png",
                    genre: product.genre || "",
                    developer: product.developer || "Reflex Interactive",
                    publisher: product.publisher || "Reflex Interactive",
                    trailer_url: product.trailerUrl || "",
                    priceId: product.priceId,
                    unitAmount: product.unitAmount,
                    currency: product.currency,
                    comingSoon: product.comingSoon || false,
                    releaseDate: product.releaseDate || "",
                    date: product.releaseDate || ""
                }));
            } catch (error) {
                console.error("[Data] Failed to load games from Stripe products", error);
                return [];
            }
        },

        news: async () => utils.newestFirst(await data.json(CONFIG.api.news)),
        supportArticles: async () => utils.newestFirst(await data.json(CONFIG.api.supportArticles)),
    };

    const templates = {
        arrow: '<span aria-hidden="true">></span>',

        newsCard: (article) => `
            <article class="card modern-card news-card h-100">
                <a href="${utils.detailHref("newswire-details", article.id)}" class="d-flex h-100 flex-column">
                    <img src="${utils.normalizeMedia(article.image_url, 720)}" alt="${utils.escape(article.title)}" width="720" height="405" class="modern-card-img" loading="eager" decoding="async">
                    <div class="card-body d-flex flex-column">
                        <time class="modern-card-date" datetime="${utils.escape(article.date)}">${utils.escape(article.date)}</time>
                        <h3 class="modern-card-title">${utils.escape(article.title)}</h3>
                        <span class="modern-card-cta mt-auto">Read more ${templates.arrow}</span>
                    </div>
                </a>
            </article>
        `,

        gameCard: (game) => `
            <article class="card modern-game-card h-100">
                <a href="/game-details?id=${encodeURIComponent(game.id)}" class="modern-game-card-anchor" aria-label="Explore ${utils.escape(game.title)}">
                    <img src="${utils.normalizeMedia(game.image_url, 720)}" alt="${utils.escape(game.title)} cover art" width="720" height="405" class="modern-game-card-img" loading="eager" decoding="async">
                    <div class="modern-game-card-overlay">
                        <h3 class="modern-game-card-title">${utils.escape(game.title)}</h3>
                        <span class="modern-game-card-link">View Details ${templates.arrow}</span>
                    </div>
                </a>
            </article>
        `,

        supportGame: (game) => `
            <button type="button" class="card modern-card h-100 text-decoration-none support-game-card" data-support-game="${utils.escape(game.id)}" data-support-game-title="${utils.escape(game.title)}">
                <img src="${utils.normalizeMedia(game.image_url, 700)}" alt="${utils.escape(game.title)} support category" width="700" height="394" class="modern-game-card-img support-tile-img" loading="eager" decoding="async">
                <div class="card-img-overlay d-flex align-items-center justify-content-center">
                    <h3 class="text-white fw-bold m-0">${utils.escape(game.title)}</h3>
                </div>
            </button>
        `,

        supportArticleCard: (article, gameTitle = "All games") => `
            <article class="card support-article-card">
                <div class="card-body">
                    <div class="support-card-meta">
                        <span>${utils.escape(utils.categoryLabel(article.category))}</span>
                        <span>${utils.escape(gameTitle)}</span>
                    </div>
                    <h3 class="modern-card-title mb-2">${utils.escape(article.title)}</h3>
                    <p class="modern-card-summary mb-3">${utils.escape(article.summary)}</p>
                    <div class="support-card-footer">
                        <time class="modern-card-date mb-0" datetime="${utils.escape(article.updated || article.date || "")}">${utils.escape(article.updated || article.date || "Updated recently")}</time>
                        <button class="btn btn-outline-light btn-sm" type="button" data-support-article="${utils.escape(article.id)}">Read</button>
                    </div>
                </div>
            </article>
        `,

        storeCard: (product) => {
            const isGameCatalog = document.body.dataset.catalog === "games";
            const detailHref = isGameCatalog
                ? `/game-details?id=${encodeURIComponent(product.id)}`
                : `/shop?id=${encodeURIComponent(product.id)}`;
            const priceFormatted = product.unitAmount === 0
                ? "FREE"
                : new Intl.NumberFormat(navigator.language || CONFIG.locale, {
                    style: "currency",
                    currency: product.currency.toUpperCase(),
                }).format(product.unitAmount / 100);

            const imageUrl = product.image ? utils.normalizeMedia(product.image, 720) : "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532765/Reflex_Interactive_f3zylo.png";
            const isComingSoon = product.comingSoon;

            return `
                <article class="card modern-card store-card h-100">
                    <a class="store-card-link" href="${detailHref}" aria-label="View ${utils.escape(product.name)} details">
                        <div class="position-relative">
                            ${isComingSoon ? '<span class="position-absolute top-0 start-0 m-3 badge bg-danger text-uppercase fw-bold shadow">Coming Soon</span>' : ''}
                            <img src="${imageUrl}" alt="${utils.escape(product.name)}" width="720" height="405" class="modern-card-img" loading="eager" decoding="async">
                        </div>
                        <div class="card-body d-flex flex-column">
                            <span class="badge bg-secondary mb-2 align-self-start">${utils.escape(product.type)}</span>
                            <h3 class="modern-card-title">${utils.escape(product.name)}</h3>
                            <p class="text-muted small mb-3">${utils.escape(product.description)}</p>
                            <span class="fs-5 fw-bold text-white mt-auto">${priceFormatted}</span>
                        </div>
                    </a>
                    <div class="store-card-actions">
                        ${isComingSoon
                            ? '<button type="button" class="btn btn-outline-secondary btn-sm" disabled>Coming Soon</button>'
                            : `<button type="button" class="btn btn-danger btn-sm" data-checkout-product="${utils.escape(product.id)}" data-checkout-price="${utils.escape(product.priceId)}" data-checkout-catalog="${document.body.dataset.catalog || "games"}">${product.unitAmount === 0 ? "Get Free" : isGameCatalog ? "Buy Game" : "Buy Merch"}</button>`
                        }
                    </div>
                </article>
            `;
        },
    };

    const railControllers = new WeakMap();

    const ui = {
        initDownloadButtons: async () => {
            const buttons = dom.qsa(".launcher-download-btn");
            if (!buttons.length) return;

            const runtime = utils.currentLauncherRuntime();

            const removeButtons = () => {
                buttons.forEach((button) => button.remove());
            };

            const disable = (label = "Launcher unavailable") => {
                buttons.forEach((button) => {
                    button.href = "#";
                    button.removeAttribute("download");
                    button.setAttribute("aria-disabled", "true");
                    button.classList.add("opacity-50", "cursor-not-allowed");
                    button.textContent = label;
                });
            };

            const enableFallbackDownload = () => {
                const href = utils.fallbackLauncherPackageUrl();
                if (!href) {
                    disable("Launcher temporarily unavailable");
                    return;
                }

                buttons.forEach((button) => {
                    button.href = href;
                    button.download = "Reflex Interactive Launcher.msi";
                    button.removeAttribute("aria-disabled");
                    button.classList.remove("opacity-50", "cursor-not-allowed");
                    button.textContent = "Download Launcher";
                });
            };

            if (!runtime) {
                removeButtons();
                return;
            }

            buttons.forEach((button) => {
                button.textContent = "Preparing launcher...";
                button.setAttribute("aria-disabled", "true");
                button.classList.add("opacity-50", "cursor-not-allowed");
            });

            try {
                const response = await fetch(`${CONFIG.launcher.versionUrl}?t=${Date.now()}`, {
                    headers: { Accept: "application/json" },
                    cache: "no-store",
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const packageInfo = await response.json();
                if (packageInfo.runtime && packageInfo.runtime !== runtime) {
                    throw new Error(`No launcher package for ${runtime}`);
                }

                const href = utils.launcherPackageUrl(packageInfo);
                if (!href) throw new Error(`No launcher package for ${runtime}`);

                buttons.forEach((button) => {
                    button.href = href;
                    button.download = packageInfo.installer || packageInfo.filename || `ReflexInteractiveLauncher-${runtime}.msi`;
                    button.removeAttribute("aria-disabled");
                    button.classList.remove("opacity-50", "cursor-not-allowed");
                    button.textContent = "Download Launcher";
                });
            } catch (error) {
                console.warn("[Launcher] Version file unavailable", error);
                enableFallbackDownload();
            }
        },

        fallbackLauncherPackageUrl: () => {
            try {
                return new URL("Reflex Interactive Launcher.msi", `${CONFIG.launcher.baseUrl.replace(/\/$/, "")}/`).toString();
            } catch {
                return "";
            }
        },

        initRail: (rail) => {
            if (!rail) return null;
            const existing = railControllers.get(rail);
            if (existing) {
                existing.refresh();
                return existing;
            }

            const shell = rail.closest(".rail-shell");
            if (!shell) return null;
            const label = rail.getAttribute("aria-label") || "Carousel";
            rail.setAttribute("role", "region");
            rail.setAttribute("aria-roledescription", "carousel");

            let pages = [0];
            let dots = [];
            let updateFrame = 0;
            let observer = null;
            let requestedPage = null;
            let settleTimer = 0;
            const reducedMotion = () => document.documentElement.dataset.motion === "reduced"
                || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            const currentPage = () => pages.reduce((best, offset, index) =>
                Math.abs(offset - rail.scrollLeft) < Math.abs(pages[best] - rail.scrollLeft) ? index : best, 0);

            const update = () => {
                updateFrame = 0;
                const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
                const page = currentPage();
                shell.querySelectorAll("[data-rail-prev]").forEach((button) => {
                    const disabled = maxScroll <= 1 || rail.scrollLeft <= 1;
                    button.disabled = disabled;
                    button.setAttribute("aria-disabled", String(disabled));
                });
                shell.querySelectorAll("[data-rail-next]").forEach((button) => {
                    const disabled = maxScroll <= 1 || rail.scrollLeft >= maxScroll - 1;
                    button.disabled = disabled;
                    button.setAttribute("aria-disabled", String(disabled));
                });
                dots.forEach((dot, index) => {
                    const active = index === page;
                    dot.classList.toggle("is-active", active);
                    if (active) dot.setAttribute("aria-current", "true");
                    else dot.removeAttribute("aria-current");
                });
            };

            const scheduleUpdate = () => {
                if (!updateFrame) updateFrame = requestAnimationFrame(update);
                window.clearTimeout(settleTimer);
                settleTimer = window.setTimeout(() => { requestedPage = null; }, 450);
            };

            const goToPage = (index) => {
                requestedPage = Math.max(0, Math.min(index, pages.length - 1));
                const target = pages[requestedPage] || 0;
                rail.scrollTo({ left: target, behavior: reducedMotion() ? "auto" : "smooth" });
            };

            const refresh = () => {
                const items = Array.from(rail.children).filter((item) => item.classList.contains("rail-item"));
                const railRect = rail.getBoundingClientRect();
                const offsets = items.map((item) => Math.max(0, item.getBoundingClientRect().left - railRect.left - rail.clientLeft + rail.scrollLeft));
                items.forEach((item, index) => {
                    item.setAttribute("role", "group");
                    item.setAttribute("aria-roledescription", "slide");
                    item.setAttribute("aria-label", `${index + 1} of ${items.length}`);
                });

                const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
                pages = [0];
                requestedPage = null;
                const pageStep = Math.max(1, rail.clientWidth - (items[0]?.getBoundingClientRect().width || 0) * 0.12);
                let pageOffset = 0;
                while (pageOffset < maxScroll - 1 && pages.length <= items.length) {
                    const threshold = pageOffset + pageStep;
                    let next = offsets.find((offset) => offset > pageOffset + 2 && offset >= threshold - 2);
                    if (next === undefined || next >= maxScroll - 1) next = maxScroll;
                    if (next <= pageOffset + 1) next = maxScroll;
                    if (next <= pageOffset + 1) break;
                    pages.push(next);
                    pageOffset = next;
                }

                let pagination = shell.querySelector(".rail-pagination");
                if (!pagination) {
                    pagination = document.createElement("div");
                    pagination.className = "rail-pagination";
                    pagination.setAttribute("role", "group");
                    pagination.setAttribute("aria-label", `${label} pages`);
                    shell.appendChild(pagination);
                }
                pagination.replaceChildren();
                dots = pages.length > 1 ? pages.map((_, index) => {
                    const dot = document.createElement("button");
                    dot.type = "button";
                    dot.className = "rail-dot";
                    dot.setAttribute("aria-label", `Go to ${label.toLowerCase()} page ${index + 1}`);
                    dot.addEventListener("click", () => goToPage(index));
                    pagination.appendChild(dot);
                    return dot;
                }) : [];
                pagination.hidden = dots.length < 2;
                rail.scrollLeft = Math.min(rail.scrollLeft, maxScroll);
                scheduleUpdate();
            };

            const controller = {
                refresh,
                move: (direction) => goToPage((requestedPage ?? currentPage()) + direction),
                observer: null,
            };
            railControllers.set(rail, controller);
            rail.addEventListener("scroll", scheduleUpdate, { passive: true });
            rail.addEventListener("scrollend", () => { requestedPage = null; }, { passive: true });
            if ("ResizeObserver" in window) {
                observer = new window.ResizeObserver(refresh);
                observer.observe(rail);
                if (rail.firstElementChild) observer.observe(rail.firstElementChild);
                controller.observer = observer;
            } else {
                window.addEventListener("resize", refresh, { passive: true });
            }
            refresh();
            return controller;
        },

        scrollRail: (id, direction) => {
            const rail = dom.id(id);
            const controller = rail && (railControllers.get(rail) || ui.initRail(rail));
            controller?.move(direction);
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
                    fragment.appendChild(wrapper);
                });

                container.replaceChildren(fragment);
            } catch (error) {
                console.error(`[Render] ${containerId}`, error);
                container.innerHTML = `<div class="text-center text-danger py-5">${utils.escape(empty)}</div>`;
            } finally {
                utils.spinner(spinnerId, false);
                if (container.classList.contains("content-rail")) ui.initRail(container);
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

        supportPage: async () => {
            await Promise.allSettled([
                render.supportGames(),
                render.supportArticles(),
            ]);
        },

        supportGames: async () => {
            const container = dom.id("support-game-grid");
            if (!container) return;

            try {
                const games = await data.games();
                state.support.games = games;

                const fragment = document.createDocumentFragment();
                games.forEach((game) => {
                    const wrapper = document.createElement("div");
                    wrapper.className = "col";
                    wrapper.innerHTML = templates.supportGame(game);
                    fragment.appendChild(wrapper);
                });
                container.replaceChildren(fragment);
                render.supportGameOptions(games);
                if (state.support.articles.length) render.supportArticleResults();
            } catch (error) {
                console.error("[Render] support games", error);
                container.innerHTML = '<div class="col text-center text-danger py-5">Game support categories are temporarily unavailable.</div>';
            }
        },

        supportGameOptions: (games = []) => {
            const select = dom.id("support-ticket-game");
            if (!select) return;

            const selected = select.value;
            select.innerHTML = '<option value="">Not game-specific</option>';
            games.forEach((game) => {
                const option = document.createElement("option");
                option.value = game.id;
                option.textContent = game.title;
                select.appendChild(option);
            });
            select.value = games.some((game) => String(game.id) === selected) ? selected : "";
        },

        supportArticles: async () => {
            const container = dom.id("support-articles-grid");
            if (!container) return;

            utils.spinner("support-articles-loading", true);
            try {
                state.support.articles = await data.supportArticles();
                render.supportArticleResults();
            } catch (error) {
                console.error("[Render] support articles", error);
                container.innerHTML = '<div class="support-empty-state text-danger">Support articles are temporarily unavailable. Please email support@reflexinteractive.com.</div>';
            } finally {
                utils.spinner("support-articles-loading", false);
            }
        },

        supportArticleResults: () => {
            const container = dom.id("support-articles-grid");
            const summary = dom.id("support-active-filters");
            if (!container) return;

            const query = state.support.query.trim().toLowerCase();
            const category = state.support.selectedCategory;
            const gameId = state.support.selectedGame;
            const gameMap = new Map(state.support.games.map((game) => [String(game.id), game.title]));

            const articles = state.support.articles.filter((article) => {
                const articleGame = String(article.game_id || "all");
                const matchesGame = !gameId || articleGame === "all" || articleGame === "general" || articleGame === String(gameId);
                const matchesCategory = !category || article.category === category;
                const haystack = [
                    article.title,
                    article.summary,
                    article.category,
                    articleGame,
                    ...(Array.isArray(article.tags) ? article.tags : []),
                    utils.articleText(article),
                ].join(" ").toLowerCase();
                const matchesQuery = !query || haystack.includes(query);
                return matchesGame && matchesCategory && matchesQuery;
            });

            const labels = [];
            if (query) labels.push(`search "${state.support.query.trim()}"`);
            if (category) labels.push(utils.categoryLabel(category));
            if (gameId) labels.push(state.support.selectedGameTitle || gameMap.get(String(gameId)) || "Selected game");
            if (summary) summary.textContent = `${articles.length} article${articles.length === 1 ? "" : "s"} shown${labels.length ? ` for ${labels.join(", ")}` : ""}`;

            if (!articles.length) {
                container.innerHTML = `
                    <div class="support-empty-state">
                        <h3 class="h5 fw-bold mb-2">No matching articles</h3>
                        <p class="text-muted mb-3">Try another search or send a ticket and include as much detail as possible.</p>
                        <a class="btn btn-danger" href="#contact-section">Contact support</a>
                    </div>
                `;
                return;
            }

            const fragment = document.createDocumentFragment();
            articles.forEach((article) => {
                const gameTitle = article.game_id && article.game_id !== "all"
                    ? gameMap.get(String(article.game_id)) || "Selected game"
                    : "All games";
                const wrapper = document.createElement("div");
                wrapper.innerHTML = templates.supportArticleCard(article, gameTitle);
                fragment.appendChild(wrapper.firstElementChild);
            });
            container.replaceChildren(fragment);
        },

        supportArticleContent: (article) => {
            if (typeof article.content === "string") return utils.textToHTML(article.content);
            if (!Array.isArray(article.content)) return "";

            return article.content.map((block) => {
                if (typeof block === "string") return utils.textToHTML(block);
                if (block.type === "list" && Array.isArray(block.items)) {
                    return `<ul>${block.items.map((item) => `<li>${utils.escape(item)}</li>`).join("")}</ul>`;
                }
                if (block.type === "heading") return `<h3>${utils.escape(block.text)}</h3>`;
                return `<p>${utils.escape(block.text || "")}</p>`;
            }).join("");
        },

        supportArticleDetail: (id) => {
            const viewer = dom.id("support-article-viewer");
            if (!viewer) return;

            const article = state.support.articles.find((item) => String(item.id) === String(id));
            if (!article) return;

            const game = state.support.games.find((item) => String(item.id) === String(article.game_id));
            viewer.innerHTML = `
                <article class="support-article-detail">
                    <button class="support-back-link" type="button" data-support-close-article>Back to articles</button>
                    <div class="support-card-meta mb-3">
                        <span>${utils.escape(utils.categoryLabel(article.category))}</span>
                        <span>${utils.escape(game?.title || "All games")}</span>
                        <time datetime="${utils.escape(article.updated || article.date || "")}">${utils.escape(article.updated || article.date || "Updated recently")}</time>
                    </div>
                    <h3 class="display-6 fw-bold mb-3">${utils.escape(article.title)}</h3>
                    <p class="text-muted fs-5">${utils.escape(article.summary || "")}</p>
                    <div class="news-detail-content support-detail-content">
                        ${render.supportArticleContent(article)}
                    </div>
                    <div class="d-flex flex-wrap gap-2 mt-4">
                        <button class="btn btn-danger" type="button" data-support-article-ticket="${utils.escape(article.id)}">Use in support ticket</button>
                        <a class="btn btn-outline-light" href="#contact-section">Contact support</a>
                    </div>
                </article>
            `;
            viewer.classList.remove("d-none");
            viewer.scrollIntoView({ behavior: "smooth", block: "start" });
        },

        featuredGame: async () => {
            const slot = dom.id("featured-game-slot");
            if (!slot) return;

            try {
                const [game] = await data.games();
                const image = utils.normalizeMedia(game.hero_image_url || game.image_url, 900);
                slot.innerHTML = `
                    <div class="row g-0 align-items-stretch">
                        <div class="col-12 col-lg-5">
                            <div class="featured-media">
                                <img src="${image}" alt="${utils.escape(game.title)} key art" width="900" height="506" loading="eager" decoding="async">
                            </div>
                        </div>
                        <div class="col-12 col-lg-7">
                            <div class="featured-body">
                                <p class="section-kicker mb-3">Featured Game</p>
                                <h3 class="display-5 fw-bold mb-3">${utils.escape(game.title)}</h3>
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
                dom.setMeta('meta[property="og:image:secure_url"]', image);
                dom.setMeta('meta[property="og:image:alt"]', `Newswire key art for ${article.title}`);
                dom.setMeta('meta[property="og:url"]', url);
                dom.setMeta('meta[name="twitter:title"]', title);
                dom.setMeta('meta[name="twitter:description"]', description);
                dom.setMeta('meta[name="twitter:image"]', image);
                dom.setMeta('meta[name="twitter:image:alt"]', `Newswire key art for ${article.title}`);

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
                        inLanguage: CONFIG.locale,
                        author: { "@type": "Organization", "@id": "https://reflexinteractive.com/#organization", name: "Reflex Interactive" },
                        publisher: {
                            "@type": "Organization",
                            "@id": "https://reflexinteractive.com/#organization",
                            name: "Reflex Interactive",
                            logo: { "@type": "ImageObject", url: CONFIG.logo },
                            address: {
                                "@type": "PostalAddress",
                                streetAddress: "Bartle House, 9 Oxford Court",
                                addressLocality: "Manchester",
                                postalCode: "M2 3WQ",
                                addressCountry: "GB",
                            },
                        },
                    });
                }

                dom.setText("article-title", article.title);
                dom.setText("article-date", article.date);
                dom.setHTML("article-content", utils.textToHTML(article.content));

                const img = dom.id("article-image");
                if (img) {
                    img.src = image;
                }
            } catch (error) {
                console.error("[Render] article detail", error);
                app.message("Failed to load article.", "/newswire", "Back to Newswire");
            }
        },

        storePage: async () => {
            const container = dom.id("store-products-container");
            if (!container) {
                console.error("[Store] Critical Error: #store-products-container element not found in DOM!");
                return;
            }

            utils.spinner("store-loading-spinner", true);

            try {
                const catalog = document.body.dataset.catalog === "shop" ? "shop" : "games";
                const response = await fetch(`${CONFIG.api.products}?catalog=${catalog}`, {
                    headers: { Accept: "application/json" },
                });


                if (!response.ok) {
                    let errorDetails = "";
                    try {
                        errorDetails = await response.text();
                    } catch {
                        errorDetails = "Could not parse error body";
                    }
                    throw new Error(`HTTP ${response.status}: ${errorDetails}`);
                }

                const dataPayload = await response.json();

                const expectedCatalog = catalog;
                const products = (dataPayload.products || []).filter((product) => {
                    const metadata = product.metadata || {};
                    const isGame = String(metadata.game || "").toLowerCase() === "true";
                    const isApparel = [metadata.apparel, metadata.merch]
                        .some((value) => String(value || "").toLowerCase() === "true");
                    return expectedCatalog === "games"
                        ? isGame && !isApparel
                        : isApparel && !isGame;
                });

                if (!products.length) {
                    const catalogLabel = catalog === "games" ? "games" : "merchandise";
                    container.innerHTML = `<div class="text-center text-muted py-5">No ${catalogLabel} are available right now.</div>`;
                    return;
                }

                const fragment = document.createDocumentFragment();
                products.forEach((product) => {
                    const wrapper = document.createElement("div");
                    wrapper.className = "col";
                    wrapper.innerHTML = templates.storeCard(product);
                    fragment.appendChild(wrapper);
                });

                container.replaceChildren(fragment);
            } catch (error) {
                console.error("[Store] Failed to load store products:", error);
                container.innerHTML = `<div class="text-center text-danger py-5">Unable to load store products.<br><small class="text-muted">Details: ${utils.escape(error.message)}</small></div>`;
            } finally {
                utils.spinner("store-loading-spinner", false);
            }
        },

        storeDetail: async (productId) => {
            const gridView = dom.id("store-grid-view");
            const detailView = dom.id("store-detail-view");
            if (!gridView || !detailView) return;

            try {
                const response = await fetch(`${CONFIG.api.products}?catalog=shop`, {
                    headers: { Accept: "application/json" },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const dataPayload = await response.json();
                const products = dataPayload.products || [];
                const product = products.find(p => String(p.id) === String(productId));

                if (!product) {
                    throw new Error("Product not found");
                }

                gridView.classList.add("d-none");
                detailView.classList.remove("d-none");

                const imageUrl = product.image ? utils.normalizeMedia(product.image, 1200) : "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532765/Reflex_Interactive_f3zylo.png";

                const imgNode = dom.id("detail-image");
                if (imgNode) {
                    imgNode.src = imageUrl;
                    imgNode.alt = product.name;
                }

                dom.setText("detail-type", product.type || "Game");
                dom.setText("detail-title", product.name);
                dom.setText("detail-description", product.description);

                const priceFormatted = product.unitAmount === 0
                    ? "FREE"
                    : new Intl.NumberFormat(navigator.language || CONFIG.locale, {
                        style: "currency",
                        currency: product.currency.toUpperCase(),
                    }).format(product.unitAmount / 100);

                dom.setText("detail-price", priceFormatted);

                const isComingSoon = product.comingSoon;
                const checkoutBtn = dom.id("detail-checkout-btn");
                if (checkoutBtn) {
                    if (isComingSoon) {
                        checkoutBtn.removeAttribute("data-checkout-product");
                        checkoutBtn.removeAttribute("data-checkout-price");
                        checkoutBtn.classList.remove("btn-danger");
                        checkoutBtn.classList.add("btn-secondary", "opacity-50", "cursor-not-allowed");
                        checkoutBtn.setAttribute("disabled", "true");
                        checkoutBtn.textContent = "Coming Soon";
                    } else {
                        checkoutBtn.setAttribute("data-checkout-product", product.id);
                        checkoutBtn.setAttribute("data-checkout-price", product.priceId);
                        checkoutBtn.setAttribute("data-checkout-catalog", "shop");
                        checkoutBtn.textContent = product.unitAmount === 0 ? "Get Free" : `Buy Now - ${priceFormatted}`;
                    }
                }
            } catch (error) {
                console.error("[Store Detail] Error:", error);
                app.message("Product not found.", "/shop", "Back to Shop");
            }
        },

        gameDetail: async (id) => {
            if (!id) return app.message("Game not found.", "/games", "Back to Games");

            try {
                const response = await fetch(`${CONFIG.api.products}?catalog=games`, {
                    headers: { Accept: "application/json" },
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const dataPayload = await response.json();
                let products = dataPayload.products || [];

                // Sort: Missing or future dates first (highest priority at top), then newest to oldest past dates
                products.sort((a, b) => {
                    const dateA = a.releaseDate ? Date.parse(a.releaseDate) : NaN;
                    const dateB = b.releaseDate ? Date.parse(b.releaseDate) : NaN;
                    const now = Date.now();

                    const isFutureOrMissingA = Number.isNaN(dateA) || dateA > now;
                    const isFutureOrMissingB = Number.isNaN(dateB) || dateB > now;

                    if (isFutureOrMissingA && !isFutureOrMissingB) return -1;
                    if (!isFutureOrMissingA && isFutureOrMissingB) return 1;
                    if (isFutureOrMissingA && isFutureOrMissingB) return 0;

                    // If both are past release dates, sort newest first
                    return dateB - dateA;
                });

                const product = products.find(p => String(p.id) === String(id));

                if (!product) throw new Error("Product not found");

                const image = utils.normalizeMedia(product.image, 1200);
                const title = `${product.name} | Reflex Interactive`;

                document.title = title;
                dom.setText("game-detail-title", product.name);
                dom.setText("game-detail-developer", product.developer || "Reflex Interactive");
                dom.setText("game-detail-publisher", product.publisher || "Reflex Interactive");

                // Conditionally show/hide genre
                const genreContainer = dom.id("genre-container");
                if (genreContainer) {
                    if (product.genre) {
                        genreContainer.classList.remove("d-none");
                        dom.setText("game-detail-genre", product.genre);
                    } else {
                        genreContainer.classList.add("d-none");
                    }
                }

                // Localized formatting for release date
                let formattedReleaseDate = "To be announced";
                if (product.releaseDate) {
                    const parsedDate = Date.parse(product.releaseDate);
                    if (!Number.isNaN(parsedDate)) {
                        formattedReleaseDate = new Intl.DateTimeFormat(navigator.language || CONFIG.locale, {
                            year: "numeric",
                            month: "long",
                            day: "numeric"
                        }).format(new Date(parsedDate));
                    } else {
                        formattedReleaseDate = product.releaseDate;
                    }
                }
                dom.setText("game-detail-release-date", formattedReleaseDate);

                dom.setText("game-detail-description", product.description);

                const cover = dom.id("game-detail-cover");
                if (cover) {
                    cover.src = image;
                    cover.alt = `${product.name} official cover art`;
                }

                const heroNode = dom.id("game-hero");
                if (heroNode) heroNode.style.backgroundImage = `url('${image}')`;

                const screenshots = [];
                if (product.metadata) {
                    Object.keys(product.metadata).forEach((key) => {
                        if (/^image_\d+$/i.test(key) && product.metadata[key]) {
                            screenshots.push(product.metadata[key]);
                        }
                    });
                }

                render.gameMedia({
                    title: product.name,
                    trailer_url: product.trailerUrl || "",
                    screenshots: screenshots
                });

                const priceFormatted = product.unitAmount === 0
                    ? "FREE"
                    : new Intl.NumberFormat(navigator.language || CONFIG.locale, {
                        style: "currency",
                        currency: (product.currency || "gbp").toUpperCase(),
                    }).format(product.unitAmount / 100);

                dom.setText("game-detail-price", priceFormatted);

                const isComingSoon = product.comingSoon;
                const cta = dom.id("game-access-btn");
                if (cta) {
                    if (isComingSoon) {
                        cta.textContent = "Coming Soon";
                        cta.classList.add("btn-secondary", "disabled", "opacity-50", "cursor-not-allowed");
                        cta.classList.remove("btn-danger");
                        cta.setAttribute("aria-disabled", "true");
                    } else {
                        cta.textContent = product.unitAmount === 0 ? "Get Free" : `Buy Now - ${priceFormatted}`;
                        cta.classList.remove("disabled", "opacity-50", "cursor-not-allowed", "btn-secondary");
                        cta.classList.add("btn-danger");
                        cta.removeAttribute("aria-disabled");
                        cta.setAttribute("data-checkout-product", product.id);
                        cta.setAttribute("data-checkout-price", product.priceId);
                    }
                }
            } catch (error) {
                console.error("[Render] game detail error:", error);
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
                col.innerHTML = `<iframe src="${utils.escape(game.trailer_url)}" class="w-100 rounded-lg aspect-video mb-2" title="${utils.escape(game.title)} trailer" loading="eager" allowfullscreen></iframe>`;
                fragment.appendChild(col);
            }

            if (Array.isArray(game.screenshots)) {
                game.screenshots.forEach((shot) => {
                    const src = utils.normalizeMedia(shot.url || shot, 900);
                    const col = document.createElement("div");
                    col.className = "col";
                    col.innerHTML = `<img src="${src}" alt="${utils.escape(shot.caption || `${game.title} screenshot`)}" width="900" height="506" class="img-fluid rounded-lg" loading="eager" decoding="async">`;
                    fragment.appendChild(col);
                });
            }

            media.replaceChildren(fragment);
        },
    };

    const events = {
        init: () => {
            document.addEventListener("click", events.click);
            document.addEventListener("input", events.input);
            document.addEventListener("change", events.change);
            document.addEventListener("submit", events.submit);
        },

        click: (event) => {
            if (event.target.closest('[aria-disabled="true"]')) {
                event.preventDefault();
                return;
            }

            const prev = event.target.closest("[data-rail-prev]");
            const next = event.target.closest("[data-rail-next]");
            const hash = event.target.closest('a[href^="#"]');
            const clear = event.target.closest("#clear-cache-link");
            const supportCategory = event.target.closest("[data-support-category]");
            const supportGame = event.target.closest("[data-support-game]");
            const supportArticle = event.target.closest("[data-support-article]");
            const supportCloseArticle = event.target.closest("[data-support-close-article]");
            const supportClear = event.target.closest("#support-clear-filters");
            const supportTicketArticle = event.target.closest("[data-support-article-ticket]");
            const checkoutBtn = event.target.closest("[data-checkout-product]");

            if (prev || next) {
                event.preventDefault();
                const control = prev || next;
                ui.scrollRail(control.dataset.railPrev || control.dataset.railNext, prev ? -1 : 1);
                return;
            }

            if (supportCategory) {
                event.preventDefault();
                events.selectSupportCategory(supportCategory.dataset.supportCategory);
                return;
            }

            if (supportGame) {
                event.preventDefault();
                events.selectSupportGame(supportGame.dataset.supportGame, supportGame.dataset.supportGameTitle);
                return;
            }

            if (supportArticle) {
                event.preventDefault();
                render.supportArticleDetail(supportArticle.dataset.supportArticle);
                return;
            }

            if (supportCloseArticle) {
                event.preventDefault();
                dom.id("support-article-viewer")?.classList.add("d-none");
                dom.id("support-articles-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }

            if (supportClear) {
                event.preventDefault();
                events.clearSupportFilters();
                return;
            }

            if (supportTicketArticle) {
                event.preventDefault();
                events.useArticleInTicket(supportTicketArticle.dataset.supportArticleTicket);
                return;
            }

            if (checkoutBtn) {
                event.preventDefault();
                events.startCheckout(checkoutBtn.dataset.checkoutProduct, checkoutBtn.dataset.checkoutPrice, checkoutBtn.dataset.checkoutCatalog, checkoutBtn);
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

        input: (event) => {
            if (event.target?.id !== "support-search-input") return;
            state.support.query = event.target.value;
            dom.id("support-article-viewer")?.classList.add("d-none");
            render.supportArticleResults();
        },

        change: (event) => {
            if (event.target?.id === "support-ticket-category") {
                state.support.selectedCategory = event.target.value === "general" ? "" : event.target.value;
                dom.id("support-article-viewer")?.classList.add("d-none");
                render.supportArticleResults();
            }

            if (event.target?.id === "support-ticket-game") {
                const option = event.target.selectedOptions?.[0];
                events.selectSupportGame(event.target.value, option?.textContent || "", false);
            }
        },

        submit: async (event) => {
            const form = event.target;

            if (form?.id === "support-search-form") {
                event.preventDefault();
                state.support.query = dom.id("support-search-input")?.value || "";
                dom.id("support-article-viewer")?.classList.add("d-none");
                render.supportArticleResults();
                dom.id("support-articles-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }

            if (form?.id === "support-ticket-form") {
                event.preventDefault();
                events.submitSupportTicket(form);
                return;
            }

            if (form?.id !== "newsletter-form") return;

            event.preventDefault();
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

        selectSupportCategory: (category = "") => {
            state.support.selectedCategory = category;
            const select = dom.id("support-ticket-category");
            if (select && category) select.value = category;
            const subject = dom.id("support-ticket-subject");
            if (subject && !subject.value.trim()) subject.value = `${utils.categoryLabel(category)} support request`;
            dom.id("support-article-viewer")?.classList.add("d-none");
            render.supportArticleResults();
            dom.id("support-articles-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        },

        selectSupportGame: (id = "", title = "", scroll = true) => {
            state.support.selectedGame = id;
            state.support.selectedGameTitle = id ? title : "";

            const current = dom.id("support-current-selection");
            if (current) current.textContent = id ? `Selected: ${title}` : "No game selected";

            const select = dom.id("support-ticket-game");
            if (select) select.value = id;

            dom.qsa("[data-support-game]").forEach((button) => {
                button.classList.toggle("is-selected", String(button.dataset.supportGame) === String(id));
            });

            dom.id("support-article-viewer")?.classList.add("d-none");
            render.supportArticleResults();
            if (scroll) dom.id("support-articles-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        },

        clearSupportFilters: () => {
            state.support.selectedCategory = "";
            state.support.selectedGame = "";
            state.support.selectedGameTitle = "";
            state.support.query = "";

            const search = dom.id("support-search-input");
            if (search) search.value = "";
            const category = dom.id("support-ticket-category");
            if (category) category.value = "general";
            const game = dom.id("support-ticket-game");
            if (game) game.value = "";
            const current = dom.id("support-current-selection");
            if (current) current.textContent = "No game selected";
            dom.qsa("[data-support-game]").forEach((button) => button.classList.remove("is-selected"));
            dom.id("support-article-viewer")?.classList.add("d-none");

            render.supportArticleResults();
        },

        useArticleInTicket: (id) => {
            const article = state.support.articles.find((item) => String(item.id) === String(id));
            if (!article) return;

            const category = dom.id("support-ticket-category");
            const subject = dom.id("support-ticket-subject");
            const message = dom.id("support-ticket-message");

            if (category) category.value = article.category || "general";
            if (subject && !subject.value.trim()) subject.value = `Question about: ${article.title}`;
            if (message && !message.value.trim()) {
                message.value = `I read the support article "${article.title}" and still need help with:\n\n`;
                message.focus();
            }
            dom.id("contact-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
        },

        submitSupportTicket: (form) => {
            if (!form.reportValidity()) return;

            const values = Object.fromEntries(new FormData(form).entries());
            const subject = values.subject || `${utils.categoryLabel(values.category)} support request`;
            const body = [
                `Name: ${values.name}`,
                `Reply Email: ${values.email}`,
                `Category: ${utils.categoryLabel(values.category)}`,
                `Game: ${values.game ? state.support.games.find((game) => String(game.id) === String(values.game))?.title || values.game : "Not game-specific"}`,
                `Platform: ${values.platform || "Not provided"}`,
                "",
                "Details:",
                values.message,
                "",
                `Page: ${window.location.href}`,
            ].join("\n");

            const href = `mailto:support@reflexinteractive.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            const status = dom.id("support-form-status");
            if (status) status.textContent = "Opening your email app with the ticket details. If nothing opens, use the direct email button below.";
            window.location.href = href;
        },

        startCheckout: (productId, priceId, catalog, button) => window.ReflexStripe?.startCheckout(CONFIG.api.createCheckout, productId, priceId, catalog, button),
    };

    const router = {
        run: () => {
            if (document.body.dataset.ssrCatalog === "true") return;
            const path = window.location.pathname.replace(/\/$/, "") || "/";
            const params = new URLSearchParams(window.location.search);
            const id = params.get("id");

            if (path.includes("games")) {
                if (id) return render.gameDetail(id);
                return render.storePage();
            }

            if (path.includes("store")) {
                if (id) return render.storeDetail(id);
                return render.storePage();
            }

            if (path.includes("game-details") || (id && dom.id("game-hero"))) return render.gameDetail(id);
            if (path.includes("newswire-details") || (id && dom.id("article-detail"))) return render.articleDetail(id);
            if (path.includes("newswire")) return render.newsList("news-container");
            if (state.supportHost || path.includes("support")) return render.supportPage();

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
                    window.ReflexNavigation?.init(CONFIG);
                    ui.initDownloadButtons();
                }),
                data.component("footer", "/components/footer.html"),
            ]);
            window.ReflexNavigation?.initLinks(CONFIG);
            window.ReflexSettings?.init();
            document.dispatchEvent(new CustomEvent("reflex:components-ready"));
            ui.initBackToTop();
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
