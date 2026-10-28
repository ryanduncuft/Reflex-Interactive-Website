"use strict";

const catalogSSR = require("./catalog-ssr");

// Game routes are always bound to the Stripe game catalog.
exports.handler = event => catalogSSR.handler({
    ...event,
    queryStringParameters: {
        ...(event.queryStringParameters || {}),
        catalog: "games",
    },
});
