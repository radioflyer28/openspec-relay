import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as state from '../src/state.js';

describe('Guardrails-owned v2 paths', () => {
  it('uses an explicit portable registry and Node path APIs at the filesystem boundary', () => {
    const registry = (state as Record<string, unknown>).GUARDRAILS_GENERATED_FILES as
      Record<string, string> | undefined;
    const generatedPath = (state as Record<string, unknown>).guardrailsGeneratedPath as
      ((changeDir: string, key: string, pathApi?: path.PlatformPath) => string) | undefined;

    expect(registry).toMatchObject({
      run: 'run.json',
      assurance: 'assurance.json',
      events: 'events.json',
      v1MigrationBackup: 'reports/v1-migration-backup.json',
      migrationPreview: 'reports/migration-preview.json',
      v1CompatibilityExport: 'reports/v1-compatibility-export.json',
      repositoryContext: 'reports/repository-context.json',
      readiness: 'reports/readiness.json',
      findings: 'reports/findings.json',
      debug: 'reports/debug.json',
      uat: 'reports/uat.json',
      release: 'reports/release.json',
    });
    expect(generatedPath?.('/project/openspec/changes/demo', 'readiness', path.posix))
      .toBe('/project/openspec/changes/demo/.guardrails/reports/readiness.json');
    expect(generatedPath?.('C:\\project\\openspec\\changes\\demo', 'release', path.win32))
      .toBe('C:\\project\\openspec\\changes\\demo\\.guardrails\\reports\\release.json');
  });
});
