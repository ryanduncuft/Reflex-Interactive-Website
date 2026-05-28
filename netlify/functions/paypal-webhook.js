const { getFirebaseAdmin } = require("./_firebase");
const { paypalRequest } = require("./_paypal");
const { captureMatchesOrder, fulfillPaidGame } = require("./_commerce");

const response = (statusCode, body = "") => ({ statusCode, body });

const header = (headers = {}, name = "") => {
    const lower = name.toLowerCase();
    const key = Object.keys(headers).find((item) => item.toLowerCase() === lower);
    return key ? headers[key] : "";
};

const verifyWebhook = async (event, webhookEvent) => {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not configured");

    const result = await paypalRequest("/v1/notifications/verify-webhook-signature", {
        method: "POST",
        body: JSON.stringify({
            auth_algo: header(event.headers, "paypal-auth-algo"),
            cert_url: header(event.headers, "paypal-cert-url"),
            transmission_id: header(event.headers, "paypal-transmission-id"),
            transmission_sig: header(event.headers, "paypal-transmission-sig"),
            transmission_time: header(event.headers, "paypal-transmission-time"),
            webhook_id: webhookId,
            webhook_event: webhookEvent,
        }),
    });

    return result.verification_status === "SUCCESS";
};

const orderIdFromCapture = (resource = {}) => resource.supplementary_data?.related_ids?.order_id || "";

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return response(405, "Method not allowed");

    let webhookEvent;
    try {
        webhookEvent = JSON.parse(event.body || "{}");
    } catch {
        return response(400, "Invalid JSON");
    }

    try {
        const verified = await verifyWebhook(event, webhookEvent);
        if (!verified) return response(400, "Invalid webhook signature");

        if (webhookEvent.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
            return response(200, "ignored");
        }

        const orderId = orderIdFromCapture(webhookEvent.resource);
        if (!orderId) return response(200, "missing order id");

        const admin = getFirebaseAdmin();
        const orderSnapshot = await admin.database().ref(`paypalOrders/${orderId}`).get();
        const order = orderSnapshot.val();
        if (!order?.uid || !order?.gameId) return response(200, "unknown order");
        if (!captureMatchesOrder(webhookEvent.resource, order)) {
            await admin.database().ref(`paypalOrders/${orderId}`).update({
                status: "amount_mismatch",
                updatedAtUtc: new Date().toISOString(),
            });
            return response(200, "amount mismatch");
        }

        await fulfillPaidGame({
            admin,
            uid: order.uid,
            paymentId: webhookEvent.resource.id || orderId,
            provider: "paypal",
            status: webhookEvent.resource.status || "COMPLETED",
            gameId: order.gameId,
            numericId: order.numeric_id || "",
            title: order.title,
            amountTotal: order.amountTotal || 0,
            currency: order.currency || "GBP",
        });

        await admin.database().ref(`paypalOrders/${orderId}`).update({
            status: "completed",
            captureId: webhookEvent.resource.id || "",
            updatedAtUtc: new Date().toISOString(),
        });
    } catch (error) {
        console.error("[PayPal] webhook failed", error);
        return response(500, "Webhook failed");
    }

    return response(200, "ok");
};
