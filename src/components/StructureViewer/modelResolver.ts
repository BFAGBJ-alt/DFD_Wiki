// 解析原版 Minecraft block model JSON（含 parent 继承链与 "#ref" 材质引用），
// 输出渲染用的四边形（quad）列表：支持立方体与 elements 自定义形状/局部 UV，
// 也支持多个模型组合（如雕纹书架 + 6 个槽位状态模型）。

export type Face = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';
export type FaceMap = Partial<Record<Face, string>>;

export type Quad = {
  face: Face;
  /** 元素范围（0..16，MC 方块局部坐标） */
  from: [number, number, number];
  to: [number, number, number];
  /** 贴图区域 u1,v1,u2,v2（0..16，v 向下） */
  uv: [number, number, number, number];
  /** 贴图 URL */
  texture: string;
  /** 贴图像素尺寸（默认 16×16；实体贴图如箱子是 64×64） */
  texSize?: [number, number];
  /** 绘制顺序偏置：正值更靠前（用于压在其它面上的小部件，如箱子锁扣） */
  depthBias?: number;
  /** 面贴图旋转角度（MC 的 face.rotation，贴图顺时针转，0/90/180/270） */
  uvRotation?: number;
  /** 元素旋转（如讲台倾斜的顶板） */
  rotation?: {
    angle: number;
    axis: 'x' | 'y' | 'z';
    origin?: [number, number, number];
  };
};

type ModelElement = {
  from?: [number, number, number];
  to?: [number, number, number];
  rotation?: {
    angle: number;
    axis: 'x' | 'y' | 'z';
    origin?: [number, number, number];
  };
  faces?: Partial<
    Record<
      Face,
      {
        texture?: string;
        uv?: [number, number, number, number];
        rotation?: number;
      }
    >
  >;
};

type ModelJson = {
  parent?: string;
  textures?: Record<string, string>;
  elements?: ModelElement[];
};

const FACES: Face[] = ['down', 'up', 'north', 'south', 'west', 'east'];

const modelCache = new Map<string, Promise<ModelJson | null>>();
const quadCache = new Map<string, Promise<Quad[]>>();

