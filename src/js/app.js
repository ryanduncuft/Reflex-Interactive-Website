(async () => {
  // === CONFIGURATION AND STATE ===
  const config = {
    GIST_URLS: {
      NEWS: "https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json",
      GAMES:
        "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json",
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

  // --- UTILITIES ---

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

  // --- COMPONENT LOADERS ---

  const loadComponent = async (placeholderId, componentUrl, callback) => {
    const placeholder = document.getElementById(placeholderId);
    if (!placeholder) return;
    const url = componentUrl.startsWith("/")
      ? componentUrl
      : `/${componentUrl}`;
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

  // --- UI INTERACTION (NAVBAR & MOBILE MENU) ---

  /**
   * NEW: Handles the full-screen mobile popup menu logic
   */
  const initMobileMenu = () => {
    const trigger = document.getElementById("mobile-menu-trigger");
    const closeBtn = document.getElementById("mobile-menu-close");
    const overlay = document.getElementById("mobile-menu-overlay");
    const links = document.querySelectorAll(".mobile-nav-link");

    if (!trigger || !overlay) return;

    const toggleMenu = (isOpen) => {
      if (isOpen) {
        overlay.classList.add("active");
        document.body.style.overflow = "hidden"; // Lock scrolling
      } else {
        overlay.classList.remove("active");
        document.body.style.overflow = ""; // Unlock scrolling
      }
    };

    trigger.addEventListener("click", () => toggleMenu(true));
    closeBtn?.addEventListener("click", () => toggleMenu(false));
    links.forEach((link) =>
      link.addEventListener("click", () => toggleMenu(false))
    );
  };

  /**
   * UPDATED: Navbar appearance on scroll (targets .navbar class now)
   */
  const initNavbarScrollEffect = () => {
    const header = document.querySelector(".navbar");
    if (!header) return;

    const scrollHandler = throttle(() => {
      if (window.scrollY > 50) {
        header.classList.add("bg-black");
        header.style.backgroundColor = "rgba(0, 0, 0, 1)";
      } else {
        header.classList.remove("bg-black");
        header.style.backgroundColor = "rgba(0, 0, 0, 0.75)";
      }
    }, 10);
    window.addEventListener("scroll", scrollHandler);
  };

  const initScrollReveal = () => {
    const selectors = [
      ".reveal-on-scroll",
      ".card",
      ".article-grid > .col",
      ".row .col",
      ".display-4",
      ".display-1",
      "h1",
      "h2",
      "h3",
      ".game-card",
      ".hero-section h1",
      ".hero-section p",
      ".btn",
      ".navbar-brand",
    ];

    appState.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const element = entry.target;
          const parent = element.parentElement;
          let delay = 0;

          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (el) => el.tagName === element.tagName
            );
            const index = siblings.indexOf(element);
            if (index > 0) delay = index * config.CARD_HOVER_DELAY_MS;
          }

          element.style.transitionDelay = `${delay}ms`;
          element.classList.add("visible");
          appState.revealObserver.unobserve(element);
        });
      },
      { threshold: 0.08 }
    );

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (!el.closest(".navbar")) {
          el.classList.add("reveal-on-scroll");
          appState.revealObserver.observe(el);
        }
      });
    });

    requestAnimationFrame(() => {
      document
        .querySelectorAll(".reveal-on-load, .hero-entry")
        .forEach((el, i) => {
          const delay = el.classList.contains("hero-entry") ? 120 : 0;
          setTimeout(
            () => el.classList.add("visible"),
            delay + i * config.CARD_HOVER_DELAY_MS
          );
        });
    });
  };

  const initSmoothScroll = () => {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        if (event.currentTarget.id !== "purchase-download-btn") {
          event.preventDefault();
          document
            .querySelector(event.currentTarget.getAttribute("href"))
            ?.scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  };

  // --- SEARCH AND INDEXING ---

  const buildSearchIndex = async () => {
    if (appState.searchIndex) return appState.searchIndex;

    let index = [
      {
        url: "/",
        title: "Home",
        snippet: "Reflex Interactive homepage",
        searchable: "home reflex",
      },
      {
        url: "/games",
        title: "Games",
        snippet: "Browse our games",
        searchable: "games",
      },
      {
        url: "/newswire",
        title: "Newswire",
        snippet: "Latest news",
        searchable: "newswire news",
      },
      {
        url: "/about",
        title: "About",
        snippet: "About Us",
        searchable: "about us",
      },
      {
        url: "/contact",
        title: "Contact",
        snippet: "Contact Us",
        searchable: "contact",
      },
    ];

    try {
      const [news, games] = await Promise.all([
        fetchData(config.GIST_URLS.NEWS),
        fetchData(config.GIST_URLS.GAMES),
      ]);

      if (Array.isArray(news)) {
        news.forEach((item) =>
          index.push({
            url: `/newswire?id=${item.id}`,
            title: item.title,
            snippet: item.summary.slice(0, 100),
            searchable: `${item.title} ${item.summary}`.toLowerCase(),
          })
        );
      }
      if (Array.isArray(games)) {
        games.forEach((item) =>
          index.push({
            url: `/games?id=${item.id}`,
            title: item.title,
            snippet: item.description.slice(0, 100),
            searchable: `${item.title} ${item.description}`.toLowerCase(),
          })
        );
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
    return appState.searchIndex
      .filter((item) => item.searchable.includes(q))
      .slice(0, 8);
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
        link.className =
          "list-group-item list-group-item-action bg-dark text-light border-secondary";
        link.innerHTML = `<strong>${res.title}</strong><br><small class="text-muted">${res.snippet}</small>`;
        list.appendChild(link);
      });
      container.style.display = "block";
    }, config.SEARCH_DEBOUNCE_MS);

    input.addEventListener("input", handleInput);
    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !container.contains(e.target))
        container.style.display = "none";
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        container.style.display = "none";
        input.value = "";
      }
    });
  };

  // --- FORM HANDLER ---

  const handleFormSubmission = async (event, form) => {
    event.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      const res = await fetch(form.action, {
        method: form.method,
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      const success = res.ok;
      form.innerHTML = `<p class="text-${
        success ? "success" : "danger"
      } fw-bold text-center">${
        success ? "Message sent!" : "Error sending message."
      }</p>`;
    } catch (error) {
      console.error(error);
      form.innerHTML =
        '<p class="text-danger fw-bold text-center">Something went wrong.</p>';
    }
  };

  // --- CONTENT RENDERING (Original Detailed Logic Preserved) ---

  const createNewsCard = (article) => {
    const col = document.createElement("div");
    col.className = "col";
    const card = document.createElement("div");
    card.className =
      "card modern-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll";
    card.innerHTML = `
        <a href="/newswire?id=${article.id}" class="text-decoration-none d-block h-100 d-flex flex-column">
            <img src="${article.image_url}" alt="${article.title}" class="card-img-top modern-card-img" loading="lazy">
            <div class="card-body d-flex flex-column flex-grow-1">
                <h3 class="card-title modern-card-title">${article.title}</h3>
                <p class="card-text modern-card-date">${article.date}</p>
                <p class="card-text modern-card-summary">${article.summary}</p>
                <span class="modern-card-cta mt-auto">Read More <span class="ms-2">→</span></span>
            </div>
        </a>`;
    appState.revealObserver?.observe(card);
    col.appendChild(card);
    return col;
  };

  const createGameCard = (game) => {
    const col = document.createElement("div");
    col.className = "col";
    const card = document.createElement("div");
    card.className =
      "card modern-card modern-game-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll";
    card.innerHTML = `
        <img src="${game.image_url}" alt="${game.title}" class="modern-game-card-img" loading="lazy">
        <div class="modern-game-card-overlay">
            <h3 class="modern-game-card-title">${game.title}</h3>
            <p class="modern-game-card-desc">${game.description}</p>
            <a href="/games?id=${game.id}" class="modern-game-card-link">Learn More <span class="ms-2">→</span></a>
        </div>`;
    appState.revealObserver?.observe(card);
    col.appendChild(card);
    return col;
  };

  const renderNewsList = async (container, count = null) => {
    const spinnerId = container.id.includes("latest")
      ? "homepage-loading-spinner"
      : "loading-spinner";
    toggleLoadingSpinner(spinnerId, true);
    try {
      let data = await fetchData(config.GIST_URLS.NEWS);
      if (count) data = data.slice(0, count);
      container.append(...data.map(createNewsCard));
    } catch (e) {
      container.innerHTML =
        '<div class="text-center text-danger py-5">Failed to load news.</div>';
    } finally {
      toggleLoadingSpinner(spinnerId, false);
    }
  };

  const renderGameList = async (container, count = null) => {
    const spinnerId = container.id.includes("latest")
      ? "homepage-games-loading-spinner"
      : "games-loading-spinner";
    toggleLoadingSpinner(spinnerId, true);
    try {
      let data = await fetchData(config.GIST_URLS.GAMES);
      if (count) data = data.slice(0, count);
      container.append(...data.map(createGameCard));
    } catch (e) {
      container.innerHTML =
        '<div class="text-center text-danger py-5">Failed to load games.</div>';
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
      document.getElementById("article-title").textContent = article.title;
      document.getElementById("article-date").textContent = article.date;
      document.getElementById("article-image").src = article.image_url;
      document.getElementById("article-content").innerHTML =
        article.content.replace(/\n/g, "<br><br>");
    } catch (e) {
      document.querySelector("main").innerHTML =
        '<div class="text-center text-danger pt-5">Failed to load article.</div>';
    } finally {
      toggleLoadingSpinner("loading-spinner", false);
    }
  };

  const renderGameDetail = async () => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      document.querySelector("main").innerHTML =
        '<div class="text-center text-danger pt-5">Game not found.</div>';
      return;
    }

    try {
      const data = await fetchData(config.GIST_URLS.GAMES);
      const game = data.find((i) => i.id == id);
      if (!game) throw new Error("Game not found");

      const hero = document.getElementById("game-hero");
      if (hero) {
        hero.style.backgroundImage = `url(${
          game.hero_image_url || game.image_url
        })`;
        Object.assign(hero.style, {
          backgroundPosition: "center",
          backgroundSize: "cover",
        });
      }

      document.getElementById("game-detail-cover").src = game.image_url;
      document.getElementById("game-detail-title").textContent = game.title;
      document.getElementById("game-detail-developer").textContent =
        game.developer;
      document.getElementById("game-detail-publisher").textContent =
        game.publisher;
      document.getElementById("game-detail-genre").textContent = game.genre;
      document.getElementById("game-detail-description").textContent =
        game.description;

      const btn = document.getElementById("purchase-download-btn");
      const priceEl = document.getElementById("game-detail-price");
      priceEl.textContent =
        game.price === 0 ? "FREE" : `$${game.price.toFixed(2)}`;

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

      const screens = document.getElementById("game-detail-screenshots");
      if (screens) {
        screens.innerHTML = "";
        if (game.trailer_url) {
          const iframe = document.createElement("iframe");
          iframe.src = game.trailer_url;
          iframe.className = "w-full h-auto rounded-lg shadow-md aspect-video";
          iframe.setAttribute("allowfullscreen", "");
          screens.appendChild(iframe);
        }
        game.screenshots.forEach((src) => {
          const img = document.createElement("img");
          img.src = src;
          img.className = "w-full h-auto rounded-lg shadow-md";
          screens.appendChild(img);
        });
      }
    } catch (e) {
      document.querySelector("main").innerHTML =
        '<div class="text-center text-danger pt-5">Failed to load game details.</div>';
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    const trigger = document.getElementById("mobile-menu-trigger");
    const closeBtn = document.getElementById("mobile-menu-close");
    const overlay = document.getElementById("mobile-menu-overlay");

    function toggleMenu() {
      overlay.classList.toggle("active");
      // Optional: Prevent body scrolling when menu is open
      document.body.style.overflow = overlay.classList.contains("active")
        ? "hidden"
        : "";
    }

    if (trigger && closeBtn) {
      trigger.addEventListener("click", toggleMenu);
      closeBtn.addEventListener("click", toggleMenu);
    }

    // Close menu if a link is clicked
    const links = document.querySelectorAll(".mobile-nav-link");
    links.forEach((link) => {
      link.addEventListener("click", () => {
        overlay.classList.remove("active");
        document.body.style.overflow = "";
      });
    });
  });

  // --- INITIALIZATION ---

  const initializeApp = async () => {
    // 1. Load Components
    await Promise.all([
      loadComponent("navbar-placeholder", "/src/components/navbar.html", () => {
        initNavbarScrollEffect();
        initMobileMenu(); // ** NEW: Activate mobile popup logic here
        initSmoothScroll();
      }),
      loadComponent(
        "search-placeholder",
        "/src/components/searchbar.html",
        (el) => {
          initGlobalSearch();
          el.querySelector(".global-search-wrap")?.classList.add(
            "reveal-on-load"
          );
        }
      ),
      loadComponent(
        "footer-placeholder",
        "/src/components/footer.html",
        (el) => {
          const form = el.querySelector("form");
          form?.addEventListener("submit", (e) =>
            handleFormSubmission(e, form)
          );
        }
      ),
    ]);

    initScrollReveal();

    // 2. Routing Logic
    const path = window.location.pathname;
    const urlId = new URLSearchParams(window.location.search).get("id");
    const latestGames = document.getElementById("latest-games-container");
    const latestNews = document.getElementById("latest-news-container");

    const isGameRoute = path === "/games";
    const isNewsRoute = path === "/newswire";

    if (isGameRoute && urlId) {
      renderGameDetail();
    } else if (isGameRoute) {
      const c = document.getElementById("full-games-container");
      c && renderGameList(c);
    } else if (isNewsRoute && urlId) {
      renderArticleDetail(urlId);
    } else if (isNewsRoute) {
      const c = document.getElementById("news-container");
      c && renderNewsList(c);
    } else if (path === "/" || path === "/index.html") {
      latestGames && renderGameList(latestGames, config.HOME_PAGE_ITEM_COUNT);
      latestNews && renderNewsList(latestNews, config.HOME_PAGE_ITEM_COUNT);
    }

    const cf = document.getElementById("contact-form");
    cf?.addEventListener("submit", (e) => handleFormSubmission(e, cf));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
  } else {
    initializeApp();
  }
})();
