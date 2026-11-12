# @hartii/quai-watch

One-shot health checks for the existing Quai Worker/D1 indexer schema. Detects stale heartbeats, failed runs, missing cursor data and excessive lag. No scheduler, alert transport or managed service is provisioned.

Unaudited beta. Node 22.14+; Windows and Linux are the target platforms. No live-network or external customer pilot is claimed by this package.

Run `quai-watch --help` for the command surface. Use `--json` for structured stdout.

See the monorepo README for usage, limits, state recovery and the verification workflow. Install the core and all desired CLI tarballs together from one verified release candidate; these beta packages have not been published to npm.
