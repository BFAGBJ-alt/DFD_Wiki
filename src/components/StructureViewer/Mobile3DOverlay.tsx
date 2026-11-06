import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import ErrorBoundary from '../ErrorBoundary';
import LazyStructure3D from './lazyStructure3D';
import type {Structure} from './types';
import styles from './styles.module.css';

/**
 * 移动端 3D 浮层。
 *
 * - 打开后立即渲染 3D（不是全屏也能看，默认自动旋转）
 * - 只有进入全屏（含 iOS 的视觉全屏兜底）后才开启拖动 / 双指缩放
 * - 点遮罩、按 Esc、点关闭都能退出
 */
export default function Mobile3DOverlay({
  structure,
  texBase,
  title,
  onClose,
}: {
  structure: Structure;
  texBase: string;
  title?: string;
  onClose: () => void;
}): ReactNode {
  const panelRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const height = (() => {
    if (typeof window === 'undefined') return 320;
    const h = window.innerHeight;
    return fullscreen ? Math.round(h - 92) : Math.round(Math.min(h * 0.6, 420));
  })();

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          void document.exitFullscreen?.();
        } else {
          onClose();
        }
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        // 用户按系统返回/手势退出全屏时，同步回预览态
        setFullscreen((fs) => (document.fullscreenElement ? fs : false));
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [onClose]);

  async function toggleFullscreen() {
    const el = panelRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
      setFullscreen(false);
      return;
    }
    if (typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen();
        setFullscreen(true);
        return;
      } catch {
        // iOS Safari 等不支持元素全屏：退化为视觉全屏
      }
    }
    setFullscreen((fs) => !fs);
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} 3D 视图` : '3D 视图'}
      onClick={onClose}>
      <div
        ref={panelRef}
        className={`${styles.panel} ${fullscreen ? styles.panelFull : ''}`}
        onClick={(e) => e.stopPropagation()}>
        <div className={styles.panelBar}>
          <span className={styles.panelTitle}>{title ?? '3D 视图'}</span>
          <div className={styles.panelActions}>
            <button type="button" className={styles.panelBtn} onClick={toggleFullscreen}>
              {fullscreen ? '退出全屏' : '全屏'}
            </button>
            <button type="button" className={styles.panelBtn} onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className={styles.panelBody}>
          <BrowserOnly
            fallback={
              <div className={styles.canvasPlaceholder} style={{height}} />
            }>
            {() => (
              <ErrorBoundary
                fallback={
                  <div className={styles.panelError} style={{height}}>
                    3D 资源加载失败，请关闭后重试
                  </div>
                }>
                <React.Suspense
                  fallback={
                    <div className={styles.canvasPlaceholder} style={{height}} />
                  }>
                  <LazyStructure3D
                    structure={structure}
                    texBase={texBase}
                    height={height}
                    autoRotate
                    interactive={fullscreen}
                  />
                </React.Suspense>
              </ErrorBoundary>
            )}
          </BrowserOnly>
        </div>
        <p className={styles.panelHint}>
          {fullscreen ? '双指缩放 · 单指拖动旋转' : '进入全屏后可拖动与缩放'}
        </p>
      </div>
    </div>
  );
}
