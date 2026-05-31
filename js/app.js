/**
 * @fileoverview Reflex Interactive Core Engine
 * @version v2.0.0
 * @description Highlights: redesigned launcher UX, secured account and download flows, free-only library claims, and clean Windows x64 release packaging.
 */
(() => {
    "use strict";

    const SITE_CONFIG = window.REFLEX_SITE_CONFIG || {};

    const CONFIG = {
        api: {
            news: SITE_CONFIG.urls?.news || "https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json",
            games: SITE_CONFIG.urls?.games || "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json",
            supportArticles: SITE_CONFIG.urls?.supportArticles || "https://gist.githubusercontent.com/ryanduncuft/3308af53408db611254490f5c0b8611f/raw/reflex-support.json",
        },
        siteUrl: SITE_CONFIG.urls?.site || "https://reflexinteractive.com",
        logo: SITE_CONFIG.urls?.logo || "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png",
        locale: SITE_CONFIG.locale || "en-GB",
        defaultCurrency: SITE_CONFIG.defaultCurrency || "GBP",
        launcherRuntime: SITE_CONFIG.launcherRuntime || "win-x64",
        revealDelay: SITE_CONFIG.ui?.revealDelay || 70,
        navScrollY: SITE_CONFIG.ui?.navScrollY || 24,
        railRatio: SITE_CONFIG.ui?.railRatio || 0.86,
        subdomains: {
            support: SITE_CONFIG.urls?.support || "https://support.reflexinteractive.com/",
            careers: SITE_CONFIG.urls?.careers || "https://careers.reflexinteractive.com/",
            account: SITE_CONFIG.urls?.account || "https://reflexinteractive.com/account",
        },
        downloads: {
            protectedBaseUrl: SITE_CONFIG.urls?.downloads || "https://downloads.reflexinteractive.com",
        },
        launcher: {
            baseUrl: SITE_CONFIG.urls?.launcherFiles || "https://cdn.reflexinteractive.com/launcher-files",
            versionUrl: SITE_CONFIG.urls?.launcherVersion || "https://cdn.reflexinteractive.com/launcher-files/version.json",
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

        accountHref: () => {
            const isAccountPage = window.location.pathname.includes("account") || window.location.hostname.startsWith("account.");
            const target = utils.isLocal()
                ? new URL(CONFIG.localRoutes["/account"], window.location.origin)
                : new URL("/account", CONFIG.siteUrl);

            if (!isAccountPage) {
                target.searchParams.set("return", `${window.location.pathname}${window.location.search}${window.location.hash}`);
            }

            return target.toString();
        },

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

        protectedDownloadUrl: (key = "", filename = "", game = {}) => {
            const url = new URL(`${CONFIG.downloads.protectedBaseUrl.replace(/\/$/, "")}/download`);
            url.searchParams.set("key", key);
            url.searchParams.set("gameId", String(game.numeric_id || game.id || ""));
            if (filename) url.searchParams.set("filename", filename);
            return url.toString();
        },

        downloadFilename: (url = "", fallback = "game.zip") => {
            try {
                const path = new URL(url, window.location.origin).pathname;
                return decodeURIComponent(path.split("/").filter(Boolean).pop() || fallback);
            } catch {
                return fallback;
            }
        },

        gameHasDownload: (game = {}, runtime = CONFIG.launcherRuntime) => {
            const platformDownload = game.downloads?.[runtime] || game.downloads?.windows || game.downloads?.win64 || {};
            const flags = [
                game.hasDownload,
                game.has_download,
                game["has-download"],
                game.downloadAvailable,
                game.download_available,
                game["download-available"],
                platformDownload.hasDownload,
                platformDownload.has_download,
                platformDownload["has-download"],
                platformDownload.available,
                platformDownload.isAvailable,
                platformDownload.is_available,
            ];

            return !flags.some((value) => value === false || String(value).toLowerCase() === "false");
        },

        gameDownloadInfo: (game = {}, runtime = CONFIG.launcherRuntime) => {
            if (!utils.gameHasDownload(game, runtime)) {
                return {
                    url: "",
                    filename: "",
                    available: false,
                };
            }

            const platformDownload = game.downloads?.[runtime] || game.downloads?.windows || game.downloads?.win64;
            const platformFile = Array.isArray(platformDownload?.files) ? platformDownload.files[0] : null;
            const protectedKey = platformFile?.key
                || platformDownload?.key
                || platformDownload?.r2_key
                || platformDownload?.r2Key
                || game.download_key
                || game.downloadKey;

            const filename = platformFile?.name
                || platformDownload?.filename
                || game.download_name
                || utils.downloadFilename(protectedKey || "");

            if (protectedKey) {
                return {
                    url: utils.protectedDownloadUrl(protectedKey, filename, game),
                    filename,
                };
            }

            const explicit = platformFile?.url
                || platformDownload?.zip_url
                || platformDownload?.zipUrl
                || platformDownload?.archive_url
                || platformDownload?.archiveUrl
                || platformDownload?.url
                || game.zip_url
                || game.zipUrl
                || game.archive_url
                || game.archiveUrl
                || game.download_url
                || game.downloadUrl
                || game.installer_url
                || game.installerUrl;

            if (explicit) {
                return {
                    url: explicit,
                    filename: platformFile?.name || platformDownload?.filename || game.download_name || utils.downloadFilename(explicit),
                };
            }

            return { url: "", filename: "" };
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
            return ua.includes("win64") || ua.includes("wow64") || ua.includes("x64") || platform.includes("x64")
                ? CONFIG.launcherRuntime
                : "";
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
            return (...args) => {
                const now = performance.now();
                if (now - last < wait) return;
                last = now;
                fn(...args);
            };
        },

        spinner: (id, show) => dom.id(id)?.classList.toggle("d-none", !show),

        categoryLabel: (value = "general") => ({
            account: "Account",
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
        supportArticles: async () => utils.newestFirst(await data.json(CONFIG.api.supportArticles)),
    };

    const templates = {
        arrow: '<span aria-hidden="true">></span>',

        newsCard: (article) => `
            <article class="card modern-card news-card h-100">
                <a href="${utils.detailHref("newswire-details", article.id)}" class="d-flex h-100 flex-column">
                    <img src="${utils.normalizeMedia(article.image_url, 720)}" alt="${utils.escape(article.title)}" width="720" height="405" class="modern-card-img" loading="lazy" decoding="async">
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
                <a href="${utils.detailHref("game-details", game.id)}" class="modern-game-card-anchor" aria-label="Explore ${utils.escape(game.title)}">
                    <img src="${utils.normalizeMedia(game.image_url, 720)}" alt="${utils.escape(game.title)} cover art" width="720" height="405" class="modern-game-card-img" loading="lazy" decoding="async">
                    <div class="modern-game-card-overlay">
                        <h3 class="modern-game-card-title">${utils.escape(game.title)}</h3>
                        <span class="modern-game-card-link">Explore game ${templates.arrow}</span>
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
            <button type="button" class="card modern-card h-100 text-decoration-none support-game-card" data-support-game="${utils.escape(game.id)}" data-support-game-title="${utils.escape(game.title)}">
                <img src="${utils.normalizeMedia(game.image_url, 700)}" alt="${utils.escape(game.title)} support category" width="700" height="394" class="modern-game-card-img support-tile-img" loading="lazy" decoding="async">
                <div class="card-img-overlay d-flex align-items-center justify-content-center">
                    <h3 class="text-white fw-bold m-0 text-shadow-lg">${utils.escape(game.title)}</h3>
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
                    if (subdomain === "account") {
                        link.href = utils.accountHref();
                        return;
                    }

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
                disable("Launcher temporarily unavailable");
            }
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

            const firstItem = rail.querySelector(".rail-item, .navbar-game-tile");
            const styles = window.getComputedStyle(rail);
            const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;
            const itemWidth = firstItem?.getBoundingClientRect().width || 0;
            const distance = itemWidth ? itemWidth + gap : Math.max(rail.clientWidth * CONFIG.railRatio, 280);

            rail.scrollBy({ left: direction * distance, behavior: "smooth" });
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

            const targets = ".card, .featured-game, .feature-card";
            dom.qsa(targets).forEach((node) => node.classList.add("depth-card"));

            let tiltFrame = 0;
            let tiltEvent = null;

            const updateTilt = () => {
                const event = tiltEvent;
                tiltFrame = 0;
                if (!event) return;

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
            };

            document.addEventListener("pointermove", (event) => {
                tiltEvent = event;
                if (!tiltFrame) tiltFrame = window.requestAnimationFrame(updateTilt);
            }, { passive: true });

            document.addEventListener("pointerout", (event) => {
                const card = event.target.closest(targets);
                if (!card || card.contains(event.relatedTarget)) return;
                card.classList.remove("is-tilting");
                card.style.removeProperty("--tilt-x");
                card.style.removeProperty("--tilt-y");
                card.style.removeProperty("--shine-x");
                card.style.removeProperty("--shine-y");
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
                    ui.observe(wrapper.firstElementChild);
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
                ui.observe(wrapper.firstElementChild);
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
                                <img src="${image}" alt="${utils.escape(game.title)} key art" width="900" height="506" loading="lazy" decoding="async">
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
                const game = games.find((item) => utils.gameMatchesId(item, id));
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
                dom.setMeta('meta[property="og:image:secure_url"]', image);
                dom.setMeta('meta[property="og:image:alt"]', `${game.title} official cover art`);
                dom.setMeta('meta[property="og:url"]', url);
                dom.setMeta('meta[name="twitter:title"]', title);
                dom.setMeta('meta[name="twitter:description"]', description);
                dom.setMeta('meta[name="twitter:image"]', image);
                dom.setMeta('meta[name="twitter:image:alt"]', `${game.title} official cover art`);

                const schema = dom.id("game-json-ld");
                if (schema) {
                    const payload = utils.parseJSON(schema.text);
                    Object.assign(payload, {
                        name: game.title,
                        description,
                        genre: game.genre,
                        image,
                        url,
                        inLanguage: CONFIG.locale,
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
                        author: {
                            "@type": "Organization",
                            "@id": "https://reflexinteractive.com/#organization",
                            name: "Reflex Interactive",
                        },
                        offers: {
                            "@type": "Offer",
                            price: 0,
                            priceCurrency: CONFIG.defaultCurrency,
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
                const actualPrice = 0;
                dom.setText("game-detail-price", "Free");

                const cta = dom.id("game-access-btn");
                if (cta) {
                    const downloadInfo = utils.gameDownloadInfo(game);
                    cta.textContent = "Checking Account...";
                    cta.href = "#";
                    cta.dataset.gameId = game.id || "";
                    cta.dataset.gameNumericId = game.numeric_id || "";
                    cta.dataset.gameTitle = game.title || "";
                    cta.dataset.gamePrice = String(actualPrice);
                    cta.dataset.downloadUrl = downloadInfo.url;
                    cta.dataset.downloadName = downloadInfo.filename;
                    cta.dataset.gameHasDownload = String(utils.gameHasDownload(game));
                    cta.classList.add("opacity-50", "cursor-not-allowed");
                    cta.setAttribute("aria-disabled", "true");
                    cta.removeAttribute("download");
                }

                render.gameMedia(game);
                const downloadInfo = utils.gameDownloadInfo(game);
                document.dispatchEvent(new CustomEvent("reflex:game-detail-ready", {
                    detail: {
                        game: {
                            id: game.id || "",
                            numeric_id: game.numeric_id || "",
                            title: game.title || "",
                            price: actualPrice,
                            exe_name: game.exe_name || "",
                            download_url: downloadInfo.url,
                            download_name: downloadInfo.filename,
                            hasDownload: utils.gameHasDownload(game),
                        },
                    },
                }));
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
            document.addEventListener("input", events.input);
            document.addEventListener("change", events.change);
            document.addEventListener("submit", events.submit);
        },

        click: (event) => {
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
                    ui.initNav();
                    ui.initMobileMenu();
                    ui.initDownloadButtons();
                    render.navGames();
                }),
                data.component("footer", "/components/footer.html"),
            ]);
            ui.initEnvironmentLinks();
            document.dispatchEvent(new CustomEvent("reflex:components-ready"));
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
