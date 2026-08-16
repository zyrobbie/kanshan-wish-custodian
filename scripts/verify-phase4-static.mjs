import { existsSync, readFileSync } from 'node:fs';

const required = [
  ['supabase/functions/zhihu-search/index.ts', 'Promise.allSettled'],
  ['supabase/functions/zhihu-search/index.ts', 'ZHIHU_ACCESS_SECRET'],
  ['supabase/functions/zhihu-search/index.ts', 'Count", "5'],
  ['supabase/functions/zhihu-search/index.ts', 'expert_status'],
  ['supabase/functions/_shared/zhihu-evidence.js', 'cleanProductTitle'],
  ['supabase/functions/_shared/zhihu-evidence.js', 'safeZhihuUrl'],
  ['src/app/zhihu-service.js', "functions.invoke('zhihu-search'"],
  ['src/app/evidence-test-scenarios.js', 'EvidenceTestService'],
  ['src/app/main.js', '正在从知乎整理专业解读与真实体验'],
  ['src/app/main.js', '愿望保管将在阶段 5 接入'],
  ['PHASE4_DEPLOY_MANIFEST.md', 'verify_jwt=true'],
];
for (const [file, needle] of required) {
  if (!existsSync(file) || !readFileSync(file, 'utf8').includes(needle)) throw new Error(`Missing Phase 4 control: ${file} -> ${needle}`);
}
for (const file of ['src/app/main.js', 'src/app/zhihu-service.js']) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('ZHIHU_ACCESS_SECRET') || text.includes('innerHTML = item.') || text.includes('window.open(')) throw new Error(`Unsafe Phase 4 browser source: ${file}`);
}
const server = readFileSync('supabase/functions/zhihu-search/index.ts', 'utf8');
for (const unsafe of ['productTitle:', 'queries:', 'secret:', 'authorization:']) if (server.includes(`console.log(${unsafe}`)) throw new Error(`Unsafe server log field: ${unsafe}`);
console.log(`Phase 4 static baseline passed: ${required.length} controls present.`);
