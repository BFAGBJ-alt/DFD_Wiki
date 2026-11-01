import type {ResolvedItem} from '@site/src/data/items/index';

export type ItemStack = {
  /** 物品 id（从物品数据库解析名称/贴图），优先级低于直接写的字段 */
  id?: string;
  /** 物品贴图 URL（不填则用 id 解析） */
  texture?: string;
  /** 物品名称（不填则用 id 解析） */
  name?: string;
  /** 数量，默认 1 */
  count?: number;
};

export type ResolvedStack = ResolvedItem & {
  count?: number;
  /** 主贴图缺失时尝试的方块贴图（由 block 字段推导） */
  fallbackTexture?: string | null;
};

/** 配方附加信息（都不填则不显示） */
export type RecipeMeta = {
  /**
   * 需要使用的机器，显示在九宫格左侧。
   * 可写机器表（src/data/machines.ts）里的 id，或完整的 ItemStack。
   */
  machine?: ItemStack | string;
  /** 耗时：数字按秒显示，字符串原样显示（如 '10s'、'1m20s'） */
  time?: string | number;
  /** 耗电量：数字按 J 显示，字符串原样显示（如 '200J'、'1k FE'） */
  energy?: string | number;
};

// shaped 工作台配方
export type ShapedRecipe = RecipeMeta & {
  type: 'shaped';
  pattern: string[];
  materials: Record<string, ItemStack>;
  result: ItemStack;
};

// shapeless 工作台配方
export type ShapelessRecipe = RecipeMeta & {
  type: 'shapeless';
  ingredients: ItemStack[];
  result: ItemStack;
};

// 熔炉配方
export type FurnaceRecipe = RecipeMeta & {
  type: 'furnace';
  input: ItemStack;
  fuel?: ItemStack;
  result: ItemStack;
};

export type Recipe = ShapedRecipe | ShapelessRecipe | FurnaceRecipe;
