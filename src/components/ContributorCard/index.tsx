import type {ReactNode} from 'react';
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
  const body = (
    <>
      <div className={styles.avatar}>
        {avatar ? (
          <img src={avatar} alt={name} />
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
