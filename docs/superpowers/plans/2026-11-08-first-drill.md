# RestoreLab first drill

> Implement in order and verify each slice before publication.

**Goal** · Demonstrate a successful PostgreSQL restore whose API authorization check fails.

**Architecture** · Generate two synthetic archives with identical rows and different PostgreSQL policies. Restore each into a fresh cluster, exercise the same HTTP API with two accounts, and render the resulting evidence.

**Tech stack** · Node.js standard library and PostgreSQL command-line tools.

- [x] Cover the entry point with an end-to-end test for both archives and the generated report.
- [x] Create and stop disposable PostgreSQL clusters on private Unix sockets. Limit this native path to the bundled fixtures.
- [x] Exercise the API with least-privilege roles. Require both positive checks and the cross-user negative check.
- [x] Render local JSON and HTML results from the same evidence.
- [x] Verify cleanup, reproducibility and the report. Keep the public release gated on the separately approved isolated TaskWork acceptance.

## Product acceptance after this slice

Run a trusted PostgreSQL backup and its application inside a disposable Docker environment. Then validate TaskWork against isolated Supabase with synthetic data through sign-in, read, write and user isolation. Track run history and the latest passing backup for the same application version and test suite. Add the public synthetic demo and portfolio entry after acceptance.
