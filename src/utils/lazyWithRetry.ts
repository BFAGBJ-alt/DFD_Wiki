import React, {type ComponentType} from 'react';

/**
 * 带重试的 React.lazy。
 *
 * 动态 import 会走网络（本站的 three.js 被拆成独立 chunk），
 * 加速器抖动、部署期间文件名切换都会让它失败；默认的 React.lazy
 * 失败一次就抛错，没有边界时会把整页卸载成白屏。
 * 这里失败后自动重试若干次，仍失败则交给上层 ErrorBoundary 显示兜底 UI。
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
        return await factory();
      } catch (e) {
        lastError = e;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
        }
      }
    }
    throw lastError;
  });
}
