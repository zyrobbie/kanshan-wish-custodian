import { readFileSync } from 'node:fs';
const required = [
  ['supabase/migrations/202608120001_phase1_wishes.sql', 'force row level security'],
  ['supabase/migrations/202608120001_phase1_wishes.sql', '(select auth.uid()) = owner_id'],
  ['supabase/functions/products-search/index.ts', 'TAOBAO_APP_SECRET'],
  ['supabase/functions/zhihu-search/index.ts', 'ZHIHU_ACCESS_SECRET'],
  ['supabase/functions/taoke-convert/index.ts', 'TAOKE_CONVERT_ACCESS_KEY'],
  ['supabase/functions/migrate-anonymous-wishes/index.ts', 'x-source-authorization'],
  ['supabase/functions/migrate-anonymous-wishes/index.ts', 'SUPABASE_SERVICE_ROLE_KEY'],
  ['src/main.js', 'shouldCreateUser: false'],
  ['src/main.js', "type: 'email_change'"],
  ['src/main.js', "migrate-anonymous-wishes"],
  ['src/main.js', "x-source-authorization"],
];
for (const [file, needle] of required) if (!readFileSync(file, 'utf8').includes(needle)) throw new Error(`Missing Phase 1 control: ${file} -> ${needle}`);
console.log(`Phase 1 static baseline passed: ${required.length} controls present.`);
