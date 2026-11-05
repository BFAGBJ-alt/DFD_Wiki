import type {ReactNode} from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

type ContributorCardProps = {
  name: string;
  avatar?: string;
  description?: ReactNode;
  href?: string;
};

export default function ContributorCard({
  name,
  avatar,
  description,
  href,
}: ContributorCardProps): ReactNode {
  // 头像路径是 '/img/contributors/xxx'，子路径部署（baseUrl=/wiki_page/）要补前缀
  const avatarUrl = useBaseUrl(avatar ?? '');
  const body = (
    <>
      <div className={styles.avatar}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} />
        ) : (
          name.trim().charAt(0).toUpperCase()
        )}
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{name}</div>
        {description && <div className={styles.description}>{description}</div>}
      </div>
    </>
  );

  if (href) {
    return (
      <a
        className={styles.card}
        href={href}
        target="_blank"
        rel="noreferrer noopener">
        {body}
      </a>
    );
  }

  return <div className={styles.card}>{body}</div>;
}
