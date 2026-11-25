import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ErrorBoundary from '../ErrorBoundary';
import LazyStructure2D from './lazyStructure2D';
import styles from './styles.module.css';

export type Structure2DProps = {
  /** 结构名，对应 static/structures/<name>.json（可带子目录，如 Logi/元素嬗变-最大） */
  name: string;
  /** 方块贴图根路径，默认 /img/Minecraft/block */
  texBase?: string;
  /** 水平方位角（度），默认 45 */
  azimuth?: number;
  /** 仰角（度），默认 29.5（与 Structure3D 默认机位一致） */
  elevation?: number;
  /** 相机距离倍率：1 = 刚好容纳结构，>1 拉远，<1 拉近；默认 1 */
  distance?: number;
  /** 容器宽高比（宽 / 高）；不传则按结构在当前机位下的投影范围自动计算 */
  aspect?: number;
  /** 底部提示文案，默认显示「悬停查看方块名称」 */
  showHint?: boolean;
  className?: string;
};

/**
 * 静态结构图：固定机位、不可拖动/缩放/点击，像一张图一样嵌在文档里。
 *
 * 与 StructureViewer 的区别：
 * - 没有分层控件、没有移动端预览卡（移动端也直接渲染），没有候选面板与点击跳转
 * - 保留多状态方块轮换与悬停显示方块名称
 * - 高度 = 容器宽度 ÷ aspect；不传 aspect 时按结构投影自动取值
 */
export default function Structure2D({
  name,
  texBase,
  azimuth = 45,
  elevation = 29.5,
  distance = 1,
  aspect,
  showHint = true,
  className,
}: Structure2DProps): ReactNode {
  const defaultTexBase = useBaseUrl('/img/Minecraft/block');
  const textureBase = texBase ?? defaultTexBase;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const [autoAspect, setAutoAspect] = useState(4 / 3);
  const [labelSize, setLabelSize] = useState(13);

  // 悬停标签字号跟随容器宽度（约 3%，下限 14px、上限 26px）
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = (width: number) => {
      setLabelSize(Math.round(Math.min(26, Math.max(14, width * 0.03))));
    };
    update(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) update(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleAspect = useCallback((next: number) => {
    setAutoAspect((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
  }, []);

  const ratio = aspect ?? autoAspect;

  return (
    <div className={className}>
      <div
        ref={boxRef}
        className={styles.canvas2d}
        style={
          {
            aspectRatio: String(ratio),
            '--structure2d-label-size': `${labelSize}px`,
          } as React.CSSProperties
        }>
        <BrowserOnly fallback={<div className={styles.canvas2dPlaceholder} />}>
          {() => (
            <ErrorBoundary
              renderFallback={(err) => (
                <div className={styles.canvas2dError}>
                  <p>3D 资源加载失败，请刷新页面重试</p>
                  <p className={styles.panelErrorDetail}>{err.message}</p>
                </div>
              )}>
              <Suspense fallback={<div className={styles.canvas2dPlaceholder} />}>
                <LazyStructure2D
                  name={name}
                  texBase={textureBase}
                  azimuth={azimuth}
                  elevation={elevation}
                  distance={distance}
                  onAspectChange={aspect === undefined ? handleAspect : undefined}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </BrowserOnly>
      </div>
      {showHint && <p className={styles.canvas2dHint}>悬停查看方块名称</p>}
    </div>
  );
}
