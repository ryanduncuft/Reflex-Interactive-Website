window.REFLEX_PAYPAL_CONFIG = Object.freeze({
    environment: "live",
    clientId: "YOUR_LIVE_PAYPAL_CLIENT_ID",
    purchasesEnabled: false,
    checkoutEndpoint: "/.netlify/functions/create-paypal-order",
    disabledMessage: "Purchases are paused while checkout is being finalized.",
});
