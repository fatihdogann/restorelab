# Supabase recovery case study

This optional case study uses TaskWork to verify that a PostgreSQL restore still supports real Supabase Auth and REST workflows. The [public demo](../README.md#run-the-demo) and [generic PostgreSQL profile](../README.md#check-your-own-backup) work independently of TaskWork.

The [exercise](../examples/taskwork.mjs) uses the base schema from a local TaskWork checkout and creates two synthetic accounts in an isolated Supabase stack. It restores the resulting archive into a fresh stack, then checks password sign-in for each user, that each user can see only their own card, and that a newly written card can be read back.

If you have access to the TaskWork source, run this with Docker and Supabase CLI 3.0 on PATH.

```sh
node examples/taskwork.mjs /absolute/path/TaskWork
```

The checked scope is TaskWork’s base schema, local Auth and REST. Full migrations, Storage, and web and mobile clients require separate recovery tests.
