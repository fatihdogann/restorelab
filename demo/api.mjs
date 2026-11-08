import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

export async function withDemoApi(db, use) {
  const tokens = { ayse: randomUUID(), bora: randomUUID() };
  const server = createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.url !== '/tasks') return reply(404, {});
    const user = Object.keys(tokens).find((name) => req.headers.authorization === `Bearer ${tokens[name]}`);
    if (!user) return reply(401, {});

    try {
      if (req.method === 'GET') {
        const { stdout } = await db.psql(['-c', "SELECT COALESCE(json_agg(id ORDER BY id), '[]') FROM tasks"], user);
        return reply(200, JSON.parse(stdout));
      }
      if (req.method === 'POST') {
        const { stdout } = await db.psql(['-c', "INSERT INTO tasks (id) VALUES ('new-task') RETURNING id"], user);
        return reply(201, [stdout.trim()]);
      }
      return reply(405, {});
    } catch {
      return reply(500, {});
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/tasks`;
    return await use(async (user, method = 'GET') => {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${tokens[user]}` },
        signal: AbortSignal.timeout(5_000),
      });
      const body = await response.json();
      return { status: response.status, ids: Array.isArray(body) ? body : [] };
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
