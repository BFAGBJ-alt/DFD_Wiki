import React, {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {resolveItem} from '@site/src/data/items/index';
import {resolveBlockQuads, rotateFaceUv, quadUvPoints, skullQuads, type Quad, type SkullFace} from '../StructureViewer/modelResolver';
import {loadAtlasMeta, resolveTex, type Meta} from '@site/src/utils/minecraftAtlas';
import styles from './styles.module.css';

// 固定等距视角：俯角 26°
const PITCH = (26 * Math.PI) / 180;
const K = 0.5 * Math.sin(PITCH);            // 顶面半高
const V = Math.SQRT1_2 * Math.cos(PITCH);   // 竖直棱长

type Face = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

const FACE_SHADE: Record<Face, number> = {
  up: 1,
  down: 0.55,
  north: 0.9,
  south: 0.78,
  east: 0.84,
  west: 0.72,
};

// 图标用 <canvas> 画而不是 <svg>：
// 浏览器普遍不对 SVG 里的 <image> 应用 image-rendering，16px 贴图放大后
// 会被双线性插值糊成一片（Safari 尤其明显）。canvas 的
// imageSmoothingEnabled = false 是所有浏览器都认的开关。
// 同时记录贴图原始尺寸：头颅皮肤有 64×64 与 64×32（旧版）两种，
// 必须按 natural 尺寸渲染，否则 UV 采样会错位。
type LoadedImg = {img: HTMLImageElement; w: number; h: number};
const imgCache = new Map<string, Promise<LoadedImg>>();

function loadImg(url: string): Promise<LoadedImg> {
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise<LoadedImg>((resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({img, w: img.naturalWidth || 1, h: img.naturalHeight || 1});
      img.onerror = () => reject(new Error(`图片加载失败：${url}`));
      img.src = url;
    });
    // 失败不要缓存，下次还能重试
    p.catch(() => imgCache.delete(url));
    imgCache.set(url, p);
  }
  return p;
}

// 面四角（MC 坐标 0..16），顺序对应 uv 的 (u1,v1)(u2,v1)(u1,v2)(u2,v2)
function quadCorners(q: Quad): [number, number, number][] {
  const [fx, fy, fz] = q.from;
  const [tx, ty, tz] = q.to;
  switch (q.face as Face) {
    case 'north':
      return [[fx, ty, fz], [tx, ty, fz], [fx, fy, fz], [tx, fy, fz]];
    case 'south':
      return [[fx, ty, tz], [tx, ty, tz], [fx, fy, tz], [tx, fy, tz]];
    case 'west':
      return [[fx, ty, fz], [fx, ty, tz], [fx, fy, fz], [fx, fy, tz]];
    case 'east':
      return [[tx, ty, fz], [tx, ty, tz], [tx, fy, fz], [tx, fy, tz]];
    case 'up':
      return [[fx, ty, fz], [tx, ty, fz], [fx, ty, tz], [tx, ty, tz]];
    default:
      return [[fx, fy, fz], [tx, fy, fz], [fx, fy, tz], [tx, fy, tz]];
  }
}

function rotatePoint(
  p: [number, number, number],
  rot?: Quad['rotation'],
): [number, number, number] {
  if (!rot || !rot.angle) return p;
  const [ox, oy, oz] = rot.origin ?? [8, 8, 8];
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

type Vec3 = [number, number, number];

/**
 * 固定等距正交投影（相机位于方块西北上方，正面 north 朝画面左侧）。
 * 返回 [屏幕x, 屏幕y]，单位为图标宽度。
 */
function project(p: Vec3, size: number): [number, number] {
  const x = p[0] / 16;
  const y = p[1] / 16;
  const z = p[2] / 16;
  return [
    (0.5 * (z - x) + 0.5) * size,
    // y 向上 => 屏幕 y 变小（画面上方）
    (2 * K + V - (x + z) * K - y * V) * size,
  ];
}

/**
 * 以多边形中心为基准外扩，用来盖住相邻面之间的抗锯齿缝隙。
 *
 * 注意要连「贴图使用的角点」一起外扩（而不是只外扩裁剪路径）：
 * 每个面的贴图边缘本身是抗锯齿的半透明过渡，两个面严丝合缝地拼在一起时
 * 半透明边缘叠加仍有缝隙，会露出底色，看起来像黑线。把面本身放大 1.2%
 * 让它们互相压住，才能真正消掉黑线。
 */
function growPoints(
  points: [number, number][],
  factor: number,
): [number, number][] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [
    cx + (x - cx) * factor,
    cy + (y - cy) * factor,
  ]);
}

/** 相邻面互相压住的放大比例（1.2%，肉眼不可见，足够盖住 1px 抗锯齿缝） */
const SEAM_OVERLAP = 1.012;

/**
 * 方块图标：固定角度、不可交互的等距 3D 渲染。
 * 直接使用原版模型几何 + 贴图，非立方体（讲台、栅栏等）也能正确显示形状。
 *
 * 用法：
 *   <BlockDisplay item="me_charger" size={100} />
 *   <BlockDisplay block="lectern" size={32} />
 *   <BlockDisplay skull="https://.../skin.png" face="east" size={48} />
 */
