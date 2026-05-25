const admin = require("firebase-admin");

const getFirebaseAdmin = () => {
    if (admin.apps.length) return admin;

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.REFLEX_FIREBASE_DATABASE_URL;

    if (!databaseURL) {
        throw new Error("FIREBASE_DATABASE_URL or REFLEX_FIREBASE_DATABASE_URL is not configured");
    }

    if (serviceAccountJson) {
        let serviceAccount;

        try {
            serviceAccount = JSON.parse(serviceAccountJson);
        } catch (error) {
            throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL,
        });
        return admin;
    }

    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");

};

module.exports = { getFirebaseAdmin };
