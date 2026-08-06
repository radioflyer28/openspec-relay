import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('companion CLI', () => {
  it('provides run, check, and run-status entry points', async () => {
    const { root } = await createOpenSpecProject();
    const run = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'run', 'demo', '--project', root, '--mode', 'quick', '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(run.run).toMatchObject({ changeName: 'demo', mode: 'quick', tier: 'tier0' });
    const check = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'check', 'demo', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(check.assurance.status).toBe('fail');
    const status = JSON.parse(execFileSync(process.execPath, [
      'dist/cli.js', 'run-status', 'demo', '--project', root, '--json',
    ], { cwd: process.cwd(), encoding: 'utf8' }));
    expect(status).toMatchObject({ changeName: 'demo', mode: 'quick', tier: 'tier0' });
  });

  it('does not advertise repair when this host has no repair adapter', () => {
    const help = execFileSync(process.execPath, [
      'dist/cli.js', 'check', '--help',
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(help).not.toContain('--repair');
  });
});
