export type BlockDef = {
  /**
   * 原版方块 model id（如 "furnace"、"glass"）。
   * 支持多模型组合（后面的模型叠加到前面之上）：
   *   数组 ["chiseled_bookshelf", "chiseled_bookshelf_empty_slot_top_left", ...]
   *   或逗号分隔字符串 "chiseled_bookshelf,chiseled_bookshelf_empty_slot_top_left,..."
   */
  block?: string | string[];
  /** 引用物品数据库的 id，展开为 block/label/link/color（内联字段优先） */
  item?: string;
  /** 无 block 时的纯色回退（hex，如 "#9b59b6"） */
  color?: string;
  /** 名称：桌面端悬停显示，移动端常驻名单显示 */
  label?: string;
  /** 可选。标记后方块可点击，跳转到对应 wiki 条目 */
  link?: string;
};

export type StructureBlock = BlockDef & {
  x: number;
  y: number;
  z: number;
  /** 引用 palette 中预设 id；方块内联字段优先于预设 */
  type?: string;
};

export type Structure = {
  name: string;
  /** 方块预设表：type -> 材质/名称/链接，减少重复书写 */
  palette?: Record<string, BlockDef>;
  blocks: StructureBlock[];
};

/** 把 palette 预设 + item 数据库引用合并进每个方块（内联字段优先） */
export function resolveStructure(
  s: Structure,
  resolveItemFn: (id: string) => {
    name?: string;
    block?: string | string[];
    color?: string;
    link?: string;
  } = () => ({}),
): Structure {
  const applyItem = (b: BlockDef): BlockDef => {
    if (!b.item) return b;
    const db = resolveItemFn(b.item);
    return {
      block: db.block,
      color: db.color,
      label: db.name,
      link: db.link,
      ...b,
    };
  };
  const palette = s.palette
    ? Object.fromEntries(
        Object.entries(s.palette).map(([k, v]) => [k, applyItem(v)]),
      )
    : undefined;
  return {
    ...s,
    palette,
    blocks: s.blocks.map((b) => {
      const withPalette = b.type && palette ? {...palette[b.type], ...b} : b;
      return applyItem(withPalette);
    }),
  };
}
