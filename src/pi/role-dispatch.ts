import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  FindingScopeV2Schema,
  PortableReferenceV2Schema,
  SemanticClassificationV1Schema,
} from '../schemas.js';
import type {
  ExecutionRole,
  RoleDispatcherV1,
  RoleRequestV1,
  RoleResultV1,
} from '../execution-adapters.js';
import {
  PI_READ_ONLY_TOOLS,
  type PiHostCapabilityProfileV1,
} from './host-adapter.js';

const ASSURANCE_ROLES = new Set<ExecutionRole>(['plan_reviewer', 'pathfinder', 'reviewer', 'verifier']);
const RESULT_START = '<openspec-gsd-result>';
const RESULT_END = '</openspec-gsd-result>';

const ReportedFindingV2Schema = z.object({
  providerId: z.string().min(1),
  ruleId: z.string().min(1),
  category: z.string().min(1),
  scope: FindingScopeV2Schema,
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  blocking: z.boolean(),
  summary: z.string().min(1),
  requirementIds: z.array(z.string().min(1)).optional(),
  taskIds: z.array(z.string().min(1)).optional(),
  evidence: z.array(PortableReferenceV2Schema).optional(),
}).strict();

const PiRoleResultV1Schema = z.object({
  status: z.enum(['pass', 'fail', 'error']),
  summary: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
  evidence: z.array(PortableReferenceV2Schema).optional(),
  findings: z.array(ReportedFindingV2Schema).optional(),
  semanticClassifications: z.array(SemanticClassificationV1Schema).optional(),
  pathfinder: z.object({
    assumptions: z.array(z.string().min(1)),
    experiments: z.array(z.string().min(1)),
    observations: z.array(z.string().min(1)),
    counterexamples: z.array(z.string().min(1)),
    conclusion: z.string().min(1),
    confidence: z.enum(['high', 'medium', 'low']),
    routing: z.enum(['planner', 'discussion', 'human_needed']),
  }).strict().optional(),
  scopeExpansion: z.boolean().optional(),
}).strict();

const PiRoleOutputV1Schema = z.object({
  dispatchId: z.string().min(1),
  parentSessionId: z.string().min(1),
  childSessionId: z.string().min(1),
  role: z.enum(['plan_reviewer', 'pathfinder', 'reviewer', 'verifier']),
  changeName: z.string().min(1),
  planRevision: z.string().regex(/^[a-f0-9]{64}$/),
  result: PiRoleResultV1Schema,
}).strict();

export interface PiDispatchEnvelopeV1 {
  readonly version: 1;
  readonly dispatchId: string;
  readonly parentSessionId: string;
  readonly role: 'plan_reviewer' | 'pathfinder' | 'reviewer' | 'verifier';
  readonly changeName: string;
  readonly planRevision: string;
  readonly authority: 'read_only' | 'experiment_confined';
  readonly evidenceRequirements: readonly string[];
  readonly deadline: string;
  readonly cancellationId: string;
}

export interface PiRoleSessionV1 {
  sessionId: string;
  toolNames: string[];
  run(prompt: string, signal: AbortSignal): Promise<string>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}

export interface PiRoleSessionFactoryV1 {
  create(options: Readonly<{
    envelope: PiDispatchEnvelopeV1;
    systemPrompt: string;
    toolNames: readonly string[];
    workspace?: string;
  }>): Promise<PiRoleSessionV1>;
}

