const admin = require("firebase-admin");

const getFirebaseAdmin = () => {
    if (admin.apps.length) return admin;

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (serviceAccountJson) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
            databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
        return admin;
    }

    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
    });

    return admin;
};

module.exports = { getFirebaseAdmin };
