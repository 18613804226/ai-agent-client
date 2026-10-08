import React from 'react';
import { Text, View, TouchableOpacity, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  renderRules,
  RenderRules,
  hasParents,
} from 'react-native-markdown-display';
import { IconCopy } from '../Icons';
import { MyToast } from '../GlobalToast';

// ===================== Markdown 渲染规则 =====================
// react-native-markdown-display 默认把 block 元素渲染为 View，且不透传 selectable，
// 导致「同一个气泡内跨段落」无法连续选择。这里把所有 block 元素也改渲染为 Text，
// 让整个气泡合并成一棵可选中的文本树：H5 与 App 都能长按拖动，跨段落选词/句/段后复制。
// （PC 端鼠标本就能跨段落选择，不受影响。）
// selectable=false 时（例如抽屉打开，防止误触）关闭选择，顺带清掉已有的蓝色选择框。
// 等宽字体：项目未内置 JetBrains Mono，直接用各端系统等宽字体，避免代码块回退成普通字体
export const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

// 复制代码到剪贴板并提示
const copyCodeToClipboard = async (code: string) => {
  await Clipboard.setStringAsync(code);
  MyToast.show('已复制');
};

export const createMarkdownRules = (selectable: boolean): RenderRules => ({
  ...renderRules,
  // 根容器：把「连续的文本块」合并进同一个可选文本树（原生保证跨段选择）；
  // 代码块单独抽成 View 盒子 —— 原生 Text 内不能嵌 View，抽出来后代码块才有
  // web 同款的圆角/内边距/背景块样式（见 codeBox / codeText）。
  body: (node, children, _parent, styles) => {
    const isCode = (t: string) => t === 'fence' || t === 'code_block';
    const blocks: React.ReactNode[] = [];
    let run: React.ReactNode[] = [];
    let runKey = 0;
    (node.children || []).forEach((child: any, i: number) => {
      if (isCode(child.type)) {
        if (run.length) {
          blocks.push(
            <Text
              key={`run-${runKey++}`}
              selectable={selectable}
              style={styles.body}
            >
              {run}
            </Text>,
          );
          run = [];
        }
        blocks.push(children[i]);
      } else {
        run.push(children[i]);
      }
    });
    if (run.length) {
      blocks.push(
        <Text
          key={`run-${runKey++}`}
          selectable={selectable}
          style={styles.body}
        >
          {run}
        </Text>,
      );
    }
    return <View key={node.key}>{blocks}</View>;
  },
  // 段落：非首块才在前面补换行（不在末尾补，避免气泡底部多出一行空白）
  paragraph: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.paragraph}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading1: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading1}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading2: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading2}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading3: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading3}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading4: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading4}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading5: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading5}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading6: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading6}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  // 引用块
  blockquote: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.blockquote}>
      {/* {node.index > 0 ? '\n' : null} */}
      {/* {'\n'} */}
      {children}
    </Text>
  ),
  // 列表：非首块才在前面补换行；符号与内容放进同一个可选文本
  bullet_list: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.bullet_list}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  ordered_list: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.ordered_list}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  list_item: (node, children, parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.list_item}>
      {node.index > 0 ? '\n' : null}
      {hasParents(parent, 'bullet_list') ? '• ' : `${node.index + 1}. `}
      {children}
    </Text>
  ),
  // 水平线：用文本代替（View 无法进入可选文本树）
  hr: (node, _children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.hr}>
      {'\n'}――――――――――――――――――――{'\n'}
    </Text>
  ),
  // 表格：转为文本
  table: (node, children, _parent, _styles) => (
    <Text key={node.key} selectable={selectable}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  thead: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.thead}>
      {children}
      {'\n'}
    </Text>
  ),
  tbody: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.tbody}>
      {children}
    </Text>
  ),
  th: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.th}>
      {children}
      {'  '}
    </Text>
  ),
  tr: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.tr}>
      {children}
      {'\n'}
    </Text>
  ),
  td: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.td}>
      {children}
      {'  '}
    </Text>
  ),
  // 图片：转为占位文本（FitImage 是 View，无法进入可选文本树）
  image: (node, _children, _parent, _styles, allowedHandlers) => {
    const src = node.attributes?.src;
    if (
      src &&
      Array.isArray(allowedHandlers) &&
      allowedHandlers.some((h: string) => src.toLowerCase().startsWith(h))
    ) {
      return (
        <Text key={node.key} selectable={selectable}>
          {`[图片] ${src}`}
        </Text>
      );
    }
    return null;
  },
  // ---- 行内文本（保持可选中） ----
  textgroup: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.textgroup}>
      {children}
    </Text>
  ),
  inline: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.inline}>
      {children}
    </Text>
  ),
  text: (node, _children, _parent, styles, inheritedStyles = {}) => (
    <Text
      key={node.key}
      selectable={selectable}
      style={[inheritedStyles, styles.text]}
    >
      {node.content}
    </Text>
  ),
  strong: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.strong}>
      {children}
    </Text>
  ),
  em: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.em}>
      {children}
    </Text>
  ),
  s: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.s}>
      {children}
    </Text>
  ),
  span: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.span}>
      {children}
    </Text>
  ),
  hardbreak: (node, _children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.hardbreak}>
      {'\n'}
    </Text>
  ),
  softbreak: (node, _children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.softbreak}>
      {'\n'}
    </Text>
  ),
  code_inline: (node, _children, _parent, styles, inheritedStyles = {}) => (
    <Text
      key={node.key}
      selectable={selectable}
      style={[inheritedStyles, styles.code_inline]}
    >
      {node.content}
    </Text>
  ),
  code_block: (node, _children, _parent, styles, inheritedStyles = {}) => {
    let { content } = node;
    if (
      typeof node.content === 'string' &&
      node.content.charAt(node.content.length - 1) === '\n'
    ) {
      content = node.content.substring(0, node.content.length - 1);
    }
    return (
      <View key={node.key} style={styles.codeBox}>
        <TouchableOpacity
          onPress={() => copyCodeToClipboard(content)}
          style={styles.codeCopyBtn}
          activeOpacity={0.7}
          accessibilityLabel="复制代码"
        >
          <IconCopy size={14} color={styles.codeCopyIcon.color} />
        </TouchableOpacity>
        <Text
          selectable={selectable}
          style={[inheritedStyles, styles.codeText]}
        >
          {content}
        </Text>
      </View>
    );
  },
  fence: (node, _children, _parent, styles, inheritedStyles = {}) => {
    let { content } = node;
    if (typeof content === 'string' && content.endsWith('\n')) {
      content = content.substring(0, content.length - 1);
    }
    return (
      <View key={node.key} style={styles.codeBox}>
        <TouchableOpacity
          onPress={() => copyCodeToClipboard(content)}
          style={styles.codeCopyBtn}
          activeOpacity={0.7}
          accessibilityLabel="复制代码"
        >
          <IconCopy size={14} color={styles.codeCopyIcon.color} />
        </TouchableOpacity>
        <Text
          selectable={selectable}
          style={[inheritedStyles, styles.codeText]}
        >
          {content}
        </Text>
      </View>
    );
  },
});

