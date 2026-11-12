# Operator suite maintenance

Read this file and the READMEs before nontrivial work. Source code and current evidence outrank old notes.

- Four product packages depend only on `@hartii/ops-core`. The core never imports a sibling product or handles a production signing key. CLI bins own command dispatch.
- One write path: `packages/core/src/transactions.mjs`. Exact transaction review, one-use durable claims, explicit confirmation, external signatures and unresolved account reservations are mandatory.
- Never auto-retry a broadcast, silently clear an unknown transaction, overwrite an approval or remove a stale lock. Recover by signed hash and canonical receipt evidence.
- Use `quais`, npm and `node:test`. No new dependencies or services without maintainer approval. No `.env*`, credentials, keystores or private production keys in source, output, tests or artifacts.
- Tests first. Run `npm test`, `npm run check`, `npm run pack:verify`; check actual exit codes. The package gate must execute real installed commands, not help only.
- `site/` is the public web page (one self-contained file, no network requests, strict CSP in `site/_headers`). `studio/` is a local explanatory mockup and planning workspace, not deployed, not a live wallet and not an implementation-status oracle. Update `studio/status.js` only from actual evidence, with a timestamp and honest scope. Keep the terminal sample-data label in both.
- `studio-check.mjs` accepts an existing Playwright installation root; browser screenshots are local evidence under ignored `artifacts/studio`. No new Playwright dependency is installed by it.
- Commit exact paths with the project's anonymous author identity. No npm publication, real transactions or mainnet contract deployments as part of a test or release-candidate workflow.
- Before any live chain action, confirm the network is reachable and healthy the same day. This build's loopback fixture does not establish that confirmation.
- Keep README and package READMEs synchronized. Production documentation can describe a release only once it is tagged and live; this beta has repository docs only.
