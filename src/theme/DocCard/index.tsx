import React, {type ReactNode} from 'react';
import {
  useDocById,
  findFirstSidebarItemLink,
} from '@docusaurus/plugin-content-docs/client';
import {useDocCardDescriptionCategoryItemsPlural} from '@docusaurus/theme-common/internal';
import isInternalUrl from '@docusaurus/isInternalUrl';
import Layout from '@theme/DocCard/Layout';

import type {Props} from '@theme/DocCard';
import type {
  PropSidebarItemCategory,
  PropSidebarItemLink,
} from '@docusaurus/plugin-content-docs';

/**
 * 提取侧栏标题开头的 emoji。
 *
 * 官方实现用的是 `/^\p{RGI_Emoji}$/v`（v 标志 + RGI_Emoji）；
 * 该写法在 Safari < 16.4 以及部分旧 Chromium 内核（如夸克）中会直接抛
 * "Invalid flags supplied to RegExp constructor"，导致分类页整页崩溃、
 * 移动端侧边栏按钮也失效。这里换成兼容性更好的 u 标志，并在运行时兜底。
 */
function extractLeadingEmojiSafe(input: string): {
  emoji: string | null;
  rest: string;
} {
  try {
    const Segmenter = (Intl as unknown as {Segmenter?: new (...a: unknown[]) => unknown})
      .Segmenter;
    if (!Segmenter) {
      return {emoji: null, rest: input};
    }
    const segmenter = new Segmenter(undefined, {granularity: 'grapheme'}) as {
      segment: (s: string) => Iterable<{segment: string}>;
    };
    const grapheme = segmenter.segment(input)[Symbol.iterator]().next().value
      ?.segment;
    if (!grapheme) {
      return {emoji: null, rest: input};
    }
    const isEmoji = new RegExp('^\\p{Extended_Pictographic}$', 'u').test(grapheme);
    if (!isEmoji) {
      return {emoji: null, rest: input};
    }
    return {emoji: grapheme, rest: input.slice(grapheme.length)};
  } catch {
    // 老浏览器不认识 Segmenter 或 \p{...}：退回“不识别 emoji”，不影响页面
    return {emoji: null, rest: input};
  }
}

function getFallbackEmojiIcon(
  item: PropSidebarItemLink | PropSidebarItemCategory,
): string {
  if (item.type === 'category') {
    return '🗃';
  }
  return isInternalUrl(item.href) ? '📄️' : '🔗';
}

function getIconTitleProps(
  item: PropSidebarItemLink | PropSidebarItemCategory,
): {icon: ReactNode; title: string} {
  const extracted = extractLeadingEmojiSafe(item.label);
  const emoji = extracted.emoji ?? getFallbackEmojiIcon(item);
  return {
    icon: emoji,
    title: extracted.rest.trim(),
  };
}

function CardCategory({item}: {item: PropSidebarItemCategory}): ReactNode {
  const href = findFirstSidebarItemLink(item);
  const categoryItemsPlural = useDocCardDescriptionCategoryItemsPlural();

  if (!href) {
    return null;
  }
  return (
    <Layout
      item={item}
      className={item.className}
      href={href}
      description={item.description ?? categoryItemsPlural(item.items.length)}
      {...getIconTitleProps(item)}
    />
  );
}

function CardLink({item}: {item: PropSidebarItemLink}): ReactNode {
  const doc = useDocById(item.docId ?? undefined);
  return (
    <Layout
      item={item}
      className={item.className}
      href={item.href}
      description={item.description ?? doc?.description}
      {...getIconTitleProps(item)}
    />
  );
}

export default function DocCard({item}: Props): ReactNode {
  switch (item.type) {
    case 'link':
      return <CardLink item={item} />;
    case 'category':
      return <CardCategory item={item} />;
    default:
      throw new Error(`unknown item type ${JSON.stringify(item)}`);
  }
}
