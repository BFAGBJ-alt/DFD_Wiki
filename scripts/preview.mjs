#!/usr/bin/env node
// preview.mjs：本地预览构建产物（与 build.mjs 使用同一个 outDir）
// 用法：node scripts/preview.mjs    （端口可用 DFD_PREVIEW_PORT 覆盖，默认 3001）

import {execSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const defaultOutDir = path.join(os.tmpdir(), 'dfd-wiki-build');
const outDir = path.resolve(process.env.DFD_OUT_DIR ?? defaultOutDir);
const port = process.env.DFD_PREVIEW_PORT ?? '3001';

console.log(`[preview] serving ${outDir} on http://localhost:${port}/`);

execSync(
  `node_modules${path.sep}.bin${path.sep}docusaurus.cmd serve --dir "${outDir}" --port ${port} --no-open`,
  {cwd: REPO_ROOT, stdio: 'inherit'},
);
