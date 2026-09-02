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
      supportsCancellation: typeof created.session.abort === 'function',
      supportsTimeout: typeof AbortController === 'function',
      supportsStructuredResults: true,
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
      const probes = await Promise.all([createProbe(), createProbe()]);
      try {
        return probes.every((probe) => probe.toolNames.join(',') === 'read,grep,find,ls' ||
          [...probe.toolNames].sort().join(',') === 'find,grep,ls,read');
      } finally {
        await Promise.all(probes.map((probe) => probe.dispose()));
      }
    },
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
      const created = await createRestrictedSession({
        context,
        systemPrompt: options.systemPrompt,
        toolNames: options.toolNames,
        cwd: options.workspace ?? context.cwd,
        ...(options.workspace ? { experimentRoot: options.workspace } : {}),
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
