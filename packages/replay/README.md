# @hartii/quai-replay

Capture mined internal Quai account calls and repeat a read-only call at parent-block state. Requires archive access. This is not exact in-block replay; contract creation, ETX and Qi are unsupported.

Unaudited beta. Node 22.14+; Windows and Linux are the target platforms. No live-network or external customer pilot is claimed by this package.

Run `quai-replay --help` for the command surface. Use `--json` for structured stdout.

See the monorepo README for usage, limits, state recovery and the verification workflow. Install the core and all desired CLI tarballs together from one verified release candidate; these beta packages have not been published to npm.
