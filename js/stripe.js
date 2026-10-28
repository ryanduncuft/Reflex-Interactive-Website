/* Stripe checkout integration, shared by the games and merchandise catalogs. */
(() => {
    "use strict";

    window.ReflexStripe = Object.freeze({
        startCheckout: async (endpoint, productId, priceId, catalog, button) => {
            if (!productId || !priceId || !button) return;
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = "Processing...";

            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ productId, priceId, catalog }),
                });
                const result = await response.json();
                if (!response.ok || !result.url) throw new Error(result.error || "Failed to create checkout session");
                window.location.href = result.url;
            } catch (error) {
                console.error("[Checkout] Error:", error);
                alert(error.message || "Unable to start checkout. Please try again.");
                button.disabled = false;
                button.textContent = originalText;
            }
        },
    });
})();
