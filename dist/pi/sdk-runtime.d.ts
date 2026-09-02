import { type ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { PiHostProbeRuntimeV1 } from './host-adapter.js';
import type { PiRoleSessionFactoryV1 } from './role-dispatch.js';
export declare function createPiSdkProbeRuntime(context: ExtensionContext): Promise<PiHostProbeRuntimeV1>;
export declare function resolvePiRoleSessionRoots(contextCwd: string, workspace?: string): {
    cwd: string;
    experimentRoot?: string;
};
export declare function createPiSdkRoleSessionFactory(context: ExtensionContext): PiRoleSessionFactoryV1;
//# sourceMappingURL=sdk-runtime.d.ts.map