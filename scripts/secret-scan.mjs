import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ignored = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const allowedExamples = new Set(['.env.example', 'PROJECT_SPEC.md']);
const patterns = [
  { name: 'Supabase secret key', expression: /sb_secret_[A-Za-z0-9_-]{20,}/g },
  { name: 'GitHub token', expression: /gh[pousr]_[A-Za-z0-9_]{20,}/g },
  { name: 'private key', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'credential assignment', expression: /(?:TAOBAO_APP_SECRET|ZHIHU_ACCESS_SECRET|TAOKE_CONVERT_ACCESS_KEY)\s*=\s*(?!replace-|your-|\$)[^\s]+/g },
];
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => { const path = join(dir, entry.name); return entry.isDirectory() ? (ignored.has(entry.name) ? [] : files(path)) : [path]; }); }
const hits = [];
for (const path of files(process.cwd())) {
  const projectPath = relative(process.cwd(), path);
  if ((projectPath.startsWith('.env') && projectPath !== '.env.example') || allowedExamples.has(projectPath) || statSync(path).size > 1_000_000) continue;
  const text = readFileSync(path, 'utf8');
  for (const pattern of patterns) if (text.match(pattern.expression)) hits.push(`${projectPath}: ${pattern.name}`);
}
if (hits.length) { console.error(`Secret scan failed:\n${hits.join('\n')}`); process.exit(1); }
console.log('Secret scan passed: no credential-like values found in tracked source baseline.');
