import React, {type ReactNode} from 'react';
import styles from './styles.module.css';

type TermProps = {
  /** 悬停时浮现的提示内容 */
  tip: string;
  children: ReactNode;
};

/**
 * 悬停提示术语：鼠标放上去浮现解释气泡。
 * 用法：<Term tip="解释文字">正文里的词</Term>
 */
export default function Term({tip, children}: TermProps): ReactNode {
  return (
    <span className={styles.term}>
      {children}
      <span className={styles.tooltip} role="tooltip">
        {tip}
      </span>
    </span>
  );
}