function errorResult(summary: string): RoleResultV1 {
  return { status: 'error', summary, evidenceRefs: [] };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function compileRolePrompt(
  request: RoleRequestV1,
  envelope: PiDispatchEnvelopeV1,
  childSessionId: string,
): string {
  const planning = request.planning!;
  const roleInstruction = request.role === 'plan_reviewer'
    ? 'Review whether the plan is sufficient to achieve and verify the requirements. Do not require implementation evidence or passing execution checks before implementation; pending execution checks are expected during planning.'
    : request.role === 'pathfinder'
      ? 'Answer only the focused planning uncertainty. Do not treat intentionally unimplemented approved tasks as a defect.'
      : 'Evaluate the completed implementation using observable repository and test evidence; executor claims alone are insufficient.';
  const resultShape = request.role === 'pathfinder'
    ? 'result must also contain pathfinder={assumptions:string[],experiments:string[],observations:string[],counterexamples:string[],conclusion:string,confidence:"high"|"medium"|"low",routing:"planner"|"discussion"|"human_needed"}.'
    : 'result may also contain structured findings or semantic classifications when applicable.';
  return [
    `Role: ${request.role}`,
    `Change: ${planning.changeName}`,
    `Plan revision: ${planning.planRevision}`,
    `Authoritative artifact references: ${planning.artifactRefs.join(', ')}`,
    `Semantic obligations: ${planning.semanticObligations.join(', ') || 'none'}`,
    `Evidence requirements: ${planning.evidenceRequirements.join('; ') || 'none'}`,
    roleInstruction,
    ...(planning.pathfinderQuestion ? [`Focused pathfinder question: ${planning.pathfinderQuestion}`] : []),
    'Use only the provided read-only tools. Do not modify the project or planning artifacts.',
    `Finish with exactly one ${RESULT_START}{JSON}${RESULT_END} envelope.`,
    'The JSON must contain dispatchId, parentSessionId, childSessionId, role, changeName, planRevision, ' +
      'and result={status:"pass"|"fail"|"error",summary:string,evidenceRefs:string[]}.',
    resultShape,
    'If result.findings is present, each finding requires providerId, ruleId, category, scope={kind,identity}, severity, blocking, and summary. Do not provide a findingId.',
    `Echo dispatchId=${envelope.dispatchId}, parentSessionId=${envelope.parentSessionId}, ` +
      `childSessionId=${childSessionId}, role=${envelope.role}, ` +
      `changeName=${envelope.changeName}, and planRevision=${envelope.planRevision}.`,
  ].join('\n');
}

function parseOutput(output: string): unknown {
  const matches = [...output.matchAll(/<openspec-gsd-result>([\s\S]*?)<\/openspec-gsd-result>/g)];
  if (matches.length !== 1) throw new Error(`Expected exactly one structured result envelope; received ${matches.length}.`);
  return JSON.parse(matches[0]![1]!);
}

export function createPiRoleDispatcher(options: {
  profile: PiHostCapabilityProfileV1;
  factory: PiRoleSessionFactoryV1;
  currentRevision(changeName: string): Promise<string>;
  timeoutMs?: number;
  parentSignal?: AbortSignal;
  now?: () => Date;
}): RoleDispatcherV1 {
  return {
    async dispatch(request): Promise<RoleResultV1> {
      if (options.profile.agentDispatch.state !== 'available' || !options.profile.sessionId) {
        return errorResult(`Pi isolated dispatch is unavailable: ${options.profile.agentDispatch.reason}`);
      }
      if (!ASSURANCE_ROLES.has(request.role) || !request.readOnly || !request.isolated) {
        return errorResult(`Pi assurance adapter rejects role '${request.role}' without enforced isolated read-only authority.`);
      }
      if (!request.planning) return errorResult('Pi assurance dispatch requires revision-bound planning context.');
      if (await options.currentRevision(request.planning.changeName) !== request.planning.planRevision) {
        return errorResult('Pi assurance dispatch is stale before execution because the semantic plan revision changed.');
      }

      const now = options.now ?? (() => new Date());
      const timeoutMs = options.timeoutMs ?? 120_000;
      const controller = new AbortController();
      let abortKind: 'timeout' | 'cancelled' | undefined;
      const cancelFromParent = () => {
        abortKind = 'cancelled';
        controller.abort(options.parentSignal?.reason ?? new Error('Parent Pi session cancelled dispatch.'));
      };
      if (options.parentSignal?.aborted) cancelFromParent();
      else options.parentSignal?.addEventListener('abort', cancelFromParent, { once: true });
      const timeout = setTimeout(() => {
        abortKind = 'timeout';
        controller.abort(new Error(`Pi role dispatch timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      const deadline = new Date(now().getTime() + timeoutMs).toISOString();
      const envelope: PiDispatchEnvelopeV1 = Object.freeze({
        version: 1,
        dispatchId: `pi-dispatch:${randomUUID()}`,
        parentSessionId: options.profile.sessionId,
        role: request.role as PiDispatchEnvelopeV1['role'],
        changeName: request.planning.changeName,
        planRevision: request.planning.planRevision,
        authority: request.role === 'pathfinder' && request.workspace &&
          request.planning.disposableExperimentWorkspace ? 'experiment_confined' : 'read_only',
        evidenceRequirements: Object.freeze([...request.planning.evidenceRequirements]),
        deadline,
        cancellationId: `pi-cancel:${randomUUID()}`,
      });
      let session: PiRoleSessionV1 | undefined;
      try {
        const toolNames = envelope.authority === 'experiment_confined'
          ? [...PI_READ_ONLY_TOOLS, 'experiment_read', 'experiment_write']
          : PI_READ_ONLY_TOOLS;
        session = await options.factory.create({
          envelope,
          systemPrompt: 'You are an isolated OpenSpec GSD assurance role. Return evidence, not self-certification.',
          toolNames,
          ...(request.workspace ? { workspace: request.workspace } : {}),
        });
        if (!sameStrings(session.toolNames, toolNames)) {
          return errorResult(`Pi host authority violation: child tools were ${session.toolNames.sort().join(', ') || 'none'}.`);
        }
        const output = await session.run(compileRolePrompt(request, envelope, session.sessionId), controller.signal);
        if (controller.signal.aborted) {
          return errorResult(abortKind === 'timeout' ? 'Pi role dispatch timed out.' : 'Pi role dispatch was cancelled.');
        }
        if (await options.currentRevision(request.planning.changeName) !== request.planning.planRevision) {
          return errorResult('Pi assurance result is stale because the semantic plan revision changed during dispatch.');
        }
        const parsed = PiRoleOutputV1Schema.parse(parseOutput(output));
        const identities: Array<[string, unknown, unknown]> = [
          ['dispatchId', parsed.dispatchId, envelope.dispatchId],
          ['parentSessionId', parsed.parentSessionId, envelope.parentSessionId],
          ['childSessionId', parsed.childSessionId, session.sessionId],
          ['role', parsed.role, envelope.role],
          ['changeName', parsed.changeName, envelope.changeName],
          ['planRevision', parsed.planRevision, envelope.planRevision],
        ];
        const mismatch = identities.find(([, actual, expected]) => actual !== expected);
        if (mismatch) return errorResult(`Pi role result identity mismatch for ${mismatch[0]}.`);
        const result: RoleResultV1 = parsed.result;
        if (result.status === 'pass' && envelope.evidenceRequirements.length > 0 && result.evidenceRefs.length === 0) {
          return errorResult('Pi role result omitted evidence required by the dispatch contract.');
        }
        return result;
      } catch (error) {
        if (controller.signal.aborted) {
          return errorResult(abortKind === 'timeout' ? 'Pi role dispatch timed out.' : 'Pi role dispatch was cancelled.');
        }
        return errorResult(`Pi role result rejected: ${(error as Error).message}`);
      } finally {
        clearTimeout(timeout);
        options.parentSignal?.removeEventListener('abort', cancelFromParent);
        if (controller.signal.aborted) await session?.abort().catch(() => undefined);
        await session?.dispose().catch(() => undefined);
      }
    },
  };
}
