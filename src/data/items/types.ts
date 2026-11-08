// 物品库的类型定义
import type {
  BlockAxis,
  BlockFacing,
} from '@site/src/components/StructureViewer/modelResolver';

export type ItemDef = {
  /** 中文名 */
  name?: string;
  /** 贴图路径（不含 baseUrl），不填则默认 /img/Minecraft/item/<id>.png */
  texture?: string;
  /** 3D 方块模型 id（StructureViewer 单方块模式用），对应 block/ model */
  block?: string | string[];
  /** 方块朝向（对应原版 facing，如 end_rod 朝东；默认水平块为 north、竖直块为 up） */
  facing?: BlockFacing;
  /** 方块轴向（对应原版 axis，如原木横放 axis=x；默认 y） */
  axis?: BlockAxis;
  /** 颜色回退（无 block 且无贴图时显示） */
  color?: string;
  /** wiki 链接，标记后方块可点击跳转 */
  link?: string;
  /** 是否显示附魔光效（游戏内带光效的机器/物品） */
  glint?: boolean;
  /** 叠加在贴图上层的贴图（如带特殊数据的烟火之星） */
  overlay?: string;
  /** 自定义头颅贴图 URL（https://textures.minecraft.net/texture/<hash>） */
  skull?: string;
};

export type ResolvedItem = {
  name: string;
  texture: string | null;
  block?: string | string[];
  facing?: BlockFacing;
  axis?: BlockAxis;
  color?: string;
  link?: string;
  glint?: boolean;
  overlay?: string;
  skull?: string;
};
