import type {ItemDef} from './types';

export const items: Record<string, ItemDef> = {
  'me_terminal': {name: 'ME终端', block: 'shroomlight', link: '/docs/粘液科技-单方空岛/应用能源/物品/终端#me终端'},
  'me_crafting_terminal': {name: 'ME合成终端', block: 'crafting_table'},
  'me_craft_planning_terminal': {
    name: 'ME合成计划终端',
    block: 'sea_lantern',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/终端#me合成计划终端',
  },
  'me_all_in_one_terminal': {
    name: 'ME综合终端',
    block: 'sea_lantern',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/终端#me综合终端',
  },
  'me_pattern_terminal': {name: 'ME样板终端', block: 'loom', link: '/docs/粘液科技-单方空岛/应用能源/物品/终端#me样板终端'},
  'me_vanilla_pattern_terminal': {
    name: 'ME原版样板终端',
    block: 'loom',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/终端#me原版样板终端',
  },
  'me_security_terminal': {
    name: 'ME安全终端',
    block: 'ender_chest',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/终端#me安全终端',
  },
  'me_pattern_management_terminal': {
    name: 'ME样板管理终端',
    block: 'loom',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/终端#me样板管理终端',
  },
  'wireless_terminal': {
    name: '无线终端',
    texture: '/img/Minecraft/item/item_frame.png',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/终端#无线终端',
  },
};
