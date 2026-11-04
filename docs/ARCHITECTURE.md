# Architecture

Reflection Compass is a static React application with a Cloudflare Workers API. GitHub Pages serves only the public frontend. D1 stores each account's cloud records; IndexedDB stores the device's offline workspace and pending operations.

## Runtime boundaries

| Boundary                           | Responsibility                                                                 | Main files                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Domain                             | Shared schemas, date/time rules, action limits                                 | `src/domain.ts`, `src/support.ts`                                                      |
| Application                        | Today, Direction, Pause, Review, Settings                                      | `src/main.tsx`, view components                                                        |
| Device storage and synchronization | Account workspaces, local save acknowledgements, pending operations, API calls | `src/store.ts`, `src/use-compass.ts`                                                   |
| Record merge model                 | Record keys, three-way merge, conflict resolution                              | `src/records.ts`, `src/sync-model.ts`, `worker/sync.ts`                                |
| Identity and tenancy               | Google challenge verification, device sessions, invitations, partition access  | `worker/auth.ts`, `worker/google-auth.ts`, `worker/members.ts`, `worker/tenancy.ts`    |
| Reminders and backups              | Scheduling, push delivery lifecycle, subscriptions, daily snapshots            | `worker/index.ts`, `worker/devices.ts`, `worker/backups.ts`, `worker/push-language.ts` |
| App shell                          | Scoped offline assets, visible push, notification navigation                   | `public/sw.js`, `scripts/pwa.mjs`, `scripts/prepare-sw.mjs`                            |
| Language                           | Device preference, system-copy translation, built-in questions                 | `src/i18n.ts`, `src/messages.ts`, `src/language.ts`                                    |

## Records and synchronization

Edits first enter the IndexedDB persistence queue. A save status is shown only after storage acknowledges the write. Persisted operations carry stable IDs so retries can be recognized by the server. While the app is active, edits are submitted after a short debounce; opening, returning to the foreground, and reconnecting also trigger sync attempts.

`/api/sync` exchanges records and operation receipts. Different record changes merge. Overlapping changes retain both versions for explicit resolution; the app does not replace the entire account silently. D1 transactions and revision checks protect server commits. A compatible state projection remains available to the legacy `/api/state` interface and scheduler.

Account workspaces have separate local storage namespaces. Signing out returns to the guest workspace without erasing saved account data. Temporary add-action and Pause drafts belong only to the active session/account. Edit sessions for actions, daily notes, and weekly notes capture the original date or key, so crossing midnight does not move an edit to another record.

The cloud database is authoritative for cross-device state. Browser storage is an offline copy, not a guarantee of persistence against browser eviction, manual clearing, or a force-close before a write is acknowledged. No background synchronization is promised while an operating system suspends the app.

## Identity and five-person tenancy

Google Identity Services supplies a signed ID credential. The backend validates it against the configured Web client and a server-created challenge; the frontend does not hold an OAuth client secret. Application-issued device sessions expire after 30 days and can be revoked. Device session credentials are stored as hashes server-side. A private random installation secret is stored separately from login state; after Google verification, the server hashes it with the account ID to reuse the device identity across repeated logins. Device names are never used to merge records. Older clients without an installation secret keep their existing login behavior.

Remembered login state is stored in localStorage and IndexedDB. Startup restores the IndexedDB copy only when no explicit Web Storage login/logout state exists, before opening an account workspace. Signing out or choosing a session-only login clears the remembered backup. The installation secret remains across sign-out; clearing all site data creates a new installation.

One administrator and four additional seats share an instance. Invitations reserve a seat for seven days. Initial admission requires the invited Gmail or Google Workspace identity; subsequent access is tied to the stable Google subject. Public registration and Apple sign-in are outside the current scope.

The administrator's original records keep their existing tables. Seats 2–5 use fixed table partitions. Transactional account-generation checks prevent a recycled seat from accepting requests belonging to its former account. The five-person limit is part of this schema and security model, not just a display setting. Increasing it requires a tenancy redesign and migration.

The administrator recovery token remains an emergency capability. Ordinary accounts use Google/device sessions. UI administrators manage invitations, not other members' writing, but the infrastructure operator still controls D1 and backend secrets.

## Reminder lifecycle

Cloudflare Cron runs independently of open app windows. It evaluates explicit account timezone, daily slots, quiet hours, and pause settings. Scheduling is calendar-aware rather than based on adding a fixed number of seconds to a day.

Testing notifications from the current app uses that authenticated device’s own subscription, even when another subscription receives daily reminders. Enabling notifications refreshes the device list and offers an explicit target switch. Provider rejection of an expired subscription clears both delivery and matching device metadata, while preserving any renewed keys.

Each account selects one receiving device. Registering another device does not automatically take over the target. Pending delivery rows have IDs, expiry, attempts, and leases. Leases coordinate overlapping runs and permit recovery after a worker interruption; retries are bounded. Successful upstream acceptance is recorded as `accepted`, not displayed or read. Network failures can still cause duplicates; this is not exactly-once delivery.

A subscription stores its receiving device's locale. Updating language changes only subscription metadata. Identity comparisons use endpoint and encryption keys so a concurrent locale change does not cancel a claimed reminder or prevent invalid-subscription cleanup. Target changes still invalidate work for the old subscription. English and Simplified Chinese payloads share the same safe app-relative deep-link structure.

## Backups

Daily server snapshots retain at most 60 versions from the previous 30 days, including manual and pre-restore snapshots. Restoring preserves the prior version and pauses reminders. File exports use a versioned envelope and SHA-256 checksum; older supported exports can still be imported. The checksum is an integrity check, not encryption or a signature. Backups exclude device credentials and push subscriptions.

## Frontend, PWA, and language

The frontend builds for an explicit base path and API origin. Generated manifests and precache entries match that path. English and Simplified Chinese manifests share an application ID, scope, and storage namespace. Language is a device preference and does not alter the synced state schema or translate personal records.

The service worker caches only the public app shell and build assets, never private API responses. Notification URLs are restricted to the application's origin and path. CSP in the built HTML permits only the configured API and required Google resources; GitHub Pages does not apply Cloudflare-style `_headers` files.

CORS permits configured frontend origins, while private API routes independently require authentication. An origin allowlist is not account authorization, and a GitHub Pages origin can contain multiple repository paths.

## Change boundaries

Keep the product loop small: direction, a chosen action, an optional pause, and adjustment. Additional mandatory questions, streaks, AI coaching, automatic task backlogs, a large project hierarchy, CloudKit synchronization, and complex recurring schedules are not current features.

Operational setup is in [deployment](DEPLOYMENT.md); data-access limitations are in [privacy](PRIVACY.md); verification commands are in [development](DEVELOPMENT.md).
