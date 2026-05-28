const { getFirebaseAdmin } = require("./_firebase");
const { paypalRequest } = require("./_paypal");
const { captureMatchesOrder, fulfillPaidGame, redirect, safeReturnPath } = require("./_commerce");

const ACCOUNT_URL = process.env.ACCOUNT_URL || "https://account.reflexinteractive.com";
const SITE_URL = process.env.SITE_URL || "https://reflexinteractive.com";

const failureRedirect = (message = "checkout_failed") => redirect(`${ACCOUNT_URL}/?checkout=${encodeURIComponent(message)}`);

exports.handler = async (event) => {
    const orderId = event.queryStringParameters?.token || event.queryStringParameters?.orderId || "";
    const returnPath = safeReturnPath(event.queryStringParameters?.return || "/account");

    if (!orderId) return failureRedirect("missing_order");

    try {
        const admin = getFirebaseAdmin();
        const orderSnapshot = await admin.database().ref(`paypalOrders/${orderId}`).get();
        const order = orderSnapshot.val();
        if (!order?.uid || !order?.gameId) return failureRedirect("unknown_order");

        const captured = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
            method: "POST",
            body: "{}",
        });

        const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
        if (captured.status !== "COMPLETED" && capture?.status !== "COMPLETED") {
            await admin.database().ref(`paypalOrders/${orderId}`).update({
                status: captured.status || capture?.status || "not_completed",
                updatedAtUtc: new Date().toISOString(),
            });
            return failureRedirect("not_completed");
        }

        if (!captureMatchesOrder(capture, order)) {
            await admin.database().ref(`paypalOrders/${orderId}`).update({
                status: "amount_mismatch",
                updatedAtUtc: new Date().toISOString(),
            });
            return failureRedirect("amount_mismatch");
        }

        await fulfillPaidGame({
            admin,
            uid: order.uid,
            paymentId: capture?.id || orderId,
            provider: "paypal",
            status: capture?.status || captured.status || "COMPLETED",
            gameId: order.gameId,
            numericId: order.numeric_id || "",
            title: order.title,
            amountTotal: order.amountTotal || 0,
            currency: order.currency || "GBP",
        });

        await admin.database().ref(`paypalOrders/${orderId}`).update({
            status: "completed",
            captureId: capture?.id || "",
            updatedAtUtc: new Date().toISOString(),
        });

        return redirect(`${ACCOUNT_URL}/?checkout=success&return=${encodeURIComponent(returnPath)}`);
    } catch (error) {
        console.error("[PayPal] capture failed", error);
        return redirect(`${SITE_URL}${returnPath}?checkout=failed`);
    }
};
