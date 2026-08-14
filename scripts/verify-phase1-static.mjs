import { readFileSync } from 'node:fs';
const required = [
  ['supabase/migrations/202608120001_phase1_wishes.sql', 'force row level security'],
  ['supabase/migrations/202608120001_phase1_wishes.sql', '(select auth.uid()) = owner_id'],
  ['supabase/functions/products-search/index.ts', 'TAOBAO_APP_SECRET'],
  ['supabase/functions/products-search/index.ts', 'publish_info'],
  ['supabase/functions/products-search/index.ts', 'coupon_share_url'],
  ['supabase/functions/products-search/index.ts', 'click_url'],
  ['supabase/functions/products-search/index.ts', 'https:'],
  ['supabase/functions/zhihu-search/index.ts', 'ZHIHU_ACCESS_SECRET'],
  ['supabase/functions/taoke-convert/index.ts', 'TAOKE_CONVERT_ACCESS_KEY'],
  ['supabase/functions/migrate-anonymous-wishes/index.ts', 'x-source-authorization'],
  ['supabase/functions/migrate-anonymous-wishes/index.ts', 'SUPABASE_SERVICE_ROLE_KEY'],
  ['src/main.js', 'shouldCreateUser: false'],
  ['src/main.js', "type: 'email_change'"],
  ['src/main.js', "migrate-anonymous-wishes"],
  ['src/main.js', "x-source-authorization"],
  ['index.html', "运行两用户 RLS 越权测试"],
  ['index.html', "运行淘宝搜索真实冒烟"],
  ['index.html', "运行知乎搜索真实冒烟"],
  ['index.html', "验证首个官方推广链接落地"],
  ['src/main.js', "products-search"],
  ['src/main.js', "zhihu-search"],
  ['index.html', '<a id="verify-promotion-link"'],
  ['src/main.js', 'promotionLink.href = candidate.promotionUrl'],
  ['src/main.js', 'destinationHost'],
  ['src/main.js', "persistSession: false"],
];
for (const [file, needle] of required) if (!readFileSync(file, 'utf8').includes(needle)) throw new Error(`Missing Phase 1 control: ${file} -> ${needle}`);
for (const [file, needle] of [['index.html', '运行淘客转链真实冒烟'], ['src/main.js', 'taoke-convert'], ['src/main.js', 'window.location.assign']]) {
  if (readFileSync(file, 'utf8').includes(needle)) throw new Error(`Deprecated Taoke conversion control still active: ${file} -> ${needle}`);
}
console.log(`Phase 1 static baseline passed: ${required.length} controls present.`);
