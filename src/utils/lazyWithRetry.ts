import React, {type ComponentType} from 'react';

// 刷新一次的标记：避免 chunk 真的缺失时无限刷新
const RELOAD_FLAG = 'dfd-chunk-reload';

/**
 * 带重试的 React.lazy。
 *
 * 动态 import 会走网络（本站的 three.js 被拆成独立 chunk），
 * 加速器抖动、部署期间文件名切换都会让它失败；默认的 React.lazy
 * 失败一次就抛错，没有边界时会把整页卸载成白屏。
 *
 * 重试仍失败时：如果浏览器还停留在旧的 HTML（部署后旧的 chunk 已被删除），
 * 刷新一次就能拿到新的 index.html / runtime，所以这里自动 reload 一次，
 * 用 sessionStorage 保证只刷一次，避免死循环。
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{default: T}>,
  retries = 2,
  delay = 700,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const mod = await factory();
        // 加载成功说明当前 HTML 和 chunk 是配套的，清掉标记
        try {
          sessionStorage.removeItem(RELOAD_FLAG);
        } catch {}
        return mod;
      } catch (e) {
        lastError = e;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
        }
      }
    }
    try {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        // 页面正在刷新，保持挂起，别让 ErrorBoundary 先弹出来
        return await new Promise<{default: T}>(() => {});
      }
    } catch {}
    throw lastError;
  });
}
