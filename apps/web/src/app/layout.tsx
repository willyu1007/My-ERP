import '@willyu1007/web-workbench/styles';
import './fonts.css'; // AFTER kit styles so its :root font-token override wins
import './workbench-overrides.css';
import type { ReactNode } from 'react';
import { Manrope, Source_Serif_4, JetBrains_Mono, Caveat } from 'next/font/google';

/**
 * Fonts are host-provided: the web-workbench kit no longer self-loads webfonts
 * (it dropped the render-blocking Google Fonts @import). We self-host the Latin
 * faces via next/font and expose them as CSS variables; fonts.css maps the kit's
 * --font-* tokens onto them (Chinese falls back to the system Han font). Omit
 * `weight` — these are variable fonts, so next/font loads the full axis.
 */
const sans = Manrope({ subsets: ['latin'], variable: '--f-sans', display: 'swap' });
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--f-serif', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--f-mono', display: 'swap' });
const hand = Caveat({ subsets: ['latin'], variable: '--f-hand', display: 'swap' });

export const metadata = {
  title: 'morethan · my-erp',
  description: '可嵌入 my-chat 生态的模块化智能 erp 平台',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="zh-CN"
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${hand.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
