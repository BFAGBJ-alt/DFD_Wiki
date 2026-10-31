// 快速生成物品 wiki 样板文件
// 用法:
//   node scripts/new-item.mjs <相对路径> [--item <物品id>] [--block <模型>] [--contributors <名字>]
//
// 相对路径不含 docs/ 前缀和 .mdx 后缀，最后一段就是物品中文名。
// --item  优先：引用 src/data/items.ts 里登记的物品 id，自动解析名称/3D模型/链接
// --block 未登记时用：原版方块 model id，支持逗号分隔多模型
// --contributors 贡献者，逗号分隔，默认 BFAGBJ
//
// 示例:
//   node scripts/new-item.mjs "粘液科技-单方空岛/应用能源/物品/ME驱动器" --item me_drive
//   node scripts/new-item.mjs "粘液科技-单方空岛/应用能源/物品/ME接口" --block dropper

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positionals = [];
const opts = {item: '', block: '', contributors: 'BFAGBJ'};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--item') opts.item = args[++i] ?? '';
  else if (args[i] === '--block') opts.block = args[++i] ?? '';
  else if (args[i] === '--contributors') opts.contributors = args[++i] ?? 'BFAGBJ';
  else positionals.push(args[i]);
}

if (positionals.length === 0) {
  console.error('用法: node scripts/new-item.mjs <相对路径> [--block <模型>] [--contributors <名字>]');
  process.exit(1);
}

const relPath = positionals[0].replace(/\\/g, '/').replace(/\.mdx$/i, '');
const name = relPath.split('/').pop();
const blockModels = opts.block
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const docsDir = path.join(process.cwd(), 'docs');
const outPath = path.join(docsDir, `${relPath}.mdx`);

if (fs.existsSync(outPath)) {
  console.error(`已存在: ${outPath}`);
  process.exit(1);
}

const blockArray = blockModels.length > 0
  ? blockModels.map((b) => `        '${b}',`).join('\n')
  : "        // 在这里填写原版方块 model id，如 'furnace'";

// 3D 模型部分：优先用 --item，否则用 --block
const viewerProps = opts.item
  ? `item="${opts.item}"`
  : `block={[\n${blockArray}\n      ]} label="${name}"`;

const contributors = opts.contributors
  .split(',')
  .map((c) => ` - ${c.trim()}`)
  .join('\n');

const content = `---
sidebar_position: 0
contributors:
${contributors}
---
import StructureViewer from '@site/src/components/StructureViewer';
import RecipeViewer from '@site/src/components/RecipeViewer';
import Columns from '@site/src/components/Columns';

<Columns>

<div>

\`\`\`text
/sf give @s ${opts.item || name}
\`\`\`

### 用途

${name}

### 合成配方

<RecipeViewer recipe={{
  type: 'shaped',
  pattern: [
    'AAA',
    'AAA',
    'AAA',
  ],
  materials: {
    A: {id: '材料id'},
  },
  result: ${opts.item ? `{id: '${opts.item}'}` : `{id: '${name}'}`},
}} />

</div>

<div>

<StructureViewer ${viewerProps} />

</div>

</Columns>
`;

fs.mkdirSync(path.dirname(outPath), {recursive: true});
fs.writeFileSync(outPath, content, 'utf8');
console.log(`已生成: ${path.relative(process.cwd(), outPath)}`);
