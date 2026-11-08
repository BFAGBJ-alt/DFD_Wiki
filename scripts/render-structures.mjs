// 预渲染旋转图脚本（移动端降级显示用）
// 用法: node scripts/render-structures.mjs [--preview]
// 输出: static/img/structures/<结构名>.gif
// 同时把结构 JSON 同步到 static/structures/（保留 scripts/structures/ 下的子目录结构）
// --preview 额外把第一帧存成 PNG 到系统临时目录，方便检查效果
//
// 结构定义见 scripts/structures/ 下的 .json 文件（支持 AE/、NTW/ 等子目录，递归扫描）：
// {
//   "name": "me-network",
//   "palette": {  // 可选预设表：统一定义材质/颜色/名称/链接，减少重复
//     "controller": {"block":"furnace","color":"#9b59b6","label":"ME 控制器","link":"/docs/..."}
//   },
//   "blocks": [
//     {"x":0,"y":0,"z":0,"type":"controller"},            // 用 type 引用预设
//     {"x":1,"y":0,"z":0,"item":"me_drive"},              // 或用物品库 id
//     {"x":2,"y":0,"z":0,"block":"glass","color":"#ccc"}, // 或直接内联
//   ]
// }
//
// 渲染方式：软件光栅化（Z-buffer + 最近邻纹理采样），使用
// static/img/Minecraft/block 下的真实方块模型与贴图，无需 GPU。
// color 仅在模型缺失时作为纯色回退。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PNG} from 'pngjs';
import GIFEncoder from 'gif-encoder-2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STRUCT_DIR = path.join(ROOT, 'scripts', 'structures');
const STATIC_STRUCT_DIR = path.join(ROOT, 'static', 'structures');
const OUT_DIR = path.join(ROOT, 'static', 'img', 'structures');
const MODEL_DIR = path.join(ROOT, 'static', 'img', 'Minecraft', 'block');
const ITEMS_DIR = path.join(ROOT, 'src', 'data', 'items');

// ===== 渲染参数（可按需调） =====
const SIZE = 480;             // 输出正方形边长（像素）
const FRAMES = 36;            // 一圈多少帧
const DELAY = 50;             // 每帧毫秒
const PITCH = (30 * Math.PI) / 180; // 俯角
const BG = [0x1b, 0x1b, 0x1d];      // 背景色（深灰，适配暗色主题）
const MARGIN = 0.82;          // 画面填充比例
// =================================

// ---------- items.ts 读取（容错解析对象字面量） ----------

function skipTrivia(text, i) {
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ',') i++;
    else if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else break;
  }
  return i;
}

function parseValue(text, i) {
  i = skipTrivia(text, i);
  const c = text[i];
  if (c === '{') {
    const obj = {};
    i++;
    for (;;) {
      i = skipTrivia(text, i);
      if (text[i] === '}') return [obj, i + 1];
      let key;
      if (text[i] === "'" || text[i] === '"') [key, i] = parseString(text, i);
      else {
        const start = i;
        while (i < text.length && !' \t\r\n,:{}[]'.includes(text[i])) i++;
        key = text.slice(start, i);
      }
      i = skipTrivia(text, i);
      i++; // ':'
      const [value, ni] = parseValue(text, i);
      obj[key] = value;
      i = ni;
    }
  }
  if (c === '[') {
    const arr = [];
    i++;
    for (;;) {
      i = skipTrivia(text, i);
      if (text[i] === ']') return [arr, i + 1];
      const [value, ni] = parseValue(text, i);
      arr.push(value);
      i = ni;
    }
  }
  if (c === "'" || c === '"') return parseString(text, i);
  const start = i;
  while (i < text.length && !' \t\r\n,:{}[]'.includes(text[i])) i++;
  const token = text.slice(start, i);
  if (token === 'true') return [true, i];
  if (token === 'false') return [false, i];
  const num = Number(token);
  return [Number.isNaN(num) ? token : num, i];
}

function parseString(text, i) {
  const quote = text[i];
  i++;
  let out = '';
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      const n = text[i + 1];
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
      i += 2;
      continue;
    }
    if (c === quote) return [out, i + 1];
    out += c;
    i++;
  }
  return [out, i];
}

