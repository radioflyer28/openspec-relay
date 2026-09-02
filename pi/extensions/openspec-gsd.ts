import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from '@earendil-works/pi-ai';
import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createPiSdkProbeRuntime, createPiSdkRoleSessionFactory } from '../../dist/pi/sdk-runtime.js';
import { executePiWorkflowOperationV1 } from '../../dist/pi/workflow.js';

const binDirectory = fileURLToPath(new URL('../bin/', import.meta.url));

const workflowTool = defineTool({
  name: 'openspec_gsd_workflow',
  label: 'OpenSpec GSD workflow',
  description: 'Run an existing OpenSpec GSD plan, do, check, or status operation with live Pi capability qualification and isolated read-only assurance roles.',
  promptSnippet: 'Use openspec_gsd_workflow for OpenSpec GSD lifecycle operations when available; honor its CLI fallback response.',
  executionMode: 'sequential',
  parameters: Type.Object({
    operation: Type.Union([
      Type.Literal('plan'), Type.Literal('do'), Type.Literal('check'), Type.Literal('status'),
    ]),
    change: Type.String({ description: 'OpenSpec change name.' }),
    pathfinderQuestions: Type.Optional(Type.Array(Type.String())),
  }),
  async execute(_toolCallId, params, signal, _onUpdate, context) {
    const parentSignal = context.signal ?? signal;
    const result = await executePiWorkflowOperationV1({
      operation: params.operation,
      change: params.change,
      projectRoot: context.cwd,
      runtime: await createPiSdkProbeRuntime(context),
      factory: createPiSdkRoleSessionFactory(context),
      ...(params.pathfinderQuestions ? { pathfinderQuestions: params.pathfinderQuestions } : {}),
      ...(parentSignal ? { parentSignal } : {}),
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});

export default function loadOpenSpecGsdRuntime(pi: ExtensionAPI): void {
  const entries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  if (!entries.includes(binDirectory)) {
    process.env.PATH = [binDirectory, ...entries].join(path.delimiter);
  }
  pi.registerTool(workflowTool);
}
