# @hartii/quai-tx

Transaction operations: inspect, preflight, prepare an exact unsigned transaction, validate an external signature, explicitly submit once and reconcile a canonical receipt. A submission is not a final success. Unknown outcomes retain account reservations.

Unaudited beta. Node 22.14+; Windows and Linux are the target platforms. No live-network or external customer pilot is claimed by this package.

Run `quai-tx --help` for the command surface. Use `--json` for structured stdout.

See the monorepo README for usage, limits, state recovery and the verification workflow. Install the core and all desired CLI tarballs together from one verified release candidate; these beta packages have not been published to npm.
