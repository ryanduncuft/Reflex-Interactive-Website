const { getFirebaseAdmin } = require("./_firebase");
const { paypalRequest } = require("./_paypal");
const {
    CURRENCY_BY_COUNTRY,
    activeBanForGame,
    json,
    loadGame,
    ownedKeyForGame,
    resolvePrice,
    safeReturnPath,
} = require("./_commerce");

const SITE_URL = process.env.SITE_URL || "https://reflexinteractive.com";

const safeCheckoutError = (error) => {
    const message = error instanceof Error ? error.message : "";
    const expectedConfigurationError = /^(FIREBASE_|PayPal credentials|Could not authenticate with PayPal|PayPal request failed|PayPal did not return)/.test(message);
    return expectedConfigurationError ? message : "Could not start PayPal checkout";
};

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    try {
        const body = JSON.parse(event.body || "{}");
        const idToken = body.idToken || "";
        const gameId = String(body.gameId || "").slice(0, 120);
        const returnUrl = safeReturnPath(body.returnUrl || "/games");

        if (!idToken || !gameId) return json(400, { error: "Missing checkout details" });

        const admin = getFirebaseAdmin();
        const decoded = await admin.auth().verifyIdToken(idToken, true);
        if (!decoded.email_verified) return json(403, { error: "Verify your email before purchasing" });

        const game = await loadGame(gameId);
        if (!game) return json(404, { error: "Game not found" });

        const basePrice = Number(game.price || 0);
        if (!basePrice || basePrice <= 0) return json(400, { error: "This game is not a paid product" });

        const userRef = admin.database().ref(`users/${decoded.uid}`);
        const userSnapshot = await userRef.get();
        const userData = userSnapshot.val() || {};
        if (activeBanForGame(userData.gameBans || {}, game)) {
            return json(403, { error: "This account is restricted from this game" });
        }

        const ownedKey = ownedKeyForGame(game);
        if (userData.ownedGames?.[ownedKey]) {
            return json(409, { error: "You already own this game" });
        }

        const paymentProfile = userData.paymentProfile || {};
        const country = String(paymentProfile.country || "GB").toUpperCase();
        const requestedCurrency = paymentProfile.currency || CURRENCY_BY_COUNTRY[country] || "GBP";
        const resolvedPrice = resolvePrice(game, requestedCurrency);
        const captureUrl = `${SITE_URL}/.netlify/functions/capture-paypal-order?return=${encodeURIComponent(returnUrl)}`;

        const order = await paypalRequest("/v2/checkout/orders", {
            method: "POST",
            body: JSON.stringify({
                intent: "CAPTURE",
                purchase_units: [{
                    reference_id: ownedKey,
                    custom_id: ownedKey,
                    description: String(game.title || "Reflex Interactive game").slice(0, 127),
                    amount: {
                        currency_code: resolvedPrice.currency,
                        value: resolvedPrice.amount.toFixed(2),
                    },
                }],
                payment_source: {
                    paypal: {
                        experience_context: {
                            brand_name: "Reflex Interactive",
                            user_action: "PAY_NOW",
                            return_url: captureUrl,
                            cancel_url: `${SITE_URL}${returnUrl}`,
                        },
                    },
                },
            }),
        });

        const approve = order.links?.find((link) => link.rel === "payer-action" || link.rel === "approve");
        if (!approve?.href) throw new Error("PayPal did not return an approval link");

        await admin.database().ref(`paypalOrders/${order.id}`).set({
            id: order.id,
            uid: decoded.uid,
            email: decoded.email || "",
            gameId: String(game.id || ""),
            numeric_id: String(game.numeric_id || ""),
            title: String(game.title || "").slice(0, 120),
            ownedKey,
            amountTotal: Math.round(resolvedPrice.amount * 100),
            currency: resolvedPrice.currency,
            status: "created",
            createdAtUtc: new Date().toISOString(),
        });

        return json(200, { url: approve.href });
    } catch (error) {
        console.error("[PayPal] create order failed", error);
        return json(500, { error: safeCheckoutError(error) });
    }
};
