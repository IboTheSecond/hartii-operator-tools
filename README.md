# Hartii Operator Tools

Four focused CLIs for Quai application teams. A shared core owns address validation, RPC boundaries, local evidence and transaction review. **Local beta; not audited or production-validated.**

| Command | Working beta scope |
|---|---|
| `quai-tx` | Inspect, simulate, prepare an exact transaction, check an external signature, explicitly submit once, reconcile receipts |
| `quai-release` | Fingerprint a compiled artifact and verify exact deployed runtime bytes against a canonical contract-creation receipt |
| `quai-watch` | Evaluate the existing `quai-indexer-cron` Worker/D1 health schema, heartbeat age and cursor lag |
| `quai-replay` | Capture mined transaction evidence and repeat a read-only call at parent-block state |

Start with [the interactive local studio](studio/index.html). It explains the tools through labeled mockups, editable priorities, saved notes and exportable decisions. Open the HTML file directly; refresh for the latest saved build snapshot. It never signs or runs commands.

## Development

Node **22.14+**, npm. Windows and Linux are the target platforms.

```text
npm ci --ignore-scripts
npm test
npm run check
npm run pack:verify
```

`pack:verify` builds five tarballs twice, compares their bytes, scans the actual uncompressed archive entries, installs all packages into an independent temporary consumer and exercises the installed four-tool protocol workflow. Checksums land in `artifacts/packages/SHA256SUMS`. These checksums are local evidence, not a signed provenance attestation.

Run the workspace directly:

```text
node packages/tx/bin/cli.mjs --help
node packages/release/bin/cli.mjs --help
node packages/watch/bin/cli.mjs --help
node packages/replay/bin/cli.mjs --help
npm run pilot
```

`pilot` uses a loopback-only mock RPC and a disposable, publicly derivable test signer. It never forwards a request to a chain. It is not an external customer pilot or proof that live funds are safe.

## Transaction flagship

Create an intent JSON with exactly these fields. Values and fee budgets are **integer wei strings**. Replace both addresses with your own supported Cyprus-1 Quai account addresses.

```json
{
  "from": "0x00112233445566778899aabbccddeeff00112233",
  "to": "0x002233445566778899aabbccddeeff0011223344",
  "value": "1000000000000000000",
  "maxFee": "25000000000000000000",
  "data": "0x",
  "accessList": []
}
```

```text
quai-tx prepare --intent transfer.json --json
quai-tx status --review <review-id> --json
```

Preparation checks the chain, call outcome, gas, balance and pending nonce. It returns an unsigned `transaction` object and the path to an approval file. Sign that exact transaction using your existing trusted signing workflow, preserving chain ID. Save the resulting signed hex in a local file. The suite does not import or create a production wallet and has no signing-key flag.

```text
quai-tx send --review <review-id> --approval-file <approval-path> --signed-file <signed-hex-file> --confirm --json
quai-tx receipt --review <review-id> --json
```

A submission requires both `--confirm` and the original one-use approval file. It verifies the recovered signer and every signed field, then rechecks the selected chain, nonce, balance and gas conditions. Approvals expire after five minutes. Buffered gas is estimate × 1.3, rounded up; estimates and limits over 5,000,000 gas are refused. Gas price movement outside ±20% or estimate growth above 20% requires a fresh review. The intent fee budget caps the full signed gas ceiling.

An unresolved broadcast holds the account reservation. No automatic retry or replacement occurs. `submitted` is not a successful mined transaction. `unknown` retains the locally signed hash. Reconcile the review against a matching canonical status-0/1 receipt before another send. A stale process lock or a crash between durable writes needs manual evidence review; never delete local state to make a send go through.

## Release verification

```text
quai-release artifact --artifact Contract.json --json
quai-release verify --manifest release.json --out receipt.json --json
```

`release.json`:

```json
{
  "chainId": 9,
  "address": "0x002233445566778899aabbccddeeff0011223344",
  "transactionHash": "0x0101010101010101010101010101010101010101010101010101010101010101",
  "artifact": "./Contract.json"
}
```

The artifact path is relative to the manifest. Supported artifacts contain `deployedBytecode` as hex or an object with an `object` hex field. Empty runtime, unresolved libraries and immutable references are refused. Use a fully resolved runtime artifact for those cases. Verification compares code at the **canonical deployment block**, which may require archive access. It does not deploy, publish source to an explorer, inspect a proxy implementation or audit security.

## Monitoring and replay

```text
quai-watch check --url https://your-indexer.example/health --max-age-secs 600 --max-lag 100 --json
quai-watch report --input health.json --json
quai-replay capture --hash <transaction-hash> --out capture.json --json
quai-replay run --input capture.json --out replay.json --json
```

Monitoring reads the existing [Worker/D1 indexer health schema](https://github.com/IboTheSecond/quai-indexer-cron). It recomputes age from the heartbeat timestamp and lag from head/cursor, rejecting unknown or future values. The reported head is the last indexer observation, not an independently observed chain head. The command runs once; it does not install a scheduler or send alerts.

Replay supports mined internal Quai account calls. It verifies captured block identity and reads **parent-block state**; transaction ordering within the mined block is not reconstructed. An archive-capable node is required. Contract creation, external transactions and Qi are refused. Capture integrity hashes detect accidental edits; they are not authenticity signatures. Review calldata before sharing a capture.

## Boundaries

- Mainnet chain 9 and explicitly selected chain 15000, Cyprus-1 only. Other zones, Qi and zero destinations are refused.
- `--rpc` overrides the read/submission endpoint; `--chain-id` remains independently checked. The default is `https://rpc.quai.network/cyprus1`. Test networks require an explicit endpoint.
- HTTPS only; `--allow-local-http` permits loopback HTTP fixtures. No URL credentials, query strings or fragments. This beta needs public or locally forwarded RPC access.
- Default state: `~/.hartii-ops`, override with `--state`. Keep it private and durable. Restrict Windows folder permissions using your normal account policy; POSIX mode bits alone do not configure Windows ACLs.
- State, approvals and signatures stay out of packages. State loss removes local reservation knowledge. Only one operator/process should own a wallet's state directory.
- No custody, production key handling, mainnet contract deployment, source-verification service, managed hosting, billing or alert transport is included.
- `quais` is pinned to the existing Hartii version `1.0.0-alpha.54`; the SDK remains an upstream dependency and its release status must be evaluated before a production pilot.
- RPC errors omit arbitrary server text. JSON stdout stays parseable. Exit **0**: command succeeded; **1**: input/infrastructure/refusal; **2**: degraded health, replay revert, or uncertain submission. Inspect the result's `status` and `final` fields for transaction outcomes.

## GitHub and the first paid pilot

CI runs source guards, native tests, reproducible package construction and installed-package protocol checks on Windows/Linux with Node 22/24. The manual release-candidate workflow repeats the gate and optionally creates a GitHub artifact attestation using OIDC. It does not publish to npm. Verify attestations with `gh attestation verify <archive> --repo <owner>/<repo>` after an attested workflow has actually run.

The selected business direction is open-source CLIs plus paid services/support. First validate transaction operations with one real Quai app team. The first paid offer is operation of that team's existing Worker/D1 indexer, agreed health checks and incident alerts. A team, service scope, operational ownership and billing still need to be established. No customers, service commitments or revenue are assumed.

Quai RPC and SDK interfaces are grounded in the [official SDK source](https://github.com/dominant-strategies/quais.js) and [official protocol documentation](https://github.com/dominant-strategies/quai-docs). Local mocks are not live-network compatibility proof.
