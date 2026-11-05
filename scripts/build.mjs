#!/usr/bin/env node
// build.mjs：串联 docusaurus build + prune_out + gen_atlas（Phase 2 启用）
// 用法：
//   node scripts/build.mjs              # 完整流程
//   node scripts/build.mjs --skip-prune # 只跑 docusaurus build
//   node scripts/build.mjs --skip-atlas # 跳过 atlas 生成

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const outDir = path.resolve(REPO_ROOT, '..', '_site_build');
const skipPrune = process.argv.includes('--skip-prune');
const skipAtlas = process.argv.includes('--skip-atlas');

console.log('[build] REPO_ROOT:', REPO_ROOT);
console.log('[build] outDir:', outDir);

// Step 1: docusaurus build（直接调用 .cmd 比 npx 可靠，尤其在 PowerShell 后台）
console.log('\n=== Step 1: docusaurus build ===');
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
