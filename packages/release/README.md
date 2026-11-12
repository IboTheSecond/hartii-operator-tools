# @hartii/quai-release

Fingerprint a compiled artifact and verify exact runtime bytes against a canonical deployment receipt. Verification concerns runtime at the deployment block. It does not deploy, publish source to an explorer or audit contracts.

Unaudited beta. Node 22.14+; Windows and Linux are the target platforms. No live-network or external customer pilot is claimed by this package.

Run `quai-release --help` for the command surface. Use `--json` for structured stdout.

See the monorepo README for usage, limits, state recovery and the verification workflow. Install the core and all desired CLI tarballs together from one verified release candidate; these beta packages have not been published to npm.
