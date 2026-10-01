// Vercel serverless entry for the API. Every /api/* and /health* request is rewritten here (see
// vercel.json); the Nest app sees the original URL and host, so tenant resolution is unchanged.
// waitUntil keeps fire-and-forget work (e.g. a tenant's metadata deploy) alive after the response.
const { waitUntil } = require("@vercel/functions");
const { createHandler } = require("../apps/api/dist/serverless");

module.exports = createHandler(waitUntil);
