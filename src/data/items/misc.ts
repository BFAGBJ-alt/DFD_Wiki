import type {ItemDef} from './types';

export const items: Record<string, ItemDef> = {
  'honeycomb_block': {name: '蜂蜜块', block: 'honeycomb_block'},
  'black_stained_glass': {name: '黑色染色玻璃', block: 'black_stained_glass'},
  'note_block': {block: 'note_block'},
  'quartz_block': {name: '石英块', block: 'quartz_block'},
  'crafting_table': {name: '工作台', block: 'crafting_table'},
  'lava': {name: '岩浆', block: 'lava'},
  'reinforced_deepslate': {name: '强化深板岩', block: 'reinforced_deepslate'},
  'crying_obsidian': {name: '哭泣黑曜石', block: 'crying_obsidian'},
  'CHARGED_GPS_TRANSMITTER': {
    name: '充能GPS发射器',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/gps/gps_transmitter_4.png',
  },
  'NUCLEAR_REACTOR': {
    name: '核反应堆',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/energy/nuclear_reactor.png',
  },
  'GOLD_22K': {
    name: '22K金',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/resources/gold_ingots/gold_22k.png',
  },
  'SILVER_INGOT': {
    name: '银锭',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/resources/ingots/silver_ingot.png',
  },
  'BILLON_INGOT': {
    name: '银铜合金锭',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/resources/ingots/billon_ingot.png',
  },
};
