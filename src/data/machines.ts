// 机器表：配方里 `machine` 用到的机器（工作台 / 熔炉 / 机器方块等）
// 用法：<RecipeViewer recipe={{machine: 'enhanced_crafting_table', ...}} />
// 未在这里登记时，会回退到 src/data/items.ts 的物品库。

export type MachineDef = {
  /** 中文名（悬停显示） */
  name?: string;
  /** 平面贴图路径（不填则尝试物品库默认路径） */
  texture?: string;
  /** 3D 方块模型 id，填了会渲染成等距图标 */
  block?: string | string[];
  /** 点击跳转的 wiki 链接 */
  link?: string;
};

export const machines: Record<string, MachineDef> = {
  enhanced_crafting_table: {
    name: '增强型工作台',
    texture:
      '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/basic_machines/enhanced_crafting_table.png',
  },
  ancient_altar: {
    name: '古代祭坛',
    texture:
      '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/basic_machines/ancient_altar.png',
  },
  me_charger:{
    name: '充能器',
    block: 'lectern'
  },
  ore_crusher: {
    name: '矿物粉碎机',
    texture:
      '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/basic_machines/ore_crusher.png',
  }
};
