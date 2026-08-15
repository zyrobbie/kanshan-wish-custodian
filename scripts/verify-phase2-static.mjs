import { existsSync, readFileSync } from 'node:fs';

const required = [
  ['index.html', 'src/app/main.js'],
  ['diagnostic.html', '/src/main.js'],
  ['src/app/state-machine.js', 'Illegal state transition'],
  ['src/app/timing.js', 'remainingSeconds'],
  ['src/app/pricing.js', 'abandonedTotal'],
  ['src/app/repository.js', 'FixtureUnavailableError'],
  ['src/app/async-task.js', 'AsyncTaskGate'],
  ['src/app/navigation.js', "WISHES: 'wishes'"],
  ['src/app/main.js', '阶段 2 尚未接入真实数据'],
  ['src/app/main.js', 'taskIsCurrent'],
  ['src/app/main.js', 'data-open-wish'],
  ['src/app/main.js', 'visibilitychange'],
  ['src/app/main.js', 'pageshow'],
  ['src/app/styles.css', 'safe-area-inset'],
];
for (const [file, needle] of required) {
  if (!existsSync(file) || !readFileSync(file, 'utf8').includes(needle)) throw new Error(`Missing Phase 2 control: ${file} -> ${needle}`);
}
for (const file of ['src/app/main.js', 'src/app/repository.js', 'src/app/state-machine.js']) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('link_converting')) throw new Error(`Deprecated conversion state found in ${file}`);
  if (text.includes('localStorage')) throw new Error(`Forbidden localStorage use found in ${file}`);
}
if (readFileSync('src/app/main.js', 'utf8').includes('flow = { ...flow, state: States.ARCHIVED }')) {
  throw new Error('Wish-list navigation must not mutate the current flow into archived.');
}
console.log(`Phase 2 static baseline passed: ${required.length} controls present.`);