function loadItemsDb() {
  if (!fs.existsSync(ITEMS_DIR)) return {};
  const merged = {};
  for (const name of fs.readdirSync(ITEMS_DIR).sort()) {
    if (!name.endsWith('.ts') || name === 'index.ts' || name === 'types.ts') continue;
    const text = fs.readFileSync(path.join(ITEMS_DIR, name), 'utf8');
    const m = /export\s+const\s+items\s*:\s*Record<[^>]*>\s*=\s*\{/.exec(text);
    if (!m) continue;
    const [obj] = parseValue(text, m.index + m[0].length - 1);
    Object.assign(merged, obj);
  }
  return merged;
}

// ---------- 方块模型解析 ----------

const modelCache = new Map();

function loadModel(id) {
  if (modelCache.has(id)) return modelCache.get(id);
  const file = path.join(MODEL_DIR, `${id}.json`);
  const model = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : null;
  modelCache.set(id, model);
  return model;
}

const normalizeId = (ref) => ref.replace(/^minecraft:/, '').replace(/^block\//, '');

function loadChain(id) {
  const chain = [];
  let cur = id;
  for (let depth = 0; depth < 10 && cur; depth++) {
    const model = loadModel(cur);
    if (!model) break;
    chain.push(model);
    cur = model.parent ? normalizeId(model.parent) : null;
  }
  return chain;
}

function resolveRef(textures, key, depth = 0) {
  if (depth > 10) return undefined;
  const v = textures[key];
  if (!v) return undefined;
  if (v.startsWith('#')) return resolveRef(textures, v.slice(1), depth + 1);
  return v;
}

const FACES = ['down', 'up', 'north', 'south', 'west', 'east'];

function defaultUv(face, from, to) {
  const [fx, fy, fz] = from;
  const [tx, ty, tz] = to;
  switch (face) {
    case 'north': return [fx, 16 - ty, tx, 16 - fy];
    case 'south': return [16 - tx, 16 - ty, 16 - fx, 16 - fy];
    case 'west': return [fz, 16 - ty, tz, 16 - fy];
    case 'east': return [16 - tz, 16 - ty, 16 - fz, 16 - fy];
    default: return [fx, fz, tx, tz];
  }
}

function resolveQuads(blockId) {
  const ids = Array.isArray(blockId) ? blockId : String(blockId).split(',');
  const quads = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    const chain = loadChain(id);
    if (!chain.length) continue;
    const textures = [...chain]
      .reverse()
      .reduce((acc, m) => ({...acc, ...(m.textures || {})}), {});
    const elements = chain.find((m) => m.elements?.length)?.elements || [];
    const before = quads.length;
    for (const el of elements) {
      const from = el.from || [0, 0, 0];
      const to = el.to || [16, 16, 16];
      for (const face of FACES) {
        const def = el.faces?.[face];
        if (!def?.texture) continue;
        const ref = def.texture.startsWith('#')
          ? resolveRef(textures, def.texture.slice(1))
          : def.texture;
        if (!ref) continue;
        quads.push({
          face,
          from,
          to,
          uv: def.uv || defaultUv(face, from, to),
          texture: path.join(MODEL_DIR, `${normalizeId(ref)}.png`),
          uvRotation: def.rotation,
          rotation: el.rotation,
        });
      }
    }
    // 方块实体（无 elements）的兜底几何：箱子用实体贴图，其余用 particle 立方体
    if (quads.length === before) {
      const box = (from, to, texOffs, texture, texSize, chestUv = false, lockUv = false) => {
        const [x1, y1, z1] = from;
        const [x2, y2, z2] = to;
        const w = x2 - x1;
        const h = y2 - y1;
        const d = z2 - z1;
        const [u, v] = texOffs;
        if (lockUv) {
          const latch = [u + d, v + d, u + d + w, v + d + h];
          return FACES.map((face) => ({
            face,
            from,
            to,
            uv: latch,
            texture,
            texSize,
            uvRotation: 180,
          }));
        }
        let rects;
        if (chestUv) {
          const rWest = [u, v + d, u + d, v + d + h];
          const rNorth = [u + d, v + d, u + d + w, v + d + h];
          const rEast = [u + d + w, v + d, u + d + w + d, v + d + h];
          const rSouth = [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h];
          rects = {
            up: [u + d + w, v, u + d + 2 * w, v + d],
            down: [u + d, v, u + d + w, v + d],
            north: rEast,
            west: rEast,
            south: rNorth,
            east: rNorth,
          };
        } else {
          rects = {
            up: [u + d, v, u + d + w, v + d],
            down: [u + d + w, v, u + d + 2 * w, v + d],
            east: [u, v + d, u + d, v + d + h],
            north: [u + d, v + d, u + d + w, v + d + h],
            west: [u + d + w, v + d, u + d + w + d, v + d + h],
            south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
          };
        }
        return FACES.map((face) => ({
          face,
          from,
          to,
          uv: rects[face],
          texture,
          texSize,
          uvRotation: chestUv && face !== 'up' && face !== 'down' ? 180 : undefined,
        }));
      };
      if (id === 'chest' || id === 'ender_chest') {
        const file = id === 'ender_chest' ? 'ender' : 'normal';
        const tex = path.join(MODEL_DIR, '..', 'entity', 'chest', `${file}.png`);
        quads.push(
          ...box([1, 0, 1], [15, 10, 15], [0, 19], tex, [64, 64], true),
          ...box([1, 9, 1], [15, 14, 15], [0, 0], tex, [64, 64], true),
          ...box([7, 7, 0], [9, 11, 1], [0, 0], tex, [64, 64], true, true),
        );
      } else {
        const particle = resolveRef(textures, 'particle');
        if (particle) {
          quads.push(
            ...box(
              [0, 0, 0],
              [16, 16, 16],
              [0, 0],
              path.join(MODEL_DIR, `${normalizeId(particle)}.png`),
              [16, 16],
            ),
          );
        }
      }
    }
  }
  return quads;
}

// 面四角（MC 坐标 0..16），顺序与 uv 的 (u1,v1)(u2,v1)(u1,v2)(u2,v2) 对应
function quadCorners(q) {
  const [fx, fy, fz] = q.from;
  const [tx, ty, tz] = q.to;
  switch (q.face) {
    case 'north': return [[fx, ty, fz], [tx, ty, fz], [fx, fy, fz], [tx, fy, fz]];
    case 'south': return [[fx, ty, tz], [tx, ty, tz], [fx, fy, tz], [tx, fy, tz]];
    case 'west': return [[fx, ty, fz], [fx, ty, tz], [fx, fy, fz], [fx, fy, tz]];
    case 'east': return [[tx, ty, fz], [tx, ty, tz], [tx, fy, fz], [tx, fy, tz]];
    case 'up': return [[fx, ty, fz], [tx, ty, fz], [fx, ty, tz], [tx, ty, tz]];
    default: return [[fx, fy, fz], [tx, fy, fz], [fx, fy, tz], [tx, fy, tz]];
  }
}

function rotatePoint(p, rot) {
  if (!rot || !rot.angle) return p;
  const [ox, oy, oz] = rot.origin || [8, 8, 8];
  const rad = (rot.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = p[0] - ox;
  const y = p[1] - oy;
  const z = p[2] - oz;
  let rx = x;
  let ry = y;
  let rz = z;
  if (rot.axis === 'x') {
    ry = y * cos - z * sin;
    rz = y * sin + z * cos;
  } else if (rot.axis === 'y') {
    rx = x * cos + z * sin;
    rz = -x * sin + z * cos;
  } else {
    rx = x * cos - y * sin;
    ry = x * sin + y * cos;
  }
  return [rx + ox, ry + oy, rz + oz];
}

// ---------- 贴图缓存 ----------

const textureCache = new Map();

function loadTexture(file) {
  if (textureCache.has(file)) return textureCache.get(file);
  let tex = null;
  if (fs.existsSync(file)) {
    try {
      tex = PNG.sync.read(fs.readFileSync(file));
      // 动画贴图（海晶灯等）是高度为宽度整数倍的竖排长图，只取第一帧；
      // pngjs 数据按行连续存储，直接把 height 改成 width 即可
      if (tex.height > tex.width && tex.height % tex.width === 0) {
        tex.height = tex.width;
      }
    } catch {
      tex = null;
    }
  }
  textureCache.set(file, tex);
  return tex;
}

// ---------- 软件光栅化 ----------

const FACE_SHADE = {
  up: 1,
  down: 0.55,
  north: 0.9,
  south: 0.78,
  east: 0.84,
  west: 0.72,
};

function renderFrame(blocks, angle, view) {
  const width = SIZE;
  const height = SIZE;
  const color = new Uint8Array(width * height * 3);
  const depth = new Float32Array(width * height).fill(-Infinity);
  for (let i = 0; i < width * height; i++) {
    color[i * 3] = BG[0];
    color[i * 3 + 1] = BG[1];
    color[i * 3 + 2] = BG[2];
  }

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosP = Math.cos(PITCH);
  const sinP = Math.sin(PITCH);
  const {cx, cy, cz, scale} = view;

  const project = (p) => {
    const x = p[0] - cx;
    const y = p[1] - cy;
    const z = p[2] - cz;
    const u = x * cosA - z * sinA;
    const v = x * sinA + z * cosA;
    const sx = SIZE / 2 + u * scale;
    const sy = SIZE / 2 - (y * cosP - v * sinP) * scale;
    const d = v * cosP + y * sinP; // 越大越靠近相机
    return [sx, sy, d];
  };

  for (const block of blocks) {
    for (const q of block.quads) {
      const tex = loadTexture(q.texture);
      const corners = quadCorners(q);
      const [u1, v1, u2, v2] = q.uv;
      const [texW, texH] = q.texSize || [16, 16];
      const cu = (u1 + u2) / 2;
      const cv = (v1 + v2) / 2;
      const rad = ((q.uvRotation || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // 面贴图顺时针转 => 采样点逆时针转
      const rotUv = (u, v) => {
        const du = u - cu;
        const dv = v - cv;
        return [
          (cu + du * cos + dv * sin) / texW,
          (cv - du * sin + dv * cos) / texH,
        ];
      };
      const uvs = [
        rotUv(u1, v1),
        rotUv(u2, v1),
        rotUv(u1, v2),
        rotUv(u2, v2),
      ];
      const pts = corners.map((c) => {
        const [mx, my, mz] = rotatePoint(c, q.rotation);
        return project([
          mx / 16 + block.x,
          my / 16 + block.y,
          mz / 16 + block.z,
        ]);
      });
      const shade = FACE_SHADE[q.face] ?? 1;

      const tris = [
        [0, 1, 3],
        [0, 3, 2],
      ];
      for (const tri of tris) {
        rasterize(
          color, depth, width, height,
          tri.map((i) => pts[i]),
          tri.map((i) => uvs[i]),
          tex, shade, block.fallbackColor,
        );
      }
    }
  }

  return Buffer.from(color);
}

function rasterize(color, depth, width, height, p, uv, tex, shade, fallback) {
  const [x0, y0, d0] = p[0];
  const [x1, y1, d1] = p[1];
  const [x2, y2, d2] = p[2];
  let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-6) return;
  if (area < 0) {
    // 统一绕序，保证双面都能绘制
    [p[1], p[2]] = [p[2], p[1]];
    [uv[1], uv[2]] = [uv[2], uv[1]];
    area = -area;
  }
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
      const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const d = w0 * d0 + w1 * d1 + w2 * d2;
      const idx = y * width + x;
      if (d <= depth[idx]) continue;

      let r;
      let g;
      let b;
      let a;
      if (tex) {
        const u = w0 * uv[0][0] + w1 * uv[1][0] + w2 * uv[2][0];
        const v = w0 * uv[0][1] + w1 * uv[1][1] + w2 * uv[2][1];
        const tx = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
        const ty = Math.min(tex.height - 1, Math.max(0, Math.floor(v * tex.height)));
        const ti = (ty * tex.width + tx) * 4;
        r = tex.data[ti];
        g = tex.data[ti + 1];
        b = tex.data[ti + 2];
        a = tex.data[ti + 3];
      } else {
        [r, g, b] = fallback;
        a = 255;
      }
      if (a === 0) continue;
      r = Math.min(255, Math.round(r * shade));
      g = Math.min(255, Math.round(g * shade));
      b = Math.min(255, Math.round(b * shade));
      if (a === 255) {
        color[idx * 3] = r;
        color[idx * 3 + 1] = g;
        color[idx * 3 + 2] = b;
        depth[idx] = d;
      } else {
        const af = a / 255;
        color[idx * 3] = Math.round(color[idx * 3] * (1 - af) + r * af);
        color[idx * 3 + 1] = Math.round(color[idx * 3 + 1] * (1 - af) + g * af);
        color[idx * 3 + 2] = Math.round(color[idx * 3 + 2] * (1 - af) + b * af);
        depth[idx] = Math.max(depth[idx], d - 0.001);
      }
    }
  }
}

// ---------- 结构装载 ----------

function hexToRgb(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return [136, 136, 136];
  const v = hex.slice(1);
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mergeDefs(base, over) {
  const out = {...base};
  for (const [k, v] of Object.entries(over || {})) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

function resolveStructure(struct, itemsDb) {
  const palette = struct.palette || {};
  const blocks = [];
  for (const raw of struct.blocks || []) {
    let def = raw.type && palette[raw.type]
      ? mergeDefs(palette[raw.type], raw)
      : {...raw};
    if (def.item && itemsDb[def.item]) {
      const item = itemsDb[def.item];
      def = mergeDefs(
        {block: item.block, color: item.color, label: item.name, link: item.link},
        def,
      );
    }
    blocks.push({
      x: raw.x || 0,
      y: raw.y || 0,
      z: raw.z || 0,
      quads: def.block ? resolveQuads(def.block) : [],
      fallbackColor: hexToRgb(def.color),
    });
  }
  return blocks;
}

function computeView(blocks) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of blocks) {
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x + 1);
    minY = Math.min(minY, b.y);
    maxY = Math.max(maxY, b.y + 1);
    minZ = Math.min(minZ, b.z);
    maxZ = Math.max(maxZ, b.z + 1);
  }
  if (!Number.isFinite(minX)) {
    minX = maxX = minY = maxY = minZ = maxZ = 0;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  // 立方体对角线在等距视图下的投影长度
  const projected = extent * 1.5 + 0.6;
  const scale = (SIZE * MARGIN) / projected;
  return {cx, cy, cz, scale};
}

// ---------- GIF ----------

function saveGif(frames, outPath) {
  return new Promise((resolve, reject) => {
    const encoder = new GIFEncoder(SIZE, SIZE, 'neuquant', true);
    const stream = encoder.createReadStream();
    stream.pipe(fs.createWriteStream(outPath));
    stream.on('end', resolve);
    stream.on('error', reject);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(DELAY);
    encoder.setQuality(10);
    for (const f of frames) encoder.addFrame(f);
    encoder.finish();
  });
}

function savePng(rgb, outPath) {
  const png = new PNG({width: SIZE, height: SIZE});
  for (let i = 0; i < SIZE * SIZE; i++) {
    png.data[i * 4] = rgb[i * 3];
    png.data[i * 4 + 1] = rgb[i * 3 + 1];
    png.data[i * 4 + 2] = rgb[i * 3 + 2];
    png.data[i * 4 + 3] = 255;
  }
  fs.writeFileSync(outPath, PNG.sync.write(png));
}

// ---------- 主流程 ----------

const preview = process.argv.includes('--preview');
const itemsDb = loadItemsDb();
fs.mkdirSync(OUT_DIR, {recursive: true});
fs.mkdirSync(STATIC_STRUCT_DIR, {recursive: true});

// 递归收集结构定义，rel 是相对 scripts/structures 的路径（用于保留子目录）
function collectStructFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectStructFiles(full, base));
    } else if (entry.name.endsWith('.json')) {
      out.push({src: full, rel: path.relative(base, full)});
    }
  }
  return out;
}

