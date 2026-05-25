#!/usr/bin/env node
"use strict";

const fs = require("fs");
const admin = require("firebase-admin");

const usage = [
    "Usage:",
    "  FIREBASE_SERVICE_ACCOUNT_FILE=/path/to/service-account.json npm run admin:set -- user@example.com true",
    "  FIREBASE_SERVICE_ACCOUNT_FILE=/path/to/service-account.json npm run admin:set -- firebaseUid false",
].join("\n");

const [target, enabled = "true"] = process.argv.slice(2);

const serviceAccountFromEnv = () => {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT_FILE) {
        return JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, "utf8"));
    }

    throw new Error("Set FIREBASE_SERVICE_ACCOUNT_FILE or FIREBASE_SERVICE_ACCOUNT_JSON.");
};

const isEmail = (value = "") => value.includes("@");

const main = async () => {
    if (!target) {
        console.error(usage);
        process.exitCode = 1;
        return;
    }

    const serviceAccount = serviceAccountFromEnv();
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });

    const auth = admin.auth();
    const user = isEmail(target)
        ? await auth.getUserByEmail(target)
        : await auth.getUser(target);
    const claims = {
        ...(user.customClaims || {}),
        admin: enabled !== "false",
    };

    if (enabled === "false") delete claims.admin;

    await auth.setCustomUserClaims(user.uid, claims);

    console.log(`Admin claim ${enabled === "false" ? "removed from" : "enabled for"} ${user.email || user.uid}.`);
    console.log("Sign out and back in for the new claim to appear in the user's ID token.");
};

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
