// Minecraft Atlas 运行时代理层
// -----------------------------------------------------------------------
// build 时 gen_atlas.mjs 把原版 MC block/item/entity PNG 合成一张 _atlas.png，
// 并输出 _atlas.json，key 是源码路径的 djb2 hash（混淆，不暴露原模型名）。
// 运行时消费侧通过本模块把原 URL 映射到 atlas 的裁剪区域。
//
// 设计要点：
//   - dev 环境（process.env.NODE_ENV !== 'production'）完全透传，不做任何拦截
//   - SlimeFun/ 子树不动（build 时也没进 atlas）
//   - Skull 远程皮肤不以 /img/Minecraft/ 开头，天然跳过
//   - hash 函数与 gen_atlas.mjs 里的 djb2 完全一致（纯 JS，无 crypto 依赖）

let _metaPromise: Promise<Meta | null> | null = null;

export interface Meta {
  /** atlas.png 的实际文件名（带内容 hash，如 _atlas.1a2b3c4d.png） */
  file?: string;
  _atlas: {w: number; h: number};
  entries: Record<string, Region>;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TexResolve {
  src: string;
  region?: Region;
  atlasW?: number;
  atlasH?: number;
}

/** 纯函数，无副作用。**/
export function getHashKey(relPath: string): string {
  let h = 5381;
  for (let i = 0; i < relPath.length; i++) {
    h = ((h << 5) + h + relPath.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 拼接 baseUrl 与绝对路径，避免 // 被浏览器当成协议相对 URL。 */
function joinBase(baseUrl: string, absPath: string): string {
  const base = (baseUrl || '').replace(/\/+$/, '');
  return `${base}${absPath}`;
}

/** 全局单例加载 atlas meta（只 fetch 一次）。 */
export function loadAtlasMeta(
  baseUrl = '',
  urlOverride?: string,
): Promise<Meta | null> {
  if (_metaPromise) return _metaPromise;
  const url = urlOverride ?? joinBase(baseUrl, '/img/Minecraft/_atlas.json');
  // no-cache：每次都向服务器确认（命中 ETag 时只回 304），
  // 避免部署后仍用旧 JSON 去裁新 atlas
  _metaPromise = fetch(url, {cache: 'no-cache'})
    .then((r) => (r.ok ? (r.json() as Promise<Meta>) : null))
    .catch(() => null);
  return _metaPromise;
}

/**
 * 把贴图 URL 映射到 atlas 裁剪区域。
 * 返回值的 src 可能是 atlas.png（prod 命中）或原 URL（dev / SlimeFun / 未命中）。
 */
export function resolveTex(
  url: string,
  meta: Meta | null,
  isProd: boolean,
  atlasBaseUrl = '',
): TexResolve {
  if (!isProd || !meta) return {src: url};
  // 兼容子路径部署：baseUrl 可能是 /foo/，从标记点之后取相对路径
  const marker = '/img/Minecraft/';
  const idx = url.indexOf(marker);
  if (idx === -1) return {src: url};
  const rel = url.slice(idx + marker.length);
  if (rel.startsWith('SlimeFun/')) return {src: url};

  const key = getHashKey(rel);
  const region = meta.entries[key];
  if (!region) return {src: url};

  return {
    src: joinBase(atlasBaseUrl, `/img/Minecraft/${meta.file ?? '_atlas.png'}`),
    region,
    atlasW: meta._atlas.w,
    atlasH: meta._atlas.h,
  };
}
