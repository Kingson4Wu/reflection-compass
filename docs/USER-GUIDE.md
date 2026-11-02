# User guide

You can use Reflection Compass locally without an account. The main navigation is **Today**, **Direction**, and **Review**; **Pause** and **Settings** are in the header. On a phone, add the app to your home screen for a standalone experience.

## Start with one action

Add one specific thing you want to do today. You can keep up to three actions; there is no requirement to fill all three slots. Check an action when done, or use **Mark as incomplete** to undo completion. Use **Edit** to change or remove it.

Action edits enter the local save queue as you type. **Done** closes the editor; Escape also closes it without undoing saved edits. Leaving an action empty keeps the text it had when you opened the editor. Wait for a saved status before closing the app.

After an absence, previous actions remain in Review. Continue one only when you choose to; the app does not automatically copy unfinished work into today.

## Keep direction useful

Direction holds six optional fields: the life you want, a yearly change, a monthly project, identity, the life you want to leave behind, and constraints. Tap a row to edit it. You can change direction as experience changes your priorities; completing the entire page is unnecessary.

## Pause without another task

Pause offers a built-in question. Thinking briefly and returning to Today is enough; leaving without writing creates no empty or skipped record.

If writing helps, expand **Write a line, or adjust your next step**. Save an observation, a possible adjustment, or both. **Use as today's action** saves the observation and adopts the next step. If today's list is full or the text exceeds the action limit, it stays available to revise; it is not silently truncated or substituted for another action.

Daily and weekly notes are optional. Review keeps recorded actions, observations, and notes. Explicit next steps can be adopted from history without creating duplicate actions for that day.

## Choose a language

In **Settings → Language**, choose English or Simplified Chinese. The choice applies to this device and persists after reopening, including offline. Personal writing, device names, and custom questions stay in their original language; built-in questions are localized.

Reminders use the language saved for the receiving device. Switching another device's interface does not take over reminders. If notification-language sync fails, the app shows a notice and retries on a later online event or open. Existing subscriptions default to Simplified Chinese. The home-screen icon's displayed name may update according to the operating system; switching the interface does not require reinstalling.

## Sign in and sync

Cloud sync requires a configured Google account and an invitation to that instance. The administrator must first link the existing administrator workspace through the recovery flow. Each instance has five seats, including its administrator; there is no public registration.

Sign into the same Google account on another device and wait for **Synced to cloud**. Different records merge automatically. When two devices change the same record, inspect both versions and choose one or merge text. A conflict is not resolved by repeatedly pressing Sync.

Signing out switches to a separate guest workspace. Previously saved account records and its pending queue remain in that browser's account workspace. Unsaved Pause and add-action drafts are temporary and clear when switching accounts. Avoid shared browser profiles for private writing; see [privacy](PRIVACY.md).

## Enable reminders when useful

Reminders start paused. Set your timezone, daily times, quiet hours, and receiving device in Settings; changes take effect on the server after successful sync. Equal quiet-hour start and end times mean no quiet interval.

On iPhone, install the PWA and open it from its home-screen icon before granting notification permission. Turn on notifications from a direct button press. A newly connected device does not replace an existing receiving device; select it in **Device management** when you want to switch.

Use **Notification diagnostics → Send test reminder**, then check the lock screen or notification center. A push service accepting a request does not prove the operating system displayed it. Focus modes, permissions, connectivity, expiry, and platform restrictions can affect delivery. Closing the app does not stop server scheduling; pausing and syncing does. Already-sent notifications cannot be recalled.

## Back up and restore

**Save backup to Files** exports JSON with a SHA-256 integrity check. On a compatible device, save it to iCloud Drive through the system file/share dialog; elsewhere download it and place it there yourself. Exported files contain readable personal records. The checksum detects corruption, not malicious replacement or unauthorized access.

**Restore from file** first validates and previews the contents. Merge import adds missing records and fills blank fields while keeping existing content. Replacement saves a local restore point and pauses reminders. Import changes enter the sync queue, so concurrent cloud changes can still create conflicts. You can undo the last local import while its restore point remains available.

The server also saves daily snapshots, retaining up to 60 snapshots from the last 30 days. Cloud restore requires synced records with conflicts resolved; it preserves the previous server version and pauses reminders. File backups do not include device credentials or push subscriptions.

## Remove access or data

Removing a device revokes its cloud access. It does not remotely erase previously downloaded records. Removing the receiving device stops reminders to it until another device is enabled and selected.

**Delete all data** removes the current account's records, cloud snapshots, device authorizations, subscription, and pending reminders. It does not delete separately exported files or remove another account's records. Administrators can also revoke invitations and remove members; removing a member deletes that member's cloud partition and cannot be undone in the app.
