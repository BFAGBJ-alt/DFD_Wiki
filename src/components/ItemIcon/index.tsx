import React, {useState, type ReactNode} from 'react';
import Link from '@docusaurus/Link';
import {resolveItem} from '@site/src/data/items/index';
import BlockDisplay from '../BlockDisplay';
import styles from './styles.module.css';

type ItemIconProps = {
  /** src/data/items 里登记的物品 id */
  id?: string;
  /** id 的别名，与 BlockDisplay 的写法保持一致 */
  item?: string;
  /** 图标边长（px），默认 32 */
  size?: number;
  /** 数量，>1 时右下角显示角标 */
  count?: number;
  /** 覆盖物品库里登记的跳转链接 */
  link?: string;
  /** 额外类名 */
  className?: string;
};

/**
 * 单独展示一个物品图标。
 * - 物品库里有 block 字段 → 等距 3D 立方体图标
 * - 否则 → 平面贴图
 * 物品库里有 link（或传了 link）时整个图标可点击跳转，悬停显示名称。
 *
 * 用法：
 *   <ItemIcon id="me_drive" />
 *   <ItemIcon item="me_charger" count={4} size={48} />
 */
export default function ItemIcon({
  id,
  item: itemId,
  size = 32,
  count,
  link,
  className,
}: ItemIconProps): ReactNode {
  const key = id ?? itemId ?? '';
  const item = resolveItem(key);
  const [failed, setFailed] = useState(false);
  const target = link ?? item.link;

  const content = item.block ? (
    <BlockDisplay
      block={item.block}
      size={Math.round(size * 0.92)}
      name={item.name}
    />
  ) : failed || !item.texture ? (
    <span
      className={styles.placeholder}
      style={{width: size * 0.7, height: size * 0.7}}
    />
  ) : (
    <img
      src={item.texture}
      alt={item.name}
      width={size}
      height={size}
      className={styles.img}
      onError={() => setFailed(true)}
    />
  );

  const body = (
    <span
      className={`${styles.box} ${className ?? ''}`}
      style={{width: size, height: size}}
      title={item.name}>
      {content}
      {item.overlay && !item.block && !failed && (
        <img
          src={item.overlay}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          className={styles.overlay}
        />
      )}
      {item.glint && <span className="mc-glint" />}
      {count != null && count > 1 && <span className={styles.count}>{count}</span>}
    </span>
  );

  if (!target) return body;
  return (
    <Link to={target} className={styles.link}>
      {body}
    </Link>
  );
}
