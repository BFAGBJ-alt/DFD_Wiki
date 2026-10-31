import React, {type ReactNode} from 'react';
import Footer from '@theme-original/DocItem/Footer';
import type FooterType from '@theme/DocItem/Footer';
import type {WrapperProps} from '@docusaurus/types';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

type Props = WrapperProps<typeof FooterType>;

type ContributorRef = string | {name?: string};

export default function FooterWrapper(props: Props): ReactNode {
  const {frontMatter} = useDoc();
  const contributors = frontMatter.contributors as ContributorRef[] | undefined;

  if (!Array.isArray(contributors) || contributors.length === 0) {
    return <Footer {...props} />;
  }

  return (
    <>
      <div className={styles.contributors}>
        此条目贡献者：
        {contributors.map((c, i) => {
          const name = typeof c === 'string' ? c : c.name;
          if (!name) return null;
          return (
            <span key={name}>
              {i > 0 && '、'}
              <Link to="/docs/贡献者名单">{name}</Link>
            </span>
          );
        })}
      </div>
      <Footer {...props} />
    </>
  );
}
