// 物品数据库：id -> 名称 / 贴图 / 3D 方块模型 / wiki 链接
// 组件（StructureViewer / RecipeViewer）里只需写 id，属性从这里解析。
// 贴图路径默认 /img/Minecraft/item/<id>.png；方块用 block/ model。

export type ItemDef = {
  /** 中文名 */
  name?: string;
  /** 贴图路径（不含 baseUrl），不填则默认 /img/Minecraft/item/<id>.png */
  texture?: string;
  /** 3D 方块模型 id（StructureViewer 单方块模式用），对应 block/ model */
  block?: string | string[];
  /** 颜色回退（无 block 且无贴图时显示） */
  color?: string;
  /** wiki 链接，标记后方块可点击跳转 */
  link?: string;
  /** 是否显示附魔光效（游戏内带光效的机器/物品） */
  glint?: boolean;
};

// 在这里登记常用物品 / 方块。后续按需补充。
export const items: Record<string, ItemDef> = {
  'iron_ingot': {name: '铁锭'},
  'stick': {name: '木棍'},
  'cobblestone': {name: '圆石', block: 'cobblestone', texture: '/img/Minecraft/block/cobblestone.png'},
  'stone': {name: '石头', block: 'stone', texture: '/img/Minecraft/block/stone.png'},
  'glass': {name: '玻璃', block: 'glass', texture: '/img/Minecraft/block/glass.png'},
  'me_controller': {
    name: 'ME 控制器',
    block: 'black_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/基础ME网络的搭建',
  },
  'me_drive': {
    name: 'ME 驱动器',
    block: [
      'chiseled_bookshelf',
      'chiseled_bookshelf_empty_slot_top_left',
      'chiseled_bookshelf_empty_slot_top_mid',
      'chiseled_bookshelf_empty_slot_top_right',
      'chiseled_bookshelf_empty_slot_bottom_left',
      'chiseled_bookshelf_empty_slot_bottom_mid',
      'chiseled_bookshelf_empty_slot_bottom_right',
    ],
    link: '/docs/粘液科技-单方空岛/应用能源/物品/ME驱动器',
  },
  'me_interface': {name: 'ME 接口', block: 'target', link: '/docs/粘液科技-单方空岛/应用能源/物品/接口#me接口'},
  'fluix_crystal': {
    name: '福鲁伊克斯水晶',
    texture: '/img/Minecraft/block/amethyst_cluster.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/基础材料#福鲁伊克斯水晶',
  },
  'engineering_processor': {
    name: '工程处理器',
    texture: '/img/Minecraft/item/silence_armor_trim_smithing_template.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/处理器#工程处理器',
  },
  'sky_stone_dust': {
    name: '陨石粉',
    texture: '/img/Minecraft/item/gunpowder.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/基础材料#陨石粉',
  },
  'me_glass_cable': {name: 'ME玻璃线缆', block: 'glass', link: '/docs/粘液科技-单方空岛/应用能源/物品/ME玻璃线缆'},
  'silicon': {
    name: '硅',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/resources/valuables/silicon.png',
  },
  'ferrosilicon': {
    name: '硅铁',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/resources/ingots/ferrosilicon.png',
  },
  'me_charger': {name: '充能器', block: 'lectern', link: '/docs/粘液科技-单方空岛/应用能源/物品/充能器'},
  'me_terminal': {name: 'ME终端', block: 'shroomlight', link: '/docs/粘液科技-单方空岛/应用能源/物品/ME终端#me终端'},
  'me_inscriber': {name: '压印器', block: 'lodestone', link: '/docs/粘液科技-单方空岛/应用能源/物品/压印器'},
  'quartz_dust': {
    name: '下界石英粉',
    texture: '/img/Minecraft/item/sugar.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/基础材料#下界石英粉',
  },
  'quartz': {name: '下界石英'},
  'crystal_certus_quartz': {
    name: '赛特斯石英水晶',
    texture: '/img/Minecraft/item/quartz.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/基础材料#赛特斯石英',
  },
  'charged_crystal_certus_quartz': {
    name: '充能赛特斯石英水晶',
    texture: '/img/Minecraft/item/quartz.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/基础材料#充能赛特斯石英',
  },
  'certus_quartz_dust': {
    name: '赛特斯石英粉',
    texture: '/img/Minecraft/item/glowstone_dust.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/基础材料#赛特斯石英粉',
  },
  'fluix_dust': {
    name: '福鲁伊克斯粉',
    texture: '/img/Minecraft/item/blaze_powder.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/基础材料#福鲁伊克斯粉',
  },
  'ender_pearl': {name: '末影珍珠'},
  'fluix_pearl': {
    name: '福鲁伊克斯珍珠',
    texture: '/img/Minecraft/item/ender_eye.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/福鲁伊克斯珍珠',
  },
  'printed_silicon': {
    name: '硅板',
    texture: '/img/Minecraft/item/orange_dye.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/板材#硅板',
  },
  'printed_logic_circuit': {
    name: '逻辑电路板',
    texture: '/img/Minecraft/item/orange_dye.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/板材#逻辑电路板',
  },
  'printed_calculation_circuit': {
    name: '运算电路板',
    texture: '/img/Minecraft/item/light_blue_dye.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/板材#运算电路板',
  },
  'redstone': {name: '红石粉'},
  'printed_engineering_circuit': {
    name: '工程电路板',
    texture: '/img/Minecraft/item/blue_dye.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/板材#工程电路板',
  },
  'printed_logic_processor': {
    name: '逻辑处理器',
    texture: '/img/Minecraft/item/dune_armor_trim_smithing_template.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/处理器#逻辑处理器',
  },
  'printed_calculation_processor': {
    name: '运算处理器',
    texture: '/img/Minecraft/item/tide_armor_trim_smithing_template.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/处理器#运算处理器',
  },
  'formation_core': {
    name: '成型核心',
    texture: '/img/Minecraft/item/gold_nugget.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/核心#成型核心',
  },
  'annihilation_core': {
    name: '破坏核心',
    texture: '/img/Minecraft/item/iron_nugget.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/核心#破坏核心',
  },
  'wireless_receiver': {
    name: '无线接收器',
    texture: '/img/Minecraft/block/redstone_torch.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/无线接收器',
  },
  'me_storage_housing': {
    name: 'ME存储外壳',
    texture: '/img/Minecraft/item/sentry_armor_trim_smithing_template.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/ME存储外壳',
  },
  'sticky_piston': {name: '粘性活塞', block: 'sticky_piston'},
  'piston': {name: '活塞', block: 'piston'},
  'diamond': {name: '钻石'},
  'gold_ingot': {name: '金锭'},
  'me_pattern_interface': {name: 'ME 样板接口', block: 'target'},
  'quartz_glass': {name: '石英玻璃', block: 'glass'},
  'craft_table': {name: '工作台', block: 'crafting_table'},
  'me_crafting_terminal': {name: 'ME合成终端', block: 'crafting_table'},
  'me_import_bus': {
    name: 'ME输入总线',
    block: 'lime_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me输入总线',
  },
  'me_export_bus': {
    name: 'ME输出总线',
    block: 'red_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me输出总线',
  },
  'me_ie_bus': {
    name: 'ME输入输出总线',
    block: 'yellow_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me输入输出总线',
  },
  'me_vanilla_import_bus': {
    name: 'ME原版输入总线',
    block: 'lime_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me原版输入总线',
  },
  'me_vanilla_export_bus': {
    name: 'ME原版输出总线',
    block: 'red_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me原版输出总线',
  },
  'me_vanilla_ie_bus': {
    name: 'ME原版输入输出总线',
    block: 'yellow_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me原版输入输出总线',
  },
  'me_advanced_import_bus': {
    name: 'ME高级输入总线',
    block: 'lime_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me高级输入总线',
  },
  'me_advanced_export_bus': {
    name: 'ME高级输出总线',
    block: 'red_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me高级输出总线',
  },
  'me_advanced_ie_bus': {
    name: 'ME高级输入输出总线',
    block: 'yellow_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me高级输入输出总线',
  },
  'me_advanced_vanilla_import_bus': {
    name: 'ME高级原版输入总线',
    block: 'lime_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me高级原版输入总线',
  },
  'me_advanced_vanilla_export_bus': {
    name: 'ME高级原版输出总线',
    block: 'red_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me高级原版输出总线',
  },
  'me_advanced_vanilla_ie_bus': {
    name: 'ME高级原版输入输出总线',
    block: 'yellow_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me高级原版输入输出总线',
  },
  'me_chained_import_bus': {
    name: 'ME链式输入总线',
    block: 'lime_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me链式输入总线',
  },
  'me_chained_export_bus': {
    name: 'ME链式输出总线',
    block: 'red_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me链式输出总线',
  },
  'me_chained_ie_bus': {
    name: 'ME链式输入输出总线',
    block: 'yellow_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me链式输入输出总线',
  },
  'me_storage_bus': {
    name: 'ME存储总线',
    block: 'white_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/总线#me存储总线',
  },
  'hopper': {name: '漏斗'},
};

export type ResolvedItem = {
  name: string;
  texture: string | null;
  block?: string | string[];
  color?: string;
  link?: string;
  glint?: boolean;
};

const ITEM_PNG_BASE = '/img/Minecraft/item';

/** 按 id 解析物品，未登记的物品回退到默认贴图。 */
export function resolveItem(id: string): ResolvedItem {
  const def = items[id] ?? {};
  const name = def.name ?? id;
  const texture = def.texture ?? `${ITEM_PNG_BASE}/${id}.png`;
  return {
    name,
    texture,
    block: def.block,
    color: def.color,
    link: def.link,
    glint: def.glint,
  };
}