const files = collectStructFiles(STRUCT_DIR);
if (files.length === 0) {
  console.log('[render] scripts/structures/ 下没有 .json 结构文件');
  process.exit(0);
}

for (const {src, rel} of files) {
  const struct = JSON.parse(fs.readFileSync(src, 'utf8'));
  const name = struct.name || path.basename(rel, '.json');
  const dest = path.join(STATIC_STRUCT_DIR, rel);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.copyFileSync(src, dest);

  const blocks = resolveStructure(struct, itemsDb);
  const view = computeView(blocks);
  const frameCount = blocks.reduce((n, b) => n + b.quads.length, 0);
  console.log(`[render] ${name}: ${blocks.length} 方块 / ${frameCount} 个面`);

  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const angle = (i / FRAMES) * Math.PI * 2;
    frames.push(renderFrame(blocks, angle, view));
  }

  const out = path.join(OUT_DIR, `${name}.gif`);
  await saveGif(frames, out);
  console.log(
    `[render] ${name} -> ${path.relative(ROOT, out)} (${FRAMES} 帧, ${Math.round(
      fs.statSync(out).size / 1024,
    )}KB)`,
  );

  if (preview) {
    const p = path.join(os.tmpdir(), `${name}-preview.png`);
    savePng(frames[0], p);
    console.log(`[render] 预览帧: ${p}`);
  }
}

console.log('[render] 完成');
