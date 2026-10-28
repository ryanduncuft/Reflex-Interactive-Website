"use strict";

const catalogSSR = require("./catalog-ssr");

// The /shop route is permanently bound to merchandise. Do not let a missing or
// stale catalog query parameter make this endpoint fall back to games.
exports.handler = event => catalogSSR.handler({
    ...event,
    queryStringParameters: {
        ...(event.queryStringParameters || {}),
        catalog: "shop",
    },
}).then(result => ({
    ...result,
    headers: {
        ...(result.headers || {}),
        "Cache-Control": result.statusCode === 200
            ? "public, max-age=0, s-maxage=60, must-revalidate"
            : "no-store",
    },
}));
