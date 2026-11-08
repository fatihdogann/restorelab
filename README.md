# RestoreLab

Restore a PostgreSQL backup and verify what real application users can do against the restored data.

## Run the first drill

Install Node.js 22 or newer and PostgreSQL 16 server tools on macOS or Linux. Put `initdb`, `pg_ctl`, `pg_dump`, `pg_restore` and `psql` on PATH. Run as a regular user.

```sh
node --test
node restorelab.mjs demo "$HOME/Downloads/restorelab-demo"
```

Use a fresh output directory each time. Open `index.html` for the report, or inspect `report.json` for the underlying results. The demo exits successfully when it reproduces both the expected pass and the expected authorization failure.

The demo generates two synthetic archives with identical task rows. It restores each into a fresh PostgreSQL cluster and starts a loopback HTTP API. The API connects as two ordinary database roles. Both backups restore and return HTTP 200 for the task list. The permissive policy allows Bora to see Ayşe’s task, so the application check fails. The report also records the separate own-task and write checks.

The native demo uses private Unix sockets for PostgreSQL and accepts only its own fixtures. The temporary clusters and archives are removed on completion. The product scope and later acceptance gates are in the [implementation plan](docs/superpowers/plans/2026-11-08-first-drill.md).
