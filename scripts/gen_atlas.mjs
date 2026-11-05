#!/usr/bin/env node
// Atlas 合成 + key hash 混淆：将 prune 后的原版 Minecraft 材质（block/item/entity）
// 揉成一张 atlas.png，输出 atlas.json（hash key → 区域坐标）。
// SlimeFun 子树不进 atlas（运行时代理层也不拦截 SlimeFun URL）。
//
// 用法：node scripts/gen_atlas.mjs <outDir>
// 依赖：pngjs + image-size（已在 devDependencies）

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PNG} from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ============================================================================
// 参数
// ============================================================================
const outDir = path.resolve(process.argv[2] ?? path.join(REPO_ROOT, 'build'));
const outMinecraft = path.join(outDir, 'img', 'Minecraft');
const ATLAS_PNG = '_atlas.png';
const ATLAS_JSON = '_atlas.json';
const MAX_ATLAS_SIZE = 2048;   // 最大 atlas 边长（PNG 压缩效率在 1024~2048 最佳）

if (!fs.existsSync(outMinecraft)) {
  console.log(`[gen-atlas] No ${outMinecraft} — skipping`);
  process.exit(0);
}

// ============================================================================
// 1. 收集候选 PNG：以 static 源目录为准（源目录永远完整，可重复执行），
//    但只打包 outDir 里仍然存在的（即 prune 判定为被引用的）那些。
// ============================================================================

const srcMinecraft = path.join(REPO_ROOT, 'static', 'img', 'Minecraft');

function* walkPngs(root) {
  function* walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'SlimeFun') continue;
        yield* walk(p);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.png') {
        // 注意：rel 必须相对固定 root 计算，递归时不能把 root 换成子目录
        const rel = path.relative(root, p).replace(/\\/g, '/');
        if (rel === ATLAS_PNG) continue;
        yield {rel, full: p};
      }
    }
  }
  yield* walk(root);
}

const images = [];
for (const {rel, full} of walkPngs(srcMinecraft)) {
  // 只处理 prune 之后仍保留在产物里的图（被引用的）
  if (!fs.existsSync(path.join(outMinecraft, rel))) continue;
  try {
    const png = PNG.sync.read(fs.readFileSync(full));
    images.push({rel, full, png, width: png.width, height: png.height});
  } catch (e) {
    console.warn(`[gen-atlas] skip ${rel}: ${e.message}`);
  }
}
console.log(`[gen-atlas] ${images.length} candidate PNGs`);

if (images.length === 0) {
  console.log('[gen-atlas] Nothing to pack, skipping');
  process.exit(0);
}

// ============================================================================
// 2. Bin-packing（按高度降序，一行一行塞）
// ============================================================================

images.sort((a, b) => b.height - a.height || b.width - a.width);

const rows = [];
let curRow = null;

for (const img of images) {
  let placed = false;
  for (const row of rows) {
    const usedW = row.items.reduce((s, it) => s + it.img.width, 0);
    const gap = 2;
    if (row.h >= img.height && usedW + gap + img.width <= MAX_ATLAS_SIZE) {
      row.items.push({x: usedW + gap, img});
      placed = true;
      break;
    }
  }
  if (!placed) {
    const newRow = {y: curRow ? curRow.y + curRow.h + 2 : 2, h: img.height + 2, items: [{x: 2, img}]};
    rows.push(newRow);
    curRow = newRow;
  }
}

const atlasW = Math.min(MAX_ATLAS_SIZE, Math.max(...rows.flatMap(r =>
  r.items.reduce((s, it) => Math.max(s, it.x + it.img.width), 0)
)) + 2);
const atlasH = rows.reduce((s, r) => Math.max(s, r.y + r.h), 0) + 2;
console.log(`[gen-atlas] Atlas: ${atlasW} × ${atlasH} (${rows.length} rows)`);

// ============================================================================
// 3. 合成 PNG
// ============================================================================

const canvas = new PNG({width: atlasW, height: atlasH});

function blit(srcPng, destX, destY) {
  for (let y = 0; y < srcPng.height; y++) {
    const srcOff = y * srcPng.width * 4;
    const destOff = ((destY + y) * atlasW + destX) * 4;
    srcPng.data.copy(canvas.data, destOff, srcOff, srcOff + srcPng.width * 4);
  }
}

const hashMap = {};

for (const row of rows) {
  for (const {x, img} of row.items) {
    blit(img.png, x, row.y);
    const key = hashRel(img.rel);
    hashMap[key] = {x, y: row.y, w: img.width, h: img.height};
  }
}

const atlasBuf = PNG.sync.write(canvas);
const atlasPngPath = path.join(outMinecraft, ATLAS_PNG);
fs.writeFileSync(atlasPngPath, atlasBuf);
console.log(`[gen-atlas] Wrote ${ATLAS_PNG}: ${(atlasBuf.length / 1024).toFixed(1)} KB`);

const meta = {
  _atlas: {w: atlasW, h: atlasH},
  entries: hashMap,
};
fs.writeFileSync(path.join(outMinecraft, ATLAS_JSON), JSON.stringify(meta));
console.log(`[gen-atlas] Wrote ${ATLAS_JSON}: ${Object.keys(hashMap).length} entries`);

// ============================================================================
// 4. 清理：只删产物目录里已合入 atlas 的 PNG（static 源目录绝不动）
// ============================================================================

let pruned = 0;
for (const {rel} of images) {
  try {
    fs.unlinkSync(path.join(outMinecraft, rel));
    pruned++;
  } catch {}
}
console.log(`[gen-atlas] Removed ${pruned} source PNGs (now in atlas)`);

// ============================================================================
// djb2 hash
// ============================================================================

function hashRel(rel) {
  let h = 5381;
  for (let i = 0; i < rel.length; i++) {
    h = ((h << 5) + h + rel.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
