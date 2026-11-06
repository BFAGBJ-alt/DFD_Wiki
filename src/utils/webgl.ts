let cached: boolean | null = null;

/**
 * 检测 WebGL2 可用性。
 *
 * three.js r163 起只支持 WebGL2：老设备（iOS 14 及更早）、部分低端机 /
 * 精简版浏览器（WebGL 被禁用或仅 WebGL1）拿不到上下文时，
 * WebGLRenderer 构造函数会直接抛错，表现为整块「3D 加载失败」。
 */
export function supportsWebGL2(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    cached = !!canvas.getContext('webgl2');
  } catch {
    cached = false;
  }
  return cached;
}
