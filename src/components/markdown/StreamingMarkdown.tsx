import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import Markdown, { RenderRules } from 'react-native-markdown-display';
import { splitStableBlocks } from './streamingSplit';

/**
 * 已成形段落：props 只有字符串 + 两个稳定引用，内容不变时 memo 直接跳过，
 * DOM 保持原样（浏览器无需为它重新断行/重绘）。
 */
const StableMarkdown = memo(function StableMarkdown({
  text,
  style,
  rules,
}: {
  text: string;
  style: any;
  rules: RenderRules;
}) {
  return (
    <Markdown style={style} rules={rules}>
      {text}
    </Markdown>
  );
});

/**
 * 流式正文：已成形段落 memo 化，只有尾巴每帧重新解析。
 *
 * 这样每帧要重排的范围从「整条回答」缩小到「尾巴这一段」。之前整条回答是一个
 * 文本节点，每帧追加几个字浏览器就要对整段重跑断行 + 重绘，长回答下必然掉帧，
 * 时间是"一顿一顿"的，贴底再准也看得出底部在跳。
 *
 * 另外：流式期与结束后共用同一套 markdown 渲染 + 同一套样式，
 * 「吐字完成」那一刻不再切换渲染器、行高也不再从 22 变 24 → 气泡高度不跳。
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
  style,
  rules,
}: {
  content: string;
  style: any;
  rules: RenderRules;
}) {
  const { blocks, tail } = useMemo(() => splitStableBlocks(content), [content]);

  return (
    <View>
      {blocks.map((block, i) => (
        <StableMarkdown
          key={`md-${i}`}
          text={block}
          style={style}
          rules={rules}
        />
      ))}
      {tail ? (
        // key 用 md-${blocks.length}：尾巴将来变成稳定块时 key 不变，
        // React 复用同一个实例，不会卸载重建。
        <StableMarkdown
          key={`md-${blocks.length}`}
          text={tail}
          style={style}
          rules={rules}
        />
      ) : null}
    </View>
  );
});
