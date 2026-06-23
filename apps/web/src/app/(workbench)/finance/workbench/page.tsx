import { redirect } from 'next/navigation';

/**
 * 我的工作台 merged into the home 看板 (方案 A) — the personal task queue now lives
 * at `/`. This route redirects so old deep links keep working; the task table +
 * server actions in this folder are reused by the home page.
 */
export default function WorkbenchRedirect(): never {
  redirect('/');
}
