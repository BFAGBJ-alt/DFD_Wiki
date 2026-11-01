import React, {type ReactNode} from 'react';
import {items, resolveItem} from '@site/src/data/items';
import {machines} from '@site/src/data/machines';
import type {ItemStack, Recipe, ResolvedStack} from './types';
import Slot from './Slot';
import styles from './styles.module.css';

function blockTextureOf(block?: string | string[]): string | null {
  if (!block) return null;
  const first = Array.isArray(block) ? block[0] : block.split(',')[0];
  const id = first?.trim();
  return id ? `/img/Minecraft/block/${id}.png` : null;
}

/**
 * 兼容手写的贴图路径：反斜杠、缺前导斜杠、误粘的绝对路径（只要位于 static 下）
 * 例：`F:\proj\static\img\x.png` -> `/img/x.png`
 */
function normalizeTexture(path: string): string {
  let p = path.trim().replace(/\\/g, '/');
  const marker = '/static/';
  const idx = p.indexOf(marker);
  if (idx >= 0) {
    p = p.slice(idx + marker.length - 1);
  }
  if (!p.startsWith('/')) p = `/${p}`;
  return p;
}

function resolveStack(s: ItemStack | undefined): ResolvedStack | undefined {
  if (!s) return undefined;
  const base = s.id ? resolveItem(s.id) : {name: s.name ?? '', texture: s.texture ?? null};
  const rawTexture = s.texture ?? base.texture ?? null;
  const texture = rawTexture ? normalizeTexture(rawTexture) : null;
  const fallback = blockTextureOf(base.block);
  return {
    ...base,
    name: s.name ?? base.name,
    texture,
    // 主贴图与回退相同就不必重试
    fallbackTexture: fallback && fallback !== texture ? fallback : null,
    count: s.count,
  };
}

/** 机器：字符串时依次查 machines 表、物品库，最后当作方块模型 id */
function resolveMachine(m: ItemStack | string | undefined): ResolvedStack | undefined {
  if (!m) return undefined;
  if (typeof m !== 'string') return resolveStack(m);
  const def = machines[m];
  if (def) {
    const texture = def.texture ? normalizeTexture(def.texture) : null;
    const fallback = blockTextureOf(def.block);
    return {
      name: def.name ?? m,
      texture,
      block: def.block,
      link: def.link,
      glint: def.glint,
      fallbackTexture: fallback && fallback !== texture ? fallback : null,
    };
  }
  if (items[m]) return resolveStack({id: m});
  // 都没登记：当成原版方块模型 id（如 furnace、crafting_table），直接渲 3D 图标
  return {name: m, texture: null, block: m, fallbackTexture: null};
}

function ShapedGrid({
  recipe,
}: {
  recipe: Extract<Recipe, {type: 'shaped'}>;
}): ReactNode {
  const rows = recipe.pattern.slice(0, 3);
  while (rows.length < 3) rows.push('   ');
  return (
    <div className={styles.grid3x3}>
      {rows.flatMap((row, r) =>
        row.padEnd(3).slice(0, 3).split('').map((ch, c) => (
          <Slot
            key={`${r}-${c}`}
            item={ch === ' ' ? undefined : resolveStack(recipe.materials[ch])}
          />
        )),
      )}
    </div>
  );
}

function ShapelessGrid({
  recipe,
}: {
  recipe: Extract<Recipe, {type: 'shapeless'}>;
}): ReactNode {
  const slots = [...recipe.ingredients];
  while (slots.length < 9) slots.push(undefined);
  return (
    <div className={styles.grid3x3}>
      {slots.map((s, i) => (
        <Slot key={i} item={resolveStack(s)} />
      ))}
    </div>
  );
}

function Furnace({recipe}: {recipe: Extract<Recipe, {type: 'furnace'}>}): ReactNode {
  return (
    <div className={styles.furnace}>
      <Slot item={resolveStack(recipe.input)} />
      <div className={styles.furnaceArrow}>↓</div>
      <Slot item={resolveStack(recipe.result)} />
    </div>
  );
}

function formatMeta(value: string | number, unit: string): string {
  return typeof value === 'number' ? `${value}${unit}` : value;
}

export default function RecipeViewer({recipe}: {recipe: Recipe}): ReactNode {
  let grid: ReactNode;
  switch (recipe.type) {
    case 'shaped':
      grid = <ShapedGrid recipe={recipe} />;
      break;
    case 'shapeless':
      grid = <ShapelessGrid recipe={recipe} />;
      break;
    case 'furnace':
      grid = <Furnace recipe={recipe} />;
      break;
  }
  const hasMeta = recipe.time != null || recipe.energy != null;
  return (
    <div className={styles.recipe}>
      {recipe.machine && (
        <div className={styles.machine}>
          <Slot item={resolveMachine(recipe.machine)} />
        </div>
      )}
      {grid}
      <div className={styles.arrow}>→</div>
      <div className={styles.result}>
        <Slot item={resolveStack(recipe.result)} />
        {hasMeta && (
          <div className={styles.meta}>
            {recipe.time != null && (
              <div>耗时 {formatMeta(recipe.time, 's')}</div>
            )}
            {recipe.energy != null && (
              <div>耗电 {formatMeta(recipe.energy, 'J')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
