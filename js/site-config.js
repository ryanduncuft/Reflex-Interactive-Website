window.REFLEX_SITE_CONFIG = Object.freeze({
    version: "v3.0.0",
    locale: "en-GB",
    defaultCountry: "GB",
    defaultCurrency: "GBP",
    stripe: {
        publishableKey: "pk_live_51PT9k42NK0sbWKG5rBp6QAhS9Kro8f1Duxq7x1JgLMSi60JTtxnE2UAl0eCddx3E9wOTvwsBmJGs46CLctDE6fQQ00iQJy6B5A",
    },
    urls: {
        site: "https://reflexinteractive.com",
        support: "https://support.reflexinteractive.com/",
        careers: "https://careers.reflexinteractive.com/",
        news: "https://gist.githubusercontent.com/ryanduncuft/b4f22cbaf1366f5376bbba87228cab90/raw/reflex_newswire.json",
        games: "https://gist.githubusercontent.com/ryanduncuft/a24915ce0cace4ce24e8eee2e4140caa/raw/reflex_games.json",
        supportArticles: "https://gist.githubusercontent.com/ryanduncuft/3308af53408db611254490f5c0b8611f/raw/reflex-support.json",
        logo: "https://res.cloudinary.com/dvju1xiaw/image/upload/q_auto,f_auto/v1778532761/Reflex_Interactive_Logo_no_back_srtf76.png", // <-- Fixed typo here
    },
    routes: {
        gameDetails: "/game-details",
        games: "/games.html",
        store: "/store.html",
        shop: "/store.html",
    },
    api: {
        products: "/.netlify/functions/products",
        createCheckout: "/.netlify/functions/create-checkout-session",
    },
    ui: {
        navScrollY: 24,
    },
});

(() => {
    const isMobile = () => Boolean(navigator.userAgentData?.mobile)
        || /android|iphone|ipad|ipod|iemobile|mobile|tablet/i.test(navigator.userAgent)
        || window.matchMedia("(max-width: 767.98px)").matches;

    const detectWindowsX64 = async () => {
        const hints = navigator.userAgentData;
        const platform = String(hints?.platform || navigator.platform || navigator.userAgent).toLowerCase();
        if (!platform.includes("win") || /arm|aarch64/i.test(platform) || /arm64|windows arm/i.test(navigator.userAgent)) return false;
        if (hints?.getHighEntropyValues) {
            try {
                const details = await hints.getHighEntropyValues(["architecture", "bitness"]);
                return ["x86", "x86_64", "amd64"].includes(String(details.architecture).toLowerCase())
                    && String(details.bitness) === "64";
            } catch {
                // Older browsers fall back to the platform and user-agent signature.
            }
        }
        return /(?:win64|x64|wow64)/i.test(navigator.userAgent)
            && !/(?:arm64|windows arm)/i.test(navigator.userAgent);
    };

    let windowsX64Promise;
    const updateDeviceState = async () => {
        const root = document.documentElement;
        root.dataset.deviceView = isMobile() ? "mobile" : "desktop";
        windowsX64Promise ||= detectWindowsX64();
        if (await windowsX64Promise && !isMobile()) root.dataset.downloadPlatform = "windows-x64";
        else delete root.dataset.downloadPlatform;
    };

    window.ReflexDevice = Object.freeze({
        isMobile,
        isWindowsX64: async () => !isMobile() && await (windowsX64Promise ||= detectWindowsX64()),
    });
    updateDeviceState();
    window.addEventListener("resize", updateDeviceState, { passive: true });
})();
