window.REFLEX_PAYPAL_CONFIG = Object.freeze({
    environment: "live",
    clientId: "",
    purchasesEnabled: false,
    checkoutEndpoint: "/.netlify/functions/create-paypal-order",
    disabledMessage: "Purchases are paused while checkout is being finalized.",
});
