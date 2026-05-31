const { getFirebaseAdmin } = require("./_firebase");
const {
    activeBanForGame,
    json,
    loadGame,
    ownedKeyForGame,
} = require("./_commerce");
const { assertTrustedOrigin, parseJsonBody } = require("./_security");

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    try {
        assertTrustedOrigin(event);
        const body = parseJsonBody(event);
        const idToken = body.idToken || "";
        const gameId = String(body.gameId || "").slice(0, 120);

        if (!idToken || !gameId) return json(400, { error: "Missing claim details" });

        const admin = getFirebaseAdmin();
        const decoded = await admin.auth().verifyIdToken(idToken, true);
        if (!decoded.email_verified) return json(403, { error: "Verify your email before claiming games" });

        const game = await loadGame(gameId);
        if (!game) return json(404, { error: "Game not found" });

        const price = Number(game.price || 0);
        if (price > 0) return json(423, { error: "Paid games are not available for direct claim" });

        const userRef = admin.database().ref(`users/${decoded.uid}`);
        const userSnapshot = await userRef.get();
        const userData = userSnapshot.val() || {};
        if (activeBanForGame(userData.gameBans || {}, game)) {
            return json(403, { error: "This account is restricted from this game" });
        }

        const ownedKey = ownedKeyForGame(game);
        if (userData.ownedGames?.[ownedKey]) {
            return json(200, { owned: true });
        }

        const now = new Date().toISOString();
        await admin.database().ref(`users/${decoded.uid}/ownedGames/${ownedKey}`).set({
            id: String(game.numeric_id || game.id || ""),
            numeric_id: String(game.numeric_id || ""),
            current_id: String(game.id || ""),
            catalog_id: String(game.id || ""),
            slug: String(game.id || ""),
            title: String(game.title || "Untitled Game").slice(0, 120),
            type: "free",
            addedAtUtc: now,
            acquiredAtUtc: now,
        });

        return json(200, { owned: true });
    } catch (error) {
        console.error("[Commerce] free claim failed", error);
        return json(error.statusCode || 500, { error: "Could not add this game to your library. Please try again." });
    }
};
