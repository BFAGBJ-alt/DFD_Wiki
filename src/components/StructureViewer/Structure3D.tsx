import React, {useEffect, useLayoutEffect, useMemo, useState, type ReactNode} from 'react';
import {Canvas, useThree} from '@react-three/fiber';
import {Html, OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import {useHistory} from '@docusaurus/router';
import useBaseUrl, {useBaseUrlUtils} from '@docusaurus/useBaseUrl';
import {
  resolveBlockQuads,
  resolveBlockRotation,
  rotateFaceUv,
  quadUvPoints,
  skullQuads,
  type Quad,
} from './modelResolver';
import {loadAtlasMeta, resolveTex, type Meta} from '@site/src/utils/minecraftAtlas';
import type {Structure, StructureBlock} from './types';
import styles from './styles.module.css';

// 方块渲染尺寸：1 = 严格贴合，方块之间不留缝。
// 贴合后可能出现“背面贴背面”的共面面（玻璃贴不透明块、两块不同玻璃相贴），
// 由透明材质的 polygonOffset 与相机 near/far 收紧解决深度冲突，
// 不再靠缩小方块留缝（那会在方块之间露出背景细线）。
const SIZE = 1;
const OFFSET = -SIZE / 2;
const S = SIZE / 16;

// 全局 atlas texture 缓存（所有 Block 组件共享一张 atlas.png）
let _atlasTex: THREE.Texture | null = null;
let _atlasTexUrl: string | null = null;
let _atlasLoadPromise: Promise<THREE.Texture> | null = null;
// 标记哪些 texture 是 atlas 共享的（cleanup 时跳过，不 dispose）
const _sharedAtlasTextures = new Set<THREE.Texture>();

function useAtlasMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(null);
  // 注意用 '/' 而不是 ''：Docusaurus 的 addBaseUrl 对空串直接原样返回（不做前缀拼接）
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
  // 关掉 mipmap：多张 16px 贴图挤在一张 atlas 里，缩小后各级 mip 会把
  // 相邻贴图混进来，看起来像贴图边缘有一圈黑线
  _atlasTex.minFilter = THREE.NearestFilter;
  _atlasTex.generateMipmaps = false;
  _atlasTex.colorSpace = THREE.SRGBColorSpace;
  _atlasTexUrl = url;
  _sharedAtlasTextures.add(_atlasTex);
  return _atlasTex;
}

