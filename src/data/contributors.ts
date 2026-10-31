export type ContributorProfile = {
  avatar?: string;
  description?: string;
  href?: string;
};

// 全局贡献者资料表：name -> 资料
// 头像放在 static/img/contributors/ 下
export const contributors: Record<string, ContributorProfile> = {
  'BFAGBJ': {
    avatar: '/img/contributors/BFAGBJ.png',
    description: '本wiki的创建者\n编写了游戏中基础的帮助文档\n但大部分时间在学校内QAQ',
    href: 'https://github.com/BFAGBJ-alt',
  },
  'Deepseek v4.1 flash': {
    avatar: '/img/contributors/deepseek.jpg',
    description: '啥子鱼\n被熊猫压榨，编写游戏内的帮助。\n游戏内你肯定是没法找她求助了(',
    href: 'https://www.deepseek.com/',
  },
  'msaw4 - 熊猫': {
    avatar: '/img/contributors/masw.jpg',
    description: '缘落之梦的管理\n提供了金币相关内容',
  },
  'gzs1596eg': {
    avatar: '/img/contributors/gzs1596eg.jpg',
    description: '粘液老玩家\n提供了SlimeAE部分问题的解决方案',
  },
  '缘落之梦百科': {
    avatar: '/img/contributors/ylzm.png',
    description: '官方百科',
    href: 'https://main.guisurvive.top/#wiki/',
  },
};
