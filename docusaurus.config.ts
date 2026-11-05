import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: '缘落之梦 wiki',
  tagline: '缘落之梦的知识库',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
    // 开发模式也读取真实 git 时间（默认 dev 下使用模拟值）
    experimental_vcs: 'git-ad-hoc',
    // rspack 在本机 Windows 环境下 dev 会 panic、build 会卡死在
    // "Creating an optimized production build"，回退到 webpack
    faster: {
      rspackBundler: false,
      rspackPersistentCache: false,
    },
  },

  // Set the production url of your site here
  // 可用环境变量覆盖（GitHub Pages 项目页：baseUrl=/wiki_page/）
  url: process.env.DFD_SITE_URL ?? 'https://your-docusaurus-site.example.com',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: process.env.DFD_BASE_URL ?? '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'BFAGBJ-alt', // Usually your GitHub org/user name.
  projectName: 'wiki_page', // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/BFAGBJ-alt/DFD_Wiki/blob/main/',
          // 页脚显示「最后于 xxx 更新」，日期取自 git 提交记录
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: '缘落之梦 wiki',
      logo: {
        alt: '缘落之梦 wiki Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: '文档',
        },
        {
          href: 'https://github.com/BFAGBJ-alt/DFD_Wiki/',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '文档',
          items: [
            {
              label: '文档',
              to: '/docs/主页',
            },
          ],
        },
        {
          title: '社区',
          items: [
            {
              label: 'QQ',
              href: 'https://qm.qq.com/q/TJKiDhEQIo',
            },
          ],
        },
        {
          title: '更多',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/BFAGBJ-alt/DFD_Wiki/',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} 缘落之梦 wiki · 基于 Docusaurus 构建`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
