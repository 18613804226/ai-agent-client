import React from 'react'
// 仓库 devDependencies 未装 @types/react-dom，且 react-dom 仅在运行时 Web bundle 中使用
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPortal } = require('react-dom') as {
  createPortal: (children: React.ReactNode, container: any) => React.ReactPortal
}

export function WebPortal({ children }: { children: React.ReactNode }) {
  const body = (globalThis as any).document?.body
  if (!body) return <>{children}</>
  return createPortal(children, body)
}
