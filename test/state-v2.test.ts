import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as state from '../src/state.js';

describe('OpenSpec GSD-owned v2 paths', () => {
  it('uses an explicit portable registry and Node path APIs at the filesystem boundary', () => {
    const registry = (state as Record<string, unknown>).GSD_GENERATED_FILES as
      Record<string, string> | undefined;
    const generatedPath = (state as Record<string, unknown>).gsdGeneratedPath as
      ((changeDir: string, key: string, pathApi?: path.PlatformPath) => string) | undefined;

    expect(registry).toEqual({
      run: 'run.json',
      assurance: 'assurance.json',
      events: 'events.json',
    });
    expect(generatedPath?.('/project/openspec/changes/demo', 'events', path.posix))
      .toBe('/project/openspec/changes/demo/.openspec-gsd/events.json');
    expect(generatedPath?.('C:\\project\\openspec\\changes\\demo', 'assurance', path.win32))
      .toBe('C:\\project\\openspec\\changes\\demo\\.openspec-gsd\\assurance.json');
  });
});
