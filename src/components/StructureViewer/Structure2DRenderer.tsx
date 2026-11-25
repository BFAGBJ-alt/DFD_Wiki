import React, {useEffect, useLayoutEffect, useMemo, useState, type ReactNode} from 'react';
import {Canvas, useThree} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import * as THREE from 'three';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {resolveItem} from '@site/src/data/items/index';
import {
  resolveBlockQuads,
  resolveBlockRotation,
  rotateBlockFace,
  rotateFaceUv,
  quadUvPoints,
  skullQuads,
  type Quad,
} from './modelResolver';
import {loadAtlasMeta, resolveTex, type Meta} from '@site/src/utils/minecraftAtlas';
import {resolveStructure, type BlockDef, type Structure, type StructureBlock} from './types';
import styles from './styles.module.css';

// 与 Structure3D 相同的方块尺寸约定：1 = 严格贴合
const SIZE = 1;
const OFFSET = -SIZE / 2;
const S = SIZE / 16;

let _atlasTex: THREE.Texture | null = null;
let _atlasTexUrl: string | null = null;
const _sharedAtlasTextures = new Set<THREE.Texture>();

function useAtlasMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(null);
  const baseUrl = useBaseUrl('/');
  const isProd = process.env.NODE_ENV === 'production';
  useEffect(() => {
    if (!isProd) return;
    let cancelled = false;
    loadAtlasMeta(baseUrl).then((m) => {
      if (!cancelled) setMeta(m);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, isProd]);
  return meta;
}

function getAtlasTexture(url: string): THREE.Texture | null {
  if (_atlasTex && _atlasTexUrl === url) return _atlasTex;
  const loader = new THREE.TextureLoader();
  _atlasTex = loader.load(url);
  _atlasTex.magFilter = THREE.NearestFilter;
  _atlasTex.minFilter = THREE.NearestFilter;
  _atlasTex.generateMipmaps = false;
  _atlasTex.colorSpace = THREE.SRGBColorSpace;
  _atlasTexUrl = url;
  _sharedAtlasTextures.add(_atlasTex);
  return _atlasTex;
}

// 手动加载贴图；命中 atlas 时共享一张 atlas 并设置 offset/repeat
function useTextures(
  urls: string[],
  atlasMeta: Meta | null,
  atlasBaseUrl: string,
  isProd: boolean,
): {
  texMap: Map<string, THREE.Texture>;
  dims: Map<string, [number, number]>;
} {
  const [texMap, setTexMap] = useState<Map<string, THREE.Texture>>(new Map());
  const [dims, setDims] = useState<Map<string, [number, number]>>(new Map());
  const urlKey = urls.join('|');
  useEffect(() => {
    if (!urlKey) {
      setTexMap(new Map());
      setDims(new Map());
      return;
    }
    const loader = new THREE.TextureLoader();
    const m = new Map<string, THREE.Texture>();
    const dm = new Map<string, [number, number]>();
    let cancelled = false;
    let needsAtlas = false;
    const atlasHits: {
      url: string;
      src: string;
      region: {x: number; y: number; w: number; h: number};
      atlasW: number;
      atlasH: number;
    }[] = [];

    for (const u of urlKey.split('|')) {
      const hit = resolveTex(u, atlasMeta, isProd, atlasBaseUrl);
      if (hit.region && hit.atlasW && hit.atlasH) {
        atlasHits.push({
          url: u,
          src: hit.src,
          region: hit.region,
          atlasW: hit.atlasW,
          atlasH: hit.atlasH,
        });
        needsAtlas = true;
      } else {
        const t = loader.load(
          u,
          (loaded) => {
            const img = loaded.image as HTMLImageElement | undefined;
            if (img) {
              dm.set(u, [img.width || 1, img.height || 1]);
              setDims(new Map(dm));
            }
          },
          undefined,
          () => {
            if (cancelled) return;
            m.delete(u);
            setTexMap(new Map(m));
          },
        );
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.SRGBColorSpace;
        m.set(u, t);
      }
    }

    if (needsAtlas && atlasHits.length > 0) {
      const atlasTex = getAtlasTexture(atlasHits[0].src)!;
      for (const hit of atlasHits) {
        const texClone = atlasTex.clone();
        texClone.offset.set(
          hit.region.x / hit.atlasW,
          (hit.atlasH - hit.region.y - hit.region.h) / hit.atlasH,
        );
        texClone.repeat.set(hit.region.w / hit.atlasW, hit.region.h / hit.atlasH);
        texClone.needsUpdate = true;
        m.set(hit.url, texClone);
        dm.set(hit.url, [hit.region.w, hit.region.h]);
      }
      setDims(new Map(dm));
    }

    setTexMap(m);
    return () => {
      cancelled = true;
      m.forEach((t) => {
        if (!_sharedAtlasTextures.has(t)) t.dispose();
      });
    };
  }, [urlKey, atlasMeta, atlasBaseUrl, isProd]);
  return {texMap, dims};
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

function blockQuaternion(
  block: string | string[] | undefined,
  facing: StructureBlock['facing'],
  axis: StructureBlock['axis'],
): THREE.Quaternion | undefined {
  if (!block) return undefined;
  const rotations = resolveBlockRotation(block, facing, axis);
  if (rotations.length === 0) return undefined;
  const q = new THREE.Quaternion();
  for (const r of rotations) {
    const axisVec =
      r.axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : r.axis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
    q.premultiply(
      new THREE.Quaternion().setFromAxisAngle(
        axisVec,
        THREE.MathUtils.degToRad(r.angle),
      ),
    );
  }
  return q;
}

function mcQuadCorners(q: Quad): [number, number, number][] {
  const [fx, fy, fz] = q.from;
  const [tx, ty, tz] = q.to;
  switch (q.face) {
    case 'north':
      return [
        [fx, ty, fz], [tx, ty, fz],
        [fx, fy, fz], [tx, fy, fz],
      ];
    case 'south':
      return [
        [fx, ty, tz], [tx, ty, tz],
        [fx, fy, tz], [tx, fy, tz],
      ];
    case 'west':
      return [
        [fx, ty, fz], [fx, ty, tz],
        [fx, fy, fz], [fx, fy, tz],
      ];
    case 'east':
      return [
        [tx, ty, fz], [tx, ty, tz],
        [tx, fy, fz], [tx, fy, tz],
      ];
    case 'up':
      return [
        [fx, ty, fz], [tx, ty, fz],
        [fx, ty, tz], [tx, ty, tz],
      ];
    case 'down':
    default:
      return [
        [fx, fy, fz], [tx, fy, fz],
        [fx, fy, tz], [tx, fy, tz],
      ];
  }
}

type QuadData = {positions: number[]; uvs: number[]; indices: number[]};

function emptyQuadData(): QuadData {
  return {positions: [], uvs: [], indices: []};
}

function appendQuad(
  target: QuadData,
  q: Quad,
  natural?: [number, number],
  quat?: THREE.Quaternion,
  pos?: [number, number, number],
): void {
  const base = target.positions.length / 3;
  const uvs = quadUvPoints(q.uv, q.face);
  const [texW, texH] = natural ?? q.texSize ?? [16, 16];
  for (const [u, v] of uvs) {
    const [ru, rv] = rotateFaceUv(u, v, q.uv, q.uvRotation);
    target.uvs.push(ru / texW, 1 - rv / texH);
  }

  for (const mc of mcQuadCorners(q)) {
    const [x, y, z] = rotatePoint(mc, q.rotation);
    let vx = OFFSET + x * S;
    let vy = OFFSET + y * S;
    let vz = OFFSET + z * S;
    if (quat) {
      const v = new THREE.Vector3(vx, vy, vz).applyQuaternion(quat);
      vx = v.x;
      vy = v.y;
      vz = v.z;
    }
    if (pos) {
      vx += pos[0];
      vy += pos[1];
      vz += pos[2];
    }
    target.positions.push(vx, vy, vz);
  }
  target.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

function dataToGeometry(data: QuadData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  geo.setIndex(data.indices);
  return geo;
}

function buildQuadGeometry(q: Quad, natural?: [number, number]): THREE.BufferGeometry {
  const data = emptyQuadData();
  appendQuad(data, q, natural);
  return dataToGeometry(data);
}

// ===== 不可见面剔除（与 Structure3D 同一套规则） =====

const FACE_OFFSET: Record<Quad['face'], [number, number, number]> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};

const TRANSPARENT_ID = /(glass|leaves|ice|slime_block|honey_block|copper_grate|water)/;

function isTransparentBlock(b: StructureBlock): boolean {
  if (!b.block) return false;
  const ids = Array.isArray(b.block) ? b.block : b.block.split(',');
  return ids.some((id) => TRANSPARENT_ID.test(id.trim()));
}

function transparentKind(b: StructureBlock): string | null {
  if (!isTransparentBlock(b) || !b.block) return null;
  const ids = Array.isArray(b.block) ? b.block : b.block.split(',');
  return ids.map((s) => s.trim()).join(',');
}

const OPPOSITE_FACE: Record<Quad['face'], Quad['face']> = {
  north: 'south',
  south: 'north',
  west: 'east',
  east: 'west',
  up: 'down',
  down: 'up',
};

function isTransparentTexture(url: string): boolean {
  return TRANSPARENT_ID.test(url);
}

function onBlockBoundary(q: Quad): boolean {
  switch (q.face) {
    case 'north':
      return q.from[2] === 0;
    case 'south':
      return q.to[2] === 16;
    case 'west':
      return q.from[0] === 0;
    case 'east':
      return q.to[0] === 16;
    case 'down':
      return q.from[1] === 0;
    case 'up':
      return q.to[1] === 16;
  }
}

function coversFullFace(q: Quad): boolean {
  if (q.rotation?.angle || !onBlockBoundary(q)) return false;
  const [fx, fy, fz] = q.from;
  const [tx, ty, tz] = q.to;
  switch (q.face) {
    case 'north':
    case 'south':
      return fx === 0 && tx === 16 && fy === 0 && ty === 16;
    case 'west':
    case 'east':
      return fz === 0 && tz === 16 && fy === 0 && ty === 16;
    case 'up':
    case 'down':
      return fx === 0 && tx === 16 && fz === 0 && tz === 16;
  }
}

function isFullCube(quads: Quad[] | null): boolean {
  if (!quads) return false;
  const seen = new Set<Quad['face']>();
  for (const q of quads) {
    if (coversFullFace(q)) seen.add(q.face);
  }
  return seen.size === 6;
}

/** 单方块：静态渲染，只保留悬停显示名称（无高亮、无点击） */
function StaticBlock({
  block,
  quads,
  materials,
  dims,
}: {
  block: StructureBlock;
  quads: Quad[] | null;
  materials: Map<string, THREE.MeshBasicMaterial>;
  dims: Map<string, [number, number]>;
}): ReactNode {
  const [hovered, setHovered] = useState(false);

  const fallbackMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: block.color ?? '#888888',
        transparent: false,
        side: THREE.DoubleSide,
      }),
    [block.color],
  );

  const geometries = useMemo(
    () => (quads ?? []).map((q) => buildQuadGeometry(q, dims.get(q.texture))),
    [quads, dims],
  );

  useEffect(
    () => () => {
      geometries.forEach((g) => g.dispose());
      fallbackMaterial.dispose();
    },
    [geometries, fallbackMaterial],
  );

  const rotation = useMemo(
    () => blockQuaternion(block.block, block.facing, block.axis),
    [block.block, block.facing, block.axis],
  );

  return (
    <group
      position={[block.x, block.y, block.z]}
      quaternion={rotation}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}>
      {geometries.length > 0 ? (
        geometries.map((g, i) => (
          <mesh
            key={i}
            geometry={g}
            material={materials.get(quads![i].texture) ?? fallbackMaterial}
          />
        ))
      ) : (
        <mesh material={fallbackMaterial}>
          <boxGeometry args={[SIZE, SIZE, SIZE]} />
        </mesh>
      )}
      {hovered && block.label && (
        <Html center zIndexRange={[10, 0]} wrapperClass={styles.labelWrap}>
          <div className={styles.label}>{block.label}</div>
        </Html>
      )}
    </group>
  );
}

