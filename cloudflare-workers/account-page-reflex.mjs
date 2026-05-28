const ALLOWED_CONTENT_TYPE = "text/html";

export default {
    async fetch(request, env) {
        const response = await fetch(request);
        const showBanner = env.ACCOUNT_DEV_MODE === "true";
        const contentType = response.headers.get("Content-Type") || "";

        if (!showBanner || !contentType.includes(ALLOWED_CONTENT_TYPE)) {
            return response;
        }

        return new HTMLRewriter()
            .on("body", {
                element(element) {
                    element.prepend(`
                        <div class="bg-darker border-bottom border-warning text-center py-3 px-3 position-relative z-3" style="border-width: 2px !important;">
                            <div class="container d-flex align-items-center justify-content-center flex-wrap gap-2">
                                <span class="badge bg-warning text-dark text-uppercase fw-black px-2 py-1">Beta Environment</span>
                                <span class="small fw-light text-white-50">
                                    Reflex accounts are live. This page may still receive visual polish while the free-game library is finalized.
                                </span>
                            </div>
                        </div>
                    `, { html: true });
                },
            })
            .transform(response);
    },
};
