CREATE TABLE tasks (
  id text PRIMARY KEY,
  owner name NOT NULL DEFAULT current_user
);
INSERT INTO tasks (id, owner) VALUES ('ayse-task', 'ayse'), ('bora-task', 'bora');
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON tasks TO ayse, bora;
CREATE POLICY read_tasks ON tasks FOR SELECT TO ayse, bora USING (owner = current_user);
CREATE POLICY write_tasks ON tasks FOR INSERT TO ayse, bora WITH CHECK (owner = current_user);
