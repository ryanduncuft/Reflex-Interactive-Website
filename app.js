document.addEventListener('DOMContentLoaded', () => {

    // --- IIFE for Scoping and Encapsulation ---
    // This prevents variables from polluting the global scope.
    (function() {
        // --- API Endpoints ---
        const NEWS_GIST_URL = 'https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json';
        const GAMES_GIST_URL = 'https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json';

        // --- Core Website Functionality ---

        /**
         * Toggles the header's background color on scroll.
         */
        const setupHeader = () => {
            const header = document.querySelector('header');
            if (!header) return;

            window.addEventListener('scroll', () => {
                if (window.scrollY > 50) {
                    header.classList.add('bg-black', 'bg-opacity-100');
                    header.classList.remove('bg-opacity-75');
                } else {
                    header.classList.remove('bg-black', 'bg-opacity-100');
                    header.classList.add('bg-opacity-75');
                }
            });
        };

        /**
         * Sets up smooth scrolling for internal anchor links.
         */
        const setupSmoothScroll = () => {
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function(e) {
                    // Prevent smooth scroll on download button to allow default behavior
                    if (this.id === 'purchase-download-btn') return;

                    e.preventDefault();
                    document.querySelector(this.getAttribute('href')).scrollIntoView({
                        behavior: 'smooth'
                    });

                    // Close mobile menu after clicking a link
                    const mobileMenu = document.getElementById('mobile-menu');
                    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
                    if (mobileMenu && mobileMenu.classList.contains('transform-none')) {
                        toggleMobileMenu(mobileMenu, mobileMenuBtn);
                    }
                });
            });
        };

        /**
         * Toggles the mobile menu's visibility and button state.
         * @param {HTMLElement} mobileMenu - The mobile menu element.
         * @param {HTMLElement} mobileMenuBtn - The mobile menu button element.
         */
        const toggleMobileMenu = (mobileMenu, mobileMenuBtn) => {
            mobileMenu.classList.toggle('transform-none');
            mobileMenuBtn.classList.toggle('toggle-menu');
        };

        /**
         * Sets up the mobile menu toggle functionality.
         */
        const setupMobileMenu = () => {
            const mobileMenuBtn = document.getElementById('mobile-menu-btn');
            const mobileMenu = document.getElementById('mobile-menu');
            if (mobileMenuBtn && mobileMenu) {
                mobileMenuBtn.addEventListener('click', () => toggleMobileMenu(mobileMenu, mobileMenuBtn));
            }
        };

        // --- Utility Functions ---

        /**
         * Adds a cache-busting timestamp to a URL.
         * @param {string} url - The URL to modify.
         * @returns {string} The URL with the timestamp.
         */
        const addCacheBuster = (url) => {
            const timestamp = new Date().getTime();
            return `${url}?t=${timestamp}`;
        };

        /**
         * Fetches data from a given URL.
         * @param {string} url - The URL to fetch.
         * @returns {Promise<any>} The parsed JSON data.
         */
        const fetchData = async(url) => {
            const response = await fetch(addCacheBuster(url));
            if (!response.ok) {
                throw new Error(`Network response from ${url} was not ok`);
            }
            return response.json();
        };

        /**
         * Renders a spinner element.
         * @param {string} spinnerId - The ID of the spinner element.
         * @param {boolean} show - Whether to show or hide the spinner.
         */
        const toggleSpinner = (spinnerId, show) => {
            const spinner = document.getElementById(spinnerId);
            if (spinner) {
                spinner.classList.toggle('hidden', !show);
            }
        };

        // --- Newswire Functionality ---

        /**
         * Creates a news article card from data.
         * @param {object} article - The article data object.
         * @returns {HTMLElement} The created card element.
         */
        const createNewsCard = (article) => {
            const card = document.createElement('div');
            card.className = 'bg-[var(--color-background)] rounded-xl shadow-lg hover:shadow-2xl overflow-hidden transform hover:translate-y-[-5px] transition duration-300';
            card.innerHTML = `
                <img src="${article.image_url}" alt="${article.title}" class="w-full h-48 object-cover">
                <div class="p-6">
                    <h3 class="text-xl font-bold mb-2 text-[var(--color-primary)]">${article.title}</h3>
                    <p class="text-gray-400 text-sm mb-4">${article.date}</p>
                    <p class="text-gray-300 leading-relaxed line-clamp-3">${article.summary}</p>
                    <a href="newswire.html?id=${article.id}" class="mt-4 inline-block text-white font-semibold group">
                        Read More
                        <span class="ml-2 transform group-hover:translate-x-1 transition duration-200">&rarr;</span>
                    </a>
                </div>
            `;
            return card;
        };

        /**
         * Fetches and renders news articles to the specified containers.
         */
        const fetchAndRenderNews = async() => {
            const homepageContainer = document.getElementById('latest-news-container');
            const newswireContainer = document.getElementById('news-container');
            if (!homepageContainer && !newswireContainer) return;

            const spinnerId = homepageContainer ? 'homepage-loading-spinner' : 'loading-spinner';
            toggleSpinner(spinnerId, true);

            try {
                const articles = await fetchData(NEWS_GIST_URL);
                if (homepageContainer) {
                    const latestArticles = articles.slice(0, 3);
                    latestArticles.forEach(article => homepageContainer.appendChild(createNewsCard(article)));
                }
                if (newswireContainer) {
                    articles.forEach(article => newswireContainer.appendChild(createNewsCard(article)));
                }
            } catch (error) {
                console.error('Failed to fetch news:', error);
                const container = homepageContainer || newswireContainer;
                if (container) {
                    container.innerHTML = '<p class="text-center text-red-500">Failed to load news. Please try again later.</p>';
                }
            } finally {
                toggleSpinner(spinnerId, false);
            }
        };

        /**
         * Displays the details for a single news article.
         * @param {string} articleId - The ID of the article to display.
         */
        const displayNewsDetails = async(articleId) => {
            const newsContainer = document.getElementById('news-container');
            const detailSection = document.getElementById('article-detail');
            if (!newsContainer || !detailSection) return;

            toggleSpinner('loading-spinner', true);

            try {
                const articles = await fetchData(NEWS_GIST_URL);
                const article = articles.find(a => a.id == articleId);

                if (!article) {
                    newsContainer.classList.add('hidden');
                    detailSection.classList.remove('hidden');
                    detailSection.innerHTML = '<p class="text-center text-red-500 pt-32">Article not found.</p>';
                    return;
                }

                newsContainer.classList.add('hidden');
                detailSection.classList.remove('hidden');

                document.title = `${article.title} | Reflex Interactive`;
                document.getElementById('article-title').textContent = article.title;
                document.getElementById('article-date').textContent = article.date;
                document.getElementById('article-image').src = article.image_url;
                document.getElementById('article-image').alt = article.title;
                document.getElementById('article-content').innerHTML = article.content.replace(/\n/g, '<br><br>');
            } catch (error) {
                console.error('Failed to display article details:', error);
                document.querySelector('main').innerHTML = '<p class="text-center text-red-500 pt-32">Failed to load article details. Please try again later.</p>';
            } finally {
                toggleSpinner('loading-spinner', false);
            }
        };

        // --- Games Functionality ---

        /**
         * Creates a game card from data.
         * @param {object} game - The game data object.
         * @returns {HTMLElement} The created card element.
         */
        const createGameCard = (game) => {
            const card = document.createElement('div');
            card.className = 'group relative overflow-hidden bg-[var(--color-secondary-bg)] rounded-xl shadow-2xl';
            card.innerHTML = `
                <img src="${game.image_url}" alt="${game.title} Cover" class="w-full h-96 object-cover transform transition duration-500 group-hover:scale-105">
                <div class="absolute inset-0 bg-black/70 flex flex-col justify-end p-8 opacity-0 group-hover:opacity-100 transition duration-500">
                    <h3 class="text-3xl font-black mb-2 uppercase text-[var(--color-primary)]">${game.title}</h3>
                    <p class="text-gray-300 leading-tight mb-4">${game.description}</p>
                    <a href="game-details.html?id=${game.id}" class="text-white font-semibold flex items-center hover:underline">
                        Learn More
                        <span class="ml-2 transform group-hover:translate-x-1 transition duration-200">&rarr;</span>
                    </a>
                </div>
            `;
            return card;
        };

        /**
         * Fetches and renders games to the specified containers.
         */
        const fetchAndRenderGames = async() => {
            const homepageContainer = document.getElementById('latest-games-container');
            const fullGamesContainer = document.getElementById('full-games-container');
            if (!homepageContainer && !fullGamesContainer) return;

            toggleSpinner('homepage-games-loading-spinner', true);
            toggleSpinner('games-loading-spinner', true);

            try {
                const games = await fetchData(GAMES_GIST_URL);
                if (homepageContainer) {
                    const latestGames = games.slice(0, 3);
                    latestGames.forEach(game => homepageContainer.appendChild(createGameCard(game)));
                }
                if (fullGamesContainer) {
                    games.forEach(game => fullGamesContainer.appendChild(createGameCard(game)));
                }
            } catch (error) {
                console.error('Failed to fetch games:', error);
                const container = homepageContainer || fullGamesContainer;
                if (container) {
                    container.innerHTML = '<p class="text-center text-red-500">Failed to load games. Please try again later.</p>';
                }
            } finally {
                toggleSpinner('homepage-games-loading-spinner', false);
                toggleSpinner('games-loading-spinner', false);
            }
        };

        /**
         * Displays the details for a single game.
         */
        const displayGameDetails = async() => {
            const urlParams = new URLSearchParams(window.location.search);
            const gameId = urlParams.get('id');
            if (!gameId) return;

            try {
                const games = await fetchData(GAMES_GIST_URL);
                const game = games.find(g => g.id == gameId);

                if (!game) {
                    document.querySelector('main').innerHTML = '<p class="text-center text-red-500 pt-32">Game not found.</p>';
                    return;
                }

                document.title = `${game.title} | Reflex Interactive`;

                const gameHero = document.getElementById('game-hero');
                const heroImageUrl = game.hero_image_url || game.image_url;
                gameHero.style.backgroundImage = `url('${heroImageUrl}')`;

                document.getElementById('game-detail-title').textContent = game.title;
                document.getElementById('game-detail-cover').src = game.image_url;
                document.getElementById('game-detail-cover').alt = `${game.title} Cover Art`;
                document.getElementById('game-detail-developer').textContent = game.developer;
                document.getElementById('game-detail-publisher').textContent = game.publisher;
                document.getElementById('game-detail-genre').textContent = game.genre;
                document.getElementById('game-detail-description').textContent = game.description;

                // Handle pricing and button text
                const priceElement = document.getElementById('game-detail-price');
                const purchaseButton = document.getElementById('purchase-download-btn');
                priceElement.textContent = game.price === 0 ? 'FREE' : `$${game.price.toFixed(2)}`;
                purchaseButton.textContent = game.price === 0 ? 'Download Now' : 'Purchase Now';

                // Handle download URL
                if (game.price === 0 && game.download_url) {
                    purchaseButton.href = game.download_url;
                    purchaseButton.setAttribute('download', '');
                    purchaseButton.classList.remove('opacity-50', 'cursor-not-allowed');
                } else {
                    purchaseButton.href = '#';
                    purchaseButton.removeAttribute('download');
                    purchaseButton.classList.add('opacity-50', 'cursor-not-allowed');
                }

                // Render screenshots
                const screenshotsContainer = document.getElementById('game-detail-screenshots');
                screenshotsContainer.innerHTML = '';
                game.screenshots.forEach(src => {
                    const img = document.createElement('img');
                    img.src = src;
                    img.alt = `${game.title} screenshot`;
                    img.className = 'w-full h-auto rounded-lg shadow-md';
                    screenshotsContainer.appendChild(img);
                });
            } catch (error) {
                console.error('Failed to display game details:', error);
                document.querySelector('main').innerHTML = '<p class="text-center text-red-500 pt-32">Failed to load game details. Please try again later.</p>';
            }
        };

        // --- Form Submission Functionality ---

        /**
         * Handles form submissions using Formspree.
         * @param {Event} event - The form submission event.
         * @param {HTMLFormElement} form - The form element.
         */
        const handleFormSubmission = async(event, form) => {
            event.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            const formData = new FormData(form);

            button.disabled = true;
            button.textContent = 'Sending...';

            try {
                const response = await fetch(form.action, {
                    method: form.method,
                    body: formData,
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    if (form.id === 'main-contact-form') {
                        window.location.href = 'index.html';
                    } else {
                        form.innerHTML = '<p class="text-green-500 font-bold text-center">Thank you! Your message has been sent.</p>';
                    }
                } else {
                    console.error('Formspree submission failed');
                    form.innerHTML = '<p class="text-red-500 font-bold text-center">Oops! There was an issue sending your message.</p>';
                }
            } catch (error) {
                console.error('Submission failed:', error);
                form.innerHTML = '<p class="text-red-500 font-bold text-center">Oops! Something went wrong. Please try again later.</p>';
            }
        };

        // --- Footer Functionality ---

        /**
         * Fetches and inserts the footer HTML.
         */
        const loadFooter = async() => {
            const footerPlaceholder = document.getElementById('footer-placeholder');
            if (!footerPlaceholder) return;

            try {
                const footerHtml = await (await fetch('footer.html')).text();
                footerPlaceholder.innerHTML = footerHtml;

                const footerForm = footerPlaceholder.querySelector('form');
                if (footerForm) {
                    footerForm.addEventListener('submit', (e) => handleFormSubmission(e, footerForm));
                }
            } catch (error) {
                console.error('Error loading footer:', error);
                footerPlaceholder.innerHTML = '<p class="text-center text-red-500 pt-32">Failed to load footer.</p>';
            }
        };

        // --- Page Initialization ---
        /**
         * Main function to initialize all scripts based on the current page.
         */
        const init = () => {
            setupHeader();
            setupSmoothScroll();
            setupMobileMenu();
            loadFooter();

            const path = window.location.pathname;
            const urlParams = new URLSearchParams(window.location.search);

            // **FIXED CODE BELOW**
            if (path.includes('game-details.html')) {
                displayGameDetails();
            } else if (path.includes('games.html')) {
                fetchAndRenderGames();
            } else if (path.includes('newswire.html')) {
                const articleId = urlParams.get('id');
                if (articleId) {
                    displayNewsDetails(articleId);
                } else {
                    fetchAndRenderNews();
                }
            } else { // Handles homepage
                fetchAndRenderGames();
                fetchAndRenderNews();
            }

            // Attach form submission listener to the standalone contact page form
            const mainContactForm = document.getElementById('main-contact-form');
            if (mainContactForm) {
                mainContactForm.addEventListener('submit', (e) => handleFormSubmission(e, mainContactForm));
            }
        };

        // Run the main initialization function
        init();
    })();
});