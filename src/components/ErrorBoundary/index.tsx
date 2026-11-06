import React, {type ReactNode} from 'react';

type Props = {
  children: ReactNode;
  /** 自定义兜底 UI；不传时显示一行提示 */
  fallback?: ReactNode;
  /** 出错时的回调（打日志用） */
  onError?: (error: Error) => void;
};

type State = {error: Error | null};

/**
 * 局部错误边界：把 3D 画布这类"可选增强"组件的异常隔离在组件内部，
 * 避免一次 chunk 加载失败把整个页面卸载成白屏。
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error);
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback ?? <div>组件加载失败，请刷新重试</div>;
    }
    return this.props.children;
  }
}
