document.addEventListener('DOMContentLoaded', () => {
    (async() => {
        const [NEWS_GIST_URL, GAMES_GIST_URL] = [
            'https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json',
            'https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json'
        ];
        const addCacheBuster = url => `${url}?t=${new Date().getTime()}`;
        const fetchData = async url => {
            const response = await fetch(addCacheBuster(url));
            if (!response.ok) throw new Error(`Network response from ${url} was not ok`);
            return response.json();
        };
        const toggleSpinner = (id, show) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('hidden', !show);
        };
        const setupHeader = () => {
            const header = document.querySelector('header');
            if (!header) return;
            window.addEventListener('scroll', () => header.classList.toggle('bg-black', window.scrollY > 50));
        };
        const toggleMobileMenu = () => {
            const [menu, btn] = [document.getElementById('mobile-menu'), document.getElementById('mobile-menu-btn')];
            if (menu && btn) {
                menu.classList.toggle('transform-none');
                btn.classList.toggle('toggle-menu');
            }
        };
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
                if (el) el.content = value;
            }
        };
        const generateSchema = (data, type) => {
            let oldSchema = document.querySelector('script[type="application/ld+json"]');
            if (oldSchema) oldSchema.remove();
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
        const createNewsCard = article => {
            const card = document.createElement('div');
            card.className = 'bg-[var(--color-background)] rounded-xl shadow-lg hover:shadow-2xl overflow-hidden transform hover:translate-y-[-5px] transition duration-300';
            card.innerHTML = `<a href="newswire.html?id=${article.id}"><img src="${article.image_url}" alt="${article.title}" class="w-full h-48 object-cover"><div class="p-6"><h3 class="text-xl font-bold mb-2 text-[var(--color-primary)]">${article.title}</h3><p class="text-gray-400 text-sm mb-4">${article.date}</p><p class="text-gray-300 leading-relaxed line-clamp-3">${article.summary}</p><span class="mt-4 inline-block text-white font-semibold group">Read More<span class="ml-2 transform group-hover:translate-x-1 transition duration-200">&rarr;</span></span></div></a>`;
            return card;
        };
        const fetchAndRenderNews = async() => {
            const [homepage, newswire] = [document.getElementById('latest-news-container'), document.getElementById('news-container')];
            if (!homepage && !newswire) return;
            const spinnerId = homepage ? 'homepage-loading-spinner' : 'loading-spinner';
            toggleSpinner(spinnerId, true);
            try {
                const articles = await fetchData(NEWS_GIST_URL);
                if (homepage) articles.slice(0, 3).forEach(article => homepage.appendChild(createNewsCard(article)));
                if (newswire) articles.forEach(article => newswire.appendChild(createNewsCard(article)));
            } catch (e) {
                console.error('Failed to fetch news:', e);
                const container = homepage || newswire;
                if (container) container.innerHTML = '<p class="text-center text-red-500">Failed to load news. Please try again later.</p>';
            } finally {
                toggleSpinner(spinnerId, false);
            }
        };
        const displayNewsDetails = async id => {
            const [news, detail] = [document.getElementById('news-container'), document.getElementById('article-detail')];
            if (!news || !detail) return;
            toggleSpinner('loading-spinner', true);
            try {
                const article = (await fetchData(NEWS_GIST_URL)).find(a => a.id == id);
                if (!article) {
                    news.classList.add('hidden');
                    detail.classList.remove('hidden');
                    detail.innerHTML = '<p class="text-center text-red-500 pt-32">Article not found.</p>';
                    return;
                }
                news.classList.add('hidden');
                detail.classList.remove('hidden');
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
                    "author": {
                        "@type": "Organization",
                        "name": "Reflex Interactive"
                    },
                    "publisher": {
                        "@type": "Organization",
                        "name": "Reflex Interactive",
                        "logo": {
                            "@type": "ImageObject",
                            "url": "https://www.yourwebsite.com/assets/images/logo.png"
                        }
                    },
                    "description": article.summary
                }, "NewsArticle");
                document.getElementById('article-title').textContent = article.title;
                document.getElementById('article-date').textContent = article.date;
                document.getElementById('article-image').src = article.image_url;
                document.getElementById('article-image').alt = article.title;
                document.getElementById('article-content').innerHTML = article.content.replace(/\n/g, '<br><br>');
            } catch (e) {
                console.error('Failed to display article details:', e);
                document.querySelector('main').innerHTML = '<p class="text-center text-red-500 pt-32">Failed to load article details. Please try again later.</p>';
            } finally {
                toggleSpinner('loading-spinner', false);
            }
        };
        const createGameCard = game => {
            const card = document.createElement('div');
            card.className = 'group relative overflow-hidden bg-[var(--color-secondary-bg)] rounded-xl shadow-2xl';
            card.innerHTML = `<img src="${game.image_url}" alt="${game.title} Cover" class="w-full h-96 object-cover transform transition duration-500 group-hover:scale-105"><div class="absolute inset-0 bg-black/70 flex flex-col justify-end p-8 opacity-0 group-hover:opacity-100 transition duration-500"><h3 class="text-3xl font-black mb-2 uppercase text-[var(--color-primary)]">${game.title}</h3><p class="text-gray-300 leading-tight mb-4">${game.description}</p><a href="game-details.html?id=${game.id}" class="text-white font-semibold flex items-center hover:underline">Learn More<span class="ml-2 transform group-hover:translate-x-1 transition duration-200">&rarr;</span></span></a></div>`;
            return card;
        };
        const fetchAndRenderGames = async() => {
            const [homepage, fullGames] = [document.getElementById('latest-games-container'), document.getElementById('full-games-container')];
            if (!homepage && !fullGames) return;
            toggleSpinner('homepage-games-loading-spinner', true);
            toggleSpinner('games-loading-spinner', true);
            try {
                const games = await fetchData(GAMES_GIST_URL);
                if (homepage) games.slice(0, 3).forEach(game => homepage.appendChild(createGameCard(game)));
                if (fullGames) games.forEach(game => fullGames.appendChild(createGameCard(game)));
            } catch (e) {
                console.error('Failed to fetch games:', e);
                const container = homepage || fullGames;
                if (container) container.innerHTML = '<p class="text-center text-red-500">Failed to load games. Please try again later.</p>';
            } finally {
                toggleSpinner('homepage-games-loading-spinner', false);
                toggleSpinner('games-loading-spinner', false);
            }
        };
        const displayGameDetails = async() => {
            const id = new URLSearchParams(window.location.search).get('id');
            if (!id) return;
            try {
                const game = (await fetchData(GAMES_GIST_URL)).find(g => g.id == id);
                if (!game) {
                    document.querySelector('main').innerHTML = '<p class="text-center text-red-500 pt-32">Game not found.</p>';
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
                    "publisher": {
                        "@type": "Organization",
                        "name": game.publisher
                    },
                    "developer": {
                        "@type": "Organization",
                        "name": game.developer
                    },
                    "offers": {
                        "@type": "Offer",
                        "price": game.price,
                        "priceCurrency": "USD",
                        "url": window.location.href,
                        "availability": "https://schema.org/InStock"
                    },
                    "aggregateRating": {
                        "@type": "AggregateRating",
                        "ratingValue": "5.0",
                        "ratingCount": "1"
                    }
                }, "VideoGame");
                const {
                    title,
                    image_url,
                    developer,
                    publisher,
                    genre,
                    description,
                    price,
                    download_url,
                    screenshots,
                    hero_image_url,
                    trailer_url
                } = game;
            
                // Set the hero image
                const heroMediaContainer = document.getElementById('hero-media-container');
                const heroEl = document.getElementById('game-hero');
                const heroSrc = hero_image_url || image_url;
                
                if (heroSrc) {
                    heroEl.style.backgroundImage = `url(${heroSrc})`;
                    heroEl.style.backgroundPosition = 'center';
                    heroEl.style.backgroundSize = 'cover';
                }

                // Populate game information
                document.getElementById('game-detail-cover').src = image_url;
                document.getElementById('game-detail-cover').alt = `${title} Cover Art`;
                document.getElementById('game-detail-title').textContent = title;
                document.getElementById('game-detail-developer').textContent = developer;
                document.getElementById('game-detail-publisher').textContent = publisher;
                document.getElementById('game-detail-genre').textContent = genre;
                document.getElementById('game-detail-description').textContent = description;
                const purchaseBtn = document.getElementById('purchase-download-btn');
                const priceEl = document.getElementById('game-detail-price');
                priceEl.textContent = price === 0 ? 'FREE' : `$${price.toFixed(2)}`;
                purchaseBtn.textContent = price === 0 ? 'Download Now' : 'Purchase Now';
                if (price === 0 && download_url) {
                    purchaseBtn.href = download_url;
                    purchaseBtn.setAttribute('download', '');
                    purchaseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                } else {
                    purchaseBtn.href = '#';
                    purchaseBtn.removeAttribute('download');
                    purchaseBtn.classList.add('opacity-50', 'cursor-not-allowed');
                }
                const screenshotsContainer = document.getElementById('game-detail-screenshots');
                if (screenshotsContainer) {
                    screenshotsContainer.innerHTML = '';
                    if (trailer_url) {
                        const iframe = document.createElement('iframe');
                        iframe.src = trailer_url;
                        iframe.className = 'w-full h-auto rounded-lg shadow-md aspect-video';
                        iframe.setAttribute('frameborder', '0');
                        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
                        iframe.setAttribute('allowfullscreen', '');
                        screenshotsContainer.appendChild(iframe);
                    }
                    screenshots.forEach(src => {
                        const img = document.createElement('img');
                        img.src = src;
                        img.alt = `${title} screenshot`;
                        img.className = 'w-full h-auto rounded-lg shadow-md';
                        screenshotsContainer.appendChild(img);
                    });
                }
            } catch (e) {
                console.error('Failed to display game details:', e);
                document.querySelector('main').innerHTML = '<p class="text-center text-red-500 pt-32">Failed to load game details. Please try again later.</p>';
            }
        };
        const handleFormSubmission = async(e, form) => {
            e.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true;
            button.textContent = 'Sending...';
            try {
                const response = await fetch(form.action, {
                    method: form.method,
                    body: new FormData(form),
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                form.innerHTML = `<p class="text-green-500 font-bold text-center">${response.ok ? 'Thank you! Your message has been sent.' : 'Oops! There was an issue sending your message.'}</p>`;
                if (!response.ok) console.error('Formspree submission failed');
            } catch (e) {
                console.error('Submission failed:', e);
                form.innerHTML = '<p class="text-red-500 font-bold text-center">Oops! Something went wrong. Please try again later.</p>';
            }
        };
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
        const init = () => {
            loadComponent('navbar-placeholder', 'navbar.html', el => {
                cloneNavLinks();
                setupHeader();
                setupSmoothScroll();
                document.getElementById('mobile-menu-btn')?.addEventListener('click', toggleMobileMenu);
            });
            loadComponent('footer-placeholder', 'footer.html', el => {
                const form = el.querySelector('form');
                if (form) form.addEventListener('submit', e => handleFormSubmission(e, form));
            });
            const path = window.location.pathname;
            const id = new URLSearchParams(window.location.search).get('id');
            if (path.includes('game-details.html')) displayGameDetails();
            else if (path.includes('games.html')) fetchAndRenderGames();
            else if (path.includes('newswire.html')) id ? displayNewsDetails(id) : fetchAndRenderNews();
            else {
                fetchAndRenderGames();
                fetchAndRenderNews();
            }
            document.getElementById('main-contact-form')?.addEventListener('submit', e => handleFormSubmission(e, e.currentTarget));
        };
        init();
    })();
});