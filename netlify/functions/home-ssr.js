// netlify/functions/home-ssr.js
export default async (req, context) => {
  // You can fetch your featured game or latest news here server-side if you have an API/Supabase.
  // For demonstration and robustness, we provide clean, indexable fallback HTML so Googlebot never sees a blank spinner.
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <title>Reflex Interactive | Game Studio in Manchester, UK</title>

    <meta name="description" content="Reflex Interactive is a game studio in Manchester, UK, creating narrative action games, precision gameplay systems, studio news, and player-first worlds.">
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
    <meta name="author" content="Reflex Interactive">
    <meta name="publisher" content="Reflex Interactive">
    <meta name="application-name" content="Reflex Interactive">
    <meta name="theme-color" content="#000000">
    <meta name="format-detection" content="telephone=no">
    
    <!-- Geo / Technical Meta Tags -->
    <meta name="geo.region" content="GB-MAN">
    <meta name="geo.placename" content="Manchester">
    <meta name="geo.position" content="53.4808;-2.2426">
    <meta name="ICBM" content="53.4808, -2.2426">
    
    <link rel="canonical" href="https://reflexinteractive.com/">
    <link rel="alternate" hreflang="en-gb" href="https://reflexinteractive.com/">
    <link rel="alternate" hreflang="x-default" href="https://reflexinteractive.com/">
    <meta name="google-site-verification" content="nnOo6NCUWjihJnKmPbcQWO8iGx4NLUSQTw_ajNQHSak" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:title" content="Reflex Interactive | Game Studio in Manchester, UK">
    <meta property="og:description" content="Where every shot counts. Explore Reflex Interactive games, studio updates, and polished experiences built around precision, action, and atmosphere.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://reflexinteractive.com/">
    <meta property="og:image" content="https://res.cloudinary.com/dvju1xiaw/image/upload/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png">
    <meta property="og:image:secure_url" content="https://res.cloudinary.com/dvju1xiaw/image/upload/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:alt" content="Reflex Interactive game studio logo">
    <meta property="og:image:width" content="512">
    <meta property="og:image:height" content="512">
    <meta property="og:site_name" content="Reflex Interactive">
    <meta property="og:locale" content="en_GB">

    <!-- Twitter Cards -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@MadeByReflex">
    <meta name="twitter:creator" content="@MadeByReflex">
    <meta name="twitter:title" content="Reflex Interactive | Game Studio in Manchester, UK">
    <meta name="twitter:description" content="Game development focused on narrative action, precision gameplay, and immersive worlds.">
    <meta name="twitter:image" content="https://res.cloudinary.com/dvju1xiaw/image/upload/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png">
    <meta name="twitter:image:alt" content="Reflex Interactive game studio logo">

    <!-- Favicons & Icons -->
    <link rel="icon" href="https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto/f_auto/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.ico" sizes="any">
    <link rel="apple-touch-icon" href="https://res.cloudinary.com/dvju1xiaw/image/upload/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png">

    <!-- Resource Hints & Performance Optimizations -->
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link rel="preconnect" href="https://res.cloudinary.com" crossorigin>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    
    <link rel="preload" as="image" href="https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto,w_1800/v1778346188/Box_art_HQ_b9bwwh.png" fetchpriority="high">
    
    <!-- CSS Dependencies -->
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700;800&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="./css/styles.css">

    <!-- Schema.org Structured Data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": "https://reflexinteractive.com/#organization",
          "name": "Reflex Interactive",
          "alternateName": ["Reflex", "Reflex Interactive Games"],
          "url": "https://reflexinteractive.com/",
          "logo": {
            "@type": "ImageObject",
            "@id": "https://reflexinteractive.com/#logo",
            "url": "https://res.cloudinary.com/dvju1xiaw/image/upload/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png",
            "caption": "Reflex Interactive"
          },
          "sameAs": [
            "https://www.x.com/MadeByReflex",
            "https://www.youtube.com/@ReflexInteractiveDev",
            "https://www.instagram.com/reflexinteractive"
          ]
        }
      ]
    }
    </script>
</head>
<body class="bg-black text-white overflow-x-hidden">
    <div id="navbar"></div>
    
    <main id="main-content">
        <section class="hero-section text-center" aria-labelledby="home-heading">
            <div class="position-absolute inset-0 bg-hero-image" aria-hidden="true"></div>
            <div class="hero-overlay" aria-hidden="true"></div>
            <div class="position-relative z-3 px-3 px-md-4 container hero-content">
                <p class="section-kicker mb-3">Game Studio</p>
                <h1 id="home-heading" class="display-1 fw-black mb-4">Reflex Interactive</h1>
                <p class="fs-4 fw-light text-light">Where Every Shot Counts.</p>
                <p class="hero-description text-light">An independent game studio in Manchester, UK.</p>
                <div class="hero-actions mt-4">
                    <a href="#featured-game" class="btn btn-danger btn-lg" aria-label="Explore the featured Reflex Interactive game">Featured Game</a>
                    <a href="#newswire" class="btn btn-outline-light btn-lg" aria-label="Read the latest Reflex Interactive news">Studio News</a>
                </div>
            </div>
        </section>

        <section id="featured-game" class="py-5 publisher-section" aria-labelledby="featured-game-heading">
            <div class="container">
                <div class="publisher-heading mb-4">
                    <p class="section-kicker mb-2">Spotlight</p>
                    <h2 id="featured-game-heading" class="display-4 fw-bold mb-3">Featured Release</h2>
                </div>
                <!-- Server-rendered fallback content so search engines see indexable markup immediately -->
                <div id="featured-game-slot" class="featured-game">
                    <div class="row align-items-center">
                        <div class="col-lg-6 mb-4 mb-lg-0">
                            <h3 class="fw-bold text-white">Reflex Interactive Flagship Title</h3>
                            <p class="text-light">Experience high-stakes precision action built from the ground up in Manchester, UK.</p>
                            <a href="/games" class="btn btn-danger mt-3">View Game Details</a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        
        <section id="newswire" class="py-5 publisher-section" aria-labelledby="latest-news-heading">
            <div class="container">
                <div class="publisher-heading mb-4">
                    <p class="section-kicker mb-2">Newswire</p>
                    <h2 id="latest-news-heading" class="display-4 fw-bold mb-3">Latest News</h2>
                </div>
                
                <div id="latest-news-container" class="content-rail row" aria-label="Latest news">
                    <div class="col-md-4 mb-3">
                        <div class="card bg-dark text-white border-secondary p-3">
                            <h4>Studio Overhaul & Updates</h4>
                            <p class="text-muted small">Check out our latest progress reports regarding our Supabase backend transition.</p>
                            <a href="/newswire" class="text-danger text-decoration-none fw-bold">Read More &rarr;</a>
                        </div>
                    </div>
                </div>
                
                <div class="text-center mt-4">
                    <a href="./newswire" class="btn btn-danger btn-lg px-5 py-3 fw-bold">View Newswire</a>
                </div>
            </div>
        </section>
    </main>

    <div id="footer"></div>
    
    <script src="./js/site-config.js"></script>
    <script src="./js/navigation.js" defer></script>
    <script src="./js/stripe.js" defer></script>
    <script src="./js/settings.js" defer></script>
    <script src="./js/core.js" defer></script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};