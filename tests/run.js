// Loads every tests/*.test.ts in one process under node:test. Run through `npm test`, which supplies
// --conditions=development so workspace packages (@tdm/domain, ...) resolve to their TypeScript sources.
const fs = require("node:fs");
const path = require("node:path");

require("ts-node").register({ transpileOnly: true, project: path.join(__dirname, "tsconfig.json") });

for (const file of fs.readdirSync(__dirname).filter((name) => name.endsWith(".test.ts")).sort()) {
  require(path.join(__dirname, file));
}
