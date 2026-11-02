# Contributing

Thanks for helping make Reflection Compass easier to use and maintain. Small, focused contributions are welcome. Please use English in project documentation, issues, and pull requests; both supported interface languages should remain usable.

## Before changing behavior

For a bug, open an issue with steps, expected behavior, actual behavior, and browser/device details. Use invented records and redact screenshots, tokens, emails, and push endpoints. For a larger feature, explain the user problem and smallest useful change before building it.

Keep the product supportive and lightweight. Mandatory daily questionnaires, scores, streak penalties, public feeds, AI coaching, and automatic backlogs do not fit the current scope. The five-person invitation limit is part of the tenancy model; expanding it requires more than changing a constant.

Report vulnerabilities privately through [SECURITY.md](SECURITY.md), not a public issue or pull request.

## Development

Follow [the development guide](docs/DEVELOPMENT.md). Use Node.js 24 LTS, `npm ci`, and the existing lockfile. Use a local or disposable instance for testing. Never run the mutation suites against the hosted app or a real user's database.

Keep each pull request focused:

- Describe the concrete problem and resulting behavior.
- Preserve user records, offline edits, account boundaries, and backup compatibility.
- Keep user writing separate from system-copy translation.
- Add meaningful regression coverage when behavior changes; documentation-only work does not need implementation-mirroring tests.
- Update the relevant current guide instead of adding a new design diary.
- Include checks actually run and clearly state remaining verification limits.

Before submitting code, run `npm run format:check`, `npm test`, and `npm run build`. Run relevant isolated browser checks for UI, synchronization, or offline changes, including WebKit for affected mobile flows. Use `npm run deploy:dry-run` for Worker changes. See the guide for commands and data-deletion boundaries.

For documentation, verify referenced commands against the repository, check local links, and keep all documentation in English. The article archive has explicit provenance; do not relabel its translated reading material as a verified copy of the author's original.

## Pull requests

Use an action-oriented title such as `fix: preserve an edit across midnight` or `docs: clarify Google setup`. Explain validation without claiming that automated tests prove real iPhone delivery or long-term product effectiveness. Maintainers may request a smaller scope or decline changes outside the product's purpose.

Contribute respectfully: discuss behavior and evidence, avoid personal attacks, and never include another person's private records. The project does not promise a support SLA or release schedule.

Project contributions use the [MIT License](LICENSE), except clearly identified third-party material. Contribute only material you have permission to share; preserve its attribution and license notices.
