// 机器表条目的类型定义

export type MachineDef = {
  /** 中文名（悬停显示） */
  name?: string;
  /** 平面贴图路径（不填则尝试物品库默认路径） */
  texture?: string;
  /** 3D 方块模型 id，填了会渲染成等距图标 */
  block?: string | string[];
  /** 点击跳转的 wiki 链接 */
  link?: string;
  /** 是否显示附魔光效 */
  glint?: boolean;
};
