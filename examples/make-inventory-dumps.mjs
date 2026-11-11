import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { withDockerPostgres } from '../src/docker.mjs';

const [, , directory] = process.argv;
if (!directory || process.argv.length !== 3) {
  console.error('Usage: node examples/make-inventory-dumps.mjs <new-directory>');
  process.exit(2);
}

const output = resolve(directory);
const image = process.env.DRILL_POSTGRES_IMAGE ?? 'postgres:16-alpine';
await mkdir(output, { mode: 0o700 });
await withDockerPostgres(image, async (db) => {
  await db.psql(['-c', await readFile(new URL('./inventory.sql', import.meta.url), 'utf8')]);
  await db.dump(join(output, 'healthy.dump'));
  await db.psql(['-c', 'DELETE FROM reservations']);
  await db.dump(join(output, 'incomplete.dump'));
});
console.log(output);
