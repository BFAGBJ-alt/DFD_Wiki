import React, {type ReactNode} from 'react';
import styles from './styles.module.css';

type ColumnsProps = {
  /** 左栏宽度百分比（默认 45），右栏自动占剩余空间 */
  left?: number;
  /** 栏间距（px，默认 20） */
  gap?: number;
  /** 窄屏是否保持并排（默认 false，窄屏上下堆叠） */
  keepRowOnMobile?: boolean;
  children: ReactNode;
};

/**
 * 快速左右分栏。第一个子元素放左栏，第二个放右栏。
 *
 * 用法（子元素之间要留空行，里面的 Markdown 才会被解析）：
 * <Columns>
 * <div>
 *
 * 左边的内容
 *
 * </div>
 * <div>
 *
 * <StructureViewer item="me_drive" />
 *
 * </div>
 * </Columns>
 */
export default function Columns({
  left = 45,
  gap = 20,
  keepRowOnMobile = false,
  children,
}: ColumnsProps): ReactNode {
  const [first, second] = React.Children.toArray(children);
  return (
    <div
      className={keepRowOnMobile ? `${styles.row} ${styles.rowNowrap}` : styles.row}
      style={{gap}}>
      <div className={styles.left} style={{flexBasis: `${left}%`}}>
        {first}
      </div>
      <div className={styles.right}>{second}</div>
    </div>
  );
}
