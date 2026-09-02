import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as state from '../src/state.js';
import { startRelayRunV2 } from '../src/runner-v2.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

describe('OpenSpec Relay-owned v2 paths', () => {
  it('uses an explicit portable registry and Node path APIs at the filesystem boundary', () => {
    const registry = (state as Record<string, unknown>).RELAY_GENERATED_FILES as
      Record<string, string> | undefined;
    const generatedPath = (state as Record<string, unknown>).relayGeneratedPath as
      ((changeDir: string, key: string, pathApi?: path.PlatformPath) => string) | undefined;

    expect(registry).toEqual({
      run: 'run.json',
      assurance: 'assurance.json',
      events: 'events.json',
    });
    expect(generatedPath?.('/project/openspec/changes/demo', 'events', path.posix))
      .toBe('/project/openspec/changes/demo/.openspec-relay/events.json');
    expect(generatedPath?.('C:\\project\\openspec\\changes\\demo', 'assurance', path.win32))
      .toBe('C:\\project\\openspec\\changes\\demo\\.openspec-relay\\assurance.json');
  });

  it('starts cleanly under Relay without reading or rewriting disposable pre-release records', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const legacyDir = path.join(changeDir, '.openspec-gsd');
    const relayDir = path.join(changeDir, '.openspec-relay');
    await fs.mkdir(legacyDir);
    await fs.writeFile(path.join(legacyDir, 'sentinel.txt'), 'disposable development record\n');

    const result = await startRelayRunV2({ change: 'demo', projectRoot: root });

    expect(result.run.gateIds).toEqual(['relay.assurance']);
    expect(await fs.readFile(path.join(legacyDir, 'sentinel.txt'), 'utf8'))
      .toBe('disposable development record\n');
    expect((await fs.readdir(relayDir)).sort()).toEqual(['assurance.json', 'events.json', 'run.json']);
  });
});
