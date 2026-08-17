import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
if (!existsSync(dist)) throw new Error('Release artifact is missing; run the default production build first.');
if (existsSync(join(dist, 'diagnostic.html'))) throw new Error('Release artifact must not publish diagnostic.html.');

function textFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return textFiles(path);
    return /\.(?:html|js|css)$/.test(entry.name) ? [path] : [];
  });
}

const bundle = textFiles(dist).map((path) => readFileSync(path, 'utf8')).join('\n');
const forbidden = [
  '阶段 1：身份与部署诊断',
  '运行两用户 RLS 越权测试',
  '运行淘宝搜索真实冒烟',
  '运行知乎搜索真实冒烟',
  '运行淘客转链真实冒烟',
  '发送绑定验证码',
  '发送已有账户登录验证码',
  '验证登录验证码',
];

for (const phrase of forbidden) {
  if (bundle.includes(phrase)) throw new Error(`Release artifact contains a diagnostic-only entry: ${phrase}`);
}

console.log('Release artifact check passed: product-only dist excludes phase 1 diagnostic controls.');
