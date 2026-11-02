import type {ItemDef, ResolvedItem} from './types';

export type {ItemDef, ResolvedItem};

// 自动合并目录下所有分类文件（每个文件导出 const items），
// 新增分类文件无需修改这里；index/types 自身除外。
declare const require: {
  context(
    dir: string,
    subdirs: boolean,
    filter: RegExp,
  ): {
    keys(): string[];
    (id: string): {items?: Record<string, ItemDef>};
  };
};

const context = require.context('./', false, /\.ts$/);

export const items: Record<string, ItemDef> = {};
for (const key of context.keys()) {
  if (key === './index.ts' || key === './types.ts') continue;
  const mod = context(key);
  if (mod.items) Object.assign(items, mod.items);
}

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
