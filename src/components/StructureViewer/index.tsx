import React, {Suspense, useEffect, useMemo, useState, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {resolveItem} from '@site/src/data/items/index';
import {supportsWebGL2} from '@site/src/utils/webgl';
import {resolveStructure, type Structure} from './types';
import type {BlockAxis, BlockFacing, SkullFace} from './modelResolver';
import BlockDisplay from '../BlockDisplay';
import ErrorBoundary from '../ErrorBoundary';
import Mobile3DOverlay from './Mobile3DOverlay';
import LayerControls from './LayerControls';
import LazyStructure3D from './lazyStructure3D';
import styles from './styles.module.css';

function useIsMobile(): boolean | null {
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

/**
 * 移动端预览卡：等距 3D 静态图 + 轻触进入 3D 浮层。
 * 不再用单面贴图 / GIF：方块用 BlockDisplay（和桌面一致的立方体），
 * 不带任何 labels，避免分栏里把超链接文本暴露出来。
 */
function MobilePreview({
  block,
  facing,
  axis,
  skull,
  label,
  color,
  onOpen,
}: {
  block?: string | string[];
  facing?: BlockFacing;
  axis?: BlockAxis;
  skull?: string;
  label?: string;
  color?: string;
  onOpen: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className={styles.trigger}
      onClick={onOpen}
      aria-label={`查看 ${label ?? '方块'} 的 3D 模型`}>
      {block || skull ? (
        <BlockDisplay
          block={block}
          facing={facing}
          axis={axis}
          skull={skull}
          size={120}
          name={label}
        />
      ) : (
        <span
          className={styles.singleImg}
          style={{background: color ?? '#888888'}}
        />
      )}
      <span className={styles.triggerHint}>轻触查看 3D</span>
    </button>
  );
}

type ViewerSize = 'sm' | 'md' | 'lg' | number;

function sizeHeight(size: ViewerSize): number {
  if (typeof size === 'number') return size;
  return size === 'sm' ? 280 : size === 'lg' ? 600 : 480;
}

type StructureViewerProps = {
  /** 结构模式：加载 static/structures/<name>.json */
  name?: string;
  /**
   * 单一方块模式：原版方块 model id（如 "furnace"），无需 JSON 文件。
   * 支持多模型组合（如雕纹书架 + 槽位状态模型）：
   * 数组或逗号分隔字符串，后面的模型叠加到前面之上。
   */
  block?: string | string[];
  /** 单一方块模式：引用物品数据库 id，自动解析 block/skull/label/link */
  item?: string;
  /** 单一方块模式：自定义头颅贴图 URL（64×64 皮肤 PNG），与 block 二选一 */
  skull?: string;
  /** 单一方块模式方块朝向（对应原版 facing）；默认水平块为 north、竖直块为 up */
  facing?: BlockFacing;
  /** 单一方块模式方块轴向（对应原版 axis，原木/柱状方块） */
  axis?: BlockAxis;
  /** 单一方块模式头颅朝向：up=落地头（默认）；水平方向=脸贴该侧边缘 */
  face?: SkullFace;
  /** 单一方块模式的名称/链接/纯色回退（优先级高于 item 数据库） */
  label?: string;
  link?: string;
  color?: string;
  /** 画布高度：sm=280 md=480 lg=600，或数字像素。结构模式默认 md，单方块默认 sm */
  size?: ViewerSize;
};

/**
 * 交互式结构查看器。
 * - 桌面端：3D 渲染（原版材质，带 link 的方块可点击跳转，悬停显示名称）
 * - 移动端：结构模式显示预渲染 GIF + 常驻名单；单方块显示静态贴图
 *
 * 用法：
 *   结构        <StructureViewer name="me-network" />
 *   单方块      <StructureViewer block="furnace" label="熔炉" />
 *   按物品 id   <StructureViewer item="me_drive" />
 */
export default function StructureViewer({
  name,
  block,
  item,
  skull,
  facing,
  axis,
  face,
  label,
  link,
  color,
  size,
}: StructureViewerProps): ReactNode {
  const [structure, setStructure] = useState<Structure | null>(null);
  const [error, setError] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const isMobile = useIsMobile();
  // three 只支持 WebGL2；桌面端少数精简浏览器 / 关闭硬件加速时也会拿不到上下文
  const [webgl2, setWebgl2] = useState<boolean | null>(null);
  useEffect(() => {
    setWebgl2(supportsWebGL2());
  }, []);
  const jsonUrl = useBaseUrl(`/structures/${name ?? ''}.json`);
  const texBase = useBaseUrl('/img/Minecraft/block');

  // 单方块模式下从物品数据库展开字段（内联 props 优先）
  const singleBlock = useMemo(() => {
    if (!block && !item && !skull) return undefined;
    const db: Partial<ReturnType<typeof resolveItem>> = item
      ? resolveItem(item)
      : {};
    return {
      block: block ?? db.block,
      facing: facing ?? db.facing,
      axis: axis ?? db.axis,
      skull: skull ?? db.skull,
      face,
      label: label ?? db.name,
      link: link ?? db.link,
      color: color ?? db.color,
    };
  }, [block, item, skull, facing, axis, face, label, link, color]);

  const effectiveSize = size ?? (name ? 'md' : 'sm');
  const canvasHeight = sizeHeight(effectiveSize);

  useEffect(() => {
    if (singleBlock) {
      // 单一方块模式：直接构造结构，无需 fetch
      const b = singleBlock.block;
      setStructure({
        name: item ?? (Array.isArray(b) ? b.join(',') : b) ?? 'block',
        blocks: [
          {
            x: 0,
            y: 0,
            z: 0,
            block: b,
            facing: singleBlock.facing,
            axis: singleBlock.axis,
            skull: singleBlock.skull,
            face: singleBlock.face,
            label: singleBlock.label,
            link: singleBlock.link,
            color: singleBlock.color,
          },
        ],
      });
      return;
    }
    if (!name) {
      setError(true);
      return;
    }
    let cancelled = false;
    fetch(jsonUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((s: Structure) => {
        if (!cancelled) setStructure(resolveStructure(s, resolveItem));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [name, singleBlock, item, jsonUrl]);

  const layers = useMemo(() => {
    if (!structure) return [];
    return [...new Set(structure.blocks.map((b) => b.y))].sort((a, b) => a - b);
  }, [structure]);
  const [layer, setLayer] = useState<number | null>(null);
  useEffect(() => {
    setLayer(null);
  }, [structure]);

  if (error) {
    return <div className={styles.box}>结构「{name ?? item ?? block}」加载失败</div>;
  }
  if (!structure || isMobile === null) {
    return <div className={styles.box} aria-busy="true" />;
  }

  if (isMobile) {
    const title =
      singleBlock?.label ?? (name ? `结构「${name}」` : undefined);
    return (
      <>
        <MobilePreview
          block={singleBlock?.block ?? (name ? structure.blocks[0]?.block : undefined)}
          facing={singleBlock?.facing ?? (name ? structure.blocks[0]?.facing : undefined)}
          axis={singleBlock?.axis ?? (name ? structure.blocks[0]?.axis : undefined)}
          skull={singleBlock?.skull ?? (name ? structure.blocks[0]?.skull : undefined)}
          label={title}
          color={singleBlock?.color ?? structure.blocks[0]?.color}
          onOpen={() => setOverlayOpen(true)}
        />
        {overlayOpen && (
          <Mobile3DOverlay
            structure={structure}
            texBase={texBase}
            title={title}
            onClose={() => setOverlayOpen(false)}
          />
        )}
      </>
    );
  }

  const isSingle = !!singleBlock;
  const showLayers = !isSingle && layers.length > 1;

  return (
    <div className={styles.box} style={{height: canvasHeight + (isSingle ? 0 : 32) + (showLayers ? 40 : 0)}}>
      {showLayers && (
        <LayerControls layers={layers} value={layer} onChange={setLayer} />
      )}
      <BrowserOnly fallback={<div className={styles.canvasPlaceholder} style={{height: canvasHeight}} />}>
        {() =>
          webgl2 === false ? (
            <div className={styles.panelError} style={{height: canvasHeight}}>
              <p>当前浏览器不支持 WebGL2，无法显示 3D 模型</p>
            </div>
          ) : (
            <ErrorBoundary
              renderFallback={(err) => (
                <div className={styles.panelError} style={{height: canvasHeight}}>
                  <p>3D 资源加载失败，请刷新页面重试</p>
                  <p className={styles.panelErrorDetail}>{err.message}</p>
                </div>
              )}>
              <Suspense fallback={<div className={styles.canvasPlaceholder} style={{height: canvasHeight}} />}>
                <LazyStructure3D
                  structure={structure}
                  texBase={texBase}
                  height={canvasHeight}
                  autoRotate={!isSingle}
                  layer={layer}
                />
              </Suspense>
            </ErrorBoundary>
          )
        }
      </BrowserOnly>
      {!isSingle && (
        <p className={styles.hint}>拖动旋转 · 悬停查看名称 · 带 ↗ 的方块可点击跳转</p>
      )}
    </div>
  );
}
