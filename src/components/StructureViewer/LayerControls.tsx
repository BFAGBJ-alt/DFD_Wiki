import React, {type ReactNode} from 'react';
import styles from './styles.module.css';

/**
 * 结构分层控制条。
 * - value=null 表示“全部层”
 * - 在全部层时点“上一层/下一层”，先进入中间层（默认单层起点）
 * - 单层时按实际存在的 Y 层逐层切换，不会停到空层
 */
export default function LayerControls({
  layers,
  value,
  onChange,
}: {
  layers: number[];
  value: number | null;
  onChange: (layer: number | null) => void;
}): ReactNode {
  if (layers.length <= 1) return null;
  const index = value == null ? -1 : layers.indexOf(value);
  const middle = Math.floor((layers.length - 1) / 2);
  const canPrev = value != null && index > 0;
  const canNext = value != null && index >= 0 && index < layers.length - 1;

  const prev = () => {
    if (value == null) onChange(layers[middle]);
    else if (canPrev) onChange(layers[index - 1]);
  };
  const next = () => {
    if (value == null) onChange(layers[middle]);
    else if (canNext) onChange(layers[index + 1]);
  };

  return (
    <div className={styles.layerBar} role="group" aria-label="结构分层显示">
      <button
        type="button"
        className={styles.panelBtn}
        onClick={prev}
        disabled={value != null && !canPrev}
        aria-label="上一层">
        上一层
      </button>
      <span className={styles.layerValue} aria-live="polite">
        {value == null ? '全部层' : `Y = ${value}`}
      </span>
      <button
        type="button"
        className={styles.panelBtn}
        onClick={next}
        disabled={value != null && !canNext}
        aria-label="下一层">
        下一层
      </button>
      {value != null && (
        <button
          type="button"
          className={styles.panelBtn}
          onClick={() => onChange(null)}
          aria-label="显示全部层">
          全部层
        </button>
      )}
    </div>
  );
}