// 两套规则：可选中 / 不可选中（抽屉打开时用后者，避免误触并清掉蓝色选择框）
export const selectableMarkdownRules = createMarkdownRules(true);
export const nonSelectableMarkdownRules = createMarkdownRules(false);

// Web 专用规则：在默认规则基础上给 fence/code_block 加上右上角复制按钮
// 默认规则把 fence/code_block 渲染成 Text，这里把它们包在 View 里加按钮
export const webMarkdownRules: RenderRules = {
  ...renderRules,
  fence: (node, children, parent, styles) => {
    let { content } = node;
    if (typeof content === 'string' && content.endsWith('\n')) {
      content = content.substring(0, content.length - 1);
    }
    return (
      <View key={node.key} style={styles.codeBox}>
        <TouchableOpacity
          onPress={() => copyCodeToClipboard(content)}
          style={styles.codeCopyBtn}
          activeOpacity={0.7}
          accessibilityLabel="复制代码"
        >
          <IconCopy size={14} color={styles.codeCopyIcon.color} />
        </TouchableOpacity>
        <Text style={[styles.fence]}>{content}</Text>
      </View>
    );
  },
  code_block: (node, children, parent, styles, inheritedStyles = {}) => {
    let { content } = node;
    if (
      typeof node.content === 'string' &&
      node.content.charAt(node.content.length - 1) === '\n'
    ) {
      content = node.content.substring(0, node.content.length - 1);
    }
    return (
      <View key={node.key} style={styles.codeBox}>
        <TouchableOpacity
          onPress={() => copyCodeToClipboard(content)}
          style={styles.codeCopyBtn}
          activeOpacity={0.7}
          accessibilityLabel="复制代码"
        >
          <IconCopy size={14} color={styles.codeCopyIcon.color} />
        </TouchableOpacity>
        <Text style={[inheritedStyles, styles.code_block]}>{content}</Text>
      </View>
    );
  },
};
