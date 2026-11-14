import React, {type ReactNode} from 'react';
import styles from './styles.module.css';

type SpoilerProps = {
  /** 需要被遮罩的文字 */
  children: ReactNode;
  /** 以整行块级形式显示（适合一整段文字） */
  block?: boolean;
  /** 自定义遮罩色（覆盖默认主题色） */
  maskColor?: string;
};

/**
 * 遮罩文字（参考 MCMod 的「思索」/俺寻思式剧透块）。
 *
 * 默认显示为一块色块（亮色主题下是黑块，暗色主题下是灰块），
 * 鼠标悬停或键盘聚焦时才露出里面的文字。
 *
 * 用法：
 *   <Spoiler>俺寻思之力！</Spoiler>
 *   <Spoiler block>整段被遮罩的说明文字……</Spoiler>
 */
export default function Spoiler({
  children,
  block,
  maskColor,
}: SpoilerProps): ReactNode {
  const style = maskColor ? ({'--spoiler-block': maskColor} as React.CSSProperties) : undefined;
  return (
    <span
      className={`${styles.spoiler} ${block ? styles.block : ''}`}
      style={style}
      tabIndex={0}
      role="button"
      aria-label="遮罩文字，悬停或聚焦可查看"
    >
      {children}
    </span>
  );
}
