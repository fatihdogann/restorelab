# User isolation after a PostgreSQL restore

[Türkçe](kurtarma-vakasi.md) · [Open the sample report](https://mehmetfatihdogan.com.tr/assets/demos/restorelab-en)

Two synthetic task-app users should only be able to see their own tasks. Both PostgreSQL archives contain the same records. The second archive has a broader read policy that lets both users see all tasks.

Each archive was restored into a fresh PostgreSQL instance. RestoreLab requested the task list as Bora and compared the returned IDs with the expected list.

| Backup | Restore | Bora’s API response | Access check |
| --- | --- | --- | --- |
| `restricted.dump` | Succeeded | HTTP 200 · `bora-task` | Passed |
| `permissive.dump` | Succeeded | HTTP 200 · `ayse-task, bora-task` | Failed |

A status-code check would have passed both archives. Comparing the full list caught the overly broad policy. The report shows the restore outcome and application checks separately.

## Reproduce

Run from the repository root with Node.js 22+ and Docker.

```sh
demo_dir=$(mktemp -d)
RESTORELAB_STATE="$demo_dir/history" node restorelab.mjs demo "$demo_dir" --docker
```

Open `index.en.html` for the English report. The command succeeds when it reproduces both expected outcomes. See the [SQL profile](../README.md#test-a-business-rule-in-your-own-backup) for your own backup or the [TaskWork/Supabase drill](supabase-case-study.md) for sign-in and API tests with application roles. The TaskWork exercise covers the base schema, local Auth and REST.
