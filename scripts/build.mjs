import { execFileSync } from 'node:child_process';
import { chmodSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
execFileSync(process.execPath, [fileURLToPath(new URL('./generate-pi-resources.mjs', import.meta.url))], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
});
rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
});
chmodSync(new URL('../dist/cli.js', import.meta.url), 0o755);
chmodSync(new URL('../pi/bin/openspec-gsd', import.meta.url), 0o755);