// 手动加载贴图：404 时静默回退，不让整个画布崩掉
// atlasMeta 传入时，命中 atlas 的 URL 共享一张 atlas texture 并设置 offset/repeat
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
    const atlasHits: {url: string; src: string; region: {x:number;y:number;w:number;h:number}; atlasW: number; atlasH: number}[] = [];

    for (const u of urlKey.split('|')) {
      const hit = resolveTex(u, atlasMeta, isProd, atlasBaseUrl);
      if (hit.region && hit.atlasW && hit.atlasH) {
        // 命中 atlas：后续统一加载 atlas.png 一次
        atlasHits.push({url: u, src: hit.src, region: hit.region, atlasW: hit.atlasW, atlasH: hit.atlasH});
        needsAtlas = true;
      } else {
        // 直贴图（dev / SlimeFun / 未命中 / Skull 皮肤）
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
            // 贴图加载失败（404 / 网络中断）时立刻把该 url 从材质表里摘掉并重渲染，
            // 让方块退回 fallbackMaterial 的纯色；否则材质会一直引用没有 image
            // 的贴图，采样为黑色，表现为“某个方块整块变黑”。
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

    // 加载 atlas.png 一次，然后给每个命中的 url 设置 offset/repeat
    if (needsAtlas && atlasHits.length > 0) {
      const atlasSrc = atlasHits[0].src;
      const atlasTex = getAtlasTexture(atlasSrc)!;
      // 同步设置 offset/repeat（atlas 纹理加载可能还没完成，但 repeat/offset 属性先设置好）
      // 等 onLoad 触发时 three.js 会重新上传
      for (const hit of atlasHits) {
        // 因为多个命中 url 共享同一张 atlas texture，
        // 但每个 url 需要不同的 offset/repeat，所以我们给每个 url clone 一份！
        // three.js 的 Texture.clone() 是浅拷贝，共享 image 但各自有 offset/repeat
        const texClone = atlasTex.clone();
        // three.js 贴图默认 flipY=true：UV 的 v=0 对应图像底部，
        // 而 atlas 的 region.y 是从图像顶部算起，所以 y 偏移要翻过来
        texClone.offset.set(
          hit.region.x / hit.atlasW,
          (hit.atlasH - hit.region.y - hit.region.h) / hit.atlasH,
        );
        texClone.repeat.set(hit.region.w / hit.atlasW, hit.region.h / hit.atlasH);
        texClone.needsUpdate = true;
        m.set(hit.url, texClone);
        dm.set(hit.url, [hit.region.w, hit.region.h]);
      }
      // 全部命中 atlas 时没有 onLoad 回调，这里统一刷新尺寸，
      // 否则几何体 UV 会退回 16×16 归一化，动画长图会把所有帧挤到一面上
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

// 绕元素旋转中心旋转 MC 坐标点（0..16）
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

// 方块级朝向 -> 四元数（与 modelResolver 的点旋转同一套角度约定）
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
    // 依次应用：q = Rn * ... * R1
    q.premultiply(
      new THREE.Quaternion().setFromAxisAngle(
        axisVec,
        THREE.MathUtils.degToRad(r.angle),
      ),
    );
  }
  return q;
}

// 一个面的 4 个 MC 角点（0..16，顺序 A/B/C/D，从面外侧看）
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

// 把一面的顶点/UV 追加到合并缓冲；quat/pos 用于把方块级旋转与位置烘进顶点
function appendQuad(
  target: QuadData,
  q: Quad,
  natural?: [number, number],
  quat?: THREE.Quaternion,
  pos?: [number, number, number],
): void {
  const base = target.positions.length / 3;
  // 角点顺序 A/B/C/D 与 BlockDisplay 共用同一套 uv 约定
  const uvs = quadUvPoints(q.uv, q.face);
  // MC uv 的 v 向下，three 的 v 向上；面旋转按 MC 的 face.rotation 处理
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

// 把一个 MC 元素面转成平面几何体（含局部 UV 与元素旋转）
function buildQuadGeometry(q: Quad, natural?: [number, number]): THREE.BufferGeometry {
  const data = emptyQuadData();
  appendQuad(data, q, natural);
  return dataToGeometry(data);
}

// ===== 不可见面剔除 =====

const FACE_OFFSET: Record<Quad['face'], [number, number, number]> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};

// 透明/半透明方块：玻璃、染色玻璃、冰、树叶等。
// 它们的面可能从另一侧看到，因此不参与静态面剔除。
const TRANSPARENT_ID = /(glass|leaves|ice|slime_block|honey_block|copper_grate|water)/;

function isTransparentBlock(b: StructureBlock): boolean {
  if (!b.block) return false;
  const ids = Array.isArray(b.block) ? b.block : b.block.split(',');
  return ids.some((id) => TRANSPARENT_ID.test(id.trim()));
}

// 透明方块的“种类”：用渲染层真正决定几何与贴图的 block 模型 id 判等，
// 而不是 type/调色板键。理由：type 只是数据里的状态名，可以因刷蜡/朝向等
// 拆成多个键却共用同一个模型；反过来模型相同意味着六个面的贴图、UV、
// 是否满立方体都一致，此时贴合面两侧的材质才真正相同，剔除才不会露底。
// 无 block 的方块（skull 等）返回 null，不参与同种透明互剔。
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

// 贴图路径同样能判断透明材质（材质按贴图 URL 分组，一个贴图对应一个材质）
function isTransparentTexture(url: string): boolean {
  return TRANSPARENT_ID.test(url);
}

// 面是否正好贴在方块边界上（只有边界面上的面才可能被邻格挡住）
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

// 该面是否铺满整个方块边界（0..16），用于判断“整面被邻格挡住”
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

// 该模型是否完整的实心立方体（6 个面都铺满方块边界）
function isFullCube(quads: Quad[] | null): boolean {
  if (!quads) return false;
  const seen = new Set<Quad['face']>();
  for (const q of quads) {
    if (coversFullFace(q)) seen.add(q.face);
  }
  return seen.size === 6;
}

function Block({
  block,
  quads,
  materials,
  dims,
  labelDistance,
}: {
  block: StructureBlock;
  quads: Quad[] | null;
  materials: Map<string, THREE.MeshBasicMaterial>;
  dims: Map<string, [number, number]>;
  labelDistance: number;
}): ReactNode {
  const history = useHistory();
  // 数据里的 link 是站内绝对路径（/docs/...），子路径部署（/wiki_page/）要补前缀。
  // react-router 的 history.push 不认 baseUrl，必须自己拼。
  const {withBaseUrl} = useBaseUrlUtils();
  const [hovered, setHovered] = useState(false);

  // 共享材质：只有带 link 的方块需要独立材质做悬停高亮
  const ownMaterials = useMemo(() => {
    if (!block.link) return materials;
    const m = new Map<string, THREE.MeshBasicMaterial>();
    for (const [url, mat] of materials) m.set(url, mat.clone());
    return m;
  }, [materials, block.link]);

  useEffect(
    () => () => {
      if (ownMaterials !== materials) ownMaterials.forEach((m) => m.dispose());
    },
    [ownMaterials, materials],
  );

  // 回退纯色材质（无 quads 或贴图缺失时）
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

  // 悬停高亮（仅带 link 的方块）
  // 原始颜色必须存成纯数字：材质被 clone() 时 userData 会走 JSON 序列化，
  // 而 THREE.Color 的 toJSON() 返回的是一个 hex 数字；clone 出来的材质再把
  // 那个数字 copy 回 color，r/g/b 全是 undefined → NaN，整块方块渲染成黑色。
  // 切层会让方块组件卸载/重挂，克隆材质反复继承这份脏数据，所以“点几次就黑”。
  useEffect(() => {
    const all = [...ownMaterials.values(), fallbackMaterial];
    all.forEach((m) => {
      const orig = (m.userData.origRGB ??= [m.color.r, m.color.g, m.color.b]);
      m.color.setRGB(orig[0], orig[1], orig[2]);
      if (hovered && block.link) m.color.multiplyScalar(1.35);
    });
  }, [hovered, ownMaterials, fallbackMaterial, block.link]);

  const clickable = !!block.link;

  // 方块级朝向：绕方块中心旋转整个 group（贴图随几何体一起转）
  const rotation = useMemo(
    () => blockQuaternion(block.block, block.facing, block.axis),
    [block.block, block.facing, block.axis],
  );

  return (
    <group
      position={[block.x, block.y, block.z]}
      quaternion={rotation}
      onClick={
        clickable
          ? (e) => {
              e.stopPropagation();
              history.push(withBaseUrl(block.link!));
            }
          : undefined
      }
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        if (clickable) document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = '';
      }}>
      {geometries.length > 0 ? (
        geometries.map((g, i) => (
          <mesh
            key={i}
            geometry={g}
            material={ownMaterials.get(quads![i].texture) ?? fallbackMaterial}
          />
        ))
      ) : (
        <mesh material={fallbackMaterial}>
          <boxGeometry args={[SIZE, SIZE, SIZE]} />
        </mesh>
      )}
      {hovered && block.label && (
        <Html
          center
          distanceFactor={labelDistance}
          zIndexRange={[10, 0]}
          wrapperClass={styles.labelWrap}>
          <div className={styles.label}>
            {block.label}
            {clickable && <span className={styles.labelArrow}>↗</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

// 按“当前可见层”重新取景。
// Canvas 的 camera 属性只在创建时生效（r3f 后续不会把新的 camera 对象
// apply 到已存在的相机上），所以切层后必须在这里手动同步 near/far 和距离，
// 否则相机会停留在上一层（或用户缩放后）的位置，可能钻进方块内部，
// 整幅画面被一块暗面填满 —— 表现就是“渲染整体变黑”。
function CameraRig({radius, layer}: {radius: number; layer: number | null}): null {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | {target: THREE.Vector3; update: () => void}
    | null;

  useLayoutEffect(() => {
    const r = Number.isFinite(radius) && radius > 0 ? radius : 8;
    // near/far 跟随当前层收紧：最大缩放距离 6r，加模型自身半径约 r，
    // far 取 8r 足够覆盖；near 保持 0.1 下限，避免深度精度变差导致贴合面闪烁。
    camera.near = Math.max(0.1, r / 100);
    camera.far = r * 8;
    camera.updateProjectionMatrix();

    const target = controls?.target ?? new THREE.Vector3(0, 0, 0);
    // 保留用户已经转到的观察方向，只把距离拉回取景距离
    const dir = camera.position.clone().sub(target);
    if (!Number.isFinite(dir.lengthSq()) || dir.lengthSq() < 1e-6) {
      dir.set(1, 0.8, 1);
    }
    dir.normalize().multiplyScalar(r * 2.4 * 1.6258);
    camera.position.copy(target).add(dir);
    camera.lookAt(target);
    controls?.update();
  }, [camera, controls, radius, layer]);

  return null;
}

export default function Structure3D({
  structure,
  texBase,
  height = 480,
  autoRotate = true,
  interactive = true,
  layer = null,
}: {
  structure: Structure;
  texBase: string;
  height?: number;
  /** 自动旋转；单方块模式关闭 */
  autoRotate?: boolean;
  /** 是否允许拖动/缩放；移动端预览态只自动旋转，全屏后才开启交互 */
  interactive?: boolean;
  /** 只渲染该 Y 层；null/undefined 表示全部层 */
  layer?: number | null;
}): ReactNode {
  const [quadLists, setQuadLists] = useState<(Quad[] | null)[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      structure.blocks.map((b) =>
        b.block
          ? resolveBlockQuads(b.block, texBase)
          : b.skull
            ? Promise.resolve(skullQuads(b.skull, b.face))
            : Promise.resolve(null),
      ),
    ).then((lists) => {
      if (!cancelled) setQuadLists(lists);
    });
    return () => {
      cancelled = true;
    };
  }, [structure, texBase]);

  const atlasMeta = useAtlasMeta();
  const atlasBaseUrl = useBaseUrl('/');
  const isProd = process.env.NODE_ENV === 'production';

  // 一次性收集全部方块贴图（不受分层影响），避免切层时反复销毁/重建贴图
  const allUrls = useMemo(
    () => [
      ...new Set(
        (quadLists ?? []).flatMap((q) => (q ?? []).map((x) => x.texture)),
      ),
    ],
    [quadLists],
  );
  const {texMap, dims} = useTextures(allUrls, atlasMeta, atlasBaseUrl, isProd);

  const materials = useMemo(() => {
    const m = new Map<string, THREE.MeshBasicMaterial>();
    for (const [url, tex] of texMap) {
      const transparent = isTransparentTexture(url);
      const params: THREE.MeshBasicMaterialParameters = {
        map: tex,
        // 不透明块必须留在 opaque pass，否则会跟玻璃一起按距离排序，
        // 出现“玻璃写深度把后面的方块挡掉”的视角相关问题。
        transparent,
        // 玻璃不写深度：后面的方块先画完后仍能透过玻璃看到；
        // 玻璃自己之间的前后关系由深度测试读取 opaque pass 的结果保证。
        depthWrite: !transparent,
        // 贴合（SIZE=1）后玻璃面可能与相邻不透明块的背面严格共面。
        // 把透明多边形往相机方向偏一点点深度（负偏移 = 更近），
        // 保证玻璃稳定地通过深度测试、压在同深度的石面上，
        // 不会出现两个面轮流赢的闪烁；偏移量在深度精度以内，肉眼不可见。
        polygonOffset: transparent,
        polygonOffsetFactor: transparent ? -1 : 0,
        polygonOffsetUnits: transparent ? -1 : 0,
        side: THREE.DoubleSide,
      };
      // 非透明材质用 alphaTest 处理树叶/植物这类镂空贴图，
      // 避免为了透明排序把所有材质都丢进 transparent pass。
      // 不能传 undefined：three 会在控制台报警告。
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

  // 可见层 + 相机范围 + 面剔除
  const prepared = useMemo(() => {
    if (!quadLists) return null;
    const shown = structure.blocks
      .map((b, i) => ({b, i}))
      .filter(({b}) => layer == null || b.y === layer);
    const bounds = shown.length > 0 ? shown : structure.blocks.map((b, i) => ({b, i}));

    // 空结构：min/max 会停在 ±Infinity，算出的 center/radius 是 NaN，
    // 相机拿到 NaN 后整幅画面就是黑的。这里直接给一个安全值。
    if (bounds.length === 0) {
      return {entries: [], center: [0, 0, 0] as const, radius: 2};
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const {b} of bounds) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
      minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z);
    }

    // 只把当前可见方块建索引：单层模式下不会误剔掉朝向其它层的面
    const occupancy = new Map<string, {b: StructureBlock; i: number}>();
    for (const entry of shown) {
      occupancy.set(`${entry.b.x},${entry.b.y},${entry.b.z}`, entry);
    }

    const fullCube = new Map<number, boolean>();
    const isFull = (i: number): boolean => {
      let v = fullCube.get(i);
      if (v === undefined) {
        v = isFullCube(quadLists[i]);
        fullCube.set(i, v);
      }
      return v;
    };

    const entries = shown.map(({b, i}) => {
      const quads = quadLists[i] ?? [];
      const transparent = isTransparentBlock(b);
      const kept = quads.filter((q) => {
        // 只有铺满整面、且没有元素旋转的面才可能被邻格完全挡住
        if (!coversFullFace(q)) return true;
        // 严格只看六个正交方向：occupancy 只按 ±1 的坐标键索引，
        // 斜对角 / 棱相邻的格子根本查不到，天然不会被剔除。
        const [dx, dy, dz] = FACE_OFFSET[q.face];
        const nb = occupancy.get(`${b.x + dx},${b.y + dy},${b.z + dz}`);
        // 邻格必须是完整立方体，否则它的面只遮住一部分，不能整面剔除
        if (!nb || !isFull(nb.i)) return true;

        if (!transparent) {
          // 不透明块朝向透明块的面要保留，否则透过玻璃会看到空洞
          if (isTransparentBlock(nb.b)) return true;
          // 只有“不透明 <-> 不透明”的内部面才剔除
          return false;
        }

        // 透明块默认保留全部面：它们可能从另一侧被看到。
        // 例外：同一种透明块严格面贴面时，接触面在两侧都是同一贴图，
        // 光路本来就被同种材质连着，剔除这对内部面不会产生可见空洞。
        if (!isTransparentBlock(nb.b)) return true;
        const kind = transparentKind(b);
        if (!kind || kind !== transparentKind(nb.b)) return true;
        // 再核对邻格反方向那面的贴图：模型相同但朝向/UV 不同时也保守保留
        const nbQuad = (quadLists[nb.i] ?? []).find(
          (x) => x.face === OPPOSITE_FACE[q.face] && coversFullFace(x),
        );
        if (!nbQuad || nbQuad.texture !== q.texture) return true;
        return false;
      });
      return {b, i, quads: kept};
    });

    return {
      entries,
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as const,
      radius: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 2) / 2 + 1,
    };
  }, [structure, layer, quadLists]);

  // 无交互的静态方块合并成按贴图分组的整体几何体，大幅减少 draw call
  const merged = useMemo(() => {
    if (!prepared) return [];
    const groups = new Map<string, QuadData>();
    for (const {b, i, quads} of prepared.entries) {
      if (b.link || b.label || quads.length === 0) continue;
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

  if (!prepared) return <div className={styles.canvasPlaceholder} />;

  const individual = prepared.entries.filter(
    ({b, quads}) => b.link || b.label || quads.length === 0,
  );
  const {center, radius} = prepared;
  const d = radius * 2.4;
  return (
    <div className={styles.canvas} style={{height}}>
      <Canvas
        // 首帧机位：真正的 near/far 与距离由 CameraRig 按当前层重算，
        // 这里只保证 Canvas 创建时相机不是默认的 z=5。
        camera={{position: [d, d * 0.8, d], fov: 40, near: 0.1, far: radius * 8}}
        style={{touchAction: interactive ? 'none' : 'auto'}}
        dpr={[1, 2]}>
        {/* 切层后必须重新取景：Canvas 的 camera 属性只在挂载时生效，
            否则相机会停在上一层（或用户缩放后）的距离上，可能钻进方块里，
            画面被一整块暗面填满，看起来就是“整体变黑”。 */}
        <CameraRig radius={radius} layer={layer} />
        <OrbitControls
          makeDefault
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          enablePan={false}
          enableRotate={interactive}
          enableZoom={interactive}
          // 最近距离不小于 2×radius：半径本身只是包围盒的一半再加 1，
          // 允许贴到 radius 会让相机落进大方块或扁平层的内部。
          minDistance={radius * 2}
          maxDistance={radius * 6}
        />
        <group position={[-center[0], -center[1], -center[2]]}>
          {merged.map(({texture, geometry}) => (
            <mesh
              key={texture}
              geometry={geometry}
              material={materials.get(texture) ?? fallbackMaterial}
            />
          ))}
          {individual.map(({b, i, quads}) => (
            <Block
              key={i}
              block={b}
              quads={quads}
              materials={materials}
              dims={dims}
              labelDistance={Math.max(5, height / 40)}
            />
          ))}
        </group>
      </Canvas>
    </div>
  );
}
