import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {ThemeClassNames} from '@docusaurus/theme-common';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import Heading from '@theme/Heading';
import MDXContent from '@theme/MDXContent';
import styles from './styles.module.css';

// 与主题默认实现一致：没有 hide_title 且正文里没有一级标题时，渲染合成标题
function useSyntheticTitle(): string | null {
  const {metadata, frontMatter, contentTitle} = useDoc();
  const shouldRender = !frontMatter.hide_title && typeof contentTitle === 'undefined';
  if (!shouldRender) {
    return null;
  }
  return metadata.title;
}

// 最后更新日期：数据来自 docs 配置的 showLastUpdateTime（git 提交时间）
function LastUpdatedInfo(): ReactNode {
  const {metadata} = useDoc();
  const lastUpdatedAt = metadata.lastUpdatedAt;
  if (!lastUpdatedAt) {
    return null;
  }
  const date = new Date(lastUpdatedAt);
  const formatted = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  return (
    <div className={styles.lastUpdated}>
      最后更新于{' '}
      <time dateTime={date.toISOString()} itemProp="dateModified">
        {formatted}
      </time>
    </div>
  );
}

export default function DocItemContent({children}: {children: ReactNode}): ReactNode {
  const syntheticTitle = useSyntheticTitle();
  return (
    <div className={clsx(ThemeClassNames.docs.docMarkdown, 'markdown')}>
      {syntheticTitle && (
        <header>
          <Heading as="h1">{syntheticTitle}</Heading>
          <LastUpdatedInfo />
        </header>
      )}
      <MDXContent>{children}</MDXContent>
    </div>
  );
}
