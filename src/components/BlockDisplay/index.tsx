import React, {useEffect, useId, useMemo, useState, type ReactNode} from 'react';
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

// 动画贴图（如海晶灯）是一张 16 × (16×帧数) 的竖向长图，
// 图标里只需要第一帧，否则会把整条帧序列压进一个面。
// 同时记录贴图原始尺寸：头颅皮肤有 64×64 与 64×32（旧版）两种，
// 必须按 natural 尺寸渲染，否则 UV 采样会错位。
type ImgInfo = {w: number; h: number; frames: number};
const imgCache = new Map<string, Promise<ImgInfo>>();

function loadImgInfo(url: string): Promise<ImgInfo> {
  let p = imgCache.get(url);
  if (!p) {
    p = new Promise<ImgInfo>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || 1;
        const h = img.naturalHeight || 1;
        resolve({w, h, frames: h > w && h % w === 0 ? h / w : 1});
      };
      img.onerror = () => resolve({w: 16, h: 16, frames: 1});
      img.src = url;
    });
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
  const atlasBase = useBaseUrl('');
  const isProd = process.env.NODE_ENV === 'production';
  const [quads, setQuads] = useState<Quad[] | null>(null);
  const [atlasMeta, setAtlasMeta] = useState<Meta | null>(null);
  // atlas meta 是否已经尝试加载完（成功或失败），用于避免预加载已删除的原贴图
  const [atlasReady, setAtlasReady] = useState(!isProd);
  // clipPath 的 id 必须全局唯一，否则同页多个图标会互相套用裁剪路径
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

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

  // 贴图原始尺寸与帧数（动画长图只取第一帧）
  const [infos, setInfos] = useState<Record<string, ImgInfo>>({});
  useEffect(() => {
    if (!quads || quads.length === 0) return;
    // prod 下等 atlas meta 就绪：命中 atlas 的贴图原 PNG 已被删除，
    // 预加载只会得到 404，尺寸直接由 atlas 区域决定
    if (!atlasReady) return;
    let cancelled = false;
    const urls = [...new Set(quads.map((q) => q.texture))].filter(
      (u) => !resolveTex(u, atlasMeta, isProd, atlasBase).region,
    );
    if (urls.length === 0) {
      setInfos({});
      return;
    }
    Promise.all(urls.map((u) => loadImgInfo(u))).then((list) => {
      if (cancelled) return;
      setInfos(Object.fromEntries(urls.map((u, i) => [u, list[i]])));
    });
    return () => {
      cancelled = true;
    };
  }, [quads, atlasMeta, atlasReady, atlasBase, isProd]);

  const drawn = useMemo(() => {
    if (!quads) return [];
    return quads
      .map((q, i) => {
        const rotated = quadCorners(q).map((p) => rotatePoint(p, q.rotation));
        const pts = rotated.map((p) => project(p, size));
        // 用四个角的中点算深度：越大越远，先画远的（画家算法）
        const cx = rotated.reduce((s, p) => s + p[0], 0) / 4;
        const cy = rotated.reduce((s, p) => s + p[1], 0) / 4;
        const cz = rotated.reduce((s, p) => s + p[2], 0) / 4;
        const depth =
          (cx + cz) / 16 - (cy / 16) * 0.6 - (q.depthBias ?? 0);
        return {q, pts, depth, id: `${uid}-${i}`};
      })
      .sort((a, b) => b.depth - a.depth);
  }, [quads, size, uid]);

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

  if (!quads || quads.length === 0) {
    return <span className={styles.placeholder} style={{width: size, height: size}} />;
  }

  const renderHeight = (bounds.h / bounds.w) * size;

  return (
    <svg
      width={size}
      height={renderHeight}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
      role="img"
      aria-label={resolved.name ?? ''}
      className={`${styles.svg} ${className ?? ''}`}>
      <defs>
        {drawn.map(({pts, id}) => (
          <clipPath key={id} id={id}>
            {/* 顺序 A→B→D→C，避免自相交 */}
            <polygon
              points={[pts[0], pts[1], pts[3], pts[2]]
                .map(([x, y]) => `${x},${y}`)
                .join(' ')}
            />
          </clipPath>
        ))}
      </defs>
      {drawn.map(({q, pts, id}) => {
        const [A, B, C] = pts;
        // 角点 A/B/C 各自要采样的 uv（面旋转后是同一矩形内的另一点）。
        // 与 Structure3D 共用 quadUvPoints，保证两处贴图方向一致。
        const [pA0, pB0, pC0] = quadUvPoints(q.uv, q.face);
        const pA = rotateFaceUv(pA0[0], pA0[1], q.uv, q.uvRotation);
        const pB = rotateFaceUv(pB0[0], pB0[1], q.uv, q.uvRotation);
        const pC = rotateFaceUv(pC0[0], pC0[1], q.uv, q.uvRotation);
        // 由三组「屏幕点 <-> uv 点」解出仿射矩阵，映射贴图到投影后的平行四边形
        const det =
          ((pB[0] - pA[0]) * (pC[1] - pA[1]) -
            (pC[0] - pA[0]) * (pB[1] - pA[1])) || 1e-6;
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
        const m = [
          m00,
          m10,
          m01,
          m11,
          A[0] - m00 * pA[0] - m01 * pA[1],
          A[1] - m10 * pA[0] - m11 * pA[1],
        ];
        // Atlas 命中：调整仿射矩阵平移量，让原贴图 uv 坐标 (u, v)
        // 映射到 atlas 里 (region.x + u, region.y + v)，再由 m 变换到屏幕
        const atlasHit = resolveTex(q.texture, atlasMeta, isProd, atlasBase);
        const region = atlasHit.region;
        if (region) {
          const [tx, ty] = [
            m[4] - m00 * region.x - m01 * region.y,
            m[5] - m10 * region.x - m11 * region.y,
          ];
          m[4] = tx;
          m[5] = ty;
        }
        const shade = FACE_SHADE[q.face as Face] ?? 1;
        const [texW, texH] = q.texSize ?? [16, 16];
        const info = infos[q.texture];
        const imgW = region ? atlasHit.atlasW! : (info?.w ?? texW);
        const imgH = region ? atlasHit.atlasH! : (info?.h ?? texH);
        return (
          <g
            key={id}
            style={{filter: `brightness(${shade})`}}
            clipPath={`url(#${id})`}>
            <image
              href={atlasHit.src}
              width={imgW}
              height={imgH}
              preserveAspectRatio="none"
              style={{imageRendering: 'pixelated'}}
              transform={`matrix(${m.join(' ')})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
