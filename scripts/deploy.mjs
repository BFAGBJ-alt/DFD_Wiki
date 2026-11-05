#!/usr/bin/env node
// deploy.mjs：一键发布到 GitHub Pages 仓库
//
// 流程：构建（baseUrl=/wiki_page/）→ 更新部署仓库副本 → 覆盖产物 → 提交 → 推送
// 用法：
//   npm run deploy
// 可覆盖的环境变量：
//   DFD_PAGES_REPO   目标仓库（默认 https://github.com/BFAGBJ-alt/wiki_page.git）
//   DFD_PAGES_BRANCH 目标分支（默认 main）
//   DFD_DEPLOY_DIR   本地部署目录（默认 %LOCALAPPDATA%\wiki_page_deploy）
//   DFD_SITE_URL / DFD_BASE_URL / DFD_GIT_NAME / DFD_GIT_EMAIL

import {execSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PAGES_REPO = process.env.DFD_PAGES_REPO ?? 'https://github.com/BFAGBJ-alt/wiki_page.git';
const BRANCH = process.env.DFD_PAGES_BRANCH ?? 'main';
const DEPLOY_DIR =
  process.env.DFD_DEPLOY_DIR ?? path.join(os.tmpdir(), 'wiki_page_deploy');
const SITE_URL = process.env.DFD_SITE_URL ?? 'https://BFAGBJ-alt.github.io';
const BASE_URL = process.env.DFD_BASE_URL ?? '/wiki_page/';
const GIT_NAME = process.env.DFD_GIT_NAME ?? 'BFAGBJ';
const GIT_EMAIL = process.env.DFD_GIT_EMAIL ?? '1373176509@qq.com';

const outDir = path.resolve(
  process.env.DFD_OUT_DIR ?? path.join(os.tmpdir(), 'dfd-wiki-build'),
);

function run(cmd, opts = {}) {
  return execSync(cmd, {cwd: REPO_ROOT, stdio: 'inherit', ...opts});
}

function git(args) {
  return execSync(`git ${args}`, {
    cwd: DEPLOY_DIR,
    stdio: 'pipe',
    encoding: 'utf8',
  }).trim();
}

// 1. 构建（产物已由 build.mjs 清空 + prune + atlas）
const skipBuild = process.argv.includes('--skip-build');
if (skipBuild) {
  console.log('\n=== [deploy] skip build (--skip-build) ===');
} else {
  console.log(`\n=== [deploy] build (baseUrl=${BASE_URL}) ===`);
  run('node scripts/build.mjs', {
    env: {...process.env, DFD_SITE_URL: SITE_URL, DFD_BASE_URL: BASE_URL},
  });
}

// 2. 准备部署仓库
console.log(`\n=== [deploy] prepare ${DEPLOY_DIR} ===`);
if (!fs.existsSync(path.join(DEPLOY_DIR, '.git'))) {
  fs.rmSync(DEPLOY_DIR, {recursive: true, force: true});
  fs.mkdirSync(path.dirname(DEPLOY_DIR), {recursive: true});
  run(`git clone "${PAGES_REPO}" "${DEPLOY_DIR}"`);
} else {
  try {
    git('fetch origin');
    git(`rev-parse --verify origin/${BRANCH}`);
    git(`checkout -B ${BRANCH} origin/${BRANCH}`);
  } catch {
    // 远程还是空仓库：本地分支自己建
    git(`checkout -B ${BRANCH}`);
  }
}

// 3. 覆盖产物（保留 .git）
console.log('[deploy] sync build output ...');
for (const entry of fs.readdirSync(DEPLOY_DIR)) {
  if (entry === '.git') continue;
  fs.rmSync(path.join(DEPLOY_DIR, entry), {recursive: true, force: true});
}
fs.cpSync(outDir, DEPLOY_DIR, {recursive: true});
// GitHub Pages 默认跑 Jekyll，会忽略下划线开头的文件/目录
fs.writeFileSync(path.join(DEPLOY_DIR, '.nojekyll'), '');
// 说明与协议文件（部署目录每次整体覆盖，所以每次重新写入）
fs.copyFileSync(
  path.join(REPO_ROOT, 'scripts', 'pages-readme.md'),
  path.join(DEPLOY_DIR, 'README.md'),
);
for (const name of ['LICENSE', 'LICENSE-CONTENT']) {
  fs.copyFileSync(path.join(REPO_ROOT, name), path.join(DEPLOY_DIR, name));
}

// 4. 提交
const changed = git('status --porcelain');
if (!changed) {
  console.log('[deploy] nothing changed, skip commit');
} else {
  git('add -A');
  execSync(
    `git -c user.name="${GIT_NAME}" -c user.email="${GIT_EMAIL}" commit -m "chore: publish site ${new Date().toISOString()}"`,
    {cwd: DEPLOY_DIR, stdio: 'inherit'},
  );
}

// 5. 推送（加速器偶发证书错误时，回退到跳过校验再试一次）
console.log('\n=== [deploy] push ===');
try {
  git(`push origin ${BRANCH}`);
} catch (e) {
  console.warn('[deploy] push failed, retry with sslVerify=false');
  execSync(`git -c http.sslVerify=false push origin ${BRANCH}`, {
    cwd: DEPLOY_DIR,
    stdio: 'inherit',
  });
}

console.log(`\n[deploy] done → ${SITE_URL}${BASE_URL}`);
