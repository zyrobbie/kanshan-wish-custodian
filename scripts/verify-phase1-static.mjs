import { readFileSync } from 'node:fs';
const required = [
  ['supabase/migrations/202608120001_phase1_wishes.sql', 'force row level security'],
  ['supabase/migrations/202608120001_phase1_wishes.sql', 'auth.uid() = owner_id'],
  ['supabase/migrations/202608120002_phase1_anonymous_migration.sql', 'security definer'],
  ['supabase/functions/products-search/index.ts', 'TAOBAO_APP_SECRET'],
  ['supabase/functions/zhihu-search/index.ts', 'ZHIHU_ACCESS_SECRET'],
  ['supabase/functions/taoke-convert/index.ts', 'TAOKE_CONVERT_ACCESS_KEY'],
  ['supabase/functions/migrate-anonymous-wishes/index.ts', 'x-source-authorization'],
];
for (const [file, needle] of required) if (!readFileSync(file, 'utf8').includes(needle)) throw new Error(`Missing Phase 1 control: ${file} -> ${needle}`);
console.log(`Phase 1 static baseline passed: ${required.length} controls present.`);
