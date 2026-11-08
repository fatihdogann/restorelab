# RestoreLab

[Türkçe](README.tr.md)

Restore a PostgreSQL backup in a disposable environment and check what the application can actually do with the recovered data. RestoreLab records the newest tested backup and the newest passing backup for each application and check-suite version.

![Passing and failing application checks after both backups restore](docs/images/report-en.webp)

## Try the recovery drill

Requirements: Node.js 22+, PostgreSQL 16 tools on PATH, and a non-root account on macOS or Linux. Docker is needed for the container-backed demo and panel history.

```sh
node --test
node restorelab.mjs demo "$HOME/Downloads/restorelab-demo" --docker
node restorelab.mjs serve examples/demo-panel.mjs
```

Open the generated report or visit the loopback URL printed by the panel. Use a fresh output directory for each report. Omit `--docker` to run the synthetic comparison in temporary local PostgreSQL clusters.

Both fixtures contain the same task rows and restore successfully. Both API reads return HTTP 200. The permissive policy exposes Ayşe’s task to Bora and fails the access check. The passing fixture also verifies that Bora can write and re-read a task.

## Run your own drill

A local JavaScript profile identifies the backup, its timestamp, the application version and the check-suite version. Its `exercise` starts the test environment, calls `restoreBackup` with the actual restore operation, then returns explicit expected/observed checks. See [the PostgreSQL profile](examples/postgres-profile.mjs) for a basic example and [the TaskWork exercise](examples/taskwork.mjs) for a Supabase integration.

```sh
DRILL_BACKUP=/absolute/path/backup.dump DRILL_BACKUP_AT=2026-11-08T00:00:00Z \
  node restorelab.mjs drill examples/postgres-profile.mjs
node restorelab.mjs serve examples/postgres-profile.mjs
```

The example expects a PostgreSQL custom archive and a `public.boards` table. Use a Docker image with the same PostgreSQL major version and required extensions. Profiles can provision required roles before restoring. Test with archives and profiles you trust. A PostgreSQL restore can execute code contained in the archive. The bundled Docker PostgreSQL helper uses a network-disabled, disposable container.

Run the `drill` command from cron, a systemd timer or CI for regular verification. An unsuccessful drill exits nonzero and keeps its result. Set `RESTORELAB_STATE` to choose the history directory, which defaults to `~/.local/state/restorelab`. The panel listens on loopback and reads that history. Only record synthetic identifiers or redacted values in the checks.

## TaskWork acceptance

With Docker and Supabase CLI 3.0 on PATH, run the following against a local TaskWork checkout.

```sh
node examples/taskwork.mjs /absolute/path/TaskWork
```

This exercise applies TaskWork’s base schema from the checkout’s commit, creates two synthetic users in a local Supabase stack, and restores the resulting backup into a fresh stack. It checks password sign-in, card reads, user isolation and a write followed by a read via Supabase Auth and REST. Its scope is the database and API path on the base schema. The complete migration chain, Storage and the mobile/web client are separate acceptance paths.

## License

[MIT](LICENSE)

## Developer

**Mehmet Fatih Doğan** — software developer.

[Portfolio & contact](https://mehmetfatihdogan.com.tr/en/) · [GitHub](https://github.com/fatihdogann)