/** 多状态方块：按 interval（tick）轮换，没有交互 */
function MultiStateBlock({
  candidates,
  materials,
  dims,
  interval,
}: {
  candidates: {def: StructureBlock; quads: Quad[] | null}[];
  materials: Map<string, THREE.MeshBasicMaterial>;
  dims: Map<string, [number, number]>;
  interval?: number;
}): ReactNode {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [interval, candidates.length]);

  useEffect(() => {
    if (!interval || interval <= 0 || candidates.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % candidates.length);
    }, interval * 50);
    return () => window.clearInterval(id);
  }, [interval, candidates.length]);

  const current = candidates[index % candidates.length] ?? candidates[0];

  return (
    <StaticBlock
      block={current.def}
      quads={current.quads}
      materials={materials}
      dims={dims}
    />
  );
}

/**
 * 静态相机：按方位角 / 仰角放置，并根据包围球与容器宽高比计算距离，
 * 保证整个结构刚好落在画面内。容器尺寸变化时重新取景。
 */
function StaticCamera({
  radius,
  azimuth,
  elevation,
  distance,
}: {
  radius: number;
  azimuth: number;
  elevation: number;
  /** 相机距离倍率：1 = 刚好容纳结构，>1 拉远，<1 拉近 */
  distance: number;
}): null {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useLayoutEffect(() => {
    const r = Number.isFinite(radius) && radius > 0 ? radius : 8;
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 4 / 3;
    const vFov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov || 40);
    // 水平视场由宽高比推出，取两个方向里更“紧”的那个来算距离
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const zoom = Number.isFinite(distance) && distance > 0 ? distance : 1;
    const dist =
      Math.max(r / Math.sin(vFov / 2), r / Math.sin(hFov / 2)) * 1.02 * zoom;

    const az = THREE.MathUtils.degToRad(azimuth);
    const el = THREE.MathUtils.degToRad(
      Math.max(-89, Math.min(89, elevation)),
    );
    const cosEl = Math.cos(el);
    camera.near = Math.max(0.1, r / 100);
    camera.far = dist + r * 3;
    camera.position.set(
      dist * cosEl * Math.sin(az),
      dist * Math.sin(el),
      dist * cosEl * Math.cos(az),
    );
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, radius, azimuth, elevation, distance]);

  return null;
}

