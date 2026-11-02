# Google login setup

Each self-hosted instance needs its own Google Cloud project and OAuth client. Google authenticates users; account data stays in your Cloudflare D1 database. Access is invitation-only, with up to five accounts including the administrator.

## Create the Google client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select your project.
2. In **Google Auth Platform**, complete **Branding** and **Audience**, including support and contact email addresses. Choose an external audience when inviting users outside your organization.
3. If the application remains in **Testing**, add the administrator and intended members under **Audience → Test users**. Google's test-user allowlist and this application's invitations are independent requirements; a Google test user still needs an app invitation.
4. Under **Clients → Create client**, choose **Web application**.
5. Add the frontend origin under **Authorized JavaScript origins**, for example `https://YOUR-USERNAME.github.io` or `https://compass.example.com`. Replace these examples with your own domain. Do not include the repository path or trailing slash, and do not substitute the Worker API origin for the frontend origin.
6. This implementation uses the Google Identity Services button popup and a browser credential callback. It does not require **Authorized redirect URIs**.
7. Copy the **Client ID**, which resembles `123456-example.apps.googleusercontent.com`.

The Client ID is public. Do not share your Google password, OAuth client secret, or credential JSON. Follow any branding, domain, or privacy verification requirements shown by Google. See Google's [client setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

## Configure the Worker

Prepare `wrangler.deploy.json` as described in [deployment](DEPLOYMENT.md), then enter the Client ID at Wrangler's interactive prompt:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID --config wrangler.deploy.json
```

Check that the Worker's `/api/auth/config` returns `configured: true`. This setting does not need a frontend build variable or an OAuth client secret. Preserve your existing recovery token and VAPID key pair.

A fresh database uses the current `worker/schema.sql`. An older instance must be backed up and have its missing migrations applied before deploying Google account support, including `0003_invited_google.sql` and, if absent, the earlier `0002_multi_device.sql`. Follow the deployment guide's fresh-install and upgrade distinction. Never reset a production database to enable login.

## Bind the administrator and invite members

1. Open Settings on a connected device. If necessary, use the administrator recovery section to connect with your private `OWNER_TOKEN`.
2. Choose the action to bind existing data to a Google account and select your own account in the Google button. For initial administrator setup, use this binding action before ordinary Google sign-in.
3. Confirm that your account has administrator status and existing records remain available. Other devices can then use ordinary Google sign-in.
4. In the invitations and members section, enter the intended member's Gmail or Google Workspace address and create an invitation. Share the application URL yourself; the application does not send invitation email.

Invitations expire after seven days and reserve a place while active. Expired or revoked invitations release that place. The five-account limit includes the administrator. First admission requires the invited email; subsequent sign-ins identify the account by Google's stable subject identifier. The implementation accepts Gmail and Google Workspace identities, and rejects third-party personal email identities even when Google's token reports a verified email.

The administrator keeps the original data tables; the other four accounts use separate fixed table partitions. Increasing the limit requires a schema and authorization redesign, rather than changing a displayed number.

## Sessions and account boundaries

- Application device sessions last 30 days and can be revoked from the device list. The application stores neither Google passwords nor Google refresh tokens. Apple login is not implemented.
- Signing out switches to a separate local guest workspace. The account's local records and pending offline changes remain in its own workspace for later sign-in.
- Cloud records, sync receipts, recovery points, devices, reminder targets, and delivery queues are separated by account. One browser push subscription cannot belong to multiple accounts simultaneously; disable notifications on the previous account or use a separate browser or device.
- The administrator manages invitations and membership through the app, without access to other members' records in that interface. The operator still controls D1 and can access stored data; this is not end-to-end encryption.
- Removing a member revokes access and deletes that member's cloud partition, including backups. Previously downloaded local copies cannot be remotely erased.
- Deleting your own data affects your account's data and does not remove membership. The recovery token remains an emergency administrator capability; ordinary members do not need it.

## Verify real Google sign-in

With the actual Client ID and production frontend URL, test administrator binding, sign-in on another device, invited admission, refusal of uninvited accounts, cancellation and retry, and reauthentication after session expiry. Check desktop browsers and the iPhone Home Screen app, including continued reminder delivery. Automated tests use signed test tokens and simulated browser callbacks; they cannot verify Google's real popup or console configuration.

When changing frontend origin, update Google origins, Worker CORS, and frontend deployment settings together. The production CSP permits Google's expected button styles using a fixed style hash and required style attributes while blocking inline scripts. If Google's SDK changes its injected styles, inspect the real button and update the allowlist after review; simulated callbacks alone cannot detect that integration failure.
