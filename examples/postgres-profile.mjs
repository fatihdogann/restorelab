import { withDockerPostgres } from '../src/docker.mjs';

const table = process.env.DRILL_REQUIRED_TABLE;
const image = process.env.DRILL_POSTGRES_IMAGE ?? 'postgres:16-alpine';
const project = process.env.DRILL_PROJECT_ID;
if (!/^[a-z_][a-z0-9_]{0,62}\.[a-z_][a-z0-9_]{0,62}$/.test(table ?? '')) {
  throw new Error('DRILL_REQUIRED_TABLE must be an unquoted schema.table such as public.orders.');
}

export default {
  id: project,
  title: project,
  backup: process.env.DRILL_BACKUP,
  backupAt: process.env.DRILL_BACKUP_AT,
  applicationVersion: process.env.DRILL_APP_VERSION,
  suiteVersion: `table-v1:${table}@${image}`,
  async exercise({ restoreBackup }) {
    return withDockerPostgres(image, async (db) => {
      await restoreBackup((archive) => db.restore(archive, { skipOwnershipAndGrants: true }));
      const { stdout } = await db.psql(['-c',
        `SELECT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('${table}') AND relkind IN ('r', 'p'))`]);
      const present = stdout === 't';
      return [{ label: `Required table ${table}`, expected: ['present'],
        observed: [present ? 'present' : 'missing'], passed: present }];
    });
  },
};
