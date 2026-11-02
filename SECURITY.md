# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository:

[Report a vulnerability](https://github.com/Kingson4Wu/reflection-compass/security/advisories/new)

Include the affected commit or deployment, prerequisites, reproduction steps using invented records, expected versus actual access, and potential impact. Do not include usable tokens, session credentials, private writing, or another user's data. Do not open a public issue or publish an exploit before maintainers have had a chance to investigate.

If the private reporting form is unavailable, open a public issue containing only a request for a private contact channel, with no vulnerability details or sensitive information.

## Scope and support

Security fixes target the current `main` branch. There is no published backport policy or guaranteed response time. Operators should track updates, review deployment changes, and keep independent backups.

Particularly sensitive boundaries include Google challenge/token validation, account and seat isolation, device revocation, replay and conflict handling, subscription endpoint validation, cross-origin requests, and private data in logs or caches. An administrator's control of their own D1 database is an explicit trust boundary, not end-to-end encryption.

## If you operate an instance

Keep `.dev.vars`, local environment overrides, Cloudflare API tokens, recovery credentials, and VAPID private keys out of commits and frontend builds. `VITE_*` variables are public. Use the least access your deployment process requires and do not enable unneeded logging of private content.

For an exposed device session, revoke that device and review its access. For exposed administrator or infrastructure credentials, replace the affected credential and review sessions and deployment access. VAPID rotation requires cancelling old subscriptions and subscribing again; changing its key without re-enrollment can break reminders. Do not blindly rotate unrelated secrets or erase data during diagnosis.

See [privacy and data handling](docs/PRIVACY.md) for retention, offline copies, and deletion limits, and [deployment](docs/DEPLOYMENT.md) for configuration boundaries.
