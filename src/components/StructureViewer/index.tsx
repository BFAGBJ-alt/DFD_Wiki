import React, {Suspense, useEffect, useMemo, useState, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {resolveItem} from '@site/src/data/items';
import {resolveStructure, type Structure} from './types';
import {resolveBlockFaces} from './modelResolver';
import styles from './styles.module.css';

// 桌面端才加载 3D 渲染代码（代码分割，移动端不下载 three.js）
const LazyStructure3D = React.lazy(() => import('./Structure3D'));

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

/** 移动端单一方块：解析 model 取正面贴图，静态展示（不加载 three.js） */
function MobileSingleBlock({
  block,
  label,
  link,
  color,
  texBase,
}: {
  block: string | string[];
  label?: string;
  link?: string;
  color?: string;
  texBase: string;
}): ReactNode {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveBlockFaces(block, texBase).then((f) => {
      if (!cancelled) setImg(f.north ?? f.up ?? f.east ?? f.south ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [block, texBase]);

  const inner = (
    <>
      {img ? (
        <img src={img} alt={label ?? String(block)} className={styles.singleImg} />
      ) : (
        <span
          className={styles.singleImg}
          style={{background: color ?? '#888888'}}
        />
      )}
      {label && <span className={styles.singleLabel}>{label}</span>}
    </>
  );

  return (
    <div className={styles.single}>
      {link ? (
        <Link to={link} className={styles.singleLink}>
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
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
  /** 单一方块模式：引用物品数据库 id，自动解析 block/label/link */
  item?: string;
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
  label,
  link,
  color,
  size,
}: StructureViewerProps): ReactNode {
  const [structure, setStructure] = useState<Structure | null>(null);
  const [error, setError] = useState(false);
  const isMobile = useIsMobile();
  const jsonUrl = useBaseUrl(`/structures/${name ?? ''}.json`);
  const gifUrl = useBaseUrl(`/img/structures/${name ?? ''}.gif`);
  const texBase = useBaseUrl('/img/Minecraft/block');

  // 单方块模式下从物品数据库展开字段（内联 props 优先）
  const singleBlock = useMemo(() => {
    if (!block && !item) return undefined;
    const db = item ? resolveItem(item) : {};
    const resolvedBlock = block ?? db.block;
    return {
      block: resolvedBlock,
      label: label ?? db.name,
      link: link ?? db.link,
      color: color ?? db.color,
    };
  }, [block, item, label, link, color]);

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

  if (error) {
    return <div className={styles.box}>结构「{name ?? item ?? block}」加载失败</div>;
  }
  if (!structure || isMobile === null) {
    return <div className={styles.box} aria-busy="true" />;
  }

  if (isMobile) {
    if (singleBlock?.block) {
      return (
        <MobileSingleBlock
          block={singleBlock.block}
          label={singleBlock.label}
          link={singleBlock.link}
          color={singleBlock.color}
          texBase={texBase}
        />
      );
    }
    // 结构模式：GIF + 常驻名单（去重 label）
    const seen = new Set<string>();
    const entries = structure.blocks.filter((b) => {
      const key = b.label ?? b.block ?? '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return (
      <figure className={styles.box}>
        <img
          src={gifUrl}
          alt={`${name} 结构旋转示意`}
          className={styles.gif}
          loading="lazy"
        />
        <figcaption>
          <ul className={styles.legend}>
            {entries.map((b, i) => (
              <li key={i}>
                {b.link ? (
                  <Link to={b.link}>{b.label ?? b.block}</Link>
                ) : (
                  <span>{b.label ?? b.block}</span>
                )}
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>
    );
  }

  const isSingle = !!singleBlock;

  return (
    <div className={styles.box} style={{height: canvasHeight + (isSingle ? 0 : 32)}}>
      <BrowserOnly fallback={<div className={styles.canvasPlaceholder} style={{height: canvasHeight}} />}>
        {() => (
          <Suspense fallback={<div className={styles.canvasPlaceholder} style={{height: canvasHeight}} />}>
            <LazyStructure3D
              structure={structure}
              texBase={texBase}
              height={canvasHeight}
              autoRotate={!isSingle}
            />
          </Suspense>
        )}
      </BrowserOnly>
      {!isSingle && (
        <p className={styles.hint}>拖动旋转 · 悬停查看名称 · 带 ↗ 的方块可点击跳转</p>
      )}
    </div>
  );
}
