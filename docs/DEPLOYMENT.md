# Deployment

Reflection Compass serves a static PWA from GitHub Pages and an independent API, D1 database, and reminder Cron from Cloudflare Workers. Deploy your own instance from a fork or standalone copy of this project. You need your own Cloudflare account and database, Google OAuth application, and credentials. An instance supports up to five invited accounts, including its administrator; it has no open registration.

Run all commands from the project root. Use Node.js 24, matching CI. Replace every example value below with your own. The included workflows assume this project is the repository root.

## 1. Prepare the Worker and database

```sh
npm ci
npm run setup
npx wrangler login
npx wrangler d1 create compass
```

`setup` creates ignored local secrets in `.dev.vars` and preserves existing values. Edit `VAPID_SUBJECT` there to your own contact address, such as `mailto:admin@example.com`. Keep the recovery token and VAPID key pair private and backed up. Keep the same VAPID key pair on later deployments so existing push subscriptions continue to work.

Set these non-secret deployment values using the database UUID returned by Cloudflare:

```sh
export CLOUDFLARE_D1_DATABASE_ID='YOUR-DATABASE-UUID'
export ALLOWED_ORIGINS='https://YOUR-USERNAME.github.io'
node scripts/worker-config.mjs
```

The generator reads `wrangler.jsonc` and writes ignored `wrangler.deploy.json`. It requires a real UUID and one or more comma-separated HTTPS origins without paths or trailing slashes. For a custom frontend domain, use its origin instead. A project Pages path such as `/reflection-compass/` does not belong in `ALLOWED_ORIGINS`. CORS cannot distinguish repositories on the same Pages origin; private APIs also require authentication.

For a **new, empty database**, create the current schema:

```sh
npx wrangler d1 execute compass --remote --config wrangler.deploy.json --file worker/schema.sql
```

For an **existing instance**, back up D1 first and review its schema and deployment history. Apply only the missing historical migrations in order: `worker/migrations/0002_multi_device.sql`, then `worker/migrations/0003_invited_google.sql`. Use the same `d1 execute` command with the appropriate migration file. The current schema includes these tables; a fresh installation does not need historical migrations. Creating tables with `IF NOT EXISTS` does not migrate existing columns or data. Never run test cleanup or a destructive database reset against production.

Deploy the Worker, preserving any variables managed in the Cloudflare dashboard:

```sh
npm run deploy:backend -- --keep-vars
```

This script regenerates `wrangler.deploy.json` on every invocation, so both environment variables above must still be available. Do not edit the generated file as a persistent configuration source. The plain `npm run deploy` uses `wrangler.jsonc`, whose checked-in database ID is a placeholder.

## 2. Configure credentials and Google login

Use Wrangler's interactive prompts to enter the corresponding values from your private `.dev.vars`; do not put secret values in command arguments, shell history, logs, or frontend variables:

```sh
npx wrangler secret put OWNER_TOKEN --config wrangler.deploy.json
npx wrangler secret put VAPID_PUBLIC_KEY --config wrangler.deploy.json
npx wrangler secret put VAPID_PRIVATE_KEY --config wrangler.deploy.json
npx wrangler secret put VAPID_SUBJECT --config wrangler.deploy.json
npx wrangler secret put GOOGLE_CLIENT_ID --config wrangler.deploy.json
```

Create your own Google client and bind the administrator following [Google login setup](GOOGLE-LOGIN-SETUP.md). The Client ID is public configuration, but storing it as a Worker secret avoids losing a dashboard variable during deployment. No OAuth client secret is required.

Record the Worker HTTPS origin, for example `https://reflection-compass.YOUR-SUBDOMAIN.workers.dev`. `/api/health` is public; `/` returns 404 because the production Worker does not serve the frontend. Check `/api/auth/config` for `configured: true` after setting the Google Client ID.

Wrangler secrets survive deployments. Ordinary dashboard variables can be overwritten by deployment configuration: retain `--keep-vars` on local deployments, or declare every required non-secret variable in the source configuration. This includes Google and VAPID settings if you chose to store them as ordinary variables instead of secrets.

## 3. Publish the frontend on GitHub Pages

In your own GitHub repository:

1. In **Settings → Pages**, choose **GitHub Actions** as the source.
2. In **Settings → Secrets and variables → Actions → Variables**, create `VITE_API_BASE_URL` with your Worker HTTPS origin, without `/api` or a trailing slash.
3. Push to `main` or run **Deploy frontend to GitHub Pages** manually.

The workflow obtains `VITE_BASE_PATH` from `actions/configure-pages`. Project sites automatically use `/REPOSITORY-NAME/`; user sites and custom domains use `/`. Only `dist/` is published.

For a manual production build:

```sh
VITE_API_BASE_URL=https://reflection-compass.YOUR-SUBDOMAIN.workers.dev VITE_BASE_PATH=/reflection-compass/ npm run build
```

All `VITE_*` values become public frontend assets. Never put `OWNER_TOKEN`, `VAPID_PRIVATE_KEY`, or Cloudflare credentials there. `.env.example` contains deployment placeholders; copying it unchanged would point local builds at a nonexistent API and use a project subpath. For the local same-origin preview, leave `VITE_API_BASE_URL` unset and use `/` for the base path. See [development](DEVELOPMENT.md) for local workflows.

For a custom domain, configure the domain and HTTPS in Pages first, then rerun the frontend workflow. Update both Worker `ALLOWED_ORIGINS` and Google's authorized JavaScript origins. GitHub Pages does not apply Cloudflare `_headers`; the build includes a meta CSP, which cannot enforce every HTTP response policy, including `frame-ancestors`.

## 4. Optional backend workflow

**Deploy backend to Cloudflare** is manually triggered and uses the `cloudflare` GitHub environment. Configure repository or environment variables `CLOUDFLARE_D1_DATABASE_ID` and `ALLOWED_ORIGINS`, plus secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Restrict the token to the required Worker and D1 resources.

Configure application secrets directly on the Worker before using this workflow; GitHub does not need their values. The workflow runs tests, generates configuration, executes the current schema, and deploys API/Cron. It does not select or execute historical migrations.

The backend workflow uses `--keep-vars` to preserve dashboard-managed variables, while explicitly declared variables still come from configuration. Store application credentials as Wrangler secrets, as shown above. Keep all deployment values documented so an instance can be recreated without relying on an undocumented dashboard state.

## 5. Verify the deployed instance

- Open the production frontend, bind the administrator, and confirm sync on a second device.
- Invite another account and verify that an uninvited account is refused.
- On iPhone, add the site to the Home Screen and launch it there. Enable notifications, send a test, and verify that tapping it opens the correct app path.
- Schedule a near-term reminder, enable delivery, wait for synchronization, and close the app to check delivery. Test pausing reminders and reconnecting after offline edits.

Use your own deployed URLs for this verification. `npm run test:split` uses local test origins and an isolated local database; those are not production configuration. It also replaces `dist/` with a test build, so rebuild with production values before any manual publication.

Choose a stable production URL. Changing origin does not move IndexedDB data: synchronize or export from the old address first, then sign in and subscribe again on the new one. Changing a repository path also changes the app's local namespace and PWA scope. Web Push delivery is best effort; acceptance does not prove display or reading, and a submitted notification cannot be recalled.
