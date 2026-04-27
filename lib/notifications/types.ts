export type AppNotificationKind = 'credit_gain' | 'credit_spent' | 'study_nudge';

export type AppNotificationTone = 'positive' | 'negative';

export type AppNotificationPresentation = 'banner' | 'feed';

export interface AppNotificationDetail {
  key: string;
  label: string;
  value: string;
}

export interface AppNotification {
  id: string;
  kind: AppNotificationKind;
  title: string;
  body: string;
  tone: AppNotificationTone;
  presentation: AppNotificationPresentation;
  amountLabel: string;
  delta: number;
  balanceAfter: number;
  accountType: 'CASH' | 'COMPUTE' | 'PURCHASE';
  sourceKind: string;
  sourceLabel: string;
  createdAt: string;
  details: AppNotificationDetail[];
  showBalance?: boolean;
}

export interface NotificationsResponse {
  success: true;
  databaseEnabled: boolean;
  notifications: AppNotification[];
}
