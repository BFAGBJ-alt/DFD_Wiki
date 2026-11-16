import type {ItemDef} from './types';

// 原版方块等杂项；粘液科技（Slimefun4）物品见 Slimefun.ts。
export const items: Record<string, ItemDef> = {
  'honeycomb_block': {name: '蜂蜜块', block: 'honeycomb_block'},
  'black_stained_glass': {name: '黑色染色玻璃', block: 'black_stained_glass'},
  'note_block': {block: 'note_block'},
  'quartz_block': {name: '石英块', block: 'quartz_block'},
  'crafting_table': {name: '工作台', block: 'crafting_table'},
  'lava': {name: '岩浆', block: 'lava'},
  'reinforced_deepslate': {name: '强化深板岩', block: 'reinforced_deepslate'},
  'crying_obsidian': {name: '哭泣黑曜石', block: 'crying_obsidian'},
};
