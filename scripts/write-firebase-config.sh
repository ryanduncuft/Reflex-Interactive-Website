#!/usr/bin/env sh
set -eu

js_string() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

paypal_purchases_enabled=false
case "${REFLEX_PURCHASES_ENABLED:-false}" in
    1|true|TRUE|yes|YES) paypal_purchases_enabled=true ;;
esac

paypal_environment="${PAYPAL_ENV:-live}"
if [ "$paypal_environment" != "sandbox" ]; then
    paypal_environment="live"
fi

cat > js/firebase-config.js <<EOF
window.REFLEX_FIREBASE_CONFIG = {
    apiKey: "${REFLEX_FIREBASE_API_KEY:-}",
    authDomain: "${REFLEX_FIREBASE_AUTH_DOMAIN:-}",
    databaseURL: "${REFLEX_FIREBASE_DATABASE_URL:-}",
    projectId: "${REFLEX_FIREBASE_PROJECT_ID:-}",
    storageBucket: "${REFLEX_FIREBASE_STORAGE_BUCKET:-}",
    messagingSenderId: "${REFLEX_FIREBASE_MESSAGING_SENDER_ID:-}",
    appId: "${REFLEX_FIREBASE_APP_ID:-}",
    measurementId: "${REFLEX_FIREBASE_MEASUREMENT_ID:-}",
};
EOF

cat > js/paypal-config.js <<EOF
window.REFLEX_PAYPAL_CONFIG = Object.freeze({
    environment: "$(js_string "$paypal_environment")",
    clientId: "$(js_string "${PAYPAL_CLIENT_ID:-}")",
    purchasesEnabled: $paypal_purchases_enabled,
    checkoutEndpoint: "/.netlify/functions/create-paypal-order",
    disabledMessage: "Purchases are paused while checkout is being finalized.",
});
EOF
