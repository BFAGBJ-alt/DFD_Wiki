import {lazyWithRetry} from '@site/src/utils/lazyWithRetry';

/** 3D 渲染拆分出的独立 chunk；带重试，失败交给上层 ErrorBoundary 兜底 */
const LazyStructure3D = lazyWithRetry(() => import('./Structure3D'));

export default LazyStructure3D;
