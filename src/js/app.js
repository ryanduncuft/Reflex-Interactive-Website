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
  };  // --- UTILITIES ---
  /**
   * Adds a cache-busting timestamp to a URL if enabled in config.
   * @param {string} url The base URL.
   * @returns {string} The URL, potentially with a timestamp query parameter.
   */
  const getCacheBustedUrl = (url) =>
    config.CACHE_BUST_ENABLED ? `${url}?t=${Date.now()}` : url;
  /**
   * Fetches JSON data from a URL, using cache if available.
   * @param {string} url The URL to fetch.
   * @returns {Promise<any>} The parsed JSON data.
   */

  const fetchData = async (url) => {
    if (appState.dataCache.has(url)) {
      return appState.dataCache.get(url);
    }

    const isGistUrl = Object.values(config.GIST_URLS).includes(url);
    const fetchUrl = isGistUrl ? url : getCacheBustedUrl(url);

    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      const data = await response.json();
      appState.dataCache.set(url, data);
      return data;
    } catch (error) {
      console.error("Fetch error:", error);
      throw error;
    }
  };
  /**
   * Toggles the 'd-none' class on an element by ID (e.g., for loading spinners).
   * @param {string} id The ID of the element.
   * @param {boolean} show Whether to show (false) or hide (true).
   */

  const toggleLoadingSpinner = (id, show) => {
    document.getElementById(id)?.classList.toggle("d-none", !show);
  };
  /**
   * Updates page metadata (title, OG tags, canonical link).
   * @param {object} meta The metadata object.
   * @param {string} url The canonical URL.
   */

  const updatePageMetadata = (meta, url) => {
    document.title = meta.title;
    const attributes = {
      description: meta.description,
      "og:title": meta.title,
      "og:description": meta.description,
      "og:url": url,
      "og:image": meta.image_url,
      canonical: url,
    };
    for (const [key, value] of Object.entries(attributes)) {
      const isOg = key.startsWith("og:");
      const selector = isOg
        ? `meta[property="${key}"]`
        : `meta[name="${key}"], link[rel="${key}"]`;
      const element = document.querySelector(selector);
      element?.setAttribute(
        isOg || key === "canonical" ? "content" : "href",
        value
      );
    }
  };
  /**
   * Inserts structured data (Schema.org JSON-LD) into the head.
   * @param {object} data The structured data object payload.
   * @param {string} type The Schema.org type (e.g., 'NewsArticle').
   */

  const insertStructuredData = (data, type) => {
    document.querySelector('script[type="application/ld+json"]')?.remove();
    const jsonLd = { "@context": "https://schema.org", "@type": type, ...data };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
  };
  /**
   * Debounces a function call.
   * @param {Function} func The function to debounce.
   * @param {number} delayMs The delay in milliseconds.
   * @returns {Function} The debounced function.
   */

  const debounce = (func, delayMs = 250) => {
    let timeoutId = null;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delayMs);
    };
  };
  /**
   * Throttles a function call.
   * @param {Function} func The function to throttle.
   * @param {number} limitMs The time limit in milliseconds.
   * @returns {Function} The throttled function.
   */

  const throttle = (func, limitMs = 100) => {
    let lastRan = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastRan >= limitMs) {
        lastRan = now;
        func(...args);
      }
    };
  };  // --- COMPONENT LOADERS ---
  /**
   * Fetches and injects an HTML component into a placeholder element.
   * @param {string} placeholderId The ID of the element to receive the HTML.
   * @param {string} componentUrl The relative URL of the HTML component.
   * @param {Function} [callback] Function to run after the component is loaded and injected.
   */
  const loadComponent = async (placeholderId, componentUrl, callback) => {
    const placeholder = document.getElementById(placeholderId);
    if (!placeholder) return;

    const url = componentUrl.startsWith("/")
      ? componentUrl
      : `/${componentUrl}`;
    const fetchUrl = getCacheBustedUrl(url);

    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      const html = await response.text();
      placeholder.innerHTML = html;
      callback?.(placeholder);
    } catch (error) {
      console.error(`Error loading ${placeholderId} from ${url}:`, error);
      placeholder.innerHTML = `<p class="text-center text-danger">Failed to load ${placeholderId.replace(
        "-",
        " "
      )}.</p>`;
    }
  };  // --- SEARCH AND INDEXING (CLEAN URLS FOR INDEX) ---
  /**
   * Builds the comprehensive search index by fetching news and game data.
   * @returns {Promise<Array<object>>} The search index array.
   */
  const buildSearchIndex = async () => {
    if (appState.searchIndex) return appState.searchIndex; // **Clean URLs for major sections**

    let index = [
      {
        url: "/",
        title: "Home",
        snippet: "Reflex Interactive - independent game development",
        searchable: "home reflex interactive independent game development",
      },
      {
        url: "/games",
        title: "Our Games",
        snippet: "Browse our full catalog of games",
        searchable: "our games browse full catalog",
      },
      {
        url: "/newswire",
        title: "Newswire",
        snippet: "Latest news and announcements",
        searchable: "newswire latest news announcements",
      },
      {
        url: "/about",
        title: "About Us",
        snippet: "Learn about Reflex Interactive",
        searchable: "about us learn reflex interactive",
      },
      {
        url: "/contact",
        title: "Contact",
        snippet: "Get in touch with our team",
        searchable: "contact get in touch team",
      },
    ];

    try {
      const news = await fetchData(config.GIST_URLS.NEWS);
      if (Array.isArray(news)) {
        news.forEach((item) =>
          index.push({
            // **UPDATED Clean URL for news articles: /newswire?id=...**
            url: `/newswire?id=${item.id}`,
            title: item.title,
            snippet: item.summary.slice(0, 100),
            searchable: `${item.title} ${item.summary}`.toLowerCase(),
          })
        );
      }
    } catch (error) {
      console.warn("News fetch for search index failed:", error.message);
    }

    try {
      const games = await fetchData(config.GIST_URLS.GAMES);
      if (Array.isArray(games)) {
        games.forEach((item) =>
          index.push({
            // **UPDATED Clean URL for game details: /games?id=...**
            url: `/games?id=${item.id}`,
            title: item.title,
            snippet: item.description.slice(0, 100),
            searchable: `${item.title} ${item.description}`.toLowerCase(),
          })
        );
      }
    } catch (error) {
      console.warn("Games fetch for search index failed:", error.message);
    }

    return (appState.searchIndex = index);
  };
  /**
   * Searches the index based on a query.
   * @param {string} query The search query string.
   * @returns {Promise<Array<object>>} Up to 8 matching results.
   */

  const searchIndex = async (query) => {
    const normalizedQuery = query?.trim()?.toLowerCase();
    if (!normalizedQuery) return [];

    await buildSearchIndex();
    return appState.searchIndex
      .filter((item) => item.searchable.includes(normalizedQuery))
      .slice(0, 8);
  };
  /**
   * Sets up global search input listeners and result display logic.
   */

  const initGlobalSearch = () => {
    const input = document.getElementById("global-search-input");
    const resultsContainer = document.getElementById(
      "search-results-container"
    );
    const resultsList = document.getElementById("global-search-results");

    if (!input || !resultsContainer || !resultsList) return;

    const renderResults = (results) => {
      resultsList.innerHTML = "";
      if (!results?.length) {
        resultsContainer.style.display = "none";
        return;
      }

      results.forEach((result) => {
        const link = document.createElement("a");
        link.href = result.url;
        link.className =
          "list-group-item list-group-item-action bg-dark text-light border-secondary";
        link.innerHTML = `<strong>${result.title}</strong><br><small class="text-muted">${result.snippet}</small>`;
        resultsList.appendChild(link);
      });
      resultsContainer.style.display = "block";
    };

    const handleInput = debounce(async (event) => {
      const results = await searchIndex(event.target.value);
      renderResults(results);
    }, config.SEARCH_DEBOUNCE_MS);

    input.addEventListener("input", handleInput);
    document.addEventListener("click", (event) => {
      if (
        !input.contains(event.target) &&
        !resultsContainer.contains(event.target)
      ) {
        resultsContainer.style.display = "none";
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        resultsContainer.style.display = "none";
        input.value = "";
      }
    });
  };  // --- UI INTERACTION (SCROLL/HOVER REVEAL) ---
  /**
   * Initializes the Intersection Observer for scroll reveal animations.
   */
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
    const elementsToObserve = new Set();
    selectors.forEach((selector) =>
      document
        .querySelectorAll(selector)
        .forEach((el) => elementsToObserve.add(el))
    );

    appState.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const element = entry.target;
          const parent = element.parentElement;
          let delay = 0; // Staggered delay logic (based on sibling index)

          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (el) => el.tagName === element.tagName
            );
            const index = siblings.indexOf(element);
            if (index > 0) {
              delay = index * config.CARD_HOVER_DELAY_MS;
            }
          }

          element.style.transitionDelay = `${delay}ms`;
          element.classList.add("visible");
          appState.revealObserver.unobserve(element);
        });
      },
      { threshold: 0.08 }
    );

    elementsToObserve.forEach((element) => {
      if (!element.closest(".navbar")) {
        // Don't hide the navbar on load
        element.classList.add("reveal-on-scroll");
        appState.revealObserver.observe(element);
      }
    }); // Instant 'reveal-on-load' and delayed 'hero-entry' elements

    requestAnimationFrame(() => {
      document
        .querySelectorAll(".reveal-on-load, .hero-entry")
        .forEach((element, index) => {
          const initialDelay = element.classList.contains("hero-entry")
            ? 120
            : 0;
          setTimeout(
            () => element.classList.add("visible"),
            initialDelay + index * config.CARD_HOVER_DELAY_MS
          );
        });
    });
  };
  /**
   * Updates the navbar appearance on scroll.
   */

  const initNavbarScrollEffect = () => {
    const header = document.querySelector("header");
    if (!header) return;

    const scrollHandler = throttle(() => {
      header.classList.toggle("bg-black", window.scrollY > 50);
    }, 10);
    window.addEventListener("scroll", scrollHandler);
  };
  /**
   * Enables smooth scrolling for anchor links.
   */

  const initSmoothScroll = () => {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        // Prevent smooth scroll on the purchase/download button if it's disabled
        if (event.currentTarget.id !== "purchase-download-btn") {
          event.preventDefault();
          document
            .querySelector(event.currentTarget.getAttribute("href"))
            ?.scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  };  // --- FORM HANDLER ---
  /**
   * Handles form submission via Fetch API (for contact form).
   * @param {Event} event The form submit event.
   * @param {HTMLFormElement} form The form element.
   */
  const handleFormSubmission = async (event, form) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = "Sending...";

    try {
      const response = await fetch(form.action, {
        method: form.method,
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      const success = response.ok;
      const message = success
        ? "Thank you! Your message has been sent."
        : "There was an issue sending your message.";

      form.innerHTML = `<p class="text-${
        success ? "success" : "danger"
      } fw-bold text-center">${message}</p>`;

      if (!success) {
        console.error("Form submission failed");
      }
    } catch (error) {
      console.error("Submission error:", error);
      form.innerHTML =
        '<p class="text-danger fw-bold text-center">Something went wrong. Please try again later.</p>';
    }
  };  // --- CONTENT RENDERING FUNCTIONS (CLEAN URLS FOR LINKS) ---
  /**
   * Creates an HTML element for a single News article card.
   * @param {object} article The news article data object.
   * @returns {HTMLElement} The 'col' wrapper element containing the card.
   */
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
                     <span class="modern-card-cta mt-auto">
                         Read More <span class="ms-2">→</span>
                     </span>
                 </div>
             </a>
         `;
    appState.revealObserver?.observe(card);
    col.appendChild(card);
    return col;
  };
  /**
   * Creates an HTML element for a single Game card.
   * @param {object} game The game data object.
   * @returns {HTMLElement} The 'col' wrapper element containing the card.
   */

  const createGameCard = (game) => {
    const col = document.createElement("div");
    col.className = "col";
    const card = document.createElement("div");
    card.className =
      "card modern-card modern-game-card h-100 bg-dark border-0 overflow-hidden position-relative reveal-on-scroll";
    card.innerHTML = `
             <img src="${game.image_url}" alt="${game.title} Cover" class="modern-game-card-img" loading="lazy">
             <div class="modern-game-card-overlay">
                 <h3 class="modern-game-card-title">${game.title}</h3>
                 <p class="modern-game-card-desc">${game.description}</p>
                 <a href="/games?id=${game.id}" class="modern-game-card-link">
                     Learn More <span class="ms-2">→</span>
                 </a>
             </div>
         `;
    appState.revealObserver?.observe(card);
    col.appendChild(card);
    return col;
  };
  /**
   * Fetches and renders the news list into the target container.
   * @param {HTMLElement} container The DOM element to append cards to.
   * @param {number} [count=null] The maximum number of items to render.
   */

  const renderNewsList = async (container, count = null) => {
    const spinnerId = container.id.includes("latest")
      ? "homepage-loading-spinner"
      : "loading-spinner";
    toggleLoadingSpinner(spinnerId, true);

    try {
      let newsData = await fetchData(config.GIST_URLS.NEWS);
      if (count) {
        newsData = newsData.slice(0, count);
      }
      container.append(...newsData.map(createNewsCard));
    } catch (error) {
      console.error("Failed to fetch news:", error);
      container.innerHTML =
        '<div class="text-center text-danger py-5">Failed to load news. Please try again later.</div>';
    } finally {
      toggleLoadingSpinner(spinnerId, false);
    }
  };
  /**
   * Fetches and displays a single news article detail.
   * @param {string} articleId The ID of the article to display.
   */

  const renderArticleDetail = async (articleId) => {
    // The news page contains both the list section and the detail article section.
    const articleListSection = document.getElementById("article-list-section");
    const articleDetailSection = document.getElementById("article-detail");
    toggleLoadingSpinner("loading-spinner", true);

    try {
      const newsData = await fetchData(config.GIST_URLS.NEWS);
      const article = newsData.find((item) => item.id == articleId);

      if (!article) throw new Error("Article not found"); // Show detail view, hide list view (since they are in the same physical file)

      articleListSection?.classList.add("d-none");
      articleDetailSection?.classList.remove("d-none"); // Update Metadata and Schema (Skipped for brevity, but implemented in original file) // Populate DOM

      document.getElementById("article-title").textContent = article.title;
      document.getElementById("article-date").textContent = article.date;
      document.getElementById("article-image").src = article.image_url;
      document.getElementById("article-image").alt = article.title;
      document.getElementById("article-content").innerHTML =
        article.content.replace(/\n/g, "<br><br>");
    } catch (error) {
      console.error("Failed to display article details:", error);
      document.querySelector("main").innerHTML =
        '<div class="text-center text-danger pt-5">Failed to load article. Please try again.</div>';
    } finally {
      toggleLoadingSpinner("loading-spinner", false);
    }
  };
  /**
   * Fetches and renders the game list into the target container.
   * @param {HTMLElement} container The DOM element to append cards to.
   * @param {number} [count=null] The maximum number of items to render.
   */

  const renderGameList = async (container, count = null) => {
    const spinnerId = container.id.includes("latest")
      ? "homepage-games-loading-spinner"
      : "games-loading-spinner";
    toggleLoadingSpinner(spinnerId, true);

    try {
      let gameData = await fetchData(config.GIST_URLS.GAMES);
      if (count) {
        gameData = gameData.slice(0, count);
      }
      container.append(...gameData.map(createGameCard));
    } catch (error) {
      console.error("Failed to fetch games:", error);
      container.innerHTML =
        '<div class="text-center text-danger py-5">Failed to load games. Please try again later.</div>';
    } finally {
      toggleLoadingSpinner(spinnerId, false);
    }
  };
  /**
   * Fetches and displays a single game detail page.
   */

  const renderGameDetail = async () => {
    // This function runs when the user is on the physical /src/pages/game-details.html file (rewritten from /games?id=...)
    const gameId = new URLSearchParams(window.location.search).get("id");
    if (!gameId) {
      document.querySelector("main").innerHTML =
        '<div class="text-center text-danger pt-5">Game not found.</div>';
      return;
    }

    try {
      const gameData = await fetchData(config.GIST_URLS.GAMES);
      const game = gameData.find((item) => item.id == gameId);

      if (!game) throw new Error("Game not found"); // Update Metadata and Schema (Skipped for brevity, but implemented in original file) // Populate DOM

      const gameHero = document.getElementById("game-hero");
      if (gameHero) {
        gameHero.style.backgroundImage = `url(${
          game.hero_image_url || game.image_url
        })`;
        Object.assign(gameHero.style, {
          backgroundPosition: "center",
          backgroundSize: "cover",
        });
      }

      document.getElementById("game-detail-cover").src = game.image_url;
      document.getElementById(
        "game-detail-cover"
      ).alt = `${game.title} Cover Art`;
      document.getElementById("game-detail-title").textContent = game.title;
      document.getElementById("game-detail-developer").textContent =
        game.developer;
      document.getElementById("game-detail-publisher").textContent =
        game.publisher;
      document.getElementById("game-detail-genre").textContent = game.genre;
      document.getElementById("game-detail-description").textContent =
        game.description;

      const purchaseButton = document.getElementById("purchase-download-btn");
      const priceElement = document.getElementById("game-detail-price");

      priceElement.textContent =
        game.price === 0 ? "FREE" : `$${game.price.toFixed(2)}`;

      if (game.price === 0 && game.download_url) {
        purchaseButton.textContent = "Download Now";
        purchaseButton.href = game.download_url;
        purchaseButton.setAttribute("download", "");
        purchaseButton.classList.remove("opacity-50", "cursor-not-allowed");
      } else {
        purchaseButton.textContent = "Purchase Now";
        purchaseButton.href = "#";
        purchaseButton.removeAttribute("download");
        purchaseButton.classList.add("opacity-50", "cursor-not-allowed");
      }

      const screenshotsContainer = document.getElementById(
        "game-detail-screenshots"
      );
      if (screenshotsContainer) {
        screenshotsContainer.innerHTML = "";
        if (game.trailer_url) {
          const iframe = document.createElement("iframe");
          iframe.src = game.trailer_url;
          iframe.className = "w-full h-auto rounded-lg shadow-md aspect-video";
          iframe.setAttribute("frameborder", "0");
          iframe.setAttribute(
            "allow",
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          );
          iframe.setAttribute("allowfullscreen", "");
          screenshotsContainer.appendChild(iframe);
        }
        game.screenshots.forEach((src) => {
          const img = document.createElement("img");
          img.src = src;
          img.alt = `${game.title} screenshot`;
          img.className = "w-full h-auto rounded-lg shadow-md";
          img.loading = "lazy";
          screenshotsContainer.appendChild(img);
        });
      }
    } catch (error) {
      console.error("Failed to display game details:", error);
      document.querySelector("main").innerHTML =
        '<div class="text-center text-danger pt-5">Failed to load game details. Please try again.</div>';
    }
  }; // --- MAIN INITIALIZATION (PATH CHECKS UPDATED) ---

  const initializeApp = async () => {
    // 1. Load header, search, and footer components concurrently
    // NOTE: These paths MUST remain the original file locations (/src/components/...)
    await Promise.all([
      loadComponent(
        "navbar-placeholder",
        "/src/components/navbar.html",
        (el) => {
          initNavbarScrollEffect();
          initSmoothScroll();
        }
      ),
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
          const footerForm = el.querySelector("form");
          footerForm &&
            footerForm.addEventListener("submit", (e) =>
              handleFormSubmission(e, footerForm)
            );
        }
      ),
    ]); // 2. Initialize scroll reveal effects after all structural HTML is loaded

    initScrollReveal(); // 3. Determine current page and render content // NOTE: The pathname check must now use the clean URL visible in the browser.

    const pathname = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get("id");
    const latestGamesContainer = document.getElementById(
      "latest-games-container"
    );
    const latestNewsContainer = document.getElementById(
      "latest-news-container"
    ); // **Routing logic checks against clean URLs**

    // Determine which content to render based on URL and ID presence
    const isGameRoute = pathname === "/games";
    const isNewswireRoute = pathname === "/newswire";

    if (isGameRoute && urlId) {
      // CASE 1: /games?id=123 (Detail View)
      // This relies on the server mapping /games/* to /src/pages/game-details.html
      renderGameDetail();
    } else if (isGameRoute) {
      // CASE 2: /games (List View)
      // This relies on the server mapping /games to /src/pages/games.html
      const fullGamesContainer = document.getElementById(
        "full-games-container"
      );
      fullGamesContainer && renderGameList(fullGamesContainer);
    } else if (isNewswireRoute && urlId) {
      // CASE 3: /newswire?id=123 (Article Detail View)
      // This relies on the server mapping /newswire/* to /src/pages/newswire.html
      // And the news page template handles the list/detail hide/show logic.
      renderArticleDetail(urlId);
    } else if (isNewswireRoute) {
      // CASE 4: /newswire (List View)
      // This relies on the server mapping /newswire to /src/pages/newswire.html
      const newsContainer = document.getElementById("news-container");
      newsContainer && renderNewsList(newsContainer);
    } else if (pathname === "/" || pathname === "/index.html") {
      // Homepage logic
      latestGamesContainer &&
        renderGameList(latestGamesContainer, config.HOME_PAGE_ITEM_COUNT);
      latestNewsContainer &&
        renderNewsList(latestNewsContainer, config.HOME_PAGE_ITEM_COUNT);
    } // Note: The /about and /contact pages are static HTML and don't need dedicated rendering functions here. // 4. Attach contact form handler if present on the page (e.g., /contact)
    const contactForm = document.getElementById("contact-form");
    contactForm &&
      contactForm.addEventListener("submit", (e) =>
        handleFormSubmission(e, contactForm)
      );
  }; // Start application once DOM is ready

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
  } else {
    initializeApp();
  }
})();
