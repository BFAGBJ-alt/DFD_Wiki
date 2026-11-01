import type {ItemDef, ResolvedItem} from './types';
import {items as auto_crafting} from './auto_crafting';
import {items as buses} from './buses';
import {items as cables} from './cables';
import {items as cards} from './cards';
import {items as machines} from './machines';
import {items as materials} from './materials';
import {items as network} from './network';
import {items as storage} from './storage';
import {items as terminals} from './terminals';
import {items as tools} from './tools';
import {items as vanilla} from './vanilla';

export type {ItemDef, ResolvedItem};

// 各分类合并后的物品库
export const items: Record<string, ItemDef> = {
  ...auto_crafting,
  ...buses,
  ...cables,
  ...cards,
  ...machines,
  ...materials,
  ...network,
  ...storage,
  ...terminals,
  ...tools,
  ...vanilla,
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
    overlay: def.overlay,
  };
}
