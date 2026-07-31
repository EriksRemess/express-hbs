import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedDir = path.join(rootDir, 'types');
const generatedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'express-hbs-types-'));

async function listFiles(root, current = root) {
  const files = [];
  const entries = await fs.readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, entryPath));
    } else if (entry.isFile()) {
      files.push(path.relative(root, entryPath));
    }
  }

  return files;
}

try {
  const tscPath = path.join(rootDir, 'node_modules/typescript/bin/tsc');
  await execFileAsync(process.execPath, [
    tscPath,
    '-p',
    path.join(rootDir, 'tsconfig.types.json'),
    '--outDir',
    generatedDir
  ]);

  await fs.mkdir(path.join(generatedDir, 'lib'), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, 'lib/handlebars.d.ts'),
    path.join(generatedDir, 'lib/handlebars.d.ts')
  );

  const expectedFiles = (await listFiles(expectedDir)).sort();
  const generatedFiles = (await listFiles(generatedDir)).sort();
  const allFiles = new Set([...expectedFiles, ...generatedFiles]);
  const changedFiles = [];

  for (const filename of allFiles) {
    if (!expectedFiles.includes(filename) || !generatedFiles.includes(filename)) {
      changedFiles.push(filename);
      continue;
    }

    const [expected, generated] = await Promise.all([
      fs.readFile(path.join(expectedDir, filename)),
      fs.readFile(path.join(generatedDir, filename))
    ]);
    if (!expected.equals(generated)) {
      changedFiles.push(filename);
    }
  }

  if (changedFiles.length > 0) {
    throw new Error(`Generated declarations are stale:\n${changedFiles.join('\n')}`);
  }
} finally {
  await fs.rm(generatedDir, { recursive: true, force: true });
}
