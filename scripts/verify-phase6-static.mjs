import { existsSync, readFileSync } from 'node:fs';

const main = readFileSync('src/app/main.js', 'utf8');
const card = readFileSync('src/app/shopping-card.js', 'utf8');
const domain = readFileSync('src/app/wish-domain.js', 'utf8');
const styles = readFileSync('src/app/styles.css', 'utf8');

for (const [source, needle] of [[main, 'shoppingCardSnapshot'], [main, "setAttribute('href', href)"], [main, '去淘宝看看'], [main, '实际价格以淘宝结算页为准。'], [card, 'promotionHref'], [domain, 'savedPromotionHref'], [main, '看山·愿望寄存处'], [main, 'home-reference-original.png'], [main, 'liu-kanshan-wave-transparent.png'], [main, '查看你寄存的愿望清单'], [main, 'import.meta.env.BASE_URL'], [styles, '.home-counter-mask {'], [styles, '.home-gesture-mask {'], [styles, '.home-hint {'], [styles, 'font-size: clamp(14px']]) {
  if (!source.includes(needle)) throw new Error(`Phase 6 control missing: ${needle}`);
}
if (main.includes('home-summary') || main.includes('kanshanCharacter') || existsSync('src/app/kanshan-character.js')) throw new Error('Homepage must not retain dynamic summary or temporary SVG mascot.');
for (const asset of ['public/assets/kanshan-home/home-reference-original.png', 'public/assets/kanshan-home/liu-kanshan-wave-transparent.png']) if (!existsSync(asset)) throw new Error(`Homepage asset missing: ${asset}`);
if (/src=["'`]\/assets\/kanshan-home\//.test(main)) throw new Error('Homepage assets must honor the configured Pages base path.');
for (const unsafe of ['window.open(', 'window.location.assign(', 'taoke-convert']) {
  if (main.includes(unsafe) || card.includes(unsafe)) throw new Error(`Unsafe Phase 6 outbound path: ${unsafe}`);
}
if (!/import\.meta\.env\.DEV/.test(main)) throw new Error('Development test gate must remain DEV-only.');
console.log('Phase 6 static checks passed: snapshot-only card and local presentation controls present.');
