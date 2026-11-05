import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {ThemeClassNames} from '@docusaurus/theme-common';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';
import TOC from '@theme/TOC';
import Link from '@docusaurus/Link';
import {contributors as contributorProfiles} from '@site/src/data/contributors/index';
import styles from './styles.module.css';

type ContributorRef = string | {name?: string};

export default function DocItemTOCDesktop(): ReactNode {
  const {toc, frontMatter} = useDoc();
  // 头像路径是 '/img/contributors/xxx'，子路径部署（baseUrl=/wiki_page/）要补前缀
  const {withBaseUrl} = useBaseUrlUtils();
  const contributorRefs = frontMatter.contributors as
    | ContributorRef[]
    | undefined;

  return (
    // 外层 sticky 容器：跟随页面滚动，与官方 TOC 行为一致
    <div
      className={clsx(
        styles.stickyContainer,
        'thin-scrollbar',
        ThemeClassNames.docs.docTocDesktop,
      )}>
      {toc.length > 0 && (
        <TOC
          toc={toc}
          minHeadingLevel={frontMatter.toc_min_heading_level}
          maxHeadingLevel={frontMatter.toc_max_heading_level}
          className={styles.tocReset}
        />
      )}
      {Array.isArray(contributorRefs) && contributorRefs.length > 0 && (
        <div className={styles.contributors}>
          <div className={styles.title}>此条目贡献者</div>
          <ul className={styles.list}>
            {contributorRefs.map((c) => {
              const name = typeof c === 'string' ? c : c.name;
              if (!name) return null;
              const profile = contributorProfiles[name];
              return (
                <li key={name}>
                  <Link to="/docs/贡献者名单" className={styles.item}>
                    <span className={styles.avatar}>
                      {profile?.avatar ? (
                        <img src={withBaseUrl(profile.avatar)} alt={name} />
                      ) : (
                        name.trim().charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className={styles.name}>{name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