export type Structure2DRendererProps = {
  /** 结构名，对应 static/structures/<name>.json */
  name: string;
  /** 方块贴图根路径，默认 /img/Minecraft/block */
  texBase: string;
  /** 水平方位角（度），0 = 正南，逆时针增大；默认 45 */
  azimuth: number;
  /** 仰角（度），默认 29.5 */
  elevation: number;
  /** 相机距离倍率：1 = 刚好容纳整个结构，>1 拉远，<1 拉近；默认 1 */
  distance: number;
  /** 结构在屏幕上的投影宽高比（宽 / 高），用于让容器高度贴合结构 */
  onAspectChange?: (aspect: number) => void;
};

export default function Structure2DRenderer({
  name,
  texBase,
  azimuth,
  elevation,
  distance,
  onAspectChange,
}: Structure2DRendererProps): ReactNode {
  const [structure, setStructure] = useState<Structure | null>(null);
  const [failed, setFailed] = useState(false);
  const [candidateLists, setCandidateLists] = useState<
    {def: StructureBlock; quads: Quad[] | null}[][] | null
  >(null);

  const jsonUrl = useBaseUrl(`/structures/${name}.json`);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch(jsonUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((s: Structure) => {
        if (!cancelled) setStructure(resolveStructure(s, resolveItem));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [jsonUrl]);

  useEffect(() => {
    if (!structure) return;
    let cancelled = false;
    const loadQuads = (d: BlockDef): Promise<Quad[] | null> =>
      d.block
        ? resolveBlockQuads(d.block, texBase)
        : d.skull
          ? Promise.resolve(skullQuads(d.skull, d.face))
          : Promise.resolve(null);
    Promise.all(
      structure.blocks.map((b) => {
        const defs = b.candidates?.length ? b.candidates : [b];
        return Promise.all(defs.map(loadQuads)).then((lists) =>
          defs.map((d, k) => ({
            def: {
              ...b,
              block: d.block,
              skull: d.skull,
              item: d.item ?? b.item,
              facing: d.facing ?? b.facing,
              axis: d.axis ?? b.axis,
              face: d.face ?? b.face,
              label: d.label ?? b.label,
              color: d.color ?? b.color,
            } as StructureBlock,
            quads: lists[k] ?? null,
          })),
        );
      }),
    ).then((lists) => {
      if (!cancelled) setCandidateLists(lists);
    });
    return () => {
      cancelled = true;
    };
  }, [structure, texBase]);

  const atlasMeta = useAtlasMeta();
  const atlasBaseUrl = useBaseUrl('/');
  const isProd = process.env.NODE_ENV === 'production';

  const allUrls = useMemo(
    () => [
      ...new Set(
        (candidateLists ?? []).flatMap((list) =>
          list.flatMap((c) => (c.quads ?? []).map((x) => x.texture)),
        ),
      ),
    ],
    [candidateLists],
  );
  const {texMap, dims} = useTextures(allUrls, atlasMeta, atlasBaseUrl, isProd);

  const materials = useMemo(() => {
    const m = new Map<string, THREE.MeshBasicMaterial>();
    for (const [url, tex] of texMap) {
      const transparent = isTransparentTexture(url);
      const params: THREE.MeshBasicMaterialParameters = {
        map: tex,
        transparent,
        depthWrite: !transparent,
        polygonOffset: transparent,
        polygonOffsetFactor: transparent ? -1 : 0,
        polygonOffsetUnits: transparent ? -1 : 0,
        side: THREE.DoubleSide,
      };
      if (!transparent) params.alphaTest = 0.5;
      m.set(url, new THREE.MeshBasicMaterial(params));
    }
    return m;
  }, [texMap]);

  const fallbackMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#888888',
        transparent: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(
    () => () => {
      materials.forEach((m) => m.dispose());
      fallbackMaterial.dispose();
    },
    [materials, fallbackMaterial],
  );

  // 全量方块 + 相机范围 + 面剔除（无分层）
  const prepared = useMemo(() => {
    if (!candidateLists || !structure) return null;
    const shown = structure.blocks.map((b, i) => ({b, i}));
    if (shown.length === 0) {
      return {
        entries: [],
        center: [0, 0, 0] as const,
        size: [2, 2, 2] as [number, number, number],
        radius: 2,
      };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const {b} of shown) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
      minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z);
    }

    const occupancy = new Map<string, {b: StructureBlock; i: number}>();
    for (const entry of shown) {
      occupancy.set(`${entry.b.x},${entry.b.y},${entry.b.z}`, entry);
    }

    const fullCube = new Map<number, boolean>();
    const isFull = (i: number): boolean => {
      let v = fullCube.get(i);
      if (v === undefined) {
        v = isFullCube(candidateLists[i]?.[0]?.quads ?? null);
        fullCube.set(i, v);
      }
      return v;
    };

    const rotsCache = new Map<number, ReturnType<typeof resolveBlockRotation>>();
    const rotsOf = (b: StructureBlock, i: number) => {
      let r = rotsCache.get(i);
      if (r === undefined) {
        r = b.block ? resolveBlockRotation(b.block, b.facing, b.axis) : [];
        rotsCache.set(i, r);
      }
      return r;
    };

    const entries = shown.map(({b, i}) => {
      const multi = (b.candidates?.length ?? 0) > 1;
      const quads = candidateLists[i]?.[0]?.quads ?? [];
      if (multi) return {b, i, quads, multi: true};
      const transparent = isTransparentBlock(b);
      const rots = rotsOf(b, i);
      const kept = quads.filter((q) => {
        if (!coversFullFace(q)) return true;
        const face = rotateBlockFace(q.face, rots);
        const [dx, dy, dz] = FACE_OFFSET[face];
        const nb = occupancy.get(`${b.x + dx},${b.y + dy},${b.z + dz}`);
        if (!nb || !isFull(nb.i)) return true;

        if (!transparent) {
          if (isTransparentBlock(nb.b)) return true;
          return false;
        }

        if (!isTransparentBlock(nb.b)) return true;
        const kind = transparentKind(b);
        if (!kind || kind !== transparentKind(nb.b)) return true;
        const nbRots = rotsOf(nb.b, nb.i);
        const nbQuad = (candidateLists[nb.i]?.[0]?.quads ?? []).find(
          (x) =>
            coversFullFace(x) &&
            rotateBlockFace(x.face, nbRots) === OPPOSITE_FACE[face],
        );
        if (!nbQuad || nbQuad.texture !== q.texture) return true;
        return false;
      });
      return {b, i, quads: kept, multi: false};
    });

    const size: [number, number, number] = [
      maxX - minX + 1,
      maxY - minY + 1,
      maxZ - minZ + 1,
    ];
    return {
      entries,
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as const,
      size,
      // 用包围盒半对角线当包围球半径，任何角度旋转后都不会超出画面
      radius: Math.max(
        0.5,
        Math.sqrt(size[0] ** 2 + size[1] ** 2 + size[2] ** 2) / 2,
      ),
    };
  }, [structure, candidateLists]);

  // 结构在当前机位下的屏幕投影宽高比，决定容器高度
  const autoAspect = useMemo(() => {
    if (!prepared) return 4 / 3;
    const [dx, dy, dz] = prepared.size;
    const az = THREE.MathUtils.degToRad(azimuth);
    const el = THREE.MathUtils.degToRad(
      Math.max(-89, Math.min(89, elevation)),
    );
    const dir = [
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az),
    ];
    // right = up × dir，upScreen = dir × right
    const right = [
      dir[2],
      0,
      -dir[0],
    ];
    const rightLen = Math.hypot(right[0], right[2]) || 1;
    const rx = right[0] / rightLen;
    const rz = right[2] / rightLen;
    const up = [
      dir[1] * rz - dir[2] * 0,
      dir[2] * rx - dir[0] * rz,
      dir[0] * 0 - dir[1] * rx,
    ];
    const w = Math.abs(dx * rx) + Math.abs(dz * rz);
    const h = Math.abs(dx * up[0]) + Math.abs(dy * up[1]) + Math.abs(dz * up[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || h < 0.5) return 4 / 3;
    const ratio = w / h;
    return Math.min(2.4, Math.max(0.7, ratio));
  }, [prepared, azimuth, elevation]);

  useEffect(() => {
    onAspectChange?.(Number(autoAspect.toFixed(3)));
  }, [autoAspect, onAspectChange]);

  // 无名称、非多状态、有几何的方块合并成按贴图分组的整体
  const merged = useMemo(() => {
    if (!prepared) return [];
    const groups = new Map<string, QuadData>();
    for (const {b, quads, multi} of prepared.entries) {
      if (multi || b.label || quads.length === 0) continue;
      const quat = blockQuaternion(b.block, b.facing, b.axis);
      for (const q of quads) {
        let data = groups.get(q.texture);
        if (!data) {
          data = emptyQuadData();
          groups.set(q.texture, data);
        }
        appendQuad(data, q, dims.get(q.texture), quat, [b.x, b.y, b.z]);
      }
    }
    return [...groups].map(([texture, data]) => ({
      texture,
      geometry: dataToGeometry(data),
    }));
  }, [prepared, dims]);

  useEffect(
    () => () => {
      merged.forEach((m) => m.geometry.dispose());
    },
    [merged],
  );

  if (failed) {
    return <div className={styles.canvas2dError}>结构「{name}」加载失败</div>;
  }
  if (!prepared) return <div className={styles.canvas2dPlaceholder} />;

  const individual = prepared.entries.filter(
    ({b, quads, multi}) => multi || b.label || quads.length === 0,
  );
  const {center, radius} = prepared;

  return (
    <Canvas
      camera={{fov: 40, near: 0.1, far: radius * 8}}
      dpr={[1, 2]}
      style={{width: '100%', height: '100%'}}>
      <StaticCamera
        radius={radius}
        azimuth={azimuth}
        elevation={elevation}
        distance={distance}
      />
      <group position={[-center[0], -center[1], -center[2]]}>
        {merged.map(({texture, geometry}) => (
          <mesh
            key={texture}
            geometry={geometry}
            material={materials.get(texture) ?? fallbackMaterial}
          />
        ))}
        {individual.map(({b, i, quads, multi}) =>
          multi && candidateLists?.[i] ? (
            <MultiStateBlock
              key={i}
              candidates={candidateLists[i]}
              materials={materials}
              dims={dims}
              interval={b.interval}
            />
          ) : (
            <StaticBlock
              key={i}
              block={b}
              quads={quads}
              materials={materials}
              dims={dims}
            />
          ),
        )}
      </group>
    </Canvas>
  );
}
