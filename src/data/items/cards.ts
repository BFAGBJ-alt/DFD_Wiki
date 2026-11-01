import type {ItemDef} from './types';

export const items: Record<string, ItemDef> = {
  'basic_card': {
    name: '基础卡',
    texture: '/img/Minecraft/item/miner_pottery_sherd.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#基础卡',
  },
  'advanced_card': {
    name: '高级卡',
    texture: '/img/Minecraft/item/blade_pottery_sherd.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#高级卡',
  },
  'acceleration_card': {
    name: '加速卡',
    texture: '/img/Minecraft/item/shaper_armor_trim_smithing_template.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#加速卡',
  },
  'advanced_acceleration_card': {
    name: '高级加速卡',
    texture: '/img/Minecraft/item/spire_armor_trim_smithing_template.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#高级加速卡',
  },
  'ultimate_acceleration_card': {
    name: '终极加速卡',
    texture: '/img/Minecraft/item/vex_armor_trim_smithing_template.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#终极加速卡',
  },
  'crafting_card': {
    name: '合成卡',
    texture: '/img/Minecraft/item/dune_armor_trim_smithing_template.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#合成卡',
  },
  'redstone_card': {
    name: '红石卡',
    texture: '/img/Minecraft/item/rib_armor_trim_smithing_template.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#红石卡',
  },
  'memory_card': {
    name: '内存卡',
    texture: '/img/Minecraft/item/paper.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#内存卡',
  },
  'card_replicator': {
    name: '升级卡复制器',
    texture: '/img/Minecraft/item/paper.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#升级卡复制器',
  },
  'card_inserter': {name: '塞卡器', block: 'dispenser', link: '/docs/粘液科技-单方空岛/应用能源/物品/升级卡#塞卡器'},
};
