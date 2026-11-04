// Removes build output and caches. Safe: never touches source or node_modules
// unless you pass --all.
import { rmSync } from 'node:fs';
const targets = ['.next', 'out', 'coverage', 'node_modules/.cache', 'node_modules/.vite', 'node_modules/.vitest'];
if (process.argv.includes('--all')) targets.push('node_modules');
for (const t of targets) {
  rmSync(t, { recursive: true, force: true });
  console.log('removed', t);
}
