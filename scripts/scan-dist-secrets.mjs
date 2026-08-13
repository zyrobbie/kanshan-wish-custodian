import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const patterns = [/sb_secret_[A-Za-z0-9_-]{20,}/, /gh[pousr]_[A-Za-z0-9_]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /replace-in-supabase-secrets/];
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => { const path = join(dir, entry.name); return entry.isDirectory() ? files(path) : [path]; }); }
if (!existsSync('dist')) throw new Error('dist is missing; build before scanning artifacts.');
const hit = files('dist').find((file) => patterns.some((pattern) => pattern.test(readFileSync(file, 'utf8'))));
if (hit) throw new Error(`Build artifact contains a credential-like value or placeholder: ${hit}`);
console.log('Build artifact scan passed: no private credential patterns or secret placeholders found.');
