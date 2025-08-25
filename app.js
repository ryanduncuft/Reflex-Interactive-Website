document.addEventListener('DOMContentLoaded', () =>
{

    // --- Core Website Functionality (Header, Smooth Scroll, etc.) ---
    const header = document.querySelector('header');
    window.addEventListener('scroll', () =>
    {
        if (window.scrollY > 50)
        {
            header.classList.add('bg-black', 'bg-opacity-100');
            header.classList.remove('bg-opacity-75');
        }
        else
        {
            header.classList.remove('bg-black', 'bg-opacity-100');
            header.classList.add('bg-opacity-75');
        }
    });

    document.querySelectorAll('a[href^="#"]')
    .forEach(anchor =>
    {
        anchor.addEventListener('click', function(e)
        {
            // Do not prevent the default action for the download button
            if (this.id === 'purchase-download-btn') {
                return;
            }

            e.preventDefault();
            document.querySelector(this.getAttribute('href'))
                .scrollIntoView(
                {
                    behavior: 'smooth'
                });
            const mobileMenu = document.getElementById('mobile-menu');
            if (mobileMenu && mobileMenu.classList.contains('transform-none'))
            {
                toggleMobileMenu();
            }
        });
    });

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn)
    {
        const mobileMenu = document.getElementById('mobile-menu');
        const toggleMobileMenu = () =>
        {
            mobileMenu.classList.toggle('transform-none');
            mobileMenuBtn.classList.toggle('toggle-menu');
        };
        mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }

    // --- Cache Busting Utility Function ---
    // This function adds a timestamp to a URL to prevent caching.
    const addCacheBuster = (url) => {
        const timestamp = new Date().getTime();
        return `${url}?t=${timestamp}`;
    };

    // --- Newswire Functionality ---
    const NEWS_GIST_URL = 'https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json';

    const createNewsCard = (article) =>
    {
        const card = document.createElement('div');
        card.className = 'bg-[var(--color-background)] rounded-xl shadow-lg hover:shadow-2xl overflow-hidden transform hover:translate-y-[-5px] transition duration-300';

        card.innerHTML = `
            <img src="${article.image_url}" alt="${article.title}" class="w-full h-48 object-cover">
            <div class="p-6">
                <h3 class="text-xl font-bold mb-2 text-red-500">${article.title}</h3>
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

    const fetchAndRenderNews = async () =>
    {
        const homepageContainer = document.getElementById('latest-news-container');
        const newswireContainer = document.getElementById('news-container');
        const spinner = document.getElementById('homepage-loading-spinner') || document.getElementById('loading-spinner');

        // If neither container exists, nothing to do.
        if (!homepageContainer && !newswireContainer)
        {
            return;
        }

        try
        {
            if (spinner) spinner.classList.remove('hidden');

            const response = await fetch(addCacheBuster(NEWS_GIST_URL));
            if (!response.ok) throw new Error('Network response was not ok');
            const articles = await response.json();

            if (homepageContainer)
            {
                const latestArticles = articles.slice(0, 3);
                latestArticles.forEach(article => homepageContainer.appendChild(createNewsCard(article)));
            }

            if (newswireContainer)
            {
                articles.forEach(article => newswireContainer.appendChild(createNewsCard(article)));
            }

        }
        catch (error)
        {
            console.error('Failed to fetch news:', error);
            const container = homepageContainer || newswireContainer;
            if (container)
            {
                container.innerHTML = '<p class="text-center text-red-500">Failed to load news. Please try again later.</p>';
            }
        }
        finally
        {
            if (spinner) spinner.classList.add('hidden');
        }
    };

    // --- New News Details Page Functionality ---
    const displayNewsDetails = async () =>
    {
        const urlParams = new URLSearchParams(window.location.search);
        const articleId = urlParams.get('id');
        const newsContainer = document.getElementById('news-container');
        const detailSection = document.getElementById('article-detail');

        // Check if we are on the newswire page and an ID exists
        if (!articleId || !newsContainer || !detailSection)
        {
            return;
        }

        const spinner = document.getElementById('loading-spinner');
        if (spinner) spinner.classList.remove('hidden');

        try
        {
            const response = await fetch(addCacheBuster(NEWS_GIST_URL));
            if (!response.ok) throw new Error('Network response was not ok');
            const articles = await response.json();
            const article = articles.find(a => a.id == articleId);

            if (!article)
            {
                newsContainer.classList.add('hidden');
                detailSection.classList.remove('hidden');
                detailSection.innerHTML = '<p class="text-center text-red-500 pt-32">Article not found.</p>';
                return;
            }

            // Hide the article list and show the details section
            newsContainer.classList.add('hidden');
            detailSection.classList.remove('hidden');

            // Populate the detail page content
            document.title = `${article.title} | Reflex Interactive`;
            document.getElementById('article-title')
                .textContent = article.title;
            document.getElementById('article-date')
                .textContent = article.date;
            document.getElementById('article-image')
                .src = article.image_url;
            document.getElementById('article-image')
                .alt = article.title;
            document.getElementById('article-content')
                .innerHTML = article.content.replace(/\n/g, '<br><br>'); // Replaces newlines with <br> for formatting

        }
        catch (error)
        {
            console.error('Failed to display article details:', error);
            document.querySelector('main')
                .innerHTML = '<p class="text-center text-red-500 pt-32">Failed to load article details. Please try again later.</p>';
        }
        finally
        {
            if (spinner) spinner.classList.add('hidden');
        }
    };

    // --- Games Functionality ---
    const GAMES_GIST_URL = 'https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json';

    const createGameCard = (game) =>
    {
        const card = document.createElement('div');
        card.className = 'group relative overflow-hidden bg-[var(--color-secondary-bg)] rounded-xl shadow-2xl';

        card.innerHTML = `
            <img src="${game.image_url}" alt="${game.title} Cover" class="w-full h-96 object-cover transform transition duration-500 group-hover:scale-105">

            <div class="absolute inset-0 bg-black/70 flex flex-col justify-end p-8 opacity-0 group-hover:opacity-100 transition duration-500">
                <h3 class="text-3xl font-black mb-2 uppercase text-red-500">${game.title}</h3>
                <p class="text-gray-300 leading-tight mb-4">${game.description}</p>
                <a href="game-details.html?id=${game.id}" class="text-white font-semibold flex items-center hover:underline">
                    Learn More
                    <span class="ml-2 transform group-hover:translate-x-1 transition duration-200">&rarr;</span>
                </a>
            </div>
        `;
        return card;
    };

    const fetchAndRenderGames = async () =>
    {
        const homepageContainer = document.getElementById('latest-games-container');
        const fullGamesContainer = document.getElementById('full-games-container');
        const homepageSpinner = document.getElementById('homepage-games-loading-spinner');
        const fullGamesSpinner = document.getElementById('games-loading-spinner');

        try
        {
            if (homepageSpinner) homepageSpinner.classList.remove('hidden');
            if (fullGamesSpinner) fullGamesSpinner.classList.remove('hidden');

            const response = await fetch(addCacheBuster(GAMES_GIST_URL));
            if (!response.ok) throw new Error('Network response was not ok');
            const games = await response.json();

            if (homepageContainer)
            {
                const latestGames = games.slice(0, 3);
                latestGames.forEach(game => homepageContainer.appendChild(createGameCard(game)));
            }

            if (fullGamesContainer)
            {
                games.forEach(game => fullGamesContainer.appendChild(createGameCard(game)));
            }

        }
        catch (error)
        {
            console.error('Failed to fetch games:', error);
            if (homepageContainer) homepageContainer.innerHTML = '<p class="text-center text-red-500">Failed to load games. Please try again later.</p>';
            if (fullGamesContainer) fullGamesContainer.innerHTML = '<p class="text-center text-red-500">Failed to load games. Please try again later.</p>';
        }
        finally
        {
            if (homepageSpinner) homepageSpinner.classList.add('hidden');
            if (fullGamesSpinner) fullGamesSpinner.classList.add('hidden');
        }
    };

    // --- Game Details Page Functionality ---
    const displayGameDetails = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const gameId = urlParams.get('id');
        
        if (!gameId) {
            return;
        }

        try {
            const response = await fetch(addCacheBuster(GAMES_GIST_URL));
            if (!response.ok) throw new Error('Network response was not ok');
            const games = await response.json();
            const game = games.find(g => g.id == gameId);

            if (!game) {
                document.querySelector('main').innerHTML = '<p class="text-center text-red-500 pt-32">Game not found.</p>';
                return;
            }

            document.title = `${game.title} | Reflex Interactive`;

            const gameHero = document.getElementById('game-hero');
            if (game.hero_image_url) {
                gameHero.style.backgroundImage = `url('${game.hero_image_url}')`;
            } else {
                gameHero.style.backgroundImage = `url('${game.image_url}')`;
            }

            document.getElementById('game-detail-title').textContent = game.title;
            document.getElementById('game-detail-cover').src = game.image_url;
            document.getElementById('game-detail-cover').alt = `${game.title} Cover Art`;

            const priceElement = document.getElementById('game-detail-price');
            const purchaseButton = document.getElementById('purchase-download-btn');

            if (game.price === 0) {
                priceElement.textContent = 'FREE';
                purchaseButton.textContent = 'Download Now';
                if (game.download_url) {
                    purchaseButton.href = game.download_url;
                    purchaseButton.setAttribute('download', ''); // Add this line
                    purchaseButton.classList.remove('opacity-50', 'cursor-not-allowed');
                } else {
                    purchaseButton.href = '#';
                    purchaseButton.removeAttribute('download'); // And this line
                    purchaseButton.classList.add('opacity-50', 'cursor-not-allowed');
                }
            } else {
                priceElement.textContent = `$${game.price.toFixed(2)}`;
                purchaseButton.textContent = 'Purchase Now';
                purchaseButton.href = '#';
                purchaseButton.removeAttribute('download'); // And this line
                purchaseButton.classList.remove('opacity-50', 'cursor-not-allowed');
            }

            document.getElementById('game-detail-developer').textContent = game.developer;
            document.getElementById('game-detail-publisher').textContent = game.publisher;
            document.getElementById('game-detail-genre').textContent = game.genre;
            document.getElementById('game-detail-description').textContent = game.description;

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
    async function handleFormSubmission(event, form)
    {
        event.preventDefault();

        // Check if this is the main contact page form
        const isMainContactPage = form.id === 'main-contact-form';

        const button = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);

        button.disabled = true;
        button.textContent = 'Sending...';

        try
        {
            const response = await fetch(form.action,
            {
                method: form.method,
                body: formData,
                headers:
                {
                    'Accept': 'application/json'
                }
            });

            if (response.ok)
            {
                if (isMainContactPage)
                {
                    // Redirect to the homepage after a successful submission on the main contact page
                    window.location.href = 'index.html';
                }
                else
                {
                    // Show success message for other forms (like in the footer)
                    form.innerHTML = '<p class="text-green-500 font-bold text-center">Thank you! Your message has been sent.</p>';
                }
            }
            else
            {
                const data = await response.json();
                if (data.errors)
                {
                    console.error('Formspree errors:', data.errors.map(error => error.field)
                        .join(', '));
                }
                form.innerHTML = '<p class="text-red-500 font-bold text-center">Oops! There was an issue sending your message.</p>';
            }
        }
        catch (error)
        {
            console.error('Submission failed:', error);
            form.innerHTML = '<p class="text-red-500 font-bold text-center">Oops! Something went wrong. Please try again later.</p>';
        }
    }

    // --- Footer Functionality ---
    const loadFooter = async () =>
    {
        const footerPlaceholder = document.getElementById('footer-placeholder');
        if (!footerPlaceholder) return;

        try
        {
            const response = await fetch('footer.html');
            if (!response.ok) throw new Error('Failed to load footer');
            const footerHtml = await response.text();
            footerPlaceholder.innerHTML = footerHtml;

            const footerForm = footerPlaceholder.querySelector('form');
            if (footerForm)
            {
                footerForm.addEventListener('submit', (e) => handleFormSubmission(e, footerForm));
            }

        }
        catch (error)
        {
            console.error('Error loading footer:', error);
            footerPlaceholder.innerHTML = '<p class="text-center text-red-500 pt-32">Failed to load footer.</p>';
        }
    };

    // --- Initial calls to fetch and render data & attach listeners ---
    if (document.getElementById('full-games-container') || document.getElementById('latest-games-container'))
    {
        fetchAndRenderGames();
    }
    if (window.location.pathname.includes('game-details.html'))
    {
        displayGameDetails();
    }
    if (window.location.pathname.includes('newswire.html'))
    {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('id'))
        {
            displayNewsDetails();
        }
        else
        {
            fetchAndRenderNews();
        }
    }
    else
    {
        fetchAndRenderNews();
    }
    loadFooter();

    // Attach form submission listener to the standalone contact page form
    const mainContactForm = document.getElementById('main-contact-form');
    if (mainContactForm)
    {
        mainContactForm.addEventListener('submit', (e) => handleFormSubmission(e, mainContactForm));
    }
});