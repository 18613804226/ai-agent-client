import React, { useEffect, type ReactNode } from 'react';
import { useKnowledgeFiles } from '../hooks/useKnowledgeFiles';
import { KnowledgeContext } from './appContexts';

/**
 * 知识库 Provider。
 *
 * 关键点：把 useKnowledgeFiles 的 state 放在这里，而不是 RootLayout 里。
 * 这样上传进度每帧更新时，只会重渲染 Provider 自身和消费它的组件（如侧栏），
 * 不会重渲染 RootLayout / Drawer，避免打开抽屉上传文件时抽屉被顶掉、状态错乱。
 */
export function KnowledgeProvider({ children }: { children: ReactNode }) {
  const knowledge = useKnowledgeFiles();
  const { loadKnowledgeFiles } = knowledge;

  useEffect(() => {
    loadKnowledgeFiles();
  }, [loadKnowledgeFiles]);

  return (
    <KnowledgeContext.Provider value={knowledge}>
      {children}
    </KnowledgeContext.Provider>
  );
}
