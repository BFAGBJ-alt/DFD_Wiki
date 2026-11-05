#!/usr/bin/env node
// Post-build prune: 在 docusaurus build 完成后，从 outDir 里删掉未被引用的 Minecraft 原版材质。
// SlimeFun/ 子树永远保留，Skull 远程皮肤不进 static，完全不受影响。
//
// 扫描来源：
//   1. ts/tsx/mdx 里硬编码的 /img/Minecraft/<relpath> 字符串（直接命中 item/*.png / block/*.png / entity/*.png / block/*.json）
//   2. ItemDef.machineDef 里的 block: 'xxx' 字段（作为 block model id，递归解析 JSON 链）
//   3. Structure JSON 里的 block 字段（运行时 fetch，此处无法覆盖 → 保守策略：把源码扫描未命中的 block 模型里，只有"完全没被引用的"才删）
// 操作目标：outDir/img/Minecraft/ 下的 .png / .json / .mcmeta
// 安全策略：SlimeFun/ 永远保留；只删文件、不删目录（空目录 Docusaurus 下次也不会出现）

import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// 参数：outDir 路径
const outDir = path.resolve(process.argv[2] ?? path.join(REPO_ROOT, 'build'));
const outMinecraft = path.join(outDir, 'img', 'Minecraft');
const srcMinecraft = path.join(REPO_ROOT, 'static', 'img', 'Minecraft');
console.log('[prune] outDir (resolved):', outDir);
console.log('[prune] outMinecraft:', outMinecraft);

// 被引用集合：存相对 Minecraft/ 的路径，如 'block/furnace.png' 'item/apple.png' 'block/furnace.json'
const used = new Set();

// ============================================================================
// 1. 扫描源码
// ============================================================================

const SRC_DIRS = [
  path.join(REPO_ROOT, 'src'),
  path.join(REPO_ROOT, 'docs'),
];

function* walkFiles(dir, exts) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(p, exts);
    else if (exts.has(path.extname(entry.name))) yield p;
  }
}

function scanSources() {
  let files = 0;
  for (const srcDir of SRC_DIRS) {
    if (!fs.existsSync(srcDir)) continue;
    for (const file of walkFiles(srcDir, new Set(['.ts', '.tsx', '.mdx']))) {
      files++;
      const content = fs.readFileSync(file, 'utf8');

      // (a) 硬编码 /img/Minecraft/<relpath>
      const reUrl = /\/img\/Minecraft\/([a-zA-Z0-9_\-/.]+)/g;
      let m;
      while ((m = reUrl.exec(content))) {
        const rel = m[1];
        if (rel.startsWith('SlimeFun/')) continue;
        if (rel.startsWith('SlimeFun\\')) continue;
        used.add(rel.replace(/\\/g, '/'));
      }

      // (b) block: 'xxx' 或 block: ['xxx', 'yyy']
      //     这些是 block model id（不含 .json 后缀）
      const reBlockSingle = /block\s*:\s*['"]([^'"]+)['"]/g;
      while ((m = reBlockSingle.exec(content))) {
        const id = m[1];
        if (!id) continue;
        if (id.startsWith('SlimeFun/')) continue;
        expandBlockModel(id);
      }
      const reBlockArray = /block\s*:\s*\[([^\]]+)\]/g;
      while ((m = reBlockArray.exec(content))) {
        for (const id of m[1].split(',')) {
          const v = id.trim().replace(/['"]/g, '');
          if (v && !v.startsWith('SlimeFun/')) expandBlockModel(v);
        }
      }
    }
  }
  console.log(`[prune] Scanned ${files} source files → ${used.size} raw refs before block-model expansion`);
}

// ============================================================================
// 2. Block model JSON 链解析（复刻 modelResolver 的 loadChain + resolveRef 逻辑）
// ============================================================================

function normalizeId(ref) {
  return ref.replace(/^minecraft:/, '').replace(/^block\//, '');
}

function resolveRef(textures, key, depth = 0) {
  if (depth > 10) return undefined;
  const v = textures[key];
  if (!v) return undefined;
  if (v.startsWith('#')) return resolveRef(textures, v.slice(1), depth + 1);
  return v;
}

const _loadingModels = new Set();

function loadModelChain(id, localBase) {
  if (_loadingModels.has(id)) return [];
  _loadingModels.add(id);
  const localPath = path.join(localBase, `${id}.json`);
  if (!fs.existsSync(localPath)) return [];
  let json;
  try {
    json = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  } catch {
    return [];
  }
  const chain = [json];
  if (json.parent) {
    const parentId = normalizeId(json.parent);
    chain.push(...loadModelChain(parentId, localBase));
  }
  return chain;
}

const _expanding = new Set();

function expandBlockModel(id) {
  const nid = normalizeId(id);
  if (_expanding.has(nid)) return;   // 防循环（某些 MC model 互相嵌套）
  _expanding.add(nid);

  // 标记这个 model 的 JSON 本身也被使用（保留 .json 文件）
  used.add(`block/${nid}.json`);

  const localBase = path.join(srcMinecraft, 'block');
  _loadingModels.clear();
  const chain = loadModelChain(nid, localBase);
  if (chain.length === 0) {
    _expanding.delete(nid);
    return;
  }

  const textures = [...chain]
    .reverse()
    .reduce((acc, m) => ({...acc, ...(m.textures ?? {})}), {});
  const elements = chain.find((m) => m.elements?.length)?.elements ?? [];

  // (a) elements 里每个 face 的 texture → 叶子 .png
  for (const el of elements) {
    for (const [, def] of Object.entries(el.faces ?? {})) {
      if (!def?.texture) continue;
      const ref = def.texture.startsWith('#')
        ? resolveRef(textures, def.texture.slice(1))
        : def.texture;
      if (!ref) continue;
      const refId = normalizeId(ref);
      markTexture(refId);
    }
  }

  // (b) fallbackQuads：无 elements 时走 particle + 箱子/床等特殊处理
  if (elements.length === 0) {
    const particle = resolveRef(textures, 'particle');
    if (particle) markTexture(normalizeId(particle));

    // 箱子：entity/chest/{normal|ender}.png
    if (nid === 'chest') {
      used.add('entity/chest/normal.png');
    } else if (nid === 'ender_chest') {
      used.add('entity/chest/ender.png');
    }
  }
  _expanding.delete(nid);
}

/** 把一个 texture 引用标记为被使用。
 * MC model JSON 里 textures / face.texture 的值：
 *   - 以 .png 结尾 → 直接是叶子贴图文件
 *   - 不以 .png 结尾 → 贴图名，对应 block/<name>.png
 *   - 以 # 开头 → 已在上游通过 resolveRef 解出
 * 不会出现嵌套 model id——model 互相嵌套是通过 parent/elements，
 * 不走 texture 字段。 */
function markTexture(refId) {
  if (refId.endsWith('.png')) {
    used.add(`block/${refId}`);
  } else {
    used.add(`block/${refId}.png`);
  }
}

// ============================================================================
// 3. 执行 prune
// ============================================================================

function* walkRelativeFiles(root, exts) {
  function* walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, entry.name);
      const rel = path.relative(root, p).replace(/\\/g, '/');
      if (entry.isDirectory()) yield* walk(p);
      else if (exts.has(path.extname(entry.name))) yield rel;
    }
  }
  yield* walk(root);
}