export default function BlockDisplay({
  block,
  item,
  skull,
  face,
  size = 32,
  name,
  className,
}: {
  /** 方块模型 id，多模型叠加用数组或逗号分隔 */
  block?: string | string[];
  /** 物品库 id（src/data/items），自动取 block / skull / name */
  item?: string;
  /** 自定义头颅贴图 URL（64×64 皮肤 PNG），与 block 二选一（block 优先） */
  skull?: string;
  /** 头颅朝向：up=落地头（默认）；水平方向=脸贴该侧边缘 */
  face?: SkullFace;
  /** 图标宽度（px） */
  size?: number;
  /** 无障碍名称 / 悬停提示 */
  name?: string;
  className?: string;
}): ReactNode {
  const texBase = useBaseUrl('/img/Minecraft/block');
  // 注意用 '/' 而不是 ''：Docusaurus 的 addBaseUrl 对空串直接原样返回（不做前缀拼接）
  const atlasBase = useBaseUrl('/');
  const isProd = process.env.NODE_ENV === 'production';
  const [quads, setQuads] = useState<Quad[] | null>(null);
  const [atlasMeta, setAtlasMeta] = useState<Meta | null>(null);
  // atlas meta 是否已经尝试加载完（成功或失败），用于避免预加载已删除的原贴图
  const [atlasReady, setAtlasReady] = useState(!isProd);
  // prod 环境预加载 atlas meta（全局单例 Promise，多个 BlockDisplay 共享）
  useEffect(() => {
    if (!isProd) return;
    let cancelled = false;
    loadAtlasMeta(atlasBase).then((m) => {
      if (!cancelled) {
        setAtlasMeta(m);
        setAtlasReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [atlasBase, isProd]);

  // item 引用物品库，block/skull 直接内联；item 优先
  const resolved = useMemo(() => {
    if (!item) return {block, skull, name};
    const def = resolveItem(item);
    return {
      block: block ?? def.block,
      skull: skull ?? def.skull,
      name: name ?? def.name,
    };
  }, [item, block, skull, name]);

  const blockKey = Array.isArray(resolved.block)
    ? resolved.block.join(',')
    : resolved.block ?? '';
  const skullUrl = resolved.skull ?? '';

  useEffect(() => {
    if (blockKey) {
      let cancelled = false;
      setQuads(null);
      resolveBlockQuads(blockKey, texBase).then((q) => {
        if (!cancelled) setQuads(q);
      });
      return () => {
        cancelled = true;
      };
    }
    // 无方块模型时回退到头颅（同步生成，无需请求）
    setQuads(skullUrl ? skullQuads(skullUrl, face) : []);
    return undefined;
  }, [blockKey, skullUrl, face, texBase]);

  // 贴图（含 atlas）解码后的 Image 对象，绘制时直接 drawImage
  const [imgs, setImgs] = useState<Record<string, LoadedImg>>({});
  useEffect(() => {
    if (!quads || quads.length === 0) return;
    // prod 下等 atlas meta 就绪：命中 atlas 的原 PNG 已被删除，
    // 提前加载只会得到 404
    if (!atlasReady) return;
    let cancelled = false;
    const srcs = [
      ...new Set(
        quads.map(
          (q) => resolveTex(q.texture, atlasMeta, isProd, atlasBase).src,
        ),
      ),
    ];
    Promise.all(srcs.map((s) => loadImg(s).catch(() => null))).then((list) => {
      if (cancelled) return;
      const map: Record<string, LoadedImg> = {};
      list.forEach((v, i) => {
        if (v) map[srcs[i]] = v;
      });
      setImgs(map);
    });
    return () => {
      cancelled = true;
    };
  }, [quads, atlasMeta, atlasReady, atlasBase, isProd]);

  const drawn = useMemo(() => {
    if (!quads) return [];
    return quads
      .map((q) => {
        const rotated = quadCorners(q).map((p) => rotatePoint(p, q.rotation));
        // 投影后整体外扩一点：相邻面互相压住，消除接缝处的黑线
        const pts = growPoints(
          rotated.map((p) => project(p, size)),
          SEAM_OVERLAP,
        );
        // 用四个角的中点算深度：越大越远，先画远的（画家算法）
        const cx = rotated.reduce((s, p) => s + p[0], 0) / 4;
        const cy = rotated.reduce((s, p) => s + p[1], 0) / 4;
        const cz = rotated.reduce((s, p) => s + p[2], 0) / 4;
        const depth =
          (cx + cz) / 16 - (cy / 16) * 0.6 - (q.depthBias ?? 0);
        return {q, pts, depth};
      })
      .sort((a, b) => b.depth - a.depth);
  }, [quads, size]);

  // 实际投影包围盒，按内容设置视口，避免特殊模型被裁切
  const bounds = useMemo(() => {
    if (drawn.length === 0) return {x: 0, y: 0, w: size, h: size};
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const {pts} of drawn) {
      for (const [x, y] of pts) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const w = Math.max(maxX - minX, 0.001);
    const h = Math.max(maxY - minY, 0.001);
    // 留一点边距，避免贴图边缘被抗锯齿裁掉
    const pad = Math.max(w, h) * 0.03;
    return {x: minX - pad, y: minY - pad, w: w + pad * 2, h: h + pad * 2};
  }, [drawn, size]);

  const renderHeight = (bounds.h / bounds.w) * size;

  // 每个面的绘制参数：裁剪多边形 + 贴图坐标 -> 屏幕坐标的仿射矩阵 + 取图区域
  const faces = useMemo(
    () =>
      drawn.map(({q, pts}) => {
        const [A, B, C] = pts;
        // 角点 A/B/C 各自要采样的 uv（面旋转后是同一矩形内的另一点）。
        // 与 Structure3D 共用 quadUvPoints，保证两处贴图方向一致。
        const uvPts = quadUvPoints(q.uv, q.face).map(([u, v]) =>
          rotateFaceUv(u, v, q.uv, q.uvRotation),
        );
        const [pA, pB, pC] = uvPts;
        // 由三组「屏幕点 <-> uv 点」解出仿射矩阵，映射贴图到投影后的平行四边形
        const det =
          (pB[0] - pA[0]) * (pC[1] - pA[1]) -
            (pC[0] - pA[0]) * (pB[1] - pA[1]) || 1e-6;
        const m00 =
          ((B[0] - A[0]) * (pC[1] - pA[1]) - (C[0] - A[0]) * (pB[1] - pA[1])) /
          det;
        const m01 =
          ((C[0] - A[0]) * (pB[0] - pA[0]) - (B[0] - A[0]) * (pC[0] - pA[0])) /
          det;
        const m10 =
          ((B[1] - A[1]) * (pC[1] - pA[1]) - (C[1] - A[1]) * (pB[1] - pA[1])) /
          det;
        const m11 =
          ((C[1] - A[1]) * (pB[0] - pA[0]) - (B[1] - A[1]) * (pC[0] - pA[0])) /
          det;
        const m: [number, number, number, number, number, number] = [
          m00,
          m10,
          m01,
          m11,
          A[0] - m00 * pA[0] - m01 * pA[1],
          A[1] - m10 * pA[0] - m11 * pA[1],
        ];
        // Atlas 命中：把 uv 原点平移到 atlas 里对应的 region
        const hit = resolveTex(q.texture, atlasMeta, isProd, atlasBase);
        const ox = hit.region?.x ?? 0;
        const oy = hit.region?.y ?? 0;
        if (hit.region) {
          m[4] -= m00 * ox + m01 * oy;
          m[5] -= m10 * ox + m11 * oy;
        }
        // 只取 uv 覆盖到的那一小块，避免每个面都画整张 atlas
        const xs = uvPts.map(([u]) => u + ox);
        const ys = uvPts.map(([, v]) => v + oy);
        const sx = Math.floor(Math.min(...xs));
        const sy = Math.floor(Math.min(...ys));
        const sw = Math.max(1, Math.ceil(Math.max(...xs)) - sx);
        const sh = Math.max(1, Math.ceil(Math.max(...ys)) - sy);
        return {
          pts,
          m,
          src: hit.src,
          sx,
          sy,
          sw,
          sh,
          shade: FACE_SHADE[q.face as Face] ?? 1,
        };
      }),
    [drawn, atlasMeta, atlasBase, isProd],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 真正绘制：canvas + imageSmoothingEnabled=false，贴图放大保持像素感
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || faces.length === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = Math.max(1, Math.round(size * dpr));
    const ch = Math.max(1, Math.round(renderHeight * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    // 与 SVG 的 viewBox 等价：bounds -> 画布像素
    const k = (size / bounds.w) * dpr;
    ctx.setTransform(k, 0, 0, k, -bounds.x * k, -bounds.y * k);

    for (const f of faces) {
      const loaded = imgs[f.src];
      if (!loaded) continue;
      // 顺序 A→B→D→C（pts = [A 左上, B 右上, C 左下, D 右下]），
      // 直接按 A-B-D-C 连才不会自相交成 X 形
      const [a, b, c, d] = f.pts;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.clip();

      ctx.save();
      ctx.transform(f.m[0], f.m[1], f.m[2], f.m[3], f.m[4], f.m[5]);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        loaded.img,
        f.sx,
        f.sy,
        f.sw,
        f.sh,
        f.sx,
        f.sy,
        f.sw,
        f.sh,
      );
      ctx.restore();

      // 面向光照明暗：在裁剪区域内叠一层黑（等价于 brightness 压暗）
      if (f.shade < 1) {
        ctx.globalAlpha = 1 - f.shade;
        ctx.fillStyle = '#000';
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }, [faces, imgs, bounds, size, renderHeight]);

  if (!quads || quads.length === 0) {
    return <span className={styles.placeholder} style={{width: size, height: size}} />;
  }

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(size * 2)}
      height={Math.round(renderHeight * 2)}
      style={{width: size, height: renderHeight, imageRendering: 'auto'}}
      role="img"
      aria-label={resolved.name ?? ''}
      className={`${styles.svg} ${className ?? ''}`}
    />
  );
}
