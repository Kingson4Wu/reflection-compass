# Development

Use Node.js 24 LTS and the committed npm lockfile. No Google or Cloudflare account is required for local guest use or the isolated test suite.

## Local preview

```sh
npm ci
npm run setup
npm run db:local
npm run build
npm run preview
```

Open `http://localhost:8787`. This runs a local Worker, local D1, and the built frontend through `wrangler.local.jsonc`. Production uses `wrangler.jsonc` plus generated deployment configuration, without frontend assets.

`npm run setup` generates missing recovery and VAPID credentials in `.dev.vars`; existing values are preserved. The file is ignored and is not printed by setup. Set a real VAPID contact before production. Google sign-in can remain unconfigured locally; administrator recovery lets you exercise local sync and device management.

The default build uses the root application path and same-origin API. If you have deployment values in `.env.local`, explicitly override them:

```sh
VITE_API_BASE_URL= VITE_BASE_PATH=/ npm run build
```

`.env.example` documents public deployment values; it is not a ready-to-use local configuration. Never put secrets in `VITE_*`: these variables become public frontend assets.

## Live frontend editing

After the initial setup and build, run these in separate terminals:

```sh
# Terminal 1: local API and built-asset fallback
npm run preview -- --var 'ALLOWED_ORIGINS:http://127.0.0.1:5173,http://localhost:5173'
```

```sh
# Terminal 2: Vite, with /api proxied to port 8787
VITE_API_BASE_URL= VITE_BASE_PATH=/ npm run dev -- --port 5173 --strictPort
```

Open `http://127.0.0.1:5173`. Use the built preview for service-worker and offline acceptance, because Vite development resources are not the production precache.

## Checks

| Command                   | What it checks                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run format:check`    | Formatting of application, Worker, tests, scripts, configuration, and workflows           |
| `npm test`                | Domain rules, D1 behavior, authentication, tenancy, sync, reminders, and language helpers |
| `npm run build`           | TypeScript plus Vite and generated PWA assets                                             |
| `npm run deploy:dry-run`  | Worker packaging without deployment                                                       |
| `npm run test:split`      | Chromium browser suite against independent local frontend/API origins                     |
| `npm run test:experience` | The focused action, pause, history, and editing scenarios                                 |

Install browser engines once:

```sh
npx playwright install chromium webkit
```

`test:split` builds the frontend under `/reflection-compass/`, starts ports 4173 and 8788, initializes `.wrangler/split-test-state`, runs tests, and stops its servers. That database is disposable: tests create invitations, modify records, and delete data. Unit tests use temporary Miniflare databases. Do not point any of these suites at production or reuse real personal data.

Run the same selected WebKit checks as CI:

```sh
npm run test:split -- --browser=webkit tests/browser/app-shell.spec.ts tests/browser/native-ui.spec.ts tests/browser/support.spec.ts tests/browser/experience-eval.spec.ts tests/browser/language.spec.ts
```

The split runner rewrites `dist/` as a test deployment. Run `npm run build` again before root-path preview, or rebuild with your intended deployment variables.

### Legacy root-path and HTTP checks

`npm run test:browser` expects an already-running local preview. The HTTP integration suite also expects a local API and **deletes its data**:

```sh
# Only against a disposable local preview on port 8787
npm run test:integration
```

`INTEGRATION_API_ORIGIN`, `BROWSER_APP_URL`, and `BROWSER_API_ORIGIN` are test configuration, not production verification settings. Prefer the isolated split runner for routine work.

## Language changes

UI language is a device preference in `src/i18n.ts`; the English catalog is `src/messages.ts`. Add translations at explicit system-copy boundaries. Render user writing directly, including text that happens to match a UI label. `questionText` only localizes known built-in questions.

Check both languages, accessible names, dialogs, status feedback, small-screen overflow, refresh persistence, and offline reopening. Reminder locale belongs to a device subscription, not the account's synced record schema. Preserve the single receiving-device choice and queued reminders when changing language.

## Changes to data and deployment

Read [architecture](ARCHITECTURE.md) before changing record keys, merge rules, account partitioning, or reminder scheduling. New installs use `worker/schema.sql`. Existing deployments require a reviewed migration and a database backup; do not treat schema initialization as a generic upgrade procedure.

Keep deployment configuration, secrets, and tests separate. A dry run proves packaging, not real Google access, push display, or D1 permissions. Use a fresh guest context for public-page checks; production mutation tests require an intentionally disposable account or instance.

## Text selection

App chrome (navigation, buttons, row previews, labels, sheet titles, and disclosure headings) does not allow text selection or the iOS long-press callout. Text inputs and editors retain native selection and editing menus. Mark readable personal content and copyable diagnostics with `selectable-text` on the text element, rather than on a container that also contains controls. Keep saved actions, reflections, weekly notes, continuation text, conflict versions, and account email addresses copyable. Do not intercept clipboard, context-menu, or selection events globally.

## Manual acceptance

For mobile interaction changes, test the actual installed iPhone app: keyboard, safe areas, scroll, dialogs, and VoiceOver. For notification changes, separately check permission, closed-app lock-screen delivery, notification links, Focus behavior, and permission recovery. A mocked push service or automated WebKit run cannot establish those operating-system results.

For contribution scope and review expectations, see [CONTRIBUTING.md](../CONTRIBUTING.md).
