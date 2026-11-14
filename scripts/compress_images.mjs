#!/usr/bin/env node
// compress_images.mjs：把产物里超过阈值的大图压小，只改构建产物，不动仓库源文件。
//
// 用法：node scripts/compress_images.mjs <dir> [--max-bytes 1048576]
// 环境变量：DFD_IMG_MAX_BYTES（默认 1 MiB）、DFD_IMG_MAX_EDGE（默认 1024）
//
// 规则：
//   - 只处理 .png / .jpg / .jpeg / .webp，跳过 .gif（动图）与 .svg（文本）
//   - 先按最长边缩到 MAX_EDGE，再按质量阶梯有损压缩，命中阈值就停
//   - 压缩结果不比原图小就保持原样

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const targetDir = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'build');
const maxBytes = Number(
  args.includes('--max-bytes')
    ? args[args.indexOf('--max-bytes') + 1]
    : (process.env.DFD_IMG_MAX_BYTES ?? 1024 * 1024),
);
const maxEdge = Number(process.env.DFD_IMG_MAX_EDGE ?? 1024);

if (!fs.existsSync(targetDir)) {
  console.log(`[compress] ${targetDir} 不存在，跳过`);
  process.exit(0);
}

let sharp;
try {
  ({default: sharp} = await import('sharp'));
} catch {
  console.warn('[compress] 未安装 sharp，跳过图片压缩（npm i -D sharp）');
  process.exit(0);
}

const EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const QUALITIES = [82, 72, 62, 52];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile() && EXTS.has(path.extname(entry.name).toLowerCase())) yield p;
  }
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/** 按目标格式编码，返回 [Buffer]；失败返回 null */
async function encodeOnce(file, meta, ext, quality) {
  let p = sharp(file);
  const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (edge > maxEdge) {
    p = p.resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  try {
    if (ext === '.png') {
      // palette 量化对截图/插画收益最大，透明通道会保留
      return await p.png({compressionLevel: 9, palette: true, quality, effort: 8}).toBuffer();
    }
    if (ext === '.webp') {
      return await p.webp({quality}).toBuffer();
    }
    return await p.jpeg({quality, mozjpeg: true, progressive: true}).toBuffer();
  } catch (e) {
    console.warn(`[compress] 编码失败 ${file}: ${e.message}`);
    return null;
  }
}

let count = 0;
let saved = 0;
let skipped = 0;

for (const file of walk(targetDir)) {
  const size = fs.statSync(file).size;
  if (size <= maxBytes) continue;

  const rel = path.relative(targetDir, file).replace(/\\/g, '/');
  const ext = path.extname(file).toLowerCase();
  const meta = await sharp(file).metadata();

  let best = null;
  for (const quality of QUALITIES) {
    const buf = await encodeOnce(file, meta, ext, quality);
    if (!buf) break;
    if (!best || buf.length < best.length) best = buf;
    if (buf.length <= maxBytes) break;
  }

  if (!best || best.length >= size) {
    skipped++;
    console.log(`[compress] ${rel}: ${kb(size)}，压缩无收益，保留原图`);
    continue;
  }

  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, best);
  fs.renameSync(tmp, file);
  count++;
  saved += size - best.length;
  console.log(`[compress] ${rel}: ${kb(size)} → ${kb(best.length)}`);
}

console.log(
  `[compress] 完成：压缩 ${count} 张，跳过 ${skipped} 张，节省 ${(saved / 1024 / 1024).toFixed(2)} MB`,
);
