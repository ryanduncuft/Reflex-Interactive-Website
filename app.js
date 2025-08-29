document.addEventListener('DOMContentLoaded', () => {
    (async () => {
        // --- Configuration & Utility Functions ---

        // Central place to define data URLs
        const GIST_URLS = {
            NEWS: 'https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json',
            GAMES: 'https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json'
        };
        const HOME_PAGE_ITEM_COUNT = 3;

        /**
         * Adds a cache buster to a URL to prevent caching issues.
         * @param {string} url The URL to modify.
         * @returns {string} The URL with a timestamp.
         */
        const addCacheBuster = url => `${url}?t=${new Date().getTime()}`;

        /**
         * Fetches and parses JSON data from a given URL.
         * @param {string} url The URL to fetch data from.
         * @returns {Promise<Object>} The fetched JSON data.
         */
        const fetchData = async url => {
            const response = await fetch(addCacheBuster(url));
            if (!response.ok) {
                throw new Error(`Network response from ${url} was not ok`);
            }
            return response.json();
        };

        /**
         * Toggles the visibility of a loading spinner.
         * @param {string} id The ID of the spinner element.
         * @param {boolean} show Whether to show or hide the spinner.
         */
        const toggleSpinner = (id, show) => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.toggle('hidden', !show);
            }
        };

        /**
         * Updates page meta tags and canonical links dynamically for better SEO.
         * @param {Object} data The data object containing meta information.
         * @param {string} url The canonical URL for the page.
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
                const selector = key.startsWith('og:') ? `meta[property="${key}"]` : `meta[name="${key}"], link[rel="${key}"]`;
                const el = document.querySelector(selector);
                if (el) {
                    el.setAttribute(key.startsWith('og:') ? 'content' : 'href', value);
                }
            }
        };

        /**
         * Dynamically generates and injects JSON-LD schema for structured data.
         * @param {Object} data The schema data object.
         * @param {string} type The schema type (e.g., 'NewsArticle', 'VideoGame').
         */
        const generateSchema = (data, type) => {
            let oldSchema = document.querySelector('script[type="application/ld+json"]');
            if (oldSchema) {
                oldSchema.remove();
            }
            const schema = {
                "@context": "https://schema.org",
                "@type": type,
                ...data
            };
            const script = document.createElement('script');
            script.type = 'application/ld+json';
            script.textContent = JSON.stringify(schema);
            document.head.appendChild(script);
        };

        // --- News Functions ---

        /**
         * Creates an HTML news card element from article data.
         * @param {Object} article The news article data.
         * @returns {HTMLElement} The news card element.
         */
        const createNewsCard = article => {
            const card = document.createElement('div');
            card.className = 'bg-[var(--color-background)] rounded-xl shadow-lg hover:shadow-2xl overflow-hidden transform hover:translate-y-[-5px] transition duration-300';
            card.innerHTML = `
                <a href="newswire.html?id=${article.id}">
                    <img src="${article.image_url}" alt="${article.title}" class="w-full h-48 object-cover">
                    <div class="p-6">
                        <h3 class="text-xl font-bold mb-2 text-[var(--color-primary)]">${article.title}</h3>
                        <p class="text-gray-400 text-sm mb-4">${article.date}</p>
                        <p class="text-gray-300 leading-relaxed line-clamp-3">${article.summary}</p>
                        <span class="mt-4 inline-block text-white font-semibold group">
                            Read More
                            <span class="ml-2 transform group-hover:translate-x-1 transition duration-200">&rarr;</span>
                        </span>
                    </div>
                </a>
            `;
            return card;
        };

        /**
         * Fetches and renders news articles to a specified container.
         * @param {HTMLElement} container The DOM element to render news cards into.
         * @param {number} [limit=null] The number of articles to render.
         */
        const fetchAndRenderNews = async(container, limit = null) => {
            // This is correct. It determines the spinner ID based on the container.
            const spinnerId = container.id === 'latest-news-container' ? 'homepage-loading-spinner' : 'loading-spinner';
            toggleSpinner(spinnerId, true);
            try {
                let articles = await fetchData(GIST_URLS.NEWS);
                if (limit) {
                    articles = articles.slice(0, limit);
                }
                articles.forEach(article => container.appendChild(createNewsCard(article)));
            } catch (e) {
                console.error('Failed to fetch news:', e);
                container.innerHTML = '<p class="text-center text-red-500">Failed to load news. Please try again later.</p>';
            } finally {
                // The spinner is always hidden here, even on error.
                toggleSpinner(spinnerId, false);
            }
        };

        /**
         * Displays a single news article with full details.
         * @param {string} id The ID of the article to display.
         */
        const displayNewsDetails = async id => {
            const articleList = document.getElementById('article-list-section');
            const articleDetail = document.getElementById('article-detail');
            toggleSpinner('loading-spinner', true);
            try {
                const article = (await fetchData(GIST_URLS.NEWS)).find(a => a.id == id);
                if (!article) {
                    if (articleList) articleList.classList.add('hidden');
                    articleDetail.classList.remove('hidden');
                    articleDetail.innerHTML = '<p class="text-center text-red-500 pt-32">Article not found.</p>';
                    return;
                }
                if (articleList) articleList.classList.add('hidden');
                articleDetail.classList.remove('hidden');
                updatePageMetadata({
                    title: `${article.title} | Reflex Interactive Newswire`,
                    description: article.summary,
                    image_url: article.image_url
                }, window.location.href);
                generateSchema({
                    "headline": article.title,
                    "image": [article.image_url],
                    "datePublished": article.date_iso || new Date().toISOString(),
                    "dateModified": new Date().toISOString(),
                    "author": { "@type": "Organization", "name": "Reflex Interactive" },
                    "publisher": { "@type": "Organization", "name": "Reflex Interactive" },
                    "description": article.summary
                }, "NewsArticle");
                document.getElementById('article-title').textContent = article.title;
                document.getElementById('article-date').textContent = article.date;
                document.getElementById('article-image').src = article.image_url;
                document.getElementById('article-image').alt = article.title;
                document.getElementById('article-content').innerHTML = article.content.replace(/\n/g, '<br><br>');
            } catch (e) {
                console.error('Failed to display article details:', e);
                const mainContent = document.querySelector('main');
                if (mainContent) mainContent.innerHTML = '<p class="text-center text-red-500 pt-32">Failed to load article details. Please try again later.</p>';
            } finally {
                toggleSpinner('loading-spinner', false);
            }
        };

        // --- Games Functions ---

        /**
         * Creates an HTML game card element from game data.
         * @param {Object} game The game data.
         * @returns {HTMLElement} The game card element.
         */
        const createGameCard = game => {
            const card = document.createElement('div');
            card.className = 'group relative overflow-hidden bg-[var(--color-secondary-bg)] rounded-xl shadow-2xl';
            card.innerHTML = `
                <img src="${game.image_url}" alt="${game.title} Cover" class="w-full h-96 object-cover transform transition duration-500 group-hover:scale-105">
                <div class="absolute inset-0 bg-black/70 flex flex-col justify-end p-8 opacity-0 group-hover:opacity-100 transition duration-500">
                    <h3 class="text-3xl font-black mb-2 uppercase text-[var(--color-primary)]">${game.title}</h3>
                    <p class="text-gray-300 leading-tight mb-4">${game.description}</p>
                    <a href="game-details.html?id=${game.id}" class="text-white font-semibold flex items-center hover:underline">
                        Learn More<span class="ml-2 transform group-hover:translate-x-1 transition duration-200">&rarr;</span>
                    </a>
                </div>
            `;
            return card;
        };

        /**
         * Fetches and renders games to a specified container.
         * @param {HTMLElement} container The DOM element to render game cards into.
         * @param {number} [limit=null] The number of games to render.
         */
        const fetchAndRenderGames = async(container, limit = null) => {
            // This is correct. It determines the spinner ID based on the container.
            const spinnerId = container.id === 'latest-games-container' ? 'homepage-games-loading-spinner' : 'games-loading-spinner';
            toggleSpinner(spinnerId, true);
            try {
                let games = await fetchData(GIST_URLS.GAMES);
                if (limit) {
                    games = games.slice(0, limit);
                }
                games.forEach(game => container.appendChild(createGameCard(game)));
            } catch (e) {
                console.error('Failed to fetch games:', e);
                container.innerHTML = '<p class="text-center text-red-500">Failed to load games. Please try again later.</p>';
            } finally {
                // The spinner is always hidden here, even on error.
                toggleSpinner(spinnerId, false);
            }
        };

        /**
         * Displays a single game with full details on the game details page.
         */
        const displayGameDetails = async() => {
            const id = new URLSearchParams(window.location.search).get('id');
            if (!id) {
                const mainContent = document.querySelector('main');
                if (mainContent) mainContent.innerHTML = '<p class="text-center text-red-500 pt-32">Game not found.</p>';
                return;
            }
            try {
                const game = (await fetchData(GIST_URLS.GAMES)).find(g => g.id == id);
                if (!game) {
                    const mainContent = document.querySelector('main');
                    if (mainContent) mainContent.innerHTML = '<p class="text-center text-red-500 pt-32">Game not found.</p>';
                    return;
                }
                updatePageMetadata({
                    title: `${game.title} | Reflex Interactive`,
                    description: game.description,
                    image_url: game.image_url
                }, window.location.href);
                generateSchema({
                    "name": game.title,
                    "image": [game.image_url, ...game.screenshots],
                    "url": window.location.href,
                    "description": game.description,
                    "genre": game.genre,
                    "publisher": { "@type": "Organization", "name": game.publisher },
                    "developer": { "@type": "Organization", "name": game.developer },
                    "offers": { "@type": "Offer", "price": game.price, "priceCurrency": "USD", "url": window.location.href, "availability": "https://schema.org/InStock" },
                    "aggregateRating": { "@type": "AggregateRating", "ratingValue": "5.0", "ratingCount": "1" }
                }, "VideoGame");

                // Populate game information
                const heroEl = document.getElementById('game-hero');
                if (heroEl) {
                    heroEl.style.backgroundImage = `url(${game.hero_image_url || game.image_url})`;
                    heroEl.style.backgroundPosition = 'center';
                    heroEl.style.backgroundSize = 'cover';
                }
                document.getElementById('game-detail-cover').src = game.image_url;
                document.getElementById('game-detail-cover').alt = `${game.title} Cover Art`;
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
                        screenshotsContainer.appendChild(img);
                    });
                }
            } catch (e) {
                console.error('Failed to display game details:', e);
                const mainContent = document.querySelector('main');
                if (mainContent) mainContent.innerHTML = '<p class="text-center text-red-500 pt-32">Failed to load game details. Please try again later.</p>';
            }
        };

        // --- UI & Event Listeners ---

        /**
         * Sets up the header's scroll behavior, making it solid black after a certain scroll position.
         */
        const setupHeader = () => {
            const header = document.querySelector('header');
            if (!header) return;
            window.addEventListener('scroll', () => header.classList.toggle('bg-black', window.scrollY > 50));
        };

        /**
         * Toggles the visibility of the mobile menu.
         */
        const toggleMobileMenu = () => {
            const [menu, btn] = [document.getElementById('mobile-menu'), document.getElementById('mobile-menu-btn')];
            if (menu && btn) {
                menu.classList.toggle('transform-none');
                btn.classList.toggle('toggle-menu');
            }
        };

        /**
         * Adds smooth scroll behavior to all anchor links.
         */
        const setupSmoothScroll = () => {
            document.querySelectorAll('a[href^="#"]').forEach(anchor => anchor.addEventListener('click', e => {
                if (e.currentTarget.id === 'purchase-download-btn') return;
                e.preventDefault();
                document.querySelector(e.currentTarget.getAttribute('href')).scrollIntoView({
                    behavior: 'smooth'
                });
                const mobileMenu = document.getElementById('mobile-menu');
                if (mobileMenu && mobileMenu.classList.contains('transform-none')) toggleMobileMenu();
            }));
        };

        /**
         * Clones navigation links for the mobile menu.
         */
        const cloneNavLinks = () => {
            const [desktop, mobile] = [document.getElementById('desktop-nav'), document.getElementById('mobile-menu-links')];
            if (!desktop || !mobile) return;
            desktop.querySelectorAll('a').forEach(link => {
                const cloned = link.cloneNode(true);
                cloned.classList.remove('uppercase', 'text-sm', 'font-semibold', 'tracking-wide', 'hover:text-[var(--color-primary)]', 'transition', 'duration-300');
                cloned.classList.add('text-3xl', 'font-bold', 'text-white', 'hover:text-[var(--color-primary)]', 'transition-colors', 'duration-300');
                cloned.textContent = cloned.textContent.toUpperCase();
                mobile.appendChild(cloned);
            });
        };

        /**
         * Handles form submission asynchronously using Fetch API.
         * @param {Event} e The form submission event.
         * @param {HTMLFormElement} form The form element.
         */
        const handleFormSubmission = async(e, form) => {
            e.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true;
            button.textContent = 'Sending...';
            try {
                const response = await fetch(form.action, {
                    method: form.method,
                    body: new FormData(form),
                    headers: { 'Accept': 'application/json' }
                });
                form.innerHTML = `<p class="text-green-500 font-bold text-center">${response.ok ? 'Thank you! Your message has been sent.' : 'Oops! There was an issue sending your message.'}</p>`;
                if (!response.ok) console.error('Formspree submission failed');
            } catch (e) {
                console.error('Submission failed:', e);
                form.innerHTML = '<p class="text-red-500 font-bold text-center">Oops! Something went wrong. Please try again later.</p>';
            }
        };

        /**
         * Loads an HTML component from a separate file and inserts it into the DOM.
         * @param {string} id The ID of the placeholder element.
         * @param {string} url The URL of the HTML component.
         * @param {Function} [callback] An optional function to run after the component loads.
         */
        const loadComponent = async(id, url, callback) => {
            const el = document.getElementById(id);
            if (!el) return;
            try {
                el.innerHTML = await (await fetch(url)).text();
                if (callback) callback(el);
            } catch (e) {
                console.error(`Error loading ${id}:`, e);
                el.innerHTML = `<p class="text-center text-red-500">Failed to load ${id.replace('-', ' ')}.</p>`;
            }
        };

        // --- Main Initialization Logic ---

        const init = async () => {
            // Load and initialize shared components first
            await Promise.all([
                loadComponent('navbar-placeholder', 'navbar.html', el => {
                    cloneNavLinks();
                    setupHeader();
                    setupSmoothScroll();
                    document.getElementById('mobile-menu-btn')?.addEventListener('click', toggleMobileMenu);
                }),
                loadComponent('footer-placeholder', 'footer.html', el => {
                    const form = el.querySelector('form');
                    if (form) form.addEventListener('submit', e => handleFormSubmission(e, form));
                })
            ]);
        
            // Determine which page we are on and call the appropriate functions
            const path = window.location.pathname;
            const id = new URLSearchParams(window.location.search).get('id');
        
            if (path.includes('game-details.html')) {
                displayGameDetails();
            } else if (path.includes('games.html')) {
                const container = document.getElementById('full-games-container');
                if (container) fetchAndRenderGames(container);
            } else if (path.includes('newswire.html')) {
                const container = document.getElementById('news-container');
                if (container) id ? displayNewsDetails(id) : fetchAndRenderNews(container);
            } else {
                // Homepage
                const gamesContainer = document.getElementById('latest-games-container');
                if (gamesContainer) {
                    // Correctly pass the homepage games container and spinner ID
                    fetchAndRenderGames(gamesContainer, HOME_PAGE_ITEM_COUNT);
                }
                const newsContainer = document.getElementById('latest-news-container');
                if (newsContainer) {
                    // Correctly pass the homepage news container and spinner ID
                    fetchAndRenderNews(newsContainer, HOME_PAGE_ITEM_COUNT);
                }
            }
        
            // Global event listener for main contact form
            document.getElementById('main-contact-form')?.addEventListener('submit', e => handleFormSubmission(e, e.currentTarget));
        };

        init();
    })();
});