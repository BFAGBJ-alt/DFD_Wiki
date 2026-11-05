#!/usr/bin/env node
// build.mjs：串联 docusaurus build + prune_out + gen_atlas（Phase 2 启用）
// 用法：
//   node scripts/build.mjs              # 完整流程
//   node scripts/build.mjs --skip-prune # 只跑 docusaurus build
//   node scripts/build.mjs --skip-atlas # 跳过 atlas 生成

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// 产物放在 git 仓库之外，同时也在编辑器工作区（...\DFD_WIKI\DFD_WIKI）之外：
// 工作区内 / 工作区旁的删除会被拦截进回收站（每个文件一次登记，几万文件极慢，
// 而且会把回收站塞满）；系统临时目录下是真正的删除，清空产物快很多。
// 可用环境变量 DFD_OUT_DIR 覆盖。
const defaultOutDir = path.join(os.tmpdir(), 'dfd-wiki-build');
const outDir = path.resolve(process.env.DFD_OUT_DIR ?? defaultOutDir);
const skipPrune = process.argv.includes('--skip-prune');
const skipAtlas = process.argv.includes('--skip-atlas');

console.log('[build] REPO_ROOT:', REPO_ROOT);
console.log('[build] outDir:', outDir);

// Step 1: docusaurus build（直接调用 .cmd 比 npx 可靠，尤其在 PowerShell 后台）
console.log('\n=== Step 1: docusaurus build ===');
// 先自己清空产物：工作区外的删除是真正的删除（不进回收站），
// 之后再让 docusaurus 清理一个空目录，几乎零成本。
console.log('[build] clearing outDir ...');
fs.rmSync(outDir, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
// 刚删完 / 杀软扫描时偶发 EPERM，重试几次
for (let attempt = 0; ; attempt++) {
  try {
    fs.mkdirSync(outDir, {recursive: true});
    break;
  } catch (e) {
    if (attempt >= 4) throw e;
    await new Promise((r) => setTimeout(r, 500));
  }
}
try {
  execSync(`node_modules${path.sep}.bin${path.sep}docusaurus.cmd build --out-dir "${outDir}"`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
} catch {
  console.error('[build] FAILED at docusaurus build, aborting');
  process.exit(1);
}

// Step 2: prune 未使用的 Minecraft 原版材质
if (!skipPrune) {
  console.log('\n=== Step 2: prune unused Minecraft assets ===');
  try {
    execSync(`node scripts/prune_out.mjs "${outDir}"`, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  } catch (e) {
    console.warn('[build] prune_out failed (non-fatal):', e.message);
  }
} else {
  console.log('\n=== Step 2: skipped (--skip-prune) ===');
}

// Step 3: gen_atlas（Phase 2 才启用）
if (!skipAtlas) {
  const atlasScript = path.join(__dirname, 'gen_atlas.mjs');
  if (fs.existsSync(atlasScript)) {
    console.log('\n=== Step 3: gen_atlas ===');
    try {
      execSync(`node scripts/gen_atlas.mjs "${outDir}"`, {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
    } catch (e) {
      console.warn('[build] gen_atlas failed (non-fatal):', e.message);
    }
  } else {
    console.log('\n=== Step 3: skipped (gen_atlas.mjs not present — Phase 2 pending) ===');
  }
} else {
  console.log('\n=== Step 3: skipped (--skip-atlas) ===');
}

console.log('\n[build] ✅ Done. Output at:', outDir);