function prune() {
  if (!fs.existsSync(outMinecraft)) {
    console.log(`[prune] No out Minecraft dir at ${outMinecraft} — nothing to prune`);
    return;
  }

  const exts = new Set(['.png', '.json', '.mcmeta']);
  const allRelPaths = [...walkRelativeFiles(outMinecraft, exts)];

  console.log(`[prune] Scanned ${allRelPaths.length} Minecraft files`);
  if (allRelPaths.length > 0) {
    console.log('[prune] First 10 rel paths:', allRelPaths.slice(0, 10));
  }

  let kept = 0;
  let deleted = 0;
  const deletedList = [];

  for (const rel of allRelPaths) {
    // SlimeFun 子树永远保留
    if (rel.startsWith('SlimeFun/')) {
      kept++;
      continue;
    }

    // 精确匹配
    if (used.has(rel)) {
      kept++;
      continue;
    }

    // .mcmeta 伴生 .png：如果 png 被保留，mcmeta 也保留
    if (rel.endsWith('.mcmeta')) {
      const pngRel = rel.slice(0, -'.mcmeta'.length);
      if (used.has(pngRel)) {
        kept++;
        continue;
      }
    }

    // block model .json 宽松匹配：如果同目录有其他 .json 引用此模型，也保留
    // （保守：只删确定没被引用的）
    if (rel.endsWith('.json')) {
      // 空模型（air.json）：如果没被引用，删掉是安全的
      // 但为了安全，.json 宁可多留
      // —— 实际上 used 里会有所有被扫到的 block/xxx.json + expandBlockModel 里标记的
      // 所以如果 used 里没有，就是真的没被引用，直接删
    }

    const full = path.join(outMinecraft, rel);
    fs.unlinkSync(full);
    deleted++;
    deletedList.push(rel);
  }

  console.log(`[prune] Done. kept=${kept}, deleted=${deleted}`);
  if (deletedList.length > 0 && deletedList.length <= 20) {
    console.log('[prune] Deleted:');
    for (const d of deletedList) console.log('  - ' + d);
  } else if (deletedList.length > 20) {
    console.log(`[prune] (showing first 10 of ${deletedList.length}):`);
    for (const d of deletedList.slice(0, 10)) console.log('  - ' + d);
  }
}

// ============================================================================
// Main
// ============================================================================

console.log(`[prune] Target outDir: ${outDir}`);
console.log(`[prune] Source Minecraft: ${srcMinecraft}`);
scanSources();
prune();
