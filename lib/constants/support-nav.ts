/**
 * 侧栏「联系客服」「报告问题」跳转地址。
 * 在 `.env.local` 中设置可覆盖（例如自有工单系统或客服 IM）。
 */
const DEFAULT_CONTACT =
  process.env.NEXT_PUBLIC_CONTACT_SUPPORT_URL?.trim() ||
  'https://github.com/dongpochen/OpenMAIC/discussions';

const DEFAULT_REPORT =
  process.env.NEXT_PUBLIC_REPORT_ISSUE_URL?.trim() ||
  'https://github.com/dongpochen/OpenMAIC/issues/new';

export const CONTACT_SUPPORT_NAV_URL = DEFAULT_CONTACT;
export const REPORT_ISSUE_NAV_URL = DEFAULT_REPORT;
