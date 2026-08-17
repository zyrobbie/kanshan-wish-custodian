import { readFileSync } from 'node:fs';

const main = readFileSync('src/app/main.js', 'utf8');
const card = readFileSync('src/app/shopping-card.js', 'utf8');
const domain = readFileSync('src/app/wish-domain.js', 'utf8');
const character = readFileSync('src/app/kanshan-character.js', 'utf8');

for (const [source, needle] of [[main, 'shoppingCardSnapshot'], [main, "setAttribute('href', href)"], [main, '去淘宝看看'], [main, '实际价格以淘宝结算页为准。'], [card, 'promotionHref'], [domain, 'savedPromotionHref'], [character, 'kanshan-${state}']]) {
  if (!source.includes(needle)) throw new Error(`Phase 6 control missing: ${needle}`);
}
for (const unsafe of ['window.open(', 'window.location.assign(', 'taoke-convert']) {
  if (main.includes(unsafe) || card.includes(unsafe)) throw new Error(`Unsafe Phase 6 outbound path: ${unsafe}`);
}
if (!/import\.meta\.env\.DEV/.test(main)) throw new Error('Development test gate must remain DEV-only.');
console.log('Phase 6 static checks passed: snapshot-only card and local presentation controls present.');
