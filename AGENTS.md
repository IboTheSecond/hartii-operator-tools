# Operator suite maintenance

Read the owner's vault rules and `C:/Users/iboth/.agents/skills/SKILLS.md` before nontrivial work. Source code and current evidence outrank old handoffs.

- This repository is independent of the Labs/Biome payment and editorial worktrees. Claim it in the coordination ledger; use a fresh branch/worktree once it has a remote.
- Four product packages depend only on `@hartii/ops-core`. The core never imports a sibling product or handles a production signing key. CLI bins own command dispatch.
- One write path: `packages/core/src/transactions.mjs`. Exact transaction review, one-use durable claims, explicit confirmation, external signatures and unresolved account reservations are mandatory.
- Never auto-retry a broadcast, silently clear an unknown transaction, overwrite an approval or remove a stale lock. Recover by signed hash and canonical receipt evidence.
- Use `quais`, npm and `node:test`. No new dependencies/services without the owner's authority. No `.env*`, credentials, keystores or private production keys in source, output, tests or artifacts.
- Tests first. Run `npm test`, `npm run check`, `npm run pack:verify`; check actual exit codes. The package gate must execute real installed commands, not help only.
- Studio is a local explanatory mockup, not a live wallet or implementation-status oracle. Update `studio/status.js` only from actual evidence, with a timestamp and honest scope. Keep the terminal sample-data label.
- `studio-check.mjs` accepts an existing Playwright installation root; browser screenshots are local evidence under ignored `artifacts/studio`. No new Playwright dependency is installed by it.
- Commit exact paths with anonymous Hartii author identity. No npm publication, real transactions or mainnet contract deployments as part of a test or release-candidate workflow.
- Before any live chain action, same-day network confirmation is required by the owner's rules. This build's loopback fixture does not establish that confirmation.
- Keep README and package READMEs synchronized. Production documentation can describe a release only once it is tagged and live; this beta has local repo docs only.
