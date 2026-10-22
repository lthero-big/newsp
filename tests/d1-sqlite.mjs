// Minimal D1 stand-in over node:sqlite with every migrations/*.sql applied in order — runs the real SQL from functions/api/*.js.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function d1() {
  const db = new DatabaseSync(':memory:'), dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => /^\d{4}\.sql$/.test(f)).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), _run: () => db.prepare(sql).run(...args),
    async all() { return { results: db.prepare(sql).all(...args) }; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async run() { return db.prepare(sql).run(...args); } });
  return { prepare: sql => stmt(sql), batch: async list => { for (const s of list) s._run(); return []; }, db };
}
