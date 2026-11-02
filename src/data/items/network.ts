import type {ItemDef} from './types';

export const items: Record<string, ItemDef> = {
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
  'wireless_receiver': {name: '无线接收器', texture: '/img/Minecraft/block/redstone_torch.png'},
  'me_pattern_interface': {
    name: 'ME 样板接口',
    block: 'target',
    link: 'http://localhost:3000/docs/%E7%B2%98%E6%B6%B2%E7%A7%91%E6%8A%80-%E5%8D%95%E6%96%B9%E7%A9%BA%E5%B2%9B/%E5%BA%94%E7%94%A8%E8%83%BD%E6%BA%90/%E7%89%A9%E5%93%81/%E6%8E%A5%E5%8F%A3#me%E6%A0%B7%E6%9D%BF%E6%8E%A5%E5%8F%A3',
  },
  'me_io_port': {
    name: 'ME IO端口',
    block: [
      'chiseled_bookshelf',
      'chiseled_bookshelf_empty_slot_top_left',
      'chiseled_bookshelf_empty_slot_top_mid',
      'chiseled_bookshelf_empty_slot_top_right',
      'chiseled_bookshelf_empty_slot_bottom_left',
      'chiseled_bookshelf_empty_slot_bottom_mid',
      'chiseled_bookshelf_empty_slot_bottom_right',
    ],
    link: '/docs/粘液科技-单方空岛/应用能源/物品/网络设备#me-io端口',
  },
  'me_cell_workbench': {
    name: 'ME元件工作台',
    block: 'crafting_table',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/网络设备#me元件工作台',
  },
  'me_level_emitter': {
    name: 'ME标准发信器',
    block: 'target',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/网络设备#me标准发信器',
  },
  'networks_expansion_switch': {
    name: '网络交换机',
    block: 'magenta_glazed_terracotta',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/网络设备#网络交换机',
  },
  'me_conversation_monitor': {
    name: 'ME交换监控器',
    block: 'glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/网络设备#me交换监控器',
  },
  'me_cleaner': {name: 'ME清除器', block: 'observer', link: '/docs/粘液科技-单方空岛/应用能源/物品/网络设备#me清除器'},
  'me_crafting_trigger': {
    name: 'ME合成触发器',
    block: 'crafting_table',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/网络设备#me合成触发器',
  },
  'me_energy_acceptor': {
    name: '能源接收器',
    block: 'white_stained_glass',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/网络设备#能源接收器',
  },
  'me_reskin_machine': {
    name: 'ME材质转换机',
    block: 'smithing_table',
    link: '/docs/粘液科技-单方空岛/应用能源/物品/网络设备#me材质转换机',
  },
  'energy_connector': {
    name: '能源连接器',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/energy/energy_connector.png',
  },
  'portable_dustbin': {
    name: '便携垃圾桶',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/items/portable_dustbin.png',
  },
  'carbonado_edged_capacitor': {
    name: '碳化电容',
    texture: '/img/Minecraft/SlimeFun/assets/slimefun/textures/slimefun/energy/carbonado_edged_capacitor.png',
  },
  'network_controller': {name: '网络控制器', block: 'black_stained_glass'},
  'me_energy_cell': {name: '能源元件', block: 'amethyst_block'},
};
