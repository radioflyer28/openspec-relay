import path from 'node:path';
import { fileURLToPath } from 'node:url';

const binDirectory = fileURLToPath(new URL('../bin/', import.meta.url));

export default function loadOpenSpecGsdRuntime(): void {
  const entries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  if (!entries.includes(binDirectory)) {
    process.env.PATH = [binDirectory, ...entries].join(path.delimiter);
  }
}
