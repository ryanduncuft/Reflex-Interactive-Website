#!/usr/bin/env sh
set -eu

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
