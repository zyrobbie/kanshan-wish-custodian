import { existsSync, readFileSync } from 'node:fs';

const required = [
  ['supabase/functions/products-search/index.ts', 'taobao.tbk.dg.material.optional.upgrade'],
  ['supabase/functions/products-search/index.ts', 'normalizeProducts'],
  ['supabase/functions/products-search/index.ts', 'AbortSignal.timeout'],
  ['supabase/functions/products-search/index.ts', 'origin_not_allowed'],
  ['supabase/functions/_shared/taobao-product.js', 'coupon_share_url'],
  ['supabase/functions/_shared/taobao-product.js', 'final_promotion_price'],
  ['src/app/products-service.js', "functions.invoke('products-search'"],
  ['src/app/main.js', '商品已选定；知乎证据将在阶段 4 接入。'],
  ['src/app/main.js', "get('fixture') === '1'"],
];
for (const [file, needle] of required) {
  if (!existsSync(file) || !readFileSync(file, 'utf8').includes(needle)) throw new Error(`Missing Phase 3 control: ${file} -> ${needle}`);
}
for (const file of ['src/app/main.js', 'src/app/products-service.js']) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('taoke-convert') || text.includes('link_converting')) throw new Error(`Deprecated conversion path found in ${file}`);
  if (text.includes('service_role') || text.includes('TAOBAO_APP_SECRET')) throw new Error(`Private credential reference found in browser source ${file}`);
}
console.log(`Phase 3 static baseline passed: ${required.length} controls present.`);
