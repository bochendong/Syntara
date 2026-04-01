export type AppNotificationKind = 'credit_gain' | 'credit_spent';

export type AppNotificationTone = 'positive' | 'negative';

export type AppNotificationPresentation = 'banner' | 'feed';

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
  sourceKind: string;
  sourceLabel: string;
  createdAt: string;
}

export interface NotificationsResponse {
  success: true;
  databaseEnabled: boolean;
  notifications: AppNotification[];
}
