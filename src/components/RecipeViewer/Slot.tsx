import React, {useEffect, useState, type ReactNode} from 'react';
import Link from '@docusaurus/Link';
import type {ResolvedStack} from './types';
import BlockDisplay from '../BlockDisplay';
import styles from './styles.module.css';

export default function Slot({item}: {item?: ResolvedStack}): ReactNode {
  // 0 = 主贴图，1 = 方块贴图回退，2 = 完全无图
  const [stage, setStage] = useState(0);

  useEffect(() => {
    setStage(0);
  }, [item?.texture, item?.fallbackTexture]);

  if (!item) {
    return <div className={styles.slot} aria-hidden="true" />;
  }

  const primary = item.texture;
  const fallback = item.fallbackTexture;
  const src = stage === 0 ? primary : stage === 1 ? fallback : null;

  const inner = (
    <>
      {item.block ? (
        // 方块：固定角度的等距 3D 渲染（不可旋转）
        <BlockDisplay block={item.block} size={30} name={item.name} />
      ) : item.skull ? (
        // 头颅：等距 3D 渲染皮肤头部
        <BlockDisplay skull={item.skull} size={30} name={item.name} />
      ) : src ? (
        <img
          src={src}
          alt={item.name ?? ''}
          className={styles.icon}
          onError={() => setStage((s) => s + 1)}
        />
      ) : (
        <div className={styles.placeholder} />
      )}
      {item.overlay && stage === 0 && !item.block && (
        <img
          src={item.overlay}
          alt=""
          aria-hidden="true"
          className={styles.overlay}
        />
      )}
      {item.glint && <span className="mc-glint" />}
      {item.count && item.count > 1 && (
        <span className={styles.count}>{item.count}</span>
      )}
    </>
  );

  // 登记了 link 的物品可点击跳转到对应 wiki 条目
  if (item.link) {
    return (
      <Link
        to={item.link}
        className={`${styles.slot} ${styles.slotLink}`}
        title={item.name}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={styles.slot} title={item.name}>
      {inner}
    </div>
  );
}
