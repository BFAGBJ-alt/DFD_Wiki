import {lazyWithRetry} from '@site/src/utils/lazyWithRetry';

/** 静态结构图渲染器：独立 chunk，带重试，失败交给上层 ErrorBoundary 兜底 */
const LazyStructure2D = lazyWithRetry(() => import('./Structure2DRenderer'));

export default LazyStructure2D;
