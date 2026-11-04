import type {MachineDef} from './types';

export type {MachineDef};

// 自动合并目录下所有机器文件（每个文件导出 const machines），
// 新增机器文件无需修改这里；index/types 自身除外。
declare const require: {
  context(
    dir: string,
    subdirs: boolean,
    filter: RegExp,
  ): {
    keys(): string[];
    (id: string): {machines?: Record<string, MachineDef>};
  };
};

const context = require.context('./', false, /\.ts$/);

export const machines: Record<string, MachineDef> = {};
for (const key of context.keys()) {
  if (key === './index.ts' || key === './types.ts') continue;
  const mod = context(key);
  if (mod.machines) Object.assign(machines, mod.machines);
}
