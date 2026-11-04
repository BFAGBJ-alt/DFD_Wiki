import React, {useEffect, useMemo, useState, type ReactNode} from 'react';
import {Canvas} from '@react-three/fiber';
import {Html, OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import {useHistory} from '@docusaurus/router';
import {resolveBlockQuads, rotateFaceUv, quadUvPoints, skullQuads, type Quad} from './modelResolver';
import type {Structure, StructureBlock} from './types';
import styles from './styles.module.css';

// 方块渲染尺寸（留缝），MC 坐标 0..16 映射到 [-0.475, +0.475]
const SIZE = 0.95;
const OFFSET = -SIZE / 2;
const S = SIZE / 16;

// 手动加载贴图：404 时静默回退，不让整个画布崩掉
function useTextures(urls: string[]): {
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
    for (const u of urlKey.split('|')) {
      const t = loader.load(
        u,
        (loaded) => {
          // 记录贴图原始尺寸：几何 UV 按自然尺寸归一化后，
          // 动画长图自然只显示第一帧，64×32 旧版头颅皮肤也不会错位
          const img = loaded.image as HTMLImageElement | undefined;
          if (img) {
            dm.set(u, [img.width || 1, img.height || 1]);
            setDims(new Map(dm));
          }
        },
        undefined,
        () => {
          m.delete(u);
        },
      );
      // 像素风：最近邻采样 + sRGB
      t.magFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      m.set(u, t);
    }
    setTexMap(m);
    return () => {
      m.forEach((t) => t.dispose());
    };
  }, [urlKey]);
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

// 把一个 MC 元素面转成平面几何体（含局部 UV 与元素旋转）
// natural：贴图原始尺寸（加载完成后传入），UV 按它归一化
function buildQuadGeometry(q: Quad, natural?: [number, number]): THREE.BufferGeometry {
  const [fx, fy, fz] = q.from;
  const [tx, ty, tz] = q.to;
  // 每面 4 个角点（A 左上 B 右上 C 左下 D 右下，从面外侧看）及其 uv
  let mc: [number, number, number][];
  switch (q.face) {
    case 'north':
      mc = [
        [fx, ty, fz], [tx, ty, fz],
        [fx, fy, fz], [tx, fy, fz],
      ];
      break;
    case 'south':
      mc = [
        [fx, ty, tz], [tx, ty, tz],
        [fx, fy, tz], [tx, fy, tz],
      ];
      break;
    case 'west':
      mc = [
        [fx, ty, fz], [fx, ty, tz],
        [fx, fy, fz], [fx, fy, tz],
      ];
      break;
    case 'east':
      mc = [
        [tx, ty, fz], [tx, ty, tz],
        [tx, fy, fz], [tx, fy, tz],
      ];
      break;
    case 'up':
      mc = [
        [fx, ty, fz], [tx, ty, fz],
        [fx, ty, tz], [tx, ty, tz],
      ];
      break;
    case 'down':
    default:
      mc = [
        [fx, fy, fz], [tx, fy, fz],
        [fx, fy, tz], [tx, fy, tz],
      ];
      break;
  }
  // 角点顺序 A/B/C/D 与 BlockDisplay 共用同一套 uv 约定
  const uvs = quadUvPoints(q.uv, q.face);
  // 应用元素旋转后再映射到方块世界坐标
  const corners = mc.map((p) => {
    const [x, y, z] = rotatePoint(p, q.rotation);
    return [OFFSET + x * S, OFFSET + y * S, OFFSET + z * S];
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(corners.flat(), 3),
  );
  // MC uv 的 v 向下，three 的 v 向上；面旋转按 MC 的 face.rotation 处理
  const [texW, texH] = natural ?? q.texSize ?? [16, 16];
  geo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs
        .map(([u, v]) => rotateFaceUv(u, v, q.uv, q.uvRotation))
        .map(([u, v]) => [u / texW, 1 - v / texH])
        .flat(),
      2,
    ),
  );
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  return geo;
}

function Block({
  block,
  quads,
  labelDistance,
}: {
  block: StructureBlock;
  quads: Quad[] | null;
  labelDistance: number;
}): ReactNode {
  const history = useHistory();
  const [hovered, setHovered] = useState(false);

  const urls = useMemo(
    () => [...new Set((quads ?? []).map((q) => q.texture))],
    [quads],
  );
  const {texMap: texByUrl, dims} = useTextures(urls);
  // 每张贴图共享一个材质
  const materials = useMemo(() => {
    const m = new Map<string, THREE.MeshBasicMaterial>();
    for (const [url, tex] of texByUrl) {
      m.set(
        url,
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
    }
    return m;
  }, [texByUrl]);

  // 回退纯色材质（无 quads 或贴图缺失时）
  const fallbackMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: block.color ?? '#888888',
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
      materials.forEach((m) => m.dispose());
      fallbackMaterial.dispose();
    },
    [geometries, materials, fallbackMaterial],
  );

  // 悬停高亮（仅带 link 的方块）
  useEffect(() => {
    const all = [...materials.values(), fallbackMaterial];
    all.forEach((m) => {
      const orig = (m.userData.orig ??= m.color.clone());
      m.color.copy(orig);
      if (hovered && block.link) m.color.multiplyScalar(1.35);
    });
  }, [hovered, materials, fallbackMaterial, block.link]);

  const clickable = !!block.link;

  return (
    <group
      position={[block.x, block.y, block.z]}
      onClick={
        clickable
          ? (e) => {
              e.stopPropagation();
              history.push(block.link!);
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
            material={materials.get(quads![i].texture) ?? fallbackMaterial}
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

export default function Structure3D({
  structure,
  texBase,
  height = 480,
  autoRotate = true,
}: {
  structure: Structure;
  texBase: string;
  height?: number;
  /** 自动旋转；单方块模式关闭 */
  autoRotate?: boolean;
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

  const {center, radius} = useMemo(() => {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const b of structure.blocks) {
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
      minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z);
    }
    return {
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as const,
      radius: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 2) / 2 + 1,
    };
  }, [structure]);

  if (!quadLists) return <div className={styles.canvasPlaceholder} />;

  const d = radius * 2.4;
  return (
    <div className={styles.canvas} style={{height}}>
      <Canvas
        camera={{position: [d, d * 0.8, d], fov: 40}}
        dpr={[1, 2]}>
        <OrbitControls
          makeDefault
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          enablePan={false}
          minDistance={radius}
          maxDistance={radius * 6}
        />
        <group position={[-center[0], -center[1], -center[2]]}>
          {structure.blocks.map((b, i) => (
            <Block
              key={i}
              block={b}
              quads={quadLists[i]}
              labelDistance={Math.max(5, height / 40)}
            />
          ))}
        </group>
      </Canvas>
    </div>
  );
}
