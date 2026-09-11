// Concatenates supabase/migrations/*.sql into supabase/setup.sql (one paste in the SQL Editor).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const header = `-- Vena OS · configuración completa de la base de datos
-- Pega todo este archivo en Supabase → SQL Editor → Run. Es seguro correrlo una sola vez
-- en un proyecto nuevo. Generado desde supabase/migrations con: npm run db:setup-sql
`;
const body = files.map((f) => `\n-- =====================================================================\n-- ${f}\n-- =====================================================================\n${readFileSync(join(dir, f), 'utf8')}`).join('\n');
writeFileSync('supabase/setup.sql', header + body);
console.log(`supabase/setup.sql ← ${files.join(', ')}`);
