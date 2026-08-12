import { promises as fs } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import * as runner from '../src/runner-v2.js';
import * as status from '../src/status.js';
import { cleanupTemporaryRoots, createOpenSpecProject } from './helpers.js';

afterEach(cleanupTemporaryRoots);

const requirementId = 'spec:demo#requirement:demonstrate-behavior';
const scenarioId = `${requirementId}/scenario:works`;
const readinessTask = {
  requirementRefs: [requirementId], scenarioRefs: [scenarioId], expectedVerification: ['targeted-tests', 'compatibility'],
};

describe('Guardrails v2 run pipeline', () => {
  it('records context and independent readiness before offering execution work', async () => {
    const { root } = await createOpenSpecProject();
    const start = (runner as Record<string, unknown>).startGuardrailsRunV2 as (input: Record<string, unknown>) => Promise<{
      run: { version: number }; assurance: { readiness?: { status: string }; repositoryContext?: { status: string } }; blockedBeforeExecution: boolean;
    }>;
    const result = await start({ change: 'demo', projectRoot: root, config: {
      taskOverrides: { '1.1': readinessTask, '1.2': readinessTask },
      features: { readiness: { rollout: 'required' } },
    } });
    expect(result).toMatchObject({ run: { version: 2 }, assurance: { readiness: { status: 'pass' }, repositoryContext: { status: 'current' } },
      blockedBeforeExecution: false });
    const runStatus = await (status as Record<string, unknown>).getRunStatusV2({ change: 'demo', projectRoot: root }) as {
      repositoryContext: { status: string }; readiness: { status: string }; nextActions: string[];
    };
    expect(runStatus).toMatchObject({ repositoryContext: { status: 'current' }, readiness: { status: 'pass' } });
    expect(runStatus.nextActions).toEqual(expect.any(Array));
  }, 30_000);

  it('stops required-rollout unready changes before task writes but supports report-only migration', async () => {
    const { root, changeDir } = await createOpenSpecProject();
    const start = (runner as Record<string, unknown>).startGuardrailsRunV2 as (input: Record<string, unknown>) => Promise<{
      assurance: { readiness?: { status: string } }; blockedBeforeExecution: boolean;
    }>;
    const required = await start({ change: 'demo', projectRoot: root, config: { features: { readiness: { rollout: 'required' } } } });
    expect(required).toMatchObject({ assurance: { readiness: { status: 'fail' } }, blockedBeforeExecution: true });
    expect(await fs.readFile(`${changeDir}/tasks.md`, 'utf8')).toContain('- [ ] 1.1');

    const { root: reportRoot } = await createOpenSpecProject('report-only');
    const reportOnly = await start({ change: 'report-only', projectRoot: reportRoot });
    expect(reportOnly).toMatchObject({ assurance: { readiness: { status: 'fail' } }, blockedBeforeExecution: false });
  }, 30_000);
});
