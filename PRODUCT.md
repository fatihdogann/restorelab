# RestoreLab

RestoreLab helps small teams verify that an application works against a restored PostgreSQL backup. The operator needs to find the latest tested backup and see the exact point where an application check failed.

The first report uses the approved dark concept. The report highlights the application verdict, then separates database restore evidence from expected and observed HTTP behavior. The initial scenario uses two synthetic accounts in a task application. The runnable slices cover native and Docker PostgreSQL, read-only run history, and an isolated Supabase exercise against TaskWork’s base schema.
