import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'drift-tests-'));
try {
  const outfile = join(dir, 'tests.mjs');
  await build({ entryPoints: ['tests/engine.test.ts'], bundle: true, platform: 'node', format: 'esm', define: { 'import.meta.env': '{"BASE_URL":"/"}' }, outfile });
  await import(pathToFileURL(outfile).href);
} finally { await rm(dir, { recursive: true, force: true }); }
