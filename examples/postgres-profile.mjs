import { withDockerPostgres } from '../src/docker.mjs';

export default {
  id: 'postgres-example',
  title: 'PostgreSQL example',
  backup: process.env.DRILL_BACKUP,
  backupAt: process.env.DRILL_BACKUP_AT,
  applicationVersion: 'schema-v1',
  suiteVersion: 'boards-v1',
  async exercise({ restoreBackup }) {
    return withDockerPostgres('postgres:16-alpine', async (db) => {
      await restoreBackup(db.restore);
      const { stdout } = await db.psql(['-c', "SELECT to_regclass('public.boards') IS NOT NULL"]);
      return [{ label: 'Boards table is available', expected: ['true'],
        observed: [stdout === 't' ? 'true' : 'false'], passed: stdout === 't' }];
    });
  },
};
