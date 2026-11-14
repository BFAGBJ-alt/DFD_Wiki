#!/usr/bin/env node
// Atlas 合成 + key hash 混淆：将 prune 后的原版 Minecraft 材质（block/item/entity）
// 揉成一张 atlas.png，输出 atlas.json（hash key → 区域坐标）。
// SlimeFun 子树不进 atlas（运行时代理层也不拦截 SlimeFun URL）。
//
// 用法：node scripts/gen_atlas.mjs <outDir>
// 依赖：pngjs + image-size（已在 devDependencies）

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
// 产物文件名里带内容 hash（见文末），这里只用于排除旧产物
const ATLAS_PNG_RE = /^_atlas(?:\.[0-9a-f]+)?\.png$/i;
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
        if (ATLAS_PNG_RE.test(entry.name)) continue;
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

// 每个贴图四周复制 PAD 像素的「边缘像素」（dilate）。
// 只用透明间隙挡不住采样越界：缩放/过滤时边缘会取到相邻像素或透明黑，
// 表现为贴图四周出现一圈发黑的细线（黑线）。复制边缘像素后，
// 越界采样拿到的还是自己边缘的颜色。
const PAD = 2;
const cellW = (img) => img.width + PAD * 2;
const cellH = (img) => img.height + PAD * 2;

const rows = [];
let curRow = null;

for (const img of images) {
  let placed = false;
  for (const row of rows) {
    const usedW = row.items.reduce((s, it) => s + cellW(it.img), 0);
    if (row.h >= cellH(img) && usedW + cellW(img) <= MAX_ATLAS_SIZE) {
      row.items.push({x: usedW, img});
      placed = true;
      break;
    }
  }
  if (!placed) {
    const newRow = {
      y: curRow ? curRow.y + curRow.h : PAD,
      h: cellH(img),
      items: [{x: PAD, img}],
    };
    rows.push(newRow);
    curRow = newRow;
  }
}

const atlasW = Math.min(MAX_ATLAS_SIZE, Math.max(...rows.flatMap(r =>
  r.items.reduce((s, it) => Math.max(s, it.x + cellW(it.img)), 0)
)) + PAD);
const atlasH = rows.reduce((s, r) => Math.max(s, r.y + r.h), 0) + PAD;
console.log(`[gen-atlas] Atlas: ${atlasW} × ${atlasH} (${rows.length} rows)`);

// ============================================================================
// 3. 合成 PNG
// ============================================================================

const canvas = new PNG({width: atlasW, height: atlasH});

// 写入一张图 + 四周 PAD 像素的边缘复制（坐标超出贴图范围时钳到边缘像素）
function blit(srcPng, destX, destY) {
  const {width: sw, height: sh, data} = srcPng;
  for (let y = -PAD; y < sh + PAD; y++) {
    const sy = Math.min(sh - 1, Math.max(0, y));
    const destRow = ((destY + y) * atlasW + destX) * 4;
    for (let x = -PAD; x < sw + PAD; x++) {
      const sx = Math.min(sw - 1, Math.max(0, x));
      const srcOff = (sy * sw + sx) * 4;
      const destOff = destRow + x * 4;
      canvas.data[destOff] = data[srcOff];
      canvas.data[destOff + 1] = data[srcOff + 1];
      canvas.data[destOff + 2] = data[srcOff + 2];
      canvas.data[destOff + 3] = data[srcOff + 3];
    }
  }
}

const hashMap = {};

for (const row of rows) {
  for (const {x, img} of row.items) {
    // x/y 是 cell 左上角，内层贴图从 cell + PAD 开始
    const innerX = x + PAD;
    const innerY = row.y + PAD;
    blit(img.png, innerX, innerY);
    const key = hashRel(img.rel);
    hashMap[key] = {x: innerX, y: innerY, w: img.width, h: img.height};
  }
}

const atlasBuf = PNG.sync.write(canvas);
// 文件名带内容 hash：_atlas.png 是固定 URL，部署后浏览器/CDN 可能仍拿着上一版，
// 而 _atlas.json 已经更新，两边布局不一致就会表现为「atlas 切割错位」。
// 把内容 hash 写进文件名后，新 atlas 一定是新 URL，旧缓存只会拿到旧文件名。
const atlasHash = crypto.createHash('sha1').update(atlasBuf).digest('hex').slice(0, 8);
const atlasPngName = ATLAS_PNG.replace(/\.png$/, `.${atlasHash}.png`);
const atlasPngPath = path.join(outMinecraft, atlasPngName);
fs.writeFileSync(atlasPngPath, atlasBuf);
// 清掉上次构建留下的旧 hash 文件
for (const name of fs.readdirSync(outMinecraft)) {
  if (name !== atlasPngName && ATLAS_PNG_RE.test(name)) {
    try {
      fs.unlinkSync(path.join(outMinecraft, name));
    } catch {}
  }
}
console.log(`[gen-atlas] Wrote ${atlasPngName}: ${(atlasBuf.length / 1024).toFixed(1)} KB`);

const meta = {
  file: atlasPngName,
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
