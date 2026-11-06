import React, {type ReactNode} from 'react';
import {useNavbarMobileSidebar} from '@docusaurus/theme-common/internal';

/**
 * 移动端目录按钮（自定义 navbar item）。
 *
 * 默认的汉堡按钮在最左侧，这里复用它背后的 `useNavbarMobileSidebar()` 状态，
 * 在导航栏右侧再放一个入口。是否显示完全由 JS 判断（shouldRender），
 * 不依赖媒体查询 —— 老浏览器不支持媒体查询 range 语法时也不会漏掉。
 */
export default function NavbarDrawerToggle(): ReactNode {
  // shouldRender = 侧边栏可用 且 当前是移动端窗口（Docusaurus 用 JS 判断，
  // 不依赖媒体查询，老浏览器也不会出错）
  const {shouldRender, shown, toggle} = useNavbarMobileSidebar();
  if (!shouldRender) return null;

  return (
    <button
      type="button"
      className="navbar-drawer-toggle"
      aria-label="打开目录"
      aria-expanded={shown}
      onClick={toggle}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 6h16M4 12h16M4 18h16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
