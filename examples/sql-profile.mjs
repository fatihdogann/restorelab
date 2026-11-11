import { withDockerPostgres } from '../src/docker.mjs';
import { loadSqlSuite, runSqlChecks } from '../src/sql-checks.mjs';

const image = process.env.DRILL_POSTGRES_IMAGE ?? 'postgres:16-alpine';
const project = process.env.DRILL_PROJECT_ID;
const { version, checks } = await loadSqlSuite(process.env.DRILL_SQL_SUITE, image);

export default {
  id: project,
  title: project,
  backup: process.env.DRILL_BACKUP,
  backupAt: process.env.DRILL_BACKUP_AT,
  applicationVersion: process.env.DRILL_APP_VERSION,
  suiteVersion: version,
  async exercise({ restoreBackup, signal }) {
    return withDockerPostgres(image, async (db) => {
      await restoreBackup((archive) => db.restore(archive, { skipOwnershipAndGrants: true }));
      return runSqlChecks(db, checks, signal);
    });
  },
};
