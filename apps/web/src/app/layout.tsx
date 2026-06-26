import '@willyu1007/web-workbench/styles';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'morethan · my-erp',
  description: '可嵌入 my-chat 生态的模块化智能 erp 平台',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
