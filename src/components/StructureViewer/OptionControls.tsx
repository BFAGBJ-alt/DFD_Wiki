import React, {type ReactNode} from 'react';
import styles from './styles.module.css';

export type ViewerOption = {
  /** 按钮文字，如「最大」「激活」 */
  label: string;
  /** 追加到结构名后的后缀，如 "-最大"；空字符串表示不加 */
  suffix: string;
  /**
   * 可用条件：其他轴的当前值。
   * 键为轴的 key，值为允许的选项名称（列表轴）或数字（数字轴），
   * 也可以写数组表示多个允许值。不满足时该选项不会显示。
   *
   * 例：{label: '融毁', suffix: '-融毁', availableWhen: {level: ['最大']}}
   */
  availableWhen?: Record<string, string | number | Array<string | number>>;
};

export type ViewerAxis =
  | {
      /** 轴 id，供 order 模板与 availableWhen 引用 */
      key: string;
      /** 控制条上的名称，如「等级」「状态」 */
      label: string;
      /** 列表选择器（默认） */
      type?: 'select';
      options: ViewerOption[];
    }
  | {
      key: string;
      label: string;
      /** 数字选择器：下拉框列出 min..max（按 step） */
      type: 'number';
      min: number;
      max: number;
      step?: number;
      /** 后缀模板，{value} 替换为当前值；默认 "-{value}" */
      suffix?: string;
    };

type SelectProps = {
  title: string;
  options: ViewerOption[];
  value: number;
  onChange: (index: number) => void;
  /** 与 options 等长的可用性标记，false 的项不渲染 */
  available?: boolean[];
  kind?: 'select';
};

type NumberProps = {
  title: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  kind: 'number';
};

/**
 * 结构的多轴切换条（列表选择器 / 数字选择器）。
 * 选项直接对应结构名后缀，由 StructureViewer 拼成最终 JSON 名。
 */
export default function OptionControls(
  props: SelectProps | NumberProps,
): ReactNode {
  if (props.kind === 'number') {
    if (props.max <= props.min) return null;
    const step = props.step && props.step > 0 ? props.step : 1;
    const count = Math.floor((props.max - props.min) / step);
    if (count < 1) return null;
    // 用下标生成，避免 0.1 这类小数步长的浮点累加误差
    const values = Array.from({length: count + 1}, (_, i) =>
      Number((props.min + i * step).toFixed(6)),
    );
    return (
      <div className={styles.layerBar} role="group" aria-label={props.title}>
        <span className={styles.layerValue}>{props.title}</span>
        <select
          className={styles.axisSelect}
          value={props.value}
          aria-label={props.title}
          onChange={(e) => props.onChange(Number(e.target.value))}>
          {values.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (props.options.length <= 1) return null;
  const visible = props.options.some(
    (_, index) => props.available?.[index] !== false,
  );
  if (!visible) return null;

  return (
    <div className={styles.layerBar} role="group" aria-label={props.title}>
      <span className={styles.layerValue}>{props.title}</span>
      {props.options.map((option, index) =>
        props.available?.[index] === false ? null : (
          <button
            key={option.label}
            type="button"
            className={`${styles.panelBtn} ${index === props.value ? styles.panelBtnActive : ''}`}
            aria-pressed={index === props.value}
            onClick={() => props.onChange(index)}>
            {option.label}
          </button>
        ),
      )}
    </div>
  );
}
