import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several integration files spawn the real OpenSpec CLI. Serializing files
    // avoids process storms and platform-dependent timeouts on shared CI hosts.
    fileParallelism: false,
  },
});
