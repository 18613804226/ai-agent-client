export interface DeviceUsageRecord {
  id: string;
  uuid: string;
  totalTokens: number;
  todayTokens: number;
  todayRequests: number;
  dailyLimit: number;
  lastActiveAt: string;
  role?: string;
  platform?: string;
  model?: string;
  osVersion?: string;
  createdAt?: string;
}
