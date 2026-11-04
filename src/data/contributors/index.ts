import type {ContributorProfile} from './types';

export type {ContributorProfile};

// 自动合并目录下所有贡献者文件（每个文件导出 const contributors），
// 新增贡献者文件无需修改这里；index/types 自身除外。
declare const require: {
  context(
    dir: string,
    subdirs: boolean,
    filter: RegExp,
  ): {
    keys(): string[];
    (id: string): {contributors?: Record<string, ContributorProfile>};
  };
};

const context = require.context('./', false, /\.ts$/);

export const contributors: Record<string, ContributorProfile> = {};
for (const key of context.keys()) {
  if (key === './index.ts' || key === './types.ts') continue;
  const mod = context(key);
  if (mod.contributors) Object.assign(contributors, mod.contributors);
}