// "minecraft:block/furnace" / "block/furnace" -> "furnace"
function normalizeId(ref: string): string {
  return ref.replace(/^minecraft:/, '').replace(/^block\//, '');
}

// block 字段支持："furnace" | ["a","b"] | "a,b"（多模型组合）
function normalizeIds(block: string | string[]): string[] {
  const ids = Array.isArray(block) ? block : block.split(',');
  return ids.map((s) => s.trim()).filter(Boolean);
}

function loadModel(base: string, id: string): Promise<ModelJson | null> {
  const key = `${base}:${id}`;
  let p = modelCache.get(key);
  if (!p) {
    p = fetch(`${base}/${id}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<ModelJson>) : null))
      .catch(() => null);
    modelCache.set(key, p);
  }
  return p;
}

// 沿 parent 链收集模型（子 -> 父）
async function loadChain(base: string, id: string): Promise<ModelJson[]> {
  const chain: ModelJson[] = [];
  let cur: string | null = id;
  for (let depth = 0; depth < 10 && cur; depth++) {
    const model = await loadModel(base, cur);
    if (!model) break;
    chain.push(model);
    cur = model.parent ? normalizeId(model.parent) : null;
  }
  return chain;
}

// 解析 "#front" 这类间接引用，直到拿到真实材质路径
function resolveRef(
  textures: Record<string, string>,
  key: string,
  depth = 0,
): string | undefined {
  if (depth > 10) return undefined;
  const v = textures[key];
  if (!v) return undefined;
  if (v.startsWith('#')) return resolveRef(textures, v.slice(1), depth + 1);
  return v;
}

// MC 默认 uv：未显式给出时按面从元素范围推导
function defaultUv(
  face: Face,
  from: [number, number, number],
  to: [number, number, number],
): [number, number, number, number] {
  switch (face) {
    case 'north':
      return [from[0], 16 - to[1], to[0], 16 - from[1]];
    case 'south':
      return [16 - to[0], 16 - to[1], 16 - from[0], 16 - from[1]];
    case 'west':
      return [from[2], 16 - to[1], to[2], 16 - from[1]];
    case 'east':
      return [16 - to[2], 16 - to[1], 16 - from[2], 16 - from[1]];
    case 'up':
    case 'down':
      return [from[0], from[2], to[0], to[2]];
  }
}

/**
 * 面贴图旋转：MC 的 face.rotation 表示贴图顺时针旋转，
 * 所以面角点要采样的 uv 要反向（逆时针）转同样的角度。
 * uv 为贴图区域 u1,v1,u2,v2（v 向下）。
 */
export function rotateFaceUv(
  u: number,
  v: number,
  uv: [number, number, number, number],
  angle?: number,
): [number, number] {
  if (!angle) return [u, v];
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cu = (uv[0] + uv[2]) / 2;
  const cv = (uv[1] + uv[3]) / 2;
  const du = u - cu;
  const dv = v - cv;
  return [cu + du * cos + dv * sin, cv - du * sin + dv * cos];
}

/**
 * 一个面的 4 个角点（A 左上、B 右上、C 左下、D 右下，均从面外侧看）各自要采样的 uv 点，
 * 返回顺序为 [A, B, C, D]。这是原版 MC 的角点与 uv 对应关系：
 * north/east 的 u1 在面的右侧（东/南边缘），south/west 的 u1 在左侧（西/北边缘）；
 * up/down 以“北”为上。BlockDisplay 与 Structure3D 共用，避免两处约定漂移。
 */
export function quadUvPoints(
  uv: [number, number, number, number],
  face: Face,
): [number, number][] {
  const [u1, v1, u2, v2] = uv;
  const flipU = face === 'north' || face === 'east' || face === 'down';
  const a = flipU ? u2 : u1;
  const b = flipU ? u1 : u2;
  return [
    [a, v1],
    [b, v1],
    [a, v2],
    [b, v2],
  ];
}

// 方块实体（箱子、告示牌等）没有 elements，只给一个 particle 贴图。
// 箱子按原版 ModelChest 的 UV 布局用实体贴图还原；其余用 particle 画成立方体。
function fallbackQuads(
  base: string,
  id: string,
  textures: Record<string, string>,
): Quad[] {
  // 一个长方体按 MC 的 box UV 展开成 6 个面。
  // chestUv：箱子实体贴图的上下、左右方向与标准方块相反，单独处理。
  const box = (
    from: [number, number, number],
    to: [number, number, number],
    texOffs: [number, number],
    texture: string,
    texSize: [number, number],
    chestUv = false,
    depthBias = 0,
    lockUv = false,
  ): Quad[] => {
    const [x1, y1, z1] = from;
    const [x2, y2, z2] = to;
    const w = x2 - x1;
    const h = y2 - y1;
    const d = z2 - z1;
    const [u, v] = texOffs;
    if (lockUv) {
      // 锁扣很小，六个面都取它正面的 2×4 区域，避免采到箱体图
      const latch: [number, number, number, number] = [
        u + d,
        v + d,
        u + d + w,
        v + d + h,
      ];
      return FACES.map((face) => ({
        face,
        from,
        to,
        uv: latch,
        texture,
        texSize,
        depthBias,
        uvRotation: 180,
      }));
    }
    let rects: Record<string, [number, number, number, number]>;
    if (chestUv) {
      // 箱子：四个侧面贴图先 180°，再左右/前后互换，最后整体逆时针 90°
      const rWest: [number, number, number, number] = [u, v + d, u + d, v + d + h];
      const rNorth: [number, number, number, number] = [u + d, v + d, u + d + w, v + d + h];
      const rEast: [number, number, number, number] = [u + d + w, v + d, u + d + w + d, v + d + h];
      const rSouth: [number, number, number, number] = [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h];
      rects = {
        up: [u + d + w, v, u + d + 2 * w, v + d],
        down: [u + d, v, u + d + w, v + d],
        // 再逆时针转 90°；贴图里 west/south 两格透明，用不透明的两格替代
        north: rEast,
        west: rEast,
        south: rNorth,
        east: rNorth,
      };
    } else {
      rects = {
        up: [u + d, v, u + d + w, v + d],
        down: [u + d + w, v, u + d + 2 * w, v + d],
        east: [u, v + d, u + d, v + d + h],
        north: [u + d, v + d, u + d + w, v + d + h],
        west: [u + d + w, v + d, u + d + w + d, v + d + h],
        south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
      };
    }
    return FACES.map((face) => ({
      face,
      from,
      to,
      uv: rects[face],
      texture,
      texSize,
      depthBias,
      uvRotation: chestUv && face !== 'up' && face !== 'down' ? 180 : undefined,
    }));
  };

  if (id === 'chest' || id === 'ender_chest') {
    // 箱子是实体贴图，64×64，原版 ModelChest 的三个 box：
    // bottom texOffs(0,19)、lid texOffs(0,0)、lock texOffs(0,0)
    const file = id === 'ender_chest' ? 'ender' : 'normal';
    const tex = `${base.replace(/\/block$/, '')}/entity/chest/${file}.png`;
    return [
      // 箱体 [1,0,1]-[15,10,15]，14×10×14
      ...box([1, 0, 1], [15, 10, 15], [0, 19], tex, [64, 64], true),
      // 箱盖 [1,9,1]-[15,14,15]，14×5×14
      ...box([1, 9, 1], [15, 14, 15], [0, 0], tex, [64, 64], true),
      // 锁扣：贴在正对观察者的北面，贴图上下 + 前后翻转（180°），上移 1 格
      // depthBias 拉满，保证永远最后绘制、不会被箱盖侧面盖住
      ...box([7, 7, 0], [9, 11, 1], [0, 0], tex, [64, 64], true, 100, true),
    ];
  }

  // 其余方块实体：用 particle 贴图画满一个方块
  const particle = resolveRef(textures, 'particle');
  if (!particle) return [];
  return box(
    [0, 0, 0],
    [16, 16, 16],
    [0, 0],
    `${base}/${normalizeId(particle)}.png`,
    [16, 16],
  );
}

// 资源包没有蜡化模型（waxed_*），渲染时退回同形状的未蜡化模型
function unwaxedId(id: string): string | null {
  return id.startsWith('waxed_') ? id.slice('waxed_'.length) : null;
}

// 资源包把一些方块拆成了子模型，且没有蜡化模型（waxed_*）。
// 这里给出渲染用的候选 id：蜡化 -> 未蜡化；门/活板门 -> 默认下半子模型。
// 门/活板门的开合与铰链方向不在结构 JSON 里，取最接近的闭合默认形态。
function modelAliases(id: string): string[] {
  const out: string[] = [];
  let base = id;
  const un = unwaxedId(id);
  if (un) {
    base = un;
    out.push(un);
  }
  if (base.endsWith('_door')) out.push(`${base}_bottom_left`);
  if (base.endsWith('_trapdoor')) out.push(`${base}_bottom`);
  return out;
}

// 单个 model id -> quads
async function resolveModelQuads(base: string, id: string): Promise<Quad[]> {
  let chain = await loadChain(base, id);
  let effectiveId = id;
  for (const alt of modelAliases(id)) {
    if (chain.length > 0) break;
    chain = await loadChain(base, alt);
    effectiveId = alt;
  }
  if (chain.length === 0) return [];
  // textures 合并：父先子后，子覆盖父
  const textures = [...chain]
    .reverse()
    .reduce<Record<string, string>>(
      (acc, m) => ({...acc, ...(m.textures ?? {})}),
      {},
    );
  // elements：取链上最靠近子级、定义了 elements 的模型
  const elements = chain.find((m) => m.elements?.length)?.elements ?? [];

  const quads: Quad[] = [];
  for (const el of elements) {
    const from = el.from ?? [0, 0, 0];
    const to = el.to ?? [16, 16, 16];
    for (const face of FACES) {
      const def = el.faces?.[face];
      if (!def?.texture) continue;
      const ref = def.texture.startsWith('#')
        ? resolveRef(textures, def.texture.slice(1))
        : def.texture;
      if (!ref) continue;
      quads.push({
        face,
        from,
        to,
        uv: def.uv ?? defaultUv(face, from, to),
        texture: `${base}/${normalizeId(ref)}.png`,
        uvRotation: def.rotation,
        rotation: el.rotation,
      });
    }
  }
  if (quads.length === 0) return fallbackQuads(base, effectiveId, textures);
  return quads;
}

/** 解析方块（可组合多个 model id）为 quad 列表。 */
export function resolveBlockQuads(
  block: string | string[],
  base: string,
): Promise<Quad[]> {
  const ids = normalizeIds(block);
  const key = `${base}:${ids.join(',')}`;
  let p = quadCache.get(key);
  if (!p) {
    p = Promise.all(ids.map((id) => resolveModelQuads(base, id))).then(
      (lists) => lists.flat(),
    );
    quadCache.set(key, p);
  }
  return p;
}

/** 取每面代表贴图（移动端静态展示用；组合模型时取各面首个 quad）。 */
export async function resolveBlockFaces(
  block: string | string[],
  base: string,
): Promise<FaceMap> {
  const quads = await resolveBlockQuads(block, base);
  const faces: FaceMap = {};
  for (const q of quads) {
    faces[q.face] ??= q.texture;
  }
  return faces;
}

/** 头颅朝向：up=落地头（脸朝北，MC 的 player_head）；其余为墙头，脸贴对应方向的方块边缘 */
export type SkullFace = 'up' | 'north' | 'south' | 'east' | 'west';

// 墙头侧面标签按俯视顺时针循环（绕 Y 轴旋转一步时的标签迁移）
const SKULL_SIDE_CYCLE: Face[] = ['north', 'east', 'south', 'west'];

/**
 * 自定义头颅贴图（64×64 皮肤 PNG）→ 头颅 quads：
 * 8×8×8 底层 + 外扩 0.5 的帽子层（外扩后可见面天然在底层之前）。
 *
 * 基准朝向为面北墙头（脸贴 z=0 边缘，底层 [4,4,0]-[12,12,8]）；
 * face='up' 时平移为落地头（[4,0,4]-[12,8,12]，脸仍朝北）；
 * face=east/south/west 时绕 Y 轴 (8,y,8) 俯视顺时针旋转 1/2/3 步：
 * 侧面标签随几何旋转循环迁移（uv 区域不变，按新面的角点约定自动保持正向），
 * up 面每步 uvRotation+90、down 面 +270（保持头顶/下巴贴图方向正确）。
 */
export function skullQuads(texture: string, face: SkullFace = 'up'): Quad[] {
  // 皮肤头部 UV（texSize 64×64）：
  //   脸 (8,8)-(16,16)  后脑 (24,8)-(32,16)
  //   角色右侧 (0,8)-(8,16)  左侧 (16,8)-(24,16)
  //   顶 (8,0)-(16,8)（v=8 一侧是额头）  底 (16,0)-(24,8)
  const layer = (
    from: [number, number, number],
    to: [number, number, number],
    du: number,
  ): Quad[] => {
    const texSize: [number, number] = [64, 64];
    return [
      {face: 'north', from, to, uv: [8 + du, 8, 16 + du, 16], texture, texSize},
      {face: 'south', from, to, uv: [24 + du, 8, 32 + du, 16], texture, texSize},
      {face: 'east', from, to, uv: [0 + du, 8, 8 + du, 16], texture, texSize},
      {face: 'west', from, to, uv: [16 + du, 8, 24 + du, 16], texture, texSize},
      {face: 'up', from, to, uv: [16 + du, 8, 8 + du, 0], texture, texSize},
      {face: 'down', from, to, uv: [16 + du, 0, 24 + du, 8], texture, texSize},
    ];
  };
  // 帽子层不再需要 depthBias：外扩 0.5 后可见面本就比底层更靠近相机，
  // 统一加偏置会让帽子层的背面反超、盖住正面的贴图。
  const quads = [
    ...layer([4, 4, 0], [12, 12, 8], 0),
    ...layer([3.5, 3.5, -0.5], [12.5, 12.5, 8.5], 32),
  ];
  if (face === 'up') {
    // 落地头：下移 4、南移 4，坐在方块底面上
    return quads.map((q) => ({
      ...q,
      from: [q.from[0], q.from[1] - 4, q.from[2] + 4] as [number, number, number],
      to: [q.to[0], q.to[1] - 4, q.to[2] + 4] as [number, number, number],
    }));
  }
  const steps = {north: 0, east: 1, south: 2, west: 3}[face];
  if (steps === 0) return quads;
  const rotXZ = (x: number, z: number): [number, number] => {
    let rx = x;
    let rz = z;
    for (let i = 0; i < steps; i++) [rx, rz] = [16 - rz, rx];
    return [rx, rz];
  };
  return quads.map((q) => {
    const [ax, az] = rotXZ(q.from[0], q.from[2]);
    const [bx, bz] = rotXZ(q.to[0], q.to[2]);
    const out: Quad = {
      ...q,
      from: [Math.min(ax, bx), q.from[1], Math.min(az, bz)],
      to: [Math.max(ax, bx), q.to[1], Math.max(az, bz)],
    };
    const sideIdx = SKULL_SIDE_CYCLE.indexOf(q.face);
    if (sideIdx >= 0) {
      out.face = SKULL_SIDE_CYCLE[(sideIdx + steps) % 4];
    } else if (q.face === 'up') {
      out.uvRotation = (90 * steps) % 360;
    } else {
      out.uvRotation = (270 * steps) % 360;
    }
    return out;
  });
}

/** 方块级朝向：对应原版 blockstate 的 facing 属性（末地烛、避雷针、熔炉等） */
export type BlockFacing = 'up' | 'down' | 'north' | 'south' | 'east' | 'west';
/** 方块级轴向：对应原版 blockstate 的 axis 属性（原木、柱状方块等） */
export type BlockAxis = 'x' | 'y' | 'z';

/** 一次绕方块中心 (8,8,8) 的旋转，按数组顺序依次应用 */
export type BlockRotation = {axis: 'x' | 'y' | 'z'; angle: number};

/**
 * 模型默认朝向映射表。
 *
 * facing / axis 只有知道模型本身“默认朝哪”才能算出正确旋转量：
 *  - horizontal：默认正面朝北（facing=north）。原版绝大多数带朝向的方块都是
 *    这个约定，如熔炉、观察者、活塞、漏斗、发射器、箱子、木桶、工作台、
 *    织布机、切石机、讲台、钟…
 *  - vertical：默认竖立（facing=up），如末地烛、避雷针、锁链、蜡烛、火把、
 *    紫水晶簇、滴水石锥…
 *  - axis：默认沿 Y 轴（axis=y），如原木、菌柄、柱状方块、干草块、骨块…
 *
 * 未列出的模型按 horizontal 处理。
 */
const VERTICAL_MODELS = new Set([
  'end_rod',
  'lightning_rod',
  'chain',
  'candle',
  'white_candle',
  'orange_candle',
  'magenta_candle',
  'light_blue_candle',
  'yellow_candle',
  'lime_candle',
  'pink_candle',
  'gray_candle',
  'light_gray_candle',
  'cyan_candle',
  'purple_candle',
  'blue_candle',
  'brown_candle',
  'green_candle',
  'red_candle',
  'black_candle',
  'torch',
  'copper_torch',
  'soul_torch',
  'redstone_torch',
  'small_amethyst_bud',
  'medium_amethyst_bud',
  'large_amethyst_bud',
  'amethyst_cluster',
  'pointed_dripstone',
]);

const AXIS_MODELS = new Set([
  'basalt',
  'polished_basalt',
  'smooth_basalt',
  'bone_block',
  'hay_block',
  'deepslate',
  'bamboo_block',
  'stripped_bamboo_block',
  'ochre_froglight',
  'verdant_froglight',
  'pearlescent_froglight',
]);

// 原木类命名规律（含去皮）：*_log / *_wood / *_stem / *_hyphae / *_pillar
const AXIS_NAME = /(^|_)(log|wood|stem|hyphae|pillar)$/;

// 蜡烛模型按数量拆分命名：candle_one_candle / white_candle_two_candles …
const CANDLE_NAME = /candle_(one_candle|two_candles|three_candles|four_candles)$/;

// 避雷针全系列：lightning_rod / exposed_ / weathered_ / oxidized_ / waxed_*（含 _on）
const LIGHTNING_ROD_NAME = /(^|_)lightning_rod(_on)?$/;

// 锁链全系列：chain / copper_chain / exposed_copper_chain …（axis 朝向，基准竖立）
const CHAIN_NAME = /(^|_)chain$/;

function modelOrient(id: string): 'horizontal' | 'vertical' | 'axis' {
  const key = normalizeId(id);
  if (
    VERTICAL_MODELS.has(key) ||
    CANDLE_NAME.test(key) ||
    LIGHTNING_ROD_NAME.test(key) ||
    CHAIN_NAME.test(key)
  ) {
    return 'vertical';
  }
  if (AXIS_MODELS.has(key) || AXIS_NAME.test(key)) return 'axis';
  return 'horizontal';
}

const FACE_NORMAL: Record<Face, [number, number, number]> = {
  up: [0, 1, 0],
  down: [0, -1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0],
};

// 绕 origin 旋转 MC 坐标点，角度约定与原版模型旋转一致（右手系）
function rotateAbout(
  p: [number, number, number],
  axis: 'x' | 'y' | 'z',
  angle: number,
  origin: [number, number, number],
): [number, number, number] {
  if (!angle) return p;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = p[0] - origin[0];
  const y = p[1] - origin[1];
  const z = p[2] - origin[2];
  let rx = x;
  let ry = y;
  let rz = z;
  if (axis === 'x') {
    ry = y * cos - z * sin;
    rz = y * sin + z * cos;
  } else if (axis === 'y') {
    rx = x * cos + z * sin;
    rz = -x * sin + z * cos;
  } else {
    rx = x * cos - y * sin;
    ry = x * sin + y * cos;
  }
  return [rx + origin[0], ry + origin[1], rz + origin[2]];
}

/**
 * 计算方块级朝向旋转；不传 facing/axis 时返回空数组（行为完全不变）。
 * 旋转绕方块中心 (8,8,8)，在 2D / 3D 两处渲染中用法一致。
 */
export function resolveBlockRotation(
  block: string | string[],
  facing?: BlockFacing,
  axis?: BlockAxis,
): BlockRotation[] {
  const ids = normalizeIds(block);
  const orient = modelOrient(ids[0] ?? '');

  if (!facing && axis) {
    // axis 的基准是竖立状态（axis=y）
    if (axis === 'y') return [];
    // 原版：axis=z 用 x:90；axis=x 用 x:90,y:90。
    // 等价地：末端朝南 = 绕 X +90；末端朝东 = 绕 Z -90。
    return axis === 'z'
      ? [{axis: 'x', angle: 90}]
      : [{axis: 'z', angle: -90}];
  }

  if (!facing) return [];

  const baseUp = orient === 'vertical' || orient === 'axis';
  if (!baseUp) {
    // 水平块基准 facing=north
    switch (facing) {
      case 'north':
        return [];
      case 'east':
        return [{axis: 'y', angle: -90}];
      case 'south':
        return [{axis: 'y', angle: 180}];
      case 'west':
        return [{axis: 'y', angle: 90}];
      case 'up':
        return [{axis: 'x', angle: 90}];
      case 'down':
        return [{axis: 'x', angle: -90}];
    }
  }
  // 竖直块基准 facing=up
  switch (facing) {
    case 'up':
      return [];
    case 'down':
      return [{axis: 'x', angle: 180}];
    case 'north':
      return [{axis: 'x', angle: -90}];
    case 'south':
      return [{axis: 'x', angle: 90}];
    case 'east':
      return [{axis: 'z', angle: -90}];
    case 'west':
      return [{axis: 'z', angle: 90}];
  }
  return [];
}

/** 把 MC 坐标点按方块级旋转依次变换（默认绕方块中心 8,8,8） */
export function rotateBlockPoint(
  p: [number, number, number],
  rotations: BlockRotation[],
  origin: [number, number, number] = [8, 8, 8],
): [number, number, number] {
  let out: [number, number, number] = p;
  for (const r of rotations) out = rotateAbout(out, r.axis, r.angle, origin);
  return out;
}

/** 面标签跟着方块一起转：用于 2D 明暗（避免旋转后明暗反掉） */
export function rotateBlockFace(
  face: Face,
  rotations: BlockRotation[],
): Face {
  if (rotations.length === 0) return face;
  const v = rotateBlockPoint(FACE_NORMAL[face], rotations, [0, 0, 0]);
  let best: Face = face;
  let bestDot = -Infinity;
  for (const f of FACES) {
    const n = FACE_NORMAL[f];
    const dot = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    if (dot > bestDot) {
      bestDot = dot;
      best = f;
    }
  }
  return best;
}
