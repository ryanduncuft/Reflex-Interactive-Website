/**
 * Reflex Interactive - Main Application Script
 * Version: 2.1.2 - Full Original Source with Routing & Media Fixes
 */
(async () => {
    const config = {
        GIST_URLS: {
            NEWS: "https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json",
            GAMES: "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json",
        },
        HOME_PAGE_ITEM_COUNT: 3,
        CACHE_BUST_ENABLED: true,
        SEARCH_DEBOUNCE_MS: 200,
        CARD_HOVER_DELAY_MS: 80,
    };

    const appState = {
        searchIndex: null,
        revealObserver: null,
        dataCache: new Map(),
    };

    // --- Utilities ---

    const getCacheBustedUrl = (url) =>
        config.CACHE_BUST_ENABLED ? `${url}?t=${Date.now()}` : url;

    const fetchData = async (url) => {
        if (appState.dataCache.has(url)) return appState.dataCache.get(url);

        const isGistUrl = Object.values(config.GIST_URLS).includes(url);
        const fetchUrl = isGistUrl ? url : getCacheBustedUrl(url);

        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);

            const data = await response.json();
            appState.dataCache.set(url, data);
            return data;
        } catch (error) {
            console.error("Fetch error:", error);
            throw error;
        }
    };

    const normalizeMediaUrl = (url) => {
        if (!url) return "";
        if (/^https?:\/\//i.test(url)) return url;

        let cleaned = url.replace(/\\/g, "/");
        // Ensure leading slash for local assets
        if (!cleaned.startsWith("/") && !cleaned.startsWith("assets/")) cleaned = `/${cleaned}`;
        if (cleaned.startsWith("assets/")) cleaned = `/${cleaned}`;
        
        return cleaned;
    };

    const toggleLoadingSpinner = (id, show) => {
        const spinner = document.getElementById(id);
        if (spinner) {
            spinner.classList.toggle("d-none", !show);
        }
    };

    const debounce = (func, delayMs = 250) => {
        let timeoutId = null;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delayMs);
        };
    };

    const throttle = (func, limitMs = 100) => {
        let lastRan = 0;
        return (...args) => {
            const now = Date.now();
            if (now - lastRan >= limitMs) {
                lastRan = now;
                func(...args);
            }
        };
    };

    const loadComponent = async (placeholderId, componentUrl, callback) => {
        const placeholder = document.getElementById(placeholderId);
        if (!placeholder) return;
        
        const url = componentUrl.includes("://") 
            ? componentUrl 
            : (componentUrl.startsWith("/") ? componentUrl : `/${componentUrl}`);

        const fetchUrl = getCacheBustedUrl(url);

        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();
            placeholder.innerHTML = html;
            callback?.(placeholder);
        } catch (error) {
            console.error(`Error loading ${placeholderId}:`, error);
            placeholder.innerHTML = `<p class="text-center text-danger">Failed to load content.</p>`;
        }
    };

    const initMobileMenu = () => {
        const trigger = document.getElementById("mobile-menu-trigger");
        const closeBtn = document.getElementById("mobile-menu-close");
        const overlay = document.getElementById("mobile-menu-overlay");
        const links = document.querySelectorAll(".mobile-nav-link");

        if (!trigger || !overlay) return;

        const toggleMenu = (isOpen) => {
            if (isOpen) {
                overlay.classList.add("active");
                overlay.setAttribute("aria-hidden", "false");
                document.body.style.overflow = "hidden";
            } else {
                overlay.classList.remove("active");
                overlay.setAttribute("aria-hidden", "true");
                document.body.style.overflow = "";
            }
        };

        trigger.addEventListener("click", () => toggleMenu(true));
        closeBtn?.addEventListener("click", () => toggleMenu(false));
        links.forEach((link) => link.addEventListener("click", () => toggleMenu(false)));
    };

    const initNavbarScrollEffect = () => {
        const header = document.querySelector(".navbar");
        if (!header) return;

        const scrollHandler = throttle(() => {
            header.classList.toggle("scrolled", window.scrollY > 50);
        }, 10);

        window.addEventListener("scroll", scrollHandler);
    };

    const initBackToTop = () => {
        const btn = document.getElementById("scroll-to-top");
        if (!btn) return;

        const toggle = () => {
            btn.classList.toggle("visible", window.scrollY > 400);
        };

        window.addEventListener("scroll", toggle);
        btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
        toggle();
    };

    const initDownloadButtons = () => {
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
                const is64 = userAgent.includes("win64") ||
                    userAgent.includes("wow64") ||
                    userAgent.includes("x64") ||
                    platform.includes("x64");
                rid = is64 ? "win-x64" : "win-x86";
            }

            return `${baseUrl}/${rid}/launcher-latest.zip`;
        };

        const finalUrl = getDownloadUrl();

        downloadBtns.forEach(btn => {
            btn.href = finalUrl;
            btn.setAttribute("download", "ReflexLauncher.zip");
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
            });
        });
    };

    const initScrollReveal = () => {
        const selectors = [
            ".reveal-on-scroll", ".card", ".article-grid > .col", ".row .col",
            ".display-4", ".display-1", "h1", "h2", "h3", ".game-card",
            ".hero-section h1", ".hero-section p", ".btn", ".navbar-brand"
        ];

        appState.revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                const element = entry.target;
                const parent = element.parentElement;
                let delay = 0;

                if (parent) {
                    const siblings = Array.from(parent.children).filter((el) => el.tagName === element.tagName);
                    const index = siblings.indexOf(element);
                    if (index > 0) delay = index * config.CARD_HOVER_DELAY_MS;
                }

                element.style.transitionDelay = `${delay}ms`;
                element.classList.add("visible");
                appState.revealObserver.unobserve(element);
            });
        }, { threshold: 0.08 });

        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                if (!el.closest(".navbar")) {
                    el.classList.add("reveal-on-scroll");
                    appState.revealObserver.observe(el);
                }
            });
        });

        requestAnimationFrame(() => {
            document.querySelectorAll(".reveal-on-load, .hero-entry").forEach((el, i) => {
                const delay = el.classList.contains("hero-entry") ? 120 : 0;
                setTimeout(() => el.classList.add("visible"), delay + i * config.CARD_HOVER_DELAY_MS);
            });
        });
    };

    const initSmoothScroll = () => {
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
    };

    // --- Stats & Search ---

    const animateCount = (el, target) => {
        const duration = 900;
        const start = performance.now();
        const from = 0;

        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const value = Math.floor(from + (target - from) * progress);
            el.textContent = value.toString();
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    const initStatCounters = () => {
        const counters = Array.from(document.querySelectorAll("[data-count]"));
        if (!counters.length) return;

        const obs = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                const target = Number(el.dataset.count || "0");
                animateCount(el, target);
                obs.unobserve(el);
            });
        }, { threshold: 0.4 });

        counters.forEach((el) => {
            el.textContent = "0";
            obs.observe(el);
        });
    };

    const buildSearchIndex = async () => {
        if (appState.searchIndex) return appState.searchIndex;

        let index = [
            { url: "/", title: "Home", snippet: "Reflex Interactive homepage", searchable: "home reflex" },
            { url: "/games", title: "Games", snippet: "Browse our games", searchable: "games" },
            { url: "/newswire", title: "Newswire", snippet: "Latest news", searchable: "newswire news" },
            { url: "/about", title: "About", snippet: "About Us", searchable: "about us" },
            { url: "https://support.reflexinteractive.com/", title: "Support & Contact", snippet: "Get in touch with us", searchable: "contact support help" },
        ];

        try {
            const [news, games] = await Promise.all([
                fetchData(config.GIST_URLS.NEWS),
                fetchData(config.GIST_URLS.GAMES),
            ]);

            if (Array.isArray(news)) {
                news.forEach((item) => index.push({
                    url: `/newswire?id=${item.id}`,
                    title: item.title,
                    snippet: item.summary.slice(0, 100),
                    searchable: `${item.title} ${item.summary}`.toLowerCase(),
                }));
            }

            if (Array.isArray(games)) {
                games.forEach((item) => index.push({
                    url: `/games?id=${item.id}`,
                    title: item.title,
                    snippet: item.description.slice(0, 100),
                    searchable: `${item.title} ${item.description}`.toLowerCase(),
                }));
            }
        } catch (e) {
            console.warn("Index build warning", e);
        }

        return (appState.searchIndex = index);
    };

    const searchIndex = async (query) => {
        const q = query?.trim()?.toLowerCase();
        if (!q) return [];

        await buildSearchIndex();
        return appState.searchIndex.filter((item) => item.searchable.includes(q)).slice(0, 8);
    };

    const initGlobalSearch = () => {
        const input = document.getElementById("global-search-input");
        const container = document.getElementById("search-results-container");
        const list = document.getElementById("global-search-results");

        if (!input || !container || !list) return;

        const handleInput = debounce(async (e) => {
            const results = await searchIndex(e.target.value);
            list.innerHTML = "";

            if (!results.length) {
                container.style.display = "none";
                return;
            }

            results.forEach((res) => {
                const link = document.createElement("a");
                link.href = res.url;
                link.className = "list-group-item list-group-item-action bg-dark text-light border-secondary";
                link.innerHTML = `<strong>${res.title}</strong><br><small class="text-muted">${res.snippet}</small>`;
                list.appendChild(link);
            });

            container.style.display = "block";
        }, config.SEARCH_DEBOUNCE_MS);

        input.addEventListener("input", handleInput);

        document.addEventListener("click", (e) => {
            if (!input.contains(e.target) && !container.contains(e.target)) {
                container.style.display = "none";
            }
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                container.style.display = "none";
                input.value = "";
            }
        });
    };

    const handleFormSubmission = async (event, form) => {
        event.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        if (!btn) return;
        const originalText = btn.textContent;
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
    };

    // --- Content Rendering ---

    const createNewsCard = (article) => {
        const col = document.createElement("div");
        col.className = "col";
        const card = document.createElement("div");
        card.className = "card modern-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll";

        card.innerHTML = `
            <a href="/newswire?id=${article.id}" class="text-decoration-none d-block h-100 d-flex flex-column">
                <img src="${article.image_url}" alt="${article.title}" class="card-img-top modern-card-img" loading="lazy">
                <div class="card-body d-flex flex-column flex-grow-1">
                    <h3 class="card-title modern-card-title">${article.title}</h3>
                    <p class="card-text modern-card-date">${article.date}</p>
                    <p class="card-text modern-card-summary">${article.summary}</p>
                    <span class="modern-card-cta mt-auto">Read More <span class="ms-2">→</span></span>
                </div>
            </a>
        `;

        appState.revealObserver?.observe(card);
        col.appendChild(card);
        return col;
    };

    const createGameCard = (game) => {
        const col = document.createElement("div");
        col.className = "col";
        const card = document.createElement("div");
        card.className = "card modern-card modern-game-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll";

        const imageUrl = normalizeMediaUrl(game.image_url);

        card.innerHTML = `
            <img src="${imageUrl}" alt="${game.title}" class="modern-game-card-img" loading="lazy">
            <div class="modern-game-card-overlay">
                <h3 class="modern-game-card-title">${game.title}</h3>
                <p class="modern-game-card-desc">${game.description}</p>
                <a href="/game-details?id=${game.id}" class="modern-game-card-link">Learn More <span class="ms-2">→</span></a>
            </div>
        `;

        appState.revealObserver?.observe(card);
        col.appendChild(card);
        return col;
    };

    const renderNewsList = async (container, count = null) => {
        if (!container) return;
        const spinnerId = container.id.includes("latest") ? "homepage-loading-spinner" : "loading-spinner";
        toggleLoadingSpinner(spinnerId, true);

        try {
            let data = await fetchData(config.GIST_URLS.NEWS);
            if (count) data = data.slice(0, count);
            container.innerHTML = "";
            container.append(...data.map(createNewsCard));
        } catch (e) {
            container.innerHTML = '<div class="text-center text-danger py-5">Failed to load news.</div>';
        } finally {
            toggleLoadingSpinner(spinnerId, false);
        }
    };

    const renderGameList = async (container, count = null) => {
        if (!container) return;
        const spinnerId = container.id.includes("latest") ? "homepage-games-loading-spinner" : "games-loading-spinner";
        toggleLoadingSpinner(spinnerId, true);

        try {
            let data = await fetchData(config.GIST_URLS.GAMES);
            if (count) data = data.slice(0, count);
            container.innerHTML = "";
            container.append(...data.map(createGameCard));
        } catch (e) {
            container.innerHTML = '<div class="text-center text-danger py-5">Failed to load games.</div>';
        } finally {
            toggleLoadingSpinner(spinnerId, false);
        }
    };

    const renderArticleDetail = async (id) => {
        const listSec = document.getElementById("article-list-section");
        const detailSec = document.getElementById("article-detail");
        toggleLoadingSpinner("loading-spinner", true);

        try {
            const data = await fetchData(config.GIST_URLS.NEWS);
            const article = data.find((i) => i.id == id);
            if (!article) throw new Error("Article not found");

            listSec?.classList.add("d-none");
            detailSec?.classList.remove("d-none");

            const titleEl = document.getElementById("article-title");
            const dateEl = document.getElementById("article-date");
            const imgEl = document.getElementById("article-image");
            const contentEl = document.getElementById("article-content");

            if (titleEl) titleEl.textContent = article.title;
            if (dateEl) dateEl.textContent = article.date;
            if (imgEl) imgEl.src = article.image_url;
            if (contentEl) contentEl.innerHTML = article.content.replace(/\n/g, "<br><br>");
            
            document.title = `${article.title} | Reflex Interactive`;
        } catch (e) {
            console.error(e);
            const main = document.querySelector("main");
            if (main) main.innerHTML = '<div class="text-center text-danger pt-5">Failed to load article.</div>';
        } finally {
            toggleLoadingSpinner("loading-spinner", false);
        }
    };

    const renderGameDetail = async (id) => {
        if (!id) {
            const main = document.querySelector("main");
            if (main) main.innerHTML = '<div class="text-center text-danger pt-5">Game not found.</div>';
            return;
        }

        try {
            const data = await fetchData(config.GIST_URLS.GAMES);
            const game = data.find((i) => i.id == id);
            if (!game) throw new Error("Game not found");

            const safeSetText = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text || "";
            };

            // 1. Titles
            const titleEl = document.getElementById("game-title");
            if (titleEl) titleEl.textContent = `${game.title} | Reflex Interactive`;
            document.title = `${game.title} | Reflex Interactive`;

            // 2. Hero Section
            const hero = document.getElementById("game-hero");
            if (hero) {
                const heroUrl = normalizeMediaUrl(game.hero_image_url || game.image_url);
                hero.style.backgroundImage = `url('${heroUrl}')`;
                Object.assign(hero.style, { backgroundPosition: "center", backgroundSize: "cover" });
            }

            // 3. Info Binding
            const coverImg = document.getElementById("game-detail-cover");
            if (coverImg) coverImg.src = normalizeMediaUrl(game.image_url);

            safeSetText("game-detail-title", game.title);
            safeSetText("game-detail-developer", game.developer);
            safeSetText("game-detail-publisher", game.publisher);
            safeSetText("game-detail-genre", game.genre);
            safeSetText("game-detail-description", game.description);

            // 4. Price & Button
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

            // 5. Media Columns
            const screens = document.getElementById("game-detail-screenshots");
            if (screens) {
                screens.innerHTML = "";

                if (game.trailer_url) {
                    const iframe = document.createElement("iframe");
                    iframe.src = game.trailer_url;
                    iframe.className = "col-12 w-full rounded-lg shadow-md aspect-video mb-4";
                    iframe.setAttribute("allowfullscreen", "");
                    screens.appendChild(iframe);
                }

                if (Array.isArray(game.screenshots)) {
                    game.screenshots.forEach((screenshot) => {
                        const col = document.createElement("div");
                        col.className = "col";
                        const img = document.createElement("img");
                        img.src = normalizeMediaUrl(screenshot.url || screenshot);
                        img.className = "img-fluid rounded-lg shadow-md";
                        img.alt = screenshot.caption || game.title;
                        col.appendChild(img);
                        screens.appendChild(col);
                    });
                }
            }
        } catch (e) {
            console.error("Render Error:", e);
            const main = document.querySelector("main");
            if (main) main.innerHTML = `<div class="text-center text-danger pt-5">Failed to load game details: ${e.message}</div>`;
        }
    };

    const renderFeaturedGame = async () => {
        const slot = document.getElementById("featured-game-slot");
        if (!slot) return;

        try {
            const data = await fetchData(config.GIST_URLS.GAMES);
            const game = Array.isArray(data) ? data[0] : null;
            if (!game) throw new Error("No games found");

            const image = normalizeMediaUrl(game.hero_image_url || game.image_url);

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
                                <a href="/games?id=${game.id}" class="btn btn-danger text-uppercase fw-bold">Explore</a>
                                <a href="/games" class="btn btn-outline-light text-uppercase fw-bold">View All</a>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            slot.innerHTML = '<div class="featured-body text-center text-muted">Featured game unavailable.</div>';
        }
    };

    const setStudioStats = async () => {
        const gamesEl = document.getElementById("stat-games");
        const newsEl = document.getElementById("stat-news");
        const yearsEl = document.getElementById("stat-years");

        const years = Math.max(1, new Date().getFullYear() - 2022);
        if (yearsEl) yearsEl.dataset.count = years.toString();

        try {
            const [news, games] = await Promise.all([
                fetchData(config.GIST_URLS.NEWS),
                fetchData(config.GIST_URLS.GAMES),
            ]);

            if (gamesEl) gamesEl.dataset.count = `${games?.length ?? 0}`;
            if (newsEl) newsEl.dataset.count = `${news?.length ?? 0}`;
        } catch (e) {
            if (gamesEl) gamesEl.dataset.count = "0";
            if (newsEl) newsEl.dataset.count = "0";
        }
    };

    // --- Core Lifecycle ---

    const initializeApp = async () => {
        // We use absolute URLs for components to ensure they load correctly on both
        // www.reflexinteractive.com and support.reflexinteractive.com
        const baseContentUrl = window.location.origin;

        await Promise.all([
            loadComponent("navbar-placeholder", `${baseContentUrl}/components/navbar.html`, () => {
                initNavbarScrollEffect();
                initMobileMenu();
                initSmoothScroll();
                initDownloadButtons();
            }),
            loadComponent("search-placeholder", `${baseContentUrl}/components/searchbar.html`, (el) => {
                initGlobalSearch();
                el.querySelector(".global-search-wrap")?.classList.add("reveal-on-load");
            }),
            loadComponent("footer-placeholder", `${baseContentUrl}/components/footer.html`, (el) => {
                const form = el.querySelector("form");
                if (form) form.addEventListener("submit", (e) => handleFormSubmission(e, form));
            }),
        ]);

        initScrollReveal();
        initBackToTop();

        const path = window.location.pathname;
        const hostname = window.location.hostname;
        const urlId = new URLSearchParams(window.location.search).get("id");

        // Identify if we are currently on the support subdomain
        const isSupportSubdomain = hostname.startsWith("support.");

        // --- UNIVERSAL ROUTING LOGIC ---
        const isGameDetailPage = path.includes("game-details") || (urlId && document.getElementById("game-hero"));

        const isGamesListPage = (path.includes("games") && !urlId) || 
                                 (path.includes("games") && !document.getElementById("game-hero") && !path.includes("game-details"));

        const isNewsDetailPage = path.includes("article-detail") || (path.includes("newswire") && urlId && document.getElementById("article-detail"));

        const isNewsListPage = (path.includes("newswire") && !urlId) || 
                                (path.includes("newswire") && !document.getElementById("article-detail"));
        
        // Home page logic only triggers if we are on the main domain root
        const isHomePage = (path === "/" || path.endsWith("index.html")) && !isSupportSubdomain;

        if (isGameDetailPage) {
            renderGameDetail(urlId);
        } else if (isGamesListPage) {
            const c = document.getElementById("full-games-container");
            if (c) renderGameList(c);
        } else if (isNewsDetailPage) {
            renderArticleDetail(urlId);
        } else if (isNewsListPage) {
            const c = document.getElementById("news-container");
            if (c) renderNewsList(c);
        } else if (isHomePage) {
            const latestGames = document.getElementById("latest-games-container");
            const latestNews = document.getElementById("latest-news-container");

            if (latestGames) renderGameList(latestGames, config.HOME_PAGE_ITEM_COUNT);
            if (latestNews) renderNewsList(latestNews, config.HOME_PAGE_ITEM_COUNT);
            renderFeaturedGame();
            setStudioStats().then(initStatCounters);
        }

        // The contact form exists on the root of the support subdomain 
        // OR the /contact path of the main domain.
        const cf = document.getElementById("contact-form");
        if (cf) cf.addEventListener("submit", (e) => handleFormSubmission(e, cf));

        const nf = document.getElementById("newsletter-form");
        if (nf) nf.addEventListener("submit", (e) => handleFormSubmission(e, nf));
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeApp);
    } else {
        initializeApp();
    }
})();