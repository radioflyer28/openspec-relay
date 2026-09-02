import { randomUUID } from 'node:crypto';
import {
  VERSION,
  createAgentSession,
  createExtensionRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionContext,
  type ResourceLoader,
} from '@earendil-works/pi-coding-agent';
import { Type } from '@earendil-works/pi-ai';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { openPiExperimentWorkspace } from './experiment-workspace.js';
import type { PiHostProbeRuntimeV1, PiReadOnlyProbeV1 } from './host-adapter.js';
import type {
  PiDispatchEnvelopeV1,
  PiRoleSessionFactoryV1,
  PiRoleSessionV1,
} from './role-dispatch.js';

function minimalResources(systemPrompt: string): ResourceLoader {
  return {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => undefined,
    reload: async () => undefined,
  };
}

async function createRestrictedSession(options: {
  context: ExtensionContext;
  systemPrompt: string;
  toolNames: readonly string[];
  cwd?: string;
  experimentRoot?: string;
}) {
  if (!options.context.model) throw new Error('Active Pi model is unavailable.');
  const experiment = options.experimentRoot
    ? await openPiExperimentWorkspace(options.experimentRoot)
    : undefined;
  const customTools = experiment ? [
    defineTool({
      name: 'experiment_read',
      label: 'Read experiment file',
      description: 'Read a relative file from the confined disposable pathfinder workspace.',
      parameters: Type.Object({ path: Type.String() }),
      async execute(_id, params) {
        return {
          content: [{ type: 'text' as const, text: await experiment.read(params.path) }],
          details: { path: params.path },
        };
      },
    }),
    defineTool({
      name: 'experiment_write',
      label: 'Write experiment file',
      description: 'Write a relative file inside the confined disposable pathfinder workspace.',
      parameters: Type.Object({ path: Type.String(), content: Type.String() }),
      async execute(_id, params) {
        await experiment.write(params.path, params.content);
        return {
          content: [{ type: 'text' as const, text: `Wrote ${params.path}` }],
          details: { path: params.path },
        };
      },
    }),
  ] : [];
  return createAgentSession({
    cwd: options.cwd ?? options.context.cwd,
    model: options.context.model,
    ...(options.context.thinkingLevel ? { thinkingLevel: options.context.thinkingLevel } : {}),
    tools: [...options.toolNames],
    customTools,
    noTools: 'all',
    resourceLoader: minimalResources(options.systemPrompt),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    }),
    sessionManager: SessionManager.inMemory(options.cwd ?? options.context.cwd),
  });
}

const PROBE_START = '<openspec-gsd-probe>';
const PROBE_END = '</openspec-gsd-probe>';

function validProbeOutput(output: string, nonce: string): boolean {
  const matches = [...output.matchAll(/<openspec-gsd-probe>([\s\S]*?)<\/openspec-gsd-probe>/g)];
  if (matches.length !== 1) return false;
  try {
    const parsed = JSON.parse(matches[0]![1]!) as { ok?: unknown; nonce?: unknown };
    return parsed.ok === true && parsed.nonce === nonce;
  } catch {
    return false;
  }
}

async function promptForProbe(
  created: Awaited<ReturnType<typeof createRestrictedSession>>,
  nonce: string,
): Promise<string> {
  let output = '';
  const unsubscribe = created.session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      output += event.assistantMessageEvent.delta;
    }
  });
  try {
    await created.session.prompt(
      `Return exactly ${PROBE_START}{"ok":true,"nonce":"${nonce}"}${PROBE_END} and no other text.`,
      { expandPromptTemplates: false, source: 'extension' },
    );
    return output;
  } finally {
    unsubscribe();
  }
}

async function waitForStreaming(session: { isStreaming: boolean }): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (session.isStreaming) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
}

async function exerciseAbort(
  created: Awaited<ReturnType<typeof createRestrictedSession>>,
  viaTimeout: boolean,
): Promise<boolean> {
  const pending = created.session.prompt('Return the word probe.', {
    expandPromptTemplates: false,
    source: 'extension',
  }).catch(() => undefined);
  if (!(await waitForStreaming(created.session))) {
    await pending;
    return false;
  }
  let timeoutFired = false;
  if (viaTimeout) {
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        timeoutFired = created.session.isStreaming;
        void created.session.abort().finally(resolve);
      }, 1);
    });
  } else {
    await created.session.abort();
  }
  await pending;
  return (!viaTimeout || timeoutFired) && created.session.isIdle && !created.session.isStreaming;
}

export async function createPiSdkProbeRuntime(context: ExtensionContext): Promise<PiHostProbeRuntimeV1> {
  const auth = context.model
    ? await context.modelRegistry.getApiKeyAndHeaders(context.model).catch(() => ({ ok: false as const, error: 'probe failed' }))
    : { ok: false as const, error: 'no model' };
  const createProbe = async (): Promise<PiReadOnlyProbeV1> => {
    const created = await createRestrictedSession({
      context,
      systemPrompt: 'OpenSpec GSD read-only capability probe.',
      toolNames: ['find', 'grep', 'ls', 'read'],
    });
    return {
      toolNames: created.session.getActiveToolNames(),
      exercise: async () => {
        const cancellation = await createRestrictedSession({
          context,
          systemPrompt: 'OpenSpec GSD cancellation capability probe.',
          toolNames: ['find', 'grep', 'ls', 'read'],
        });
        const timeout = await createRestrictedSession({
          context,
          systemPrompt: 'OpenSpec GSD timeout capability probe.',
          toolNames: ['find', 'grep', 'ls', 'read'],
        });
        try {
          const nonce = randomUUID();
          const structuredResults = validProbeOutput(await promptForProbe(created, nonce), nonce);
          return {
            structuredResults,
            cancellation: await exerciseAbort(cancellation, false),
            timeout: await exerciseAbort(timeout, true),
          };
        } finally {
          cancellation.session.dispose();
          timeout.session.dispose();
        }
      },
      dispose: async () => created.session.dispose(),
    };
  };
  return {
    piVersion: VERSION,
    sessionId: context.sessionManager.getSessionId(),
    ...(context.model ? { modelRef: `${context.model.provider}/${context.model.id}` } : {}),
    modelAvailable: Boolean(context.model),
    authenticationAvailable: auth.ok,
    createReadOnlyProbe: createProbe,
    probeParallelism: async () => {
      const probes = await Promise.all([0, 1].map(async () => createRestrictedSession({
        context,
        systemPrompt: 'OpenSpec GSD concurrent structured capability probe.',
        toolNames: ['find', 'grep', 'ls', 'read'],
      })));
      let active = 0;
      let maximum = 0;
      const unsubscribes = probes.map((created) => created.session.subscribe((event) => {
        if (event.type === 'agent_start') {
          active += 1;
          maximum = Math.max(maximum, active);
        }
        if (event.type === 'agent_end') active -= 1;
      }));
      try {
        const nonces = [randomUUID(), randomUUID()];
        const outputs = await Promise.all(probes.map((created, index) => promptForProbe(created, nonces[index]!)));
        return maximum >= 2 && outputs.every((output, index) => validProbeOutput(output, nonces[index]!));
      } finally {
        unsubscribes.forEach((unsubscribe) => unsubscribe());
        probes.forEach((created) => created.session.dispose());
      }
    },
  };
}

export function resolvePiRoleSessionRoots(contextCwd: string, workspace?: string): {
  cwd: string;
  experimentRoot?: string;
} {
  return {
    cwd: contextCwd,
    ...(workspace ? { experimentRoot: workspace } : {}),
  };
}

export function createPiSdkRoleSessionFactory(context: ExtensionContext): PiRoleSessionFactoryV1 {
  return {
    async create(options: Readonly<{
      envelope: PiDispatchEnvelopeV1;
      systemPrompt: string;
      toolNames: readonly string[];
      workspace?: string;
    }>): Promise<PiRoleSessionV1> {
      const roots = resolvePiRoleSessionRoots(context.cwd, options.workspace);
      const created = await createRestrictedSession({
        context,
        systemPrompt: options.systemPrompt,
        toolNames: options.toolNames,
        ...roots,
      });
      const session = created.session;
      return {
        sessionId: session.sessionId,
        toolNames: session.getActiveToolNames(),
        run: async (prompt, signal) => {
          let output = '';
          const unsubscribe = session.subscribe((event) => {
            if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
              output += event.assistantMessageEvent.delta;
            }
          });
          const abort = () => void session.abort();
          signal.addEventListener('abort', abort, { once: true });
          try {
            await session.prompt(prompt, { expandPromptTemplates: false, source: 'extension' });
            return output;
          } finally {
            signal.removeEventListener('abort', abort);
            unsubscribe();
          }
        },
        abort: async () => session.abort(),
        dispose: async () => session.dispose(),
      };
    },
  };
}
