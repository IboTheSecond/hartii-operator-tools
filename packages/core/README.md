# @hartii/ops-core

Shared address validation, RPC transport, exact transaction review and durable local evidence. This package is an internal foundation for the four Hartii operator CLIs; it does not hold a production private key.

Unaudited beta. Node 22.14+; Windows and Linux are the target platforms. No live-network or external customer pilot is claimed by this package.

The four CLI packages use the public ESM exports. Production signing remains external.

See the monorepo README for usage, limits, state recovery and the verification workflow. Install the core and all desired CLI tarballs together from one verified release candidate; these beta packages have not been published to npm.
