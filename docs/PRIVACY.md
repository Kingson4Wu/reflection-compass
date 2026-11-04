# Privacy and data handling

This page describes the implementation, not a hosted-service contract. A self-hosting operator is responsible for their instance, its users, and any additional infrastructure they configure.

## What is stored

| Data                                                                    | Location and purpose                                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Directions, actions, observations, notes, reminder settings             | IndexedDB on each participating device; synced to that account's D1 partition after authentication |
| Pending edits, base versions, and unresolved conflicts                  | Local workspace; operations and receipts also support server-side synchronization                  |
| Google account subject, email, display name, role, and invitation state | Backend identity and admission records                                                             |
| Device name, credential hash, last-seen time, and session expiry        | Backend access control; the usable device credential stays in browser storage                      |
| Push endpoint, encryption keys, receiving-device choice, and locale     | Backend subscription records used to send notifications                                            |
| Delivery status, attempts, expiry, and error information                | Backend delivery diagnostics; not a record of whether the notification was read                    |
| Backup snapshots                                                        | D1, plus any files you explicitly export                                                           |
| Interface language                                                      | Device local storage; not the account's synced record schema                                       |

Google handles sign-in; this app does not store Google passwords, OAuth client secrets, or Google refresh tokens. Personal records do not go to Google Drive. The default app has no analytics SDK, advertising integration, or AI model endpoint. GitHub, Google, Cloudflare, and push providers may process normal service metadata under their own policies.

## Who can access records

The app separates accounts in its API and database access layer. Its administrator interface does not expose other members' writing. The deployment operator, however, controls D1 and the Worker environment and can technically access stored records. This is **not end-to-end encryption**.

Notifications contain generic prompts rather than diary answers or action text. Push providers receive the encrypted Web Push message and routing metadata; platform notification settings determine what appears on a lock screen.

The default Worker configuration enables observability. Hosting providers can retain request and error metadata. If you change logging or monitoring, avoid logging request bodies, authorization headers, credentials, or personal writing; document any extra collection to your users.

## Shared devices and signing out

Signing out revokes the active local login state and switches to a separate guest workspace. It does not erase previously downloaded account records or pending edits. A separate browser profile is a better boundary for private writing on a shared computer. Removing a device blocks future cloud access but cannot remotely wipe copies already downloaded there.

When you choose to remember a device, the app stores its session in localStorage and IndexedDB so it can restore a missing Web Storage copy. Signing out clears both remembered login copies. A private random installation identifier remains across sign-out to prevent duplicate device records; the server derives an account-specific ID from it after Google verification. It is separate from the session credential and does not itself permit sign-in.

A browser may retain a device session until expiry or revocation. The recovery token is a privileged emergency credential; keep it private and out of frontend configuration. If credentials are exposed, follow [SECURITY.md](../SECURITY.md) and revoke affected access.

## Backups and retention

Automatic cloud snapshots are kept within a 30-day window, with at most 60 snapshots including manual and pre-restore versions. Delivery records older than their retention window are cleaned by scheduling. Synchronization receipts and deletion markers support offline replay and can grow with use; there is no blanket promise that every internal metadata table is pruned after 30 days.

Exported JSON files contain readable personal records. Their checksum detects accidental corruption, not unauthorized reading or malicious replacement. Saving to iCloud Drive is a manual system file/share operation. Separately exported files follow the storage provider's retention and are not deleted when you delete the account's cloud data.

## Deletion

Deleting your data removes current-account records, server backups, device authorizations, push subscriptions, and pending notifications. It does not revoke membership, affect another account's records, or erase files and copies stored elsewhere. Removing a member revokes that member and clears their cloud partition. Previously downloaded copies remain outside the server's control.

Browser storage clearing can destroy unsynced local edits. Sync and export before clearing site data, changing application origin or base path, or moving devices. Already-sent notifications cannot be recalled.

For practical actions, see the [user guide](USER-GUIDE.md); for a suspected vulnerability, use the private channel in [SECURITY.md](../SECURITY.md).
