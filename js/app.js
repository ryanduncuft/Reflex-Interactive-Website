/**
 * @fileoverview Reflex Interactive Core Engine
 * @version 3.0.0 - Phase 1: Engine Swap
 * @description Highly optimized, modular, and scalable vanilla JS architecture.
 */

(async () => {
    "use strict";

    // --- 1. CONFIGURATION & STATE ---
    const Config = {
        API: {
            NEWS: "https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json",
            GAMES: "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json",
        },
        UI: {
            HOME_ITEM_COUNT: 3,
            SEARCH_DEBOUNCE_MS: 200,
            REVEAL_DELAY_MS: 80,
        },
        SYSTEM: {
            CACHE_BUST: true,
            BASE_URL: "https://www.reflexinteractive.com"
        }
    };

    const State = {
        searchIndex: null,
        revealObserver: null,
        dataCache: new Map(),
        isSupportSubdomain: window.location.hostname.startsWith("support.")
    };

    // --- 2. UTILITIES ---
    const Utils = {
        getBustedUrl: (url) => Config.SYSTEM.CACHE_BUST ? `${url}?t=${Date.now()}` : url,

        normalizeMediaUrl: (url) => {
            if (!url) return "";
            if (/^https?:\/\//i.test(url)) return url;
            let cleaned = url.replace(/\\/g, "/");
            if (!cleaned.startsWith("/") && !cleaned.startsWith("assets/")) cleaned = `/${cleaned}`;
            if (cleaned.startsWith("assets/")) cleaned = `/${cleaned}`;
            return cleaned;
        },

        debounce: (func, delayMs = 250) => {
            let timeoutId = null;
            return (...args) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => func(...args), delayMs);
            };
        },

        throttle: (func, limitMs = 100) => {
            let lastRan = 0;
            return (...args) => {
                const now = Date.now();
                if (now - lastRan >= limitMs) {
                    lastRan = now;
                    func(...args);
                }
            };
        },

        toggleSpinner: (id, show) => {
            const spinner = document.getElementById(id);
            if (spinner) spinner.classList.toggle("d-none", !show);
        }
    };

    // --- 3. DATA SERVICES ---
    const API = {
        fetchData: async (url) => {
            if (State.dataCache.has(url)) return State.dataCache.get(url);

            const isGist = Object.values(Config.API).includes(url);
            const fetchUrl = isGist ? url : Utils.getBustedUrl(url);

            try {
                const response = await fetch(fetchUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
                const data = await response.json();
                State.dataCache.set(url, data);
                return data;
            } catch (error) {
                console.error("[API Error]", error);
                throw error;
            }
        },

        loadComponent: async (placeholderId, componentPath, callback) => {
            const placeholder = document.getElementById(placeholderId);
            if (!placeholder) return;

            const url = componentPath.startsWith("http") ? componentPath : `${Config.SYSTEM.BASE_URL}${componentPath}`;
            
            try {
                const response = await fetch(Utils.getBustedUrl(url));
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                placeholder.innerHTML = await response.text();
                if (callback) callback(placeholder);
            } catch (error) {
                console.error(`[Component Error] Failed to load ${placeholderId}:`, error);
                placeholder.innerHTML = `<p class="text-center text-danger">Failed to load content.</p>`;
            }
        }
    };

    // --- 4. UI COMPONENTS & ANIMATIONS ---
    const UI = {
        initScrollReveal: () => {
            const selectors = [
                ".reveal-on-scroll", ".card", ".article-grid > .col", ".row .col",
                ".display-4", ".display-1", "h1", "h2", "h3", ".game-card",
                ".hero-section h1", ".hero-section p", ".btn", ".navbar-brand"
            ];

            State.revealObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    const parent = el.parentElement;
                    let delay = 0;

                    if (parent) {
                        const siblings = Array.from(parent.children).filter(e => e.tagName === el.tagName);
                        const index = siblings.indexOf(el);
                        if (index > 0) delay = index * Config.UI.REVEAL_DELAY_MS;
                    }

                    el.style.transitionDelay = `${delay}ms`;
                    el.classList.add("visible");
                    State.revealObserver.unobserve(el);
                });
            }, { threshold: 0.08 });

            document.querySelectorAll(selectors.join(", ")).forEach((el) => {
                if (!el.closest(".navbar")) {
                    el.classList.add("reveal-on-scroll");
                    State.revealObserver.observe(el);
                }
            });

            requestAnimationFrame(() => {
                document.querySelectorAll(".reveal-on-load, .hero-entry").forEach((el, i) => {
                    const delay = el.classList.contains("hero-entry") ? 120 : 0;
                    setTimeout(() => el.classList.add("visible"), delay + i * Config.UI.REVEAL_DELAY_MS);
                });
            });
        },

        initNavbar: () => {
            const header = document.querySelector(".navbar");
            if (header) {
                window.addEventListener("scroll", Utils.throttle(() => {
                    header.classList.toggle("scrolled", window.scrollY > 50);
                }, 10));
            }

            document.querySelectorAll('.navbar a, .mobile-nav-link').forEach(link => {
                const href = link.getAttribute('href');
                if (href && href.startsWith('/') && href !== '/') {
                    if (State.isSupportSubdomain) link.href = `${Config.SYSTEM.BASE_URL}${href}`;
                } else if (href === '/') {
                    link.href = Config.SYSTEM.BASE_URL;
                }
            });
        },

        initMobileMenu: () => {
            const trigger = document.getElementById("mobile-menu-trigger");
            const overlay = document.getElementById("mobile-menu-overlay");
            if (!trigger || !overlay) return;

            const toggleMenu = (isOpen) => {
                overlay.classList.toggle("active", isOpen);
                overlay.setAttribute("aria-hidden", !isOpen);
                document.body.style.overflow = isOpen ? "hidden" : "";
            };

            trigger.addEventListener("click", () => toggleMenu(true));
            document.getElementById("mobile-menu-close")?.addEventListener("click", () => toggleMenu(false));
            document.querySelectorAll(".mobile-nav-link").forEach(link => 
                link.addEventListener("click", () => toggleMenu(false))
            );
        },

        initSearch: () => {
            const input = document.getElementById("global-search-input");
            const container = document.getElementById("search-results-container");
            const list = document.getElementById("global-search-results");
            if (!input || !container || !list) return;

            const buildIndex = async () => {
                if (State.searchIndex) return State.searchIndex;
                let index = [
                    { url: "/", title: "Home", snippet: "Reflex Interactive homepage", searchable: "home reflex" },
                    { url: "/games", title: "Games", snippet: "Browse our games", searchable: "games" },
                    { url: "/newswire", title: "Newswire", snippet: "Latest news", searchable: "newswire news" },
                    { url: "/about", title: "About", snippet: "About Us", searchable: "about us" },
                    { url: "https://support.reflexinteractive.com/", title: "Support", snippet: "Get in touch", searchable: "contact support help" },
                ];

                try {
                    const [news, games] = await Promise.all([API.fetchData(Config.API.NEWS), API.fetchData(Config.API.GAMES)]);
                    news?.forEach(item => index.push({ url: `/newswire?id=${item.id}`, title: item.title, snippet: item.summary.slice(0, 100), searchable: `${item.title} ${item.summary}`.toLowerCase() }));
                    games?.forEach(item => index.push({ url: `/games?id=${item.id}`, title: item.title, snippet: item.description.slice(0, 100), searchable: `${item.title} ${item.description}`.toLowerCase() }));
                } catch (e) { console.warn("Search index build failed", e); }
                
                return (State.searchIndex = index);
            };

            input.addEventListener("input", Utils.debounce(async (e) => {
                const q = e.target.value.trim().toLowerCase();
                list.innerHTML = "";
                
                if (!q) {
                    container.style.display = "none";
                    return;
                }

                const index = await buildIndex();
                const results = index.filter(item => item.searchable.includes(q)).slice(0, 8);

                if (results.length) {
                    const fragment = document.createDocumentFragment();
                    results.forEach(res => {
                        const link = document.createElement("a");
                        link.href = res.url;
                        link.className = "list-group-item list-group-item-action bg-dark text-light border-secondary";
                        link.innerHTML = `<strong>${res.title}</strong><br><small class="text-muted">${res.snippet}</small>`;
                        fragment.appendChild(link);
                    });
                    list.appendChild(fragment);
                    container.style.display = "block";
                } else {
                    container.style.display = "none";
                }
            }, Config.UI.SEARCH_DEBOUNCE_MS));

            document.addEventListener("click", (e) => {
                if (!input.contains(e.target) && !container.contains(e.target)) container.style.display = "none";
            });

            input.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    container.style.display = "none";
                    input.value = "";
                }
            });
        },

        initSmoothScroll: () => {
            document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
                anchor.addEventListener("click", (event) => {
                    const href = event.currentTarget.getAttribute("href");
                    if (!href || href === "#" || href.includes("http")) return;
                    try {
                        const targetElement = document.querySelector(href);
                        if (targetElement) {
                            event.preventDefault();
                            targetElement.scrollIntoView({ behavior: "smooth" });
                        }
                    } catch (e) {
                        console.warn("Smooth scroll target not found:", href);
                    }
                });
            });
        },

        initBackToTop: () => {
            const btn = document.getElementById("scroll-to-top");
            if (!btn) return;
            const toggle = () => btn.classList.toggle("visible", window.scrollY > 400);
            window.addEventListener("scroll", toggle);
            btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
            toggle();
        },

        initDownloadButtons: () => {
            const downloadBtns = document.querySelectorAll(".launcher-download-btn");
            if (!downloadBtns.length) return;

            const getDownloadUrl = () => {
                const baseUrl = "https://cdn.reflexinteractive.com/launcher-files";
                const userAgent = window.navigator.userAgent.toLowerCase();
                const platform = window.navigator.platform.toLowerCase();
                let rid = "win-x64";

                if (userAgent.includes("mac") || platform.includes("mac")) {
                    const isArm = (navigator.maxTouchPoints > 0) || userAgent.includes("arm64");
                    rid = isArm ? "osx-arm64" : "osx-x64";
                } else if (userAgent.includes("linux")) {
                    rid = "linux-x64";
                } else if (userAgent.includes("win")) {
                    const is64 = userAgent.includes("win64") || userAgent.includes("wow64") || userAgent.includes("x64") || platform.includes("x64");
                    rid = is64 ? "win-x64" : "win-x86";
                }
                return `${baseUrl}/${rid}/launcher-latest.zip`;
            };

            const finalUrl = getDownloadUrl();
            downloadBtns.forEach(btn => {
                btn.href = finalUrl;
                btn.setAttribute("download", "ReflexLauncher.zip");
                btn.addEventListener("click", (e) => e.stopPropagation());
            });
        },

        handleFormSubmission: async (event, form) => {
            event.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            if (!btn) return;
            btn.disabled = true;
            btn.textContent = "Sending...";

            try {
                const res = await fetch(form.action, {
                    method: form.method,
                    body: new FormData(form),
                    headers: { Accept: "application/json" },
                });
                const success = res.ok;
                form.innerHTML = `<p class="text-${success ? "success" : "danger"} fw-bold text-center">${success ? "Message sent!" : "Error sending message."}</p>`;
            } catch (error) {
                console.error(error);
                form.innerHTML = '<p class="text-danger fw-bold text-center">Something went wrong.</p>';
            }
        },

        animateCount: (el, target) => {
            const duration = 900;
            const start = performance.now();
            const step = (now) => {
                const progress = Math.min((now - start) / duration, 1);
                el.textContent = Math.floor(target * progress).toString();
                if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        },

        initStatCounters: () => {
            const counters = Array.from(document.querySelectorAll("[data-count]"));
            if (!counters.length) return;

            const obs = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    UI.animateCount(el, Number(el.dataset.count || "0"));
                    obs.unobserve(el);
                });
            }, { threshold: 0.4 });

            counters.forEach((el) => {
                el.textContent = "0";
                obs.observe(el);
            });
        }
    };

    // --- 5. RENDERERS ---
    const Renderers = {
        newsList: async (containerId, limit = null) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            Utils.toggleSpinner(containerId.includes("latest") ? "homepage-loading-spinner" : "loading-spinner", true);

            try {
                let data = await API.fetchData(Config.API.NEWS);
                if (limit) data = data.slice(0, limit);
                
                const fragment = document.createDocumentFragment();
                data.forEach(article => {
                    const col = document.createElement("div");
                    col.className = "col";
                    col.innerHTML = `
                        <div class="card modern-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll">
                            <a href="/newswire?id=${article.id}" class="text-decoration-none d-block h-100 d-flex flex-column">
                                <img src="${article.image_url}" alt="${article.title}" class="card-img-top modern-card-img" loading="lazy">
                                <div class="card-body d-flex flex-column flex-grow-1">
                                    <h3 class="card-title modern-card-title">${article.title}</h3>
                                    <p class="card-text modern-card-date">${article.date}</p>
                                    <p class="card-text modern-card-summary">${article.summary}</p>
                                    <span class="modern-card-cta mt-auto">Read More <span class="ms-2">→</span></span>
                                </div>
                            </a>
                        </div>`;
                    State.revealObserver?.observe(col.firstElementChild);
                    fragment.appendChild(col);
                });
                container.innerHTML = "";
                container.appendChild(fragment);
            } catch (e) {
                container.innerHTML = '<div class="text-center text-danger py-5">Failed to load news.</div>';
            } finally {
                Utils.toggleSpinner(containerId.includes("latest") ? "homepage-loading-spinner" : "loading-spinner", false);
            }
        },

        gameList: async (containerId, limit = null) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            Utils.toggleSpinner(containerId.includes("latest") ? "homepage-games-loading-spinner" : "games-loading-spinner", true);

            try {
                let data = await API.fetchData(Config.API.GAMES);
                if (limit) data = data.slice(0, limit);

                const fragment = document.createDocumentFragment();
                data.forEach(game => {
                    const col = document.createElement("div");
                    col.className = "col";
                    col.innerHTML = `
                        <div class="card modern-card modern-game-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll">
                            <img src="${Utils.normalizeMediaUrl(game.image_url)}" alt="${game.title}" class="modern-game-card-img" loading="lazy">
                            <div class="modern-game-card-overlay">
                                <h3 class="modern-game-card-title">${game.title}</h3>
                                <p class="modern-game-card-desc">${game.description}</p>
                                <a href="/game-details?id=${game.id}" class="modern-game-card-link">Learn More <span class="ms-2">→</span></a>
                            </div>
                        </div>`;
                    State.revealObserver?.observe(col.firstElementChild);
                    fragment.appendChild(col);
                });
                container.innerHTML = "";
                container.appendChild(fragment);
            } catch (e) {
                container.innerHTML = '<div class="text-center text-danger py-5">Failed to load games.</div>';
            } finally {
                Utils.toggleSpinner(containerId.includes("latest") ? "homepage-games-loading-spinner" : "games-loading-spinner", false);
            }
        },

        articleDetail: async (id) => {
            const listSec = document.getElementById("article-list-section");
            const detailSec = document.getElementById("article-detail");
            Utils.toggleSpinner("loading-spinner", true);

            try {
                const data = await API.fetchData(Config.API.NEWS);
                const article = data.find((i) => i.id == id);
                if (!article) throw new Error("Article not found");

                listSec?.classList.add("d-none");
                detailSec?.classList.remove("d-none");

                const safeSet = (elId, prop, isHtml = false) => {
                    const el = document.getElementById(elId);
                    if (el) {
                        if (isHtml) el.innerHTML = article[prop].replace(/\n/g, "<br><br>");
                        else if (prop === 'image_url') el.src = article[prop];
                        else el.textContent = article[prop];
                    }
                };

                safeSet("article-title", "title");
                safeSet("article-date", "date");
                safeSet("article-image", "image_url");
                safeSet("article-content", "content", true);
                
                document.title = `${article.title} | Reflex Interactive`;
            } catch (e) {
                console.error(e);
                const main = document.querySelector("main");
                if (main) main.innerHTML = '<div class="text-center text-danger pt-5">Failed to load article.</div>';
            } finally {
                Utils.toggleSpinner("loading-spinner", false);
            }
        },

        gameDetail: async (id) => {
            if (!id) {
                const main = document.querySelector("main");
                if (main) main.innerHTML = '<div class="text-center text-danger pt-5">Game not found.</div>';
                return;
            }

            try {
                const data = await API.fetchData(Config.API.GAMES);
                const game = data.find((i) => i.id == id);
                if (!game) throw new Error("Game not found");

                const safeSetText = (elId, text) => {
                    const el = document.getElementById(elId);
                    if (el) el.textContent = text || "";
                };

                const titleEl = document.getElementById("game-title");
                if (titleEl) titleEl.textContent = `${game.title} | Reflex Interactive`;
                document.title = `${game.title} | Reflex Interactive`;

                const hero = document.getElementById("game-hero");
                if (hero) {
                    const heroUrl = Utils.normalizeMediaUrl(game.hero_image_url || game.image_url);
                    hero.style.backgroundImage = `url('${heroUrl}')`;
                    Object.assign(hero.style, { backgroundPosition: "center", backgroundSize: "cover" });
                }

                const coverImg = document.getElementById("game-detail-cover");
                if (coverImg) coverImg.src = Utils.normalizeMediaUrl(game.image_url);

                safeSetText("game-detail-title", game.title);
                safeSetText("game-detail-developer", game.developer);
                safeSetText("game-detail-publisher", game.publisher);
                safeSetText("game-detail-genre", game.genre);
                safeSetText("game-detail-description", game.description);

                const btn = document.getElementById("purchase-download-btn");
                const priceEl = document.getElementById("game-detail-price");

                if (priceEl) {
                    priceEl.textContent = game.price === 0 ? "FREE" : `$${Number(game.price).toFixed(2)}`;
                }

                if (btn) {
                    if (game.price === 0 && game.download_url) {
                        btn.textContent = "Download Now";
                        btn.href = game.download_url;
                        btn.setAttribute("download", "");
                        btn.classList.remove("opacity-50", "cursor-not-allowed");
                    } else {
                        btn.textContent = "Purchase Now";
                        btn.href = "#";
                        btn.removeAttribute("download");
                        btn.classList.add("opacity-50", "cursor-not-allowed");
                    }
                }

                const screens = document.getElementById("game-detail-screenshots");
                if (screens) {
                    screens.innerHTML = "";
                    const fragment = document.createDocumentFragment();

                    if (game.trailer_url) {
                        const iframe = document.createElement("iframe");
                        iframe.src = game.trailer_url;
                        iframe.className = "col-12 w-full rounded-lg shadow-md aspect-video mb-4";
                        iframe.setAttribute("allowfullscreen", "");
                        fragment.appendChild(iframe);
                    }

                    if (Array.isArray(game.screenshots)) {
                        game.screenshots.forEach((screenshot) => {
                            const col = document.createElement("div");
                            col.className = "col";
                            const img = document.createElement("img");
                            img.src = Utils.normalizeMediaUrl(screenshot.url || screenshot);
                            img.className = "img-fluid rounded-lg shadow-md";
                            img.alt = screenshot.caption || game.title;
                            col.appendChild(img);
                            fragment.appendChild(col);
                        });
                    }
                    screens.appendChild(fragment);
                }
            } catch (e) {
                console.error("Render Error:", e);
                const main = document.querySelector("main");
                if (main) main.innerHTML = `<div class="text-center text-danger pt-5">Failed to load game details: ${e.message}</div>`;
            }
        },

        featuredGame: async () => {
            const slot = document.getElementById("featured-game-slot");
            if (!slot) return;

            try {
                const data = await API.fetchData(Config.API.GAMES);
                const game = Array.isArray(data) ? data[0] : null;
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
                                <h3 class="display-6 fw-bold text-uppercase mb-3">${game.title}</h3>
                                <p class="text-muted mb-4">${game.description}</p>
                                <div class="d-flex flex-wrap gap-3">
                                    <a href="https://www.reflexinteractive.com/games?id=${game.id}" class="btn btn-danger text-uppercase fw-bold">Explore</a>
                                    <a href="https://www.reflexinteractive.com/games" class="btn btn-outline-light text-uppercase fw-bold">View All</a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } catch (e) {
                slot.innerHTML = '<div class="featured-body text-center text-muted">Featured game unavailable.</div>';
            }
        },

        supportGameList: async (containerId) => {
            const container = document.getElementById(containerId);
            if (!container) return;
        
            try {
                const data = await API.fetchData(Config.API.GAMES);
                const fragment = document.createDocumentFragment();
            
                data.forEach(game => {
                    const col = document.createElement("div");
                    col.className = "col";
                    col.innerHTML = `
                        <a href="#contact-section" class="card modern-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll text-decoration-none">
                            <img src="${Utils.normalizeMediaUrl(game.image_url)}" alt="${game.title}" class="modern-game-card-img support-tile-img" loading="lazy">
                            <div class="card-img-overlay d-flex align-items-center justify-content-center">
                                <h3 class="text-white text-uppercase fw-bold m-0" style="text-shadow: 2px 2px 10px rgba(0,0,0,1);">${game.title}</h3>
                            </div>
                        </a>`;

                    State.revealObserver?.observe(col.firstElementChild);
                    fragment.appendChild(col);
                });
            
                container.innerHTML = "";
                container.appendChild(fragment);
            } catch (e) {
                container.innerHTML = '<div class="text-center text-danger py-5">Failed to load game categories.</div>';
            }
        },

        studioStats: async () => {
            const gamesEl = document.getElementById("stat-games");
            const newsEl = document.getElementById("stat-news");
            const yearsEl = document.getElementById("stat-years");

            const years = Math.max(1, new Date().getFullYear() - 2022);
            if (yearsEl) yearsEl.dataset.count = years.toString();

            try {
                const [news, games] = await Promise.all([
                    API.fetchData(Config.API.NEWS),
                    API.fetchData(Config.API.GAMES),
                ]);

                if (gamesEl) gamesEl.dataset.count = `${games?.length ?? 0}`;
                if (newsEl) newsEl.dataset.count = `${news?.length ?? 0}`;
            } catch (e) {
                if (gamesEl) gamesEl.dataset.count = "0";
                if (newsEl) newsEl.dataset.count = "0";
            }
        }
    };

    // --- 6. ROUTER & INITIALIZATION ---
    const App = {
        init: async () => {
            // 1. Load Global Components
            await Promise.all([
                API.loadComponent("navbar-placeholder", "/components/navbar.html", () => {
                    UI.initNavbar();
                    UI.initMobileMenu();
                    UI.initSmoothScroll();
                    UI.initDownloadButtons();
                }),
                API.loadComponent("search-placeholder", "/components/searchbar.html", (el) => {
                    UI.initSearch();
                    el.querySelector(".global-search-wrap")?.classList.add("reveal-on-load");
                }),
                API.loadComponent("footer-placeholder", "/components/footer.html", (el) => {
                    const form = el.querySelector("form");
                    if (form) form.addEventListener("submit", (e) => UI.handleFormSubmission(e, form));
                })
            ]);

            UI.initScrollReveal();
            UI.initBackToTop();

            // 2. Route Handling
            const path = window.location.pathname;
            const urlId = new URLSearchParams(window.location.search).get("id");

            const isGameDetailPage = path.includes("game-details") || (urlId && document.getElementById("game-hero"));
            const isGamesListPage = (path.includes("games") && !urlId) || (path.includes("games") && !document.getElementById("game-hero") && !path.includes("game-details"));
            const isNewsDetailPage = path.includes("article-detail") || (path.includes("newswire") && urlId && document.getElementById("article-detail"));
            const isNewsListPage = (path.includes("newswire") && !urlId) || (path.includes("newswire") && !document.getElementById("article-detail"));
            const isHomePage = (path === "/" || path.endsWith("index.html")) && !State.isSupportSubdomain;
            const isSupportPage = State.isSupportSubdomain || path.includes("contact");

            if (isGameDetailPage) {
                Renderers.gameDetail(urlId);
            } else if (isGamesListPage) {
                Renderers.gameList("full-games-container");
            } else if (isNewsDetailPage) {
                Renderers.articleDetail(urlId);
            } else if (isNewsListPage) {
                Renderers.newsList("news-container");
            } else if (isHomePage) {
                Renderers.gameList("latest-games-container", Config.UI.HOME_ITEM_COUNT);
                Renderers.newsList("latest-news-container", Config.UI.HOME_ITEM_COUNT);
                Renderers.featuredGame();
                Renderers.studioStats().then(UI.initStatCounters);
            }

            if (isSupportPage) {
                Renderers.supportGameList("support-game-grid");

                const updateSupportBadge = () => {
                    const badge = document.getElementById('status-badge');
                    if (!badge) return;
                
                    const now = new Date();
                    const day = now.getUTCDay(); 
                    const hour = now.getUTCHours();
                
                    const isOpen = (day >= 1 && day <= 5) && (hour >= 9 && hour < 17);
                
                    if (isOpen) {
                        badge.innerText = "Online";
                        badge.className = "badge bg-danger text-white text-uppercase py-2 px-3";
                    } else {
                        badge.innerText = "Offline";
                        badge.className = "badge bg-transparent border border-white text-white text-uppercase py-2 px-3";
                    }
                };
                
                updateSupportBadge();
            }

            // Tawk.to Logic
            const chatBtn = document.getElementById("open-live-chat");
            if (chatBtn) {
                chatBtn.addEventListener("click", (e) => {
                    e.preventDefault();
                    if (typeof Tawk_API !== "undefined" && Tawk_API.showWidget) {
                        if (Tawk_API.getStatus() === 'offline') {
                            Tawk_API.showWidget();
                            Tawk_API.maximize();
                        } else {
                            Tawk_API.showWidget();
                            Tawk_API.maximize();
                            if (typeof Tawk_API.isChatDone === 'function' && Tawk_API.isChatDone()) {
                                Tawk_API.endChat();
                            }
                        }
                    } else {
                        alert("Live chat is currently loading or offline. Please try again in a moment or use the contact form.");
                    }
                });
            }

            // 3. Form Bindings
            const cf = document.getElementById("contact-form");
            if (cf) cf.addEventListener("submit", (e) => UI.handleFormSubmission(e, cf));

            const nf = document.getElementById("newsletter-form");
            if (nf) nf.addEventListener("submit", (e) => UI.handleFormSubmission(e, nf));
        }
    };

    // Boot Engine
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", App.init);
    } else {
        App.init();
    }

})();