本网站使用 [Docusaurus](https://docusaurus.io/) 构建。

## 仓库说明

- **本站源码与内容**放在本仓库：[DFD_Wiki](https://github.com/BFAGBJ-alt/DFD_Wiki)
- 构建产物会发布到 [wiki_page](https://github.com/BFAGBJ-alt/wiki_page) 并通过 GitHub Pages 提供访问：https://bfagbj-alt.github.io/wiki_page/
- 内容问题、功能建议、内容投稿请在本仓库提交 Issue / Pull Request

## 本地开发

```bash
npm install
npm start        # 开发服务器 http://localhost:3000
npm run build    # 构建 + 剔除未使用材质 + 生成 atlas（产物在系统临时目录）
npm run preview  # 本地预览构建产物 http://localhost:3001
npm run deploy   # 构建并发布到 GitHub Pages 仓库
```

## 许可协议

| 范围 | 协议 |
|---|---|
| 站点内容（文档、图片、数据） | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)（见 `LICENSE-CONTENT`） |
| 站点代码（组件、脚本等） | [AGPL-3.0](LICENSE)（见 `LICENSE`） |

Minecraft 及其相关材质、模型、商标版权归 Mojang Studios / Microsoft 所有。
本项目是非官方粉丝 Wiki，与 Mojang Studios / Microsoft 及任何服务器官方无关。
