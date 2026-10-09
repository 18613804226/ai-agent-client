import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Markdown, { RenderRules } from 'react-native-markdown-display';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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

/** 月相序列：一轮「新→满→新」，视觉上是月球自转、暗面逐片扫过 */
const PHASES = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];

/**
 * 内联在正文末尾的「月球自转」提示。
 * 用月相 emoji 字形轮换，纯文本内联 → 贴着最后一个字、随文字换行，安卓也不用 transform。
 * 为消除「硬切帧」的僵硬感：
 *  - 每次换相做一个缓出淡入（不闪烁着跳变）；
 *  - 叠加一个持续的轻微呼吸（亮度缓缓起伏），元素始终有生命感。
 * 安卓内联 span 只支持 opacity，故用透明度做过渡（transform 会被忽略）。
 */
const InlineMoonPhase = memo(function InlineMoonPhase() {
  const [i, setI] = useState(0);
  const enter = useSharedValue(0);
  const breath = useSharedValue(0);

  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % PHASES.length), 220);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    enter.value = 0;
    enter.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [enter, i]);

  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [breath]);

  const istyle = useAnimatedStyle(() => ({
    opacity: (0.2 + 0.8 * enter.value) * (0.85 + 0.15 * breath.value),
  }));

  return (
    <Animated.Text style={[styles.inlineMoon, istyle]}>
      {PHASES[i]}
    </Animated.Text>
  );
});

/**
 * 还在增长的最后一行：纯文本渲染（不做 markdown 解析）。
 * 文字尾部分月相 emoji 自转提示，跟随最后一个字。
 *
 * 之前尾巴每帧都走 markdown：
 * - 半截 token（**bo、1. 列表、|表格）会被解析成不同的节点结构，行内/换行不断变化；
 * - 段落规则对 index>0 的段落前面插 '\n'，结构一变整体就上下平移。
 * 这些都会让已显示的字在吐快时「重排跳动」。
 *
 * 这里把它改成纯文本：只有换行会自然断行，markdown 结构在「该行成长为稳定块」
 * 的那一帧才生效（由上面的 StableMarkdown 负责），所以吐字过程平滑，格式化
 * 只晚一个段落出现。
 */
const TailText = memo(function TailText({
  text,
  selectable,
  color,
}: {
  text: string;
  selectable: boolean;
  color: string;
}) {
  return (
    <Text selectable={selectable} style={[styles.tail, { color }]}>
      {text}
      <InlineMoonPhase />
    </Text>
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
  selectable = true,
}: {
  content: string;
  style: any;
  rules: RenderRules;
  selectable?: boolean;
}) {
  const { blocks, tail } = useMemo(() => splitStableBlocks(content), [content]);
  const color = style.body?.color ?? '#000';

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
      <TailText text={tail} selectable={selectable} color={color} />
    </View>
  );
});

const styles = StyleSheet.create({
  tail: {
    fontSize: 15,
    lineHeight: 24,
  },
  inlineMoon: {
    fontSize: 12,
    lineHeight: 24,
    marginLeft: 2,
  },
});