import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
const nonInteractiveEnvironment = {
  ...process.env,
  CI: 'true',
  NO_COLOR: '1',
  OPENSPEC_NO_UPDATE_CHECK: '1',
  OPENSPEC_TELEMETRY: '0',
  DO_NOT_TRACK: '1',
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('actual packed companion candidate', () => {
  it('installs with the core seam and exposes all seven workflows through host discovery', async () => {
    const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd actual candidate '));
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gsd installed host '));
    roots.push(artifactRoot, projectRoot);
    const packageRoot = process.cwd();
    const coreRoot = path.resolve(packageRoot, '..', 'OpenSpec');
    const packed = JSON.parse(execFileSync('npm', [
      'pack', '--json', '--ignore-scripts', '--pack-destination', artifactRoot,
    ], { cwd: packageRoot, encoding: 'utf8' })) as Array<{
      filename: string;
      files: Array<{ path: string }>;
    }>;
    expect(packed).toHaveLength(1);
    const candidate = path.join(artifactRoot, packed[0].filename);
    const fileList = packed[0].files.map((item) => item.path).sort();
    expect(fileList).toEqual(expect.arrayContaining([
      'package.json', 'openspec-extension.json', 'dist/cli.js', 'dist/gate.js',
      'workflows/plan.md', 'workflows/do.md', 'workflows/check.md', 'workflows/status.md',
      'workflows/debug.md', 'workflows/uat.md',
    ]));
    expect(createHash('sha256').update(await fs.readFile(candidate)).digest('hex')).toMatch(/^[a-f0-9]{64}$/);

    await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
      private: true,
      name: 'gsd-installed-host',
      dependencies: {
        '@fission-ai/openspec': `file:${coreRoot}`,
        'openspec-gsd': `file:${candidate}`,
      },
    }));
    execFileSync('npm', [
      'install', '--offline', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund',
      '--package-lock=false',
    ], { cwd: projectRoot, encoding: 'utf8', timeout: 30_000, env: nonInteractiveEnvironment });
    const installedCompanion = path.join(projectRoot, 'node_modules', 'openspec-gsd');
    const installedManifest = JSON.parse(await fs.readFile(path.join(installedCompanion, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
      peerDependencies: Record<string, string>;
      files: string[];
    };
    expect(installedManifest).toMatchObject({
      name: 'openspec-gsd',
      version: '0.1.0',
      peerDependencies: { '@fission-ai/openspec': '>=1.8.0-gsd.1 <2.0.0' },
    });

    const coreCli = path.join(projectRoot, 'node_modules', '@fission-ai', 'openspec', 'bin', 'openspec.js');
    execFileSync(process.execPath, [coreCli, 'init', '--tools', 'codex', '--force', '--no-animation'], {
      cwd: projectRoot, encoding: 'utf8', timeout: 15_000, env: nonInteractiveEnvironment,
    });
    const linked = execFileSync(process.execPath, [coreCli, 'extension', 'link', installedCompanion], {
      cwd: projectRoot, encoding: 'utf8', timeout: 15_000, env: nonInteractiveEnvironment,
    });
    expect(linked).toContain('workflows=7');
    const listed = execFileSync(process.execPath, [coreCli, 'extension', 'list'], {
      cwd: projectRoot, encoding: 'utf8', timeout: 15_000, env: nonInteractiveEnvironment,
    });
    expect(listed).toMatch(/gsd@0\.1\.0.*compatibility=compatible.*workflows=7/);
    const doctor = execFileSync(process.execPath, [coreCli, 'extension', 'doctor', 'gsd'], {
      cwd: projectRoot, encoding: 'utf8', timeout: 15_000, env: nonInteractiveEnvironment,
    });
    expect(doctor).toMatch(/manifest=valid; compatibility=compatible/);

    for (const workflow of ['discuss', 'plan', 'do', 'check', 'status', 'debug', 'uat']) {
      const skill = await fs.readFile(path.join(
        projectRoot, '.agents', 'skills', `openspec-${workflow}`, 'SKILL.md',
      ), 'utf8');
      expect(skill).toContain(`openspec-extension:gsd@0.1.0/${workflow}/codex/skill`);
      expect(skill).toContain(workflow === 'discuss' ? 'Interview the user relentlessly' : 'openspec-gsd');
    }
    const help = execFileSync(process.execPath, [
      path.join(installedCompanion, 'dist', 'cli.js'), '--help',
    ], { cwd: projectRoot, encoding: 'utf8' });
    for (const command of ['plan', 'do', 'check', 'status', 'debug', 'uat']) expect(help).toContain(command);
    expect(help).not.toMatch(/^\s+run(?:-status)?\s/m);
  }, 60_000);
});
