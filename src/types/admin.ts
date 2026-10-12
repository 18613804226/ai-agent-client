export interface DeviceUsageRecord {
  id: string;
  uuid: string;
  totalTokens: number;
  todayTokens: number;
  todayRequests: number;
  dailyLimit: number;
  lastActiveAt: string;
}
