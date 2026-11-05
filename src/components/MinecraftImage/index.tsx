import React, {useEffect, useState, type CSSProperties, type ReactNode} from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {
  loadAtlasMeta,
  resolveTex,
  type Meta,
  type Region,
} from '@site/src/utils/minecraftAtlas';

const isProd = process.env.NODE_ENV === 'production';

/** 该 URL 是否属于会进 atlas 的子树（原版 MC，排除 SlimeFun） */
function isAtlasCandidate(url: string): boolean {
  const idx = url.indexOf('/img/Minecraft/');
  if (idx === -1) return false;
  return !url.slice(idx + '/img/Minecraft/'.length).startsWith('SlimeFun/');
}

/** 数据文件里写的是 '/img/Minecraft/xxx' 绝对路径，部署到子路径时需要补上 baseUrl */
function withBase(url: string, baseUrl: string): string {
  if (!url.startsWith('/')) return url;
  const base = (baseUrl || '').replace(/\/+$/, '');
  if (!base) return url;
  return url.startsWith(`${base}/`) ? url : `${base}${url}`;
}

type TexState = {
  status: 'ready' | 'pending';
  src: string;
  region?: Region;
  atlasW?: number;
  atlasH?: number;
};

function useAtlasTex(rawUrl: string): TexState {
  // 注意用 '/' 而不是 ''：Docusaurus 的 addBaseUrl 对空串直接原样返回（不做前缀拼接）
  const baseUrl = useBaseUrl('/');
  // 数据里是 '/img/Minecraft/...' 绝对路径，子路径部署（baseUrl=/wiki_page/）要补前缀
  const url = withBase(rawUrl, baseUrl);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    if (!isProd || !isAtlasCandidate(url)) return;
    let cancelled = false;
    loadAtlasMeta(baseUrl).then((m) => {
      if (!cancelled) setMeta(m);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, url]);

  const hit = resolveTex(url, meta, isProd, baseUrl);
  if (hit.region) {
    return {
      status: 'ready',
      src: hit.src,
      region: hit.region,
      atlasW: hit.atlasW,
      atlasH: hit.atlasH,
    };
  }
  // prod 下原版贴图已进 atlas：等 meta 到达再渲染，避免先请求已删除的原 PNG
  if (isProd && isAtlasCandidate(url) && !meta) {
    return {status: 'pending', src: url};
  }
  return {status: 'ready', src: url};
}

type MinecraftImageProps = {
  src: string;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  style?: CSSProperties;
  onError?: () => void;
};

/**
 * 贴图 <img> 的 atlas 代理层：
 * 命中 atlas 时用 <svg viewBox> 裁出对应区域（尺寸/缩放语义与原 <img> 一致），
 * 未命中（SlimeFun、远程皮肤、dev 环境）时原样输出 <img>。
 */
export default function MinecraftImage({
  src,
  alt = '',
  className,
  width,
  height,
  style,
  onError,
}: MinecraftImageProps): ReactNode {
  const tex = useAtlasTex(src);

  if (tex.status === 'pending') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-block',
          width: width ?? '100%',
          height: height ?? '100%',
          ...style,
        }}
        aria-hidden="true"
      />
    );
  }

  if (!tex.region) {
    return (
      <img
        src={tex.src}
        alt={alt}
        className={className}
        width={width}
        height={height}
        style={style}
        onError={onError}
      />
    );
  }

  // 动画贴图是竖排长图（10×n 帧），只显示第一帧，与 <img> 时代的裁剪行为一致
  const frameH =
    tex.region.h > tex.region.w && tex.region.h % tex.region.w === 0
      ? tex.region.w
      : tex.region.h;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`${tex.region.x} ${tex.region.y} ${tex.region.w} ${frameH}`}
      style={{imageRendering: 'pixelated', ...style}}
      role="img"
      aria-label={alt}>
      <image
        href={tex.src}
        x={0}
        y={0}
        width={tex.atlasW}
        height={tex.atlasH}
      />
    </svg>
  );
}
