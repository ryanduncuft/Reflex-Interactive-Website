// ============================================================================
// Reflex Interactive - Modern ES6+ Application
// ============================================================================

(async () => {
  // Config constants
  const CONFIG = {
    GIST_URLS: {
      NEWS: 'https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json',
      GAMES: 'https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json'
    },
    HOME_PAGE_ITEM_COUNT: 3,
    CACHE_BUST_ENABLED: true,
    SEARCH_DEBOUNCE_MS: 200,
    CARD_HOVER_DELAY_MS: 80
  };

  // State
  const state = {
    searchIndex: null,
    revealObserver: null,
    dataCache: new Map()
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Add cache buster to URL
   */
  const addCacheBuster = (url) => CONFIG.CACHE_BUST_ENABLED 
    ? `${url}?t=${Date.now()}` 
    : url;

  /**
   * Fetch data with error handling and caching
   */
  const fetchData = async (url) => {
    const cacheKey = url;
    if (state.dataCache.has(cacheKey)) {
      return state.dataCache.get(cacheKey);
    }
    
    try {
      const response = await fetch(addCacheBuster(url));
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
      const data = await response.json();
      state.dataCache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.error('Fetch error:', err);
      throw err;
    }
  };

  /**
   * Toggle loading spinner
   */
  const toggleSpinner = (spinnerId, show) => {
    const el = document.getElementById(spinnerId);
    el?.classList.toggle('d-none', !show);
  };

  /**
   * Update page metadata
   */
  const updatePageMetadata = (data, url) => {
    document.title = data.title;
    const metaTags = {
      'description': data.description,
      'og:title': data.title,
      'og:description': data.description,
      'og:url': url,
      'og:image': data.image_url,
      'canonical': url
    };
    
    for (const [key, value] of Object.entries(metaTags)) {
      const selector = key.startsWith('og:') 
        ? `meta[property="${key}"]` 
        : `meta[name="${key}"], link[rel="${key}"]`;
      const el = document.querySelector(selector);
      if (el) {
        el.setAttribute(key.startsWith('og:') ? 'content' : 'href', value);
      }
    }
  };

  /**
   * Generate and inject JSON-LD schema
   */
  const generateSchema = (data, type) => {
    const oldSchema = document.querySelector('script[type="application/ld+json"]');
    oldSchema?.remove();
    
    const schema = { '@context': 'https://schema.org', '@type': type, ...data };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  };

  /**
   * Debounce function for performance
   */
  const debounce = (fn, wait = 250) => {
    let timeout = null;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  };

  /**
   * Throttle function for scroll events
   */
  const throttle = (fn, limit = 100) => {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= limit) {
        lastCall = now;
        fn(...args);
      }
    };
  };

  // ============================================================================
  // SEARCH FUNCTIONALITY
  // ============================================================================

  /**
   * Build search index from static pages and GIST data
   */
  const buildSearchIndex = async () => {
    if (state.searchIndex) return state.searchIndex;
    
    state.searchIndex = [
      { url: '/games', title: 'Our Games', snippet: 'Browse our full catalog of games', searchable: 'our games browse full catalog' },
      { url: '/newswire', title: 'Newswire', snippet: 'Latest news and announcements', searchable: 'newswire latest news announcements' },
      { url: '/about', title: 'About Us', snippet: 'Learn about Reflex Interactive', searchable: 'about us learn reflex interactive' },
      { url: '/contact', title: 'Contact', snippet: 'Get in touch with our team', searchable: 'contact get in touch team' }
    ];

    try {
      const newsData = await fetchData(CONFIG.GIST_URLS.NEWS);
      if (Array.isArray(newsData)) {
        newsData.forEach(article => {
          state.searchIndex.push({
            url: `/newswire?id=${article.id}`,
            title: article.title,
            snippet: article.summary.slice(0, 100),
            searchable: `${article.title} ${article.summary}`.toLowerCase()
          });
        });
      }
    } catch (err) {
      console.warn('News fetch for search:', err.message);
    }

    try {
      const gamesData = await fetchData(CONFIG.GIST_URLS.GAMES);
      if (Array.isArray(gamesData)) {
        gamesData.forEach(game => {
          state.searchIndex.push({
            url: `/game-details?id=${game.id}`,
            title: game.title,
            snippet: game.description.slice(0, 100),
            searchable: `${game.title} ${game.description}`.toLowerCase()
          });
        });
      }
    } catch (err) {
      console.warn('Games fetch for search:', err.message);
    }

    return state.searchIndex;
  };

  /**
   * Perform search query
   */
  const performSearch = async (query) => {
    if (!query?.trim()) return [];
    
    await buildSearchIndex();
    const q = query.trim().toLowerCase();
    
    return state.searchIndex
      .filter(item => item.searchable.includes(q))
      .slice(0, 8);
  };

  /**
   * Setup global search UI
   */
  const setupGlobalSearch = () => {
    const input = document.getElementById('global-search-input');
    const resultsContainer = document.getElementById('search-results-container');
    const resultsDiv = document.getElementById('global-search-results');

    if (!input || !resultsContainer || !resultsDiv) return;

    const renderResults = (items) => {
      resultsDiv.innerHTML = '';
      
      if (!items?.length) {
        resultsContainer.style.display = 'none';
        return;
      }

      items.forEach(item => {
        const a = document.createElement('a');
        a.href = item.url;
        a.className = 'list-group-item list-group-item-action bg-dark text-light border-secondary';
        a.innerHTML = `<strong>${item.title}</strong><br><small class="text-muted">${item.snippet}</small>`;
        resultsDiv.appendChild(a);
      });

      resultsContainer.style.display = 'block';
    };

    const handleSearch = debounce(async (e) => {
      const results = await performSearch(e.target.value);
      renderResults(results);
    }, CONFIG.SEARCH_DEBOUNCE_MS);

    input.addEventListener('input', handleSearch);

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
        resultsContainer.style.display = 'none';
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        resultsContainer.style.display = 'none';
        input.value = '';
      }
    });
  };

  // ============================================================================
  // REVEAL ANIMATIONS
  // ============================================================================

  /**
   * Setup scroll reveal animations with IntersectionObserver
   */
  const setupRevealAnimations = () => {
    const selectors = [
      '.reveal-on-scroll',
      '.card',
      '.article-grid > .col',
      '.row .col',
      '.display-4, .display-1, h1, h2, h3',
      '.game-card',
      '.hero-section h1, .hero-section p',
      '.btn',
      '.navbar-brand'
    ];

    const elements = new Set();
    selectors.forEach(sel => 
      document.querySelectorAll(sel).forEach(el => elements.add(el))
    );

    state.revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        
        const el = entry.target;
        const parent = el.parentElement;
        let delay = 0;

        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
          const idx = siblings.indexOf(el);
          if (idx > 0) delay = idx * CONFIG.CARD_HOVER_DELAY_MS;
        }

        el.style.transitionDelay = `${delay}ms`;
        el.classList.add('visible');
        state.revealObserver.unobserve(el);
      });
    }, { threshold: 0.08 });

    elements.forEach(el => {
      if (el.closest('.navbar')) return;
      el.classList.add('reveal-on-scroll');
      state.revealObserver.observe(el);
    });

    requestAnimationFrame(() => {
      document.querySelectorAll('.reveal-on-load').forEach((el, i) => 
        setTimeout(() => el.classList.add('visible'), i * CONFIG.CARD_HOVER_DELAY_MS)
      );
      document.querySelectorAll('.hero-entry').forEach((el, i) => 
        setTimeout(() => el.classList.add('visible'), 120 + i * 120)
      );
    });
  };

  // ============================================================================
  // CARD CREATION
  // ============================================================================

  /**
   * Create modern news card
   */
  const createNewsCard = (article) => {
    const col = document.createElement('div');
    col.className = 'col';
    
    const card = document.createElement('div');
    card.className = 'card modern-card h-100 bg-dark border-0 overflow-hidden position-relative';
    card.classList.add('reveal-on-scroll');
    
    card.innerHTML = `
      <a href="/newswire.html?id=${article.id}" class="text-decoration-none d-block h-100 d-flex flex-column">
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

    if (state.revealObserver) {
      state.revealObserver.observe(card);
    }

    col.appendChild(card);
    return col;
  };

  /**
   * Create modern game card
   */
  const createGameCard = (game) => {
    const col = document.createElement('div');
    col.className = 'col';
    
    const card = document.createElement('div');
    card.className = 'card modern-card modern-game-card h-100 bg-dark border-0 overflow-hidden position-relative';
    card.classList.add('reveal-on-scroll');

    card.innerHTML = `
      <img src="${game.image_url}" alt="${game.title} Cover" class="modern-game-card-img" loading="lazy">
      <div class="modern-game-card-overlay">
        <h3 class="modern-game-card-title">${game.title}</h3>
        <p class="modern-game-card-desc">${game.description}</p>
        <a href="/game-details.html?id=${game.id}" class="modern-game-card-link">
          Learn More <span class="ms-2">→</span>
        </a>
      </div>
    `;

    if (state.revealObserver) {
      state.revealObserver.observe(card);
    }

    col.appendChild(card);
    return col;
  };

  // ============================================================================
  // DATA FETCHING & RENDERING
  // ============================================================================

  /**
   * Fetch and render news articles
   */
  const fetchAndRenderNews = async (container, limit = null) => {
    const spinnerId = container.id === 'latest-news-container' 
      ? 'homepage-loading-spinner' 
      : 'loading-spinner';
    
    toggleSpinner(spinnerId, true);
    try {
      let articles = await fetchData(CONFIG.GIST_URLS.NEWS);
      if (limit) articles = articles.slice(0, limit);
      articles.forEach(article => container.appendChild(createNewsCard(article)));
    } catch (err) {
      console.error('Failed to fetch news:', err);
      container.innerHTML = '<div class="text-center text-danger py-5">Failed to load news. Please try again later.</div>';
    } finally {
      toggleSpinner(spinnerId, false);
    }
  };

  /**
   * Display news article details
   */
  const displayNewsDetails = async (id) => {
    const articleList = document.getElementById('article-list-section');
    const articleDetail = document.getElementById('article-detail');
    
    toggleSpinner('loading-spinner', true);
    try {
      const article = (await fetchData(CONFIG.GIST_URLS.NEWS)).find(a => a.id == id);
      
      if (!article) throw new Error('Article not found');

      articleList?.classList.add('d-none');
      articleDetail?.classList.remove('d-none');

      updatePageMetadata({
        title: `${article.title} | Reflex Interactive Newswire`,
        description: article.summary,
        image_url: article.image_url
      }, window.location.href);

      generateSchema({
        headline: article.title,
        image: [article.image_url],
        datePublished: article.date_iso || new Date().toISOString(),
        dateModified: new Date().toISOString(),
        author: { '@type': 'Organization', name: 'Reflex Interactive' },
        publisher: { '@type': 'Organization', name: 'Reflex Interactive' },
        description: article.summary
      }, 'NewsArticle');

      document.getElementById('article-title').textContent = article.title;
      document.getElementById('article-date').textContent = article.date;
      document.getElementById('article-image').src = article.image_url;
      document.getElementById('article-image').alt = article.title;
      document.getElementById('article-content').innerHTML = article.content.replace(/\n/g, '<br><br>');
    } catch (err) {
      console.error('Failed to display article details:', err);
      const main = document.querySelector('main');
      if (main) main.innerHTML = '<div class="text-center text-danger pt-5">Failed to load article. Please try again.</div>';
    } finally {
      toggleSpinner('loading-spinner', false);
    }
  };

  /**
   * Fetch and render games
   */
  const fetchAndRenderGames = async (container, limit = null) => {
    const spinnerId = container.id === 'latest-games-container' 
      ? 'homepage-games-loading-spinner' 
      : 'games-loading-spinner';
    
    toggleSpinner(spinnerId, true);
    try {
      let games = await fetchData(CONFIG.GIST_URLS.GAMES);
      if (limit) games = games.slice(0, limit);
      games.forEach(game => container.appendChild(createGameCard(game)));
    } catch (err) {
      console.error('Failed to fetch games:', err);
      container.innerHTML = '<div class="text-center text-danger py-5">Failed to load games. Please try again later.</div>';
    } finally {
      toggleSpinner(spinnerId, false);
    }
  };

  /**
   * Display game details
   */
  const displayGameDetails = async () => {
    const id = new URLSearchParams(window.location.search).get('id');
    
    if (!id) {
      const main = document.querySelector('main');
      if (main) main.innerHTML = '<div class="text-center text-danger pt-5">Game not found.</div>';
      return;
    }

    try {
      const game = (await fetchData(CONFIG.GIST_URLS.GAMES)).find(g => g.id == id);
      
      if (!game) throw new Error('Game not found');

      updatePageMetadata({
        title: `${game.title} | Reflex Interactive`,
        description: game.description,
        image_url: game.image_url
      }, window.location.href);

      generateSchema({
        name: game.title,
        image: [game.image_url, ...game.screenshots],
        url: window.location.href,
        description: game.description,
        genre: game.genre,
        publisher: { '@type': 'Organization', name: game.publisher },
        developer: { '@type': 'Organization', name: game.developer },
        offers: { '@type': 'Offer', price: game.price, priceCurrency: 'USD', url: window.location.href, availability: 'https://schema.org/InStock' },
        aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', ratingCount: '1' }
      }, 'VideoGame');

      const heroEl = document.getElementById('game-hero');
      if (heroEl) {
        heroEl.style.backgroundImage = `url(${game.hero_image_url || game.image_url})`;
        heroEl.style.backgroundPosition = 'center';
        heroEl.style.backgroundSize = 'cover';
      }

      const cover = document.getElementById('game-detail-cover');
      if (cover) {
        cover.src = game.image_url;
        cover.alt = `${game.title} Cover Art`;
      }

      document.getElementById('game-detail-title').textContent = game.title;
      document.getElementById('game-detail-developer').textContent = game.developer;
      document.getElementById('game-detail-publisher').textContent = game.publisher;
      document.getElementById('game-detail-genre').textContent = game.genre;
      document.getElementById('game-detail-description').textContent = game.description;

      const purchaseBtn = document.getElementById('purchase-download-btn');
      const priceEl = document.getElementById('game-detail-price');
      
      priceEl.textContent = game.price === 0 ? 'FREE' : `$${game.price.toFixed(2)}`;

      if (game.price === 0 && game.download_url) {
        purchaseBtn.textContent = 'Download Now';
        purchaseBtn.href = game.download_url;
        purchaseBtn.setAttribute('download', '');
        purchaseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      } else {
        purchaseBtn.textContent = 'Purchase Now';
        purchaseBtn.href = '#';
        purchaseBtn.removeAttribute('download');
        purchaseBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }

      const screenshotsContainer = document.getElementById('game-detail-screenshots');
      if (screenshotsContainer) {
        screenshotsContainer.innerHTML = '';
        
        if (game.trailer_url) {
          const iframe = document.createElement('iframe');
          iframe.src = game.trailer_url;
          iframe.className = 'w-full h-auto rounded-lg shadow-md aspect-video';
          iframe.setAttribute('frameborder', '0');
          iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
          iframe.setAttribute('allowfullscreen', '');
          screenshotsContainer.appendChild(iframe);
        }

        game.screenshots.forEach(src => {
          const img = document.createElement('img');
          img.src = src;
          img.alt = `${game.title} screenshot`;
          img.className = 'w-full h-auto rounded-lg shadow-md';
          img.loading = 'lazy';
          screenshotsContainer.appendChild(img);
        });
      }
    } catch (err) {
      console.error('Failed to display game details:', err);
      const main = document.querySelector('main');
      if (main) main.innerHTML = '<div class="text-center text-danger pt-5">Failed to load game details. Please try again.</div>';
    }
  };

  // ============================================================================
  // UI SETUP
  // ============================================================================

  /**
   * Setup header scroll effect
   */
  const setupHeader = () => {
    const header = document.querySelector('header');
    if (!header) return;
    
    const handleScroll = throttle(() => {
      header.classList.toggle('bg-black', window.scrollY > 50);
    }, 10);

    window.addEventListener('scroll', handleScroll);
  };

  /**
   * Setup smooth scroll for anchor links
   */
  const setupSmoothScroll = () => {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        if (e.currentTarget.id === 'purchase-download-btn') return;
        e.preventDefault();
        
        const target = document.querySelector(e.currentTarget.getAttribute('href'));
        target?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  };

  /**
   * Handle form submission
   */
  const handleFormSubmission = async (e, form) => {
    e.preventDefault();
    
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    
    button.disabled = true;
    button.textContent = 'Sending...';

    try {
      const response = await fetch(form.action, {
        method: form.method,
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      });

      const message = response.ok 
        ? 'Thank you! Your message has been sent.'
        : 'There was an issue sending your message.';

      form.innerHTML = `<p class="text-${response.ok ? 'success' : 'danger'} fw-bold text-center">${message}</p>`;
      
      if (!response.ok) console.error('Form submission failed');
    } catch (err) {
      console.error('Submission error:', err);
      form.innerHTML = '<p class="text-danger fw-bold text-center">Something went wrong. Please try again later.</p>';
    }
  };

  /**
   * Load component HTML
   */
  const loadComponent = async (id, url, callback) => {
    const el = document.getElementById(id);
    if (!el) return;

    const tryFetch = async (candidate) => {
      try {
        const res = await fetch(addCacheBuster(candidate));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch {
        return null;
      }
    };

    const origin = window.location.origin && window.location.origin !== 'null' 
      ? window.location.origin 
      : '';
    const normUrl = url.startsWith('/') ? url : `/${url}`;
    const segments = window.location.pathname.split('/').filter(Boolean);
    const ups = Math.max(0, segments.length - 1);
    const prefix = ups > 0 ? '../'.repeat(ups) : '';
    const relativeCandidate = `${prefix}${url}`;

    const candidates = [];
    if (origin) candidates.push(`${origin}${normUrl}`);
    candidates.push(normUrl);
    candidates.push(relativeCandidate);

    try {
      let html = null;
      for (const candidate of candidates) {
        html = await tryFetch(candidate);
        if (html) break;
      }
      
      if (!html) throw new Error('All attempts failed');
      
      el.innerHTML = html;
      callback?.(el);
    } catch (err) {
      console.error(`Error loading ${id}:`, err);
      el.innerHTML = `<p class="text-center text-danger">Failed to load ${id.replace('-', ' ')}.</p>`;
    }
  };

  // ============================================================================
  // APPLICATION INITIALIZATION
  // ============================================================================

  /**
   * Initialize application
   */
  const init = async () => {
    // Load all components in parallel
    await Promise.all([
      loadComponent('navbar-placeholder', 'src/components/navbar.html', () => {
        setupHeader();
        setupSmoothScroll();
      }),
      loadComponent('search-placeholder', 'src/components/searchbar.html', (el) => {
        setupGlobalSearch();
        el.querySelector('.global-search-wrap')?.classList.add('reveal-on-load');
      }),
      loadComponent('footer-placeholder', 'src/components/footer.html', (el) => {
        const form = el.querySelector('form');
        if (form) form.addEventListener('submit', (e) => handleFormSubmission(e, form));
      })
    ]);

    // Setup animations after components loaded
    setupRevealAnimations();

    // Route-based content loading
    const path = window.location.pathname;
    const id = new URLSearchParams(window.location.search).get('id');

    if (path.includes('game-details.html')) {
      displayGameDetails();
    } else if (path.includes('games.html')) {
      const container = document.getElementById('full-games-container');
      if (container) fetchAndRenderGames(container);
    } else if (path.includes('newswire.html')) {
      const container = document.getElementById('news-container');
      if (container) {
        id ? displayNewsDetails(id) : fetchAndRenderNews(container);
      }
    } else {
      // Home page
      const gamesContainer = document.getElementById('latest-games-container');
      if (gamesContainer) fetchAndRenderGames(gamesContainer, CONFIG.HOME_PAGE_ITEM_COUNT);
      
      const newsContainer = document.getElementById('latest-news-container');
      if (newsContainer) fetchAndRenderNews(newsContainer, CONFIG.HOME_PAGE_ITEM_COUNT);
    }

    // Setup contact form
    const contactForm = document.getElementById('contact-form');
    if (contactForm) contactForm.addEventListener('submit', (e) => handleFormSubmission(e, contactForm));
  };

  // Start application when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();