import React, {type ReactNode} from 'react';
import {useNavbarMobileSidebar} from '@docusaurus/theme-common/internal';

/**
 * 移动端目录按钮（自定义 navbar item）。
 *
 * 默认的汉堡按钮在最左侧，这里复用它背后的 `useNavbarMobileSidebar()` 状态，
 * 在导航栏右侧再放一个入口；样式由 custom.css 的 `.navbar-drawer-toggle` 控制，
 * 只在窄屏（≤996px）显示。
 */
export default function NavbarDrawerToggle(): ReactNode {
  const {disabled, shown, toggle} = useNavbarMobileSidebar();
  if (disabled) return null;

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
