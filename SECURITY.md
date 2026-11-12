# Security reporting and operational limits

This is unaudited beta tooling. Do not include production keys or sensitive endpoint credentials in an issue. Use GitHub private vulnerability reporting where enabled, or contact `dev@hartiibiome.com` with a minimal description and no secrets.

The selected RPC is a trust dependency: chain ID and response identity checks do not prove the node's honesty. Local state belongs to one trusted operating-system account. Filesystem compromise, deleted state, independent signers using the same account and inaccurate RPC data are outside the local reservation's authority.

A broadcast exception is unknown. The same signed bytes may already be in the network. Preserve the hash and state, obtain canonical receipt evidence, and do not blindly resubmit. A successful read-only call is not a guarantee that a later transaction will succeed. Mined observations can be reorganized.

Protected state, approval files and signed transaction files are never intended for publication. Captured calldata is public on-chain but may contain application-sensitive information. Review captures before sharing them.
