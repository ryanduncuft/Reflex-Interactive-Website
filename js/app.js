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
        cleaned = cleaned.replace(/^assets\/images\//i, "/assets/images/");
        cleaned = cleaned.replace(/^assets\/image\//i, "/assets/images/");
        if (!cleaned.startsWith("/")) cleaned = `/${cleaned}`;
        return cleaned;
    };

    const toggleLoadingSpinner = (id, show) => {
        document.getElementById(id)?.classList.toggle("d-none", !show);
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

    // --- Component Loading ---
    const loadComponent = async (placeholderId, componentUrl, callback) => {
        const placeholder = document.getElementById(placeholderId);
        if (!placeholder) return;
        const url = componentUrl.startsWith("/") ? componentUrl : `/${componentUrl}`;
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

    // --- UI Initializers ---
    const initMobileMenu = () => {
        const trigger = document.getElementById("mobile-menu-trigger");
        const closeBtn = document.getElementById("mobile-menu-close");
        const overlay = document.getElementById("mobile-menu-overlay");
        const links = document.querySelectorAll(".mobile-nav-link");
        if (!trigger || !overlay) return;
        const toggleMenu = (isOpen) => {
            overlay.classList.toggle("active", isOpen);
            overlay.setAttribute("aria-hidden", !isOpen);
            document.body.style.overflow = isOpen ? "hidden" : "";
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
        const toggle = () => btn.classList.toggle("visible", window.scrollY > 400);
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
    };

    const initScrollReveal = () => {
        const selectors = [".reveal-on-scroll", ".card", ".article-grid > .col", ".row .col", ".display-4", ".display-1", "h1", "h2", "h3", ".game-card", ".btn"];
        appState.revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const element = entry.target;
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
                } catch (e) { console.warn("Smooth scroll target not found:", href); }
            });
        });
    };

    // --- Search & Stats ---
    const buildSearchIndex = async () => {
        if (appState.searchIndex) return appState.searchIndex;
        let index = [
            { url: "/", title: "Home", snippet: "Reflex Interactive homepage", searchable: "home reflex" },
            { url: "/games", title: "Games", snippet: "Browse our games", searchable: "games" },
            { url: "/newswire", title: "Newswire", snippet: "Latest news", searchable: "newswire news" },
        ];
        try {
            const [news, games] = await Promise.all([fetchData(config.GIST_URLS.NEWS), fetchData(config.GIST_URLS.GAMES)]);
            if (Array.isArray(news)) news.forEach(i => index.push({ url: `/newswire?id=${i.id}`, title: i.title, snippet: i.summary.slice(0, 100), searchable: `${i.title} ${i.summary}`.toLowerCase() }));
            if (Array.isArray(games)) games.forEach(i => index.push({ url: `/games?id=${i.id}`, title: i.title, snippet: i.description.slice(0, 100), searchable: `${i.title} ${i.description}`.toLowerCase() }));
        } catch (e) { console.warn("Index build warning", e); }
        return (appState.searchIndex = index);
    };

    const initGlobalSearch = () => {
        const input = document.getElementById("global-search-input");
        const container = document.getElementById("search-results-container");
        const list = document.getElementById("global-search-results");
        if (!input || !container || !list) return;
        const handleInput = debounce(async (e) => {
            const q = e.target.value.trim().toLowerCase();
            if (!q) { container.style.display = "none"; return; }
            await buildSearchIndex();
            const results = appState.searchIndex.filter(i => i.searchable.includes(q)).slice(0, 8);
            list.innerHTML = "";
            if (!results.length) { container.style.display = "none"; return; }
            results.forEach(res => {
                const link = document.createElement("a");
                link.href = res.url;
                link.className = "list-group-item list-group-item-action bg-dark text-light border-secondary";
                link.innerHTML = `<strong>${res.title}</strong><br><small class="text-muted">${res.snippet}</small>`;
                list.appendChild(link);
            });
            container.style.display = "block";
        }, config.SEARCH_DEBOUNCE_MS);
        input.addEventListener("input", handleInput);
    };

    // --- Page Renderers ---
    const createGameCard = (game) => {
        const col = document.createElement("div");
        col.className = "col";
        col.innerHTML = `
            <div class="card modern-card modern-game-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll">
                <img src="${normalizeMediaUrl(game.image_url)}" alt="${game.title}" class="modern-game-card-img" loading="lazy">
                <div class="modern-game-card-overlay">
                    <h3 class="modern-game-card-title">${game.title}</h3>
                    <p class="modern-game-card-desc">${game.description}</p>
                    <a href="/games?id=${game.id}" class="modern-game-card-link">Learn More <span class="ms-2">→</span></a>
                </div>
            </div>`;
        appState.revealObserver?.observe(col.firstChild);
        return col;
    };

    const renderGameList = async (container) => {
        toggleLoadingSpinner("games-loading-spinner", true);
        try {
            const data = await fetchData(config.GIST_URLS.GAMES);
            container.append(...data.map(createGameCard));
        } catch (e) { container.innerHTML = '<div class="text-center text-danger py-5">Failed to load games.</div>'; }
        finally { toggleLoadingSpinner("games-loading-spinner", false); }
    };

    const renderGameDetail = async (id) => {
        try {
            const data = await fetchData(config.GIST_URLS.GAMES);
            const game = data.find((i) => i.id == id);
            if (!game) throw new Error("Game not found");

            document.title = `${game.title} | Reflex Interactive`;
            const hero = document.getElementById("game-hero");
            if (hero) hero.style.backgroundImage = `url('${normalizeMediaUrl(game.hero_image_url || game.image_url)}')`;
            
            document.getElementById("game-detail-title").textContent = game.title;
            document.getElementById("game-detail-cover").src = normalizeMediaUrl(game.image_url);
            document.getElementById("game-detail-developer").textContent = game.developer;
            document.getElementById("game-detail-publisher").textContent = game.publisher;
            document.getElementById("game-detail-genre").textContent = game.genre;
            document.getElementById("game-detail-description").textContent = game.description;
            document.getElementById("game-detail-price").textContent = game.price === 0 ? "FREE" : `$${game.price.toFixed(2)}`;

            const btn = document.getElementById("purchase-download-btn");
            if (game.price === 0 && game.download_url) {
                btn.textContent = "Download Now";
                btn.href = game.download_url;
            }

            const screens = document.getElementById("game-detail-screenshots");
            if (screens && Array.isArray(game.screenshots)) {
                screens.innerHTML = "";
                game.screenshots.forEach((s) => {
                    const col = document.createElement("div");
                    col.className = "col";
                    col.innerHTML = `<img src="${normalizeMediaUrl(s.url || s)}" class="img-fluid rounded-xl shadow-md" alt="${game.title}">`;
                    screens.appendChild(col);
                });
            }
        } catch (e) {
            console.error(e);
            document.querySelector("main").innerHTML = '<div class="text-center text-danger pt-5">Failed to load game details.</div>';
        }
    };

    // --- App Init ---
    const initializeApp = async () => {
        await Promise.all([
            loadComponent("navbar-placeholder", "/components/navbar.html", () => {
                initNavbarScrollEffect(); initMobileMenu(); initSmoothScroll(); initDownloadButtons();
            }),
            loadComponent("search-placeholder", "/components/searchbar.html", initGlobalSearch),
            loadComponent("footer-placeholder", "/components/footer.html"),
        ]);

        initScrollReveal();
        initBackToTop();
        
        const path = window.location.pathname;
        const urlId = new URLSearchParams(window.location.search).get("id");

        // FIX: Look for '/games' with an ID to trigger the detail page
        if (path.includes("/games") && urlId) {
            renderGameDetail(urlId);
        } else if (path.includes("/games")) {
            const c = document.getElementById("full-games-container");
            if (c) renderGameList(c);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeApp);
    } else {
        initializeApp();
    }
})();