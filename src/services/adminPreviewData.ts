import type { DeviceUsageRecord } from '../types/admin';

/** Frontend-only sample data; replace with admin API responses when the backend is ready. */
export const adminPreviewRecords: DeviceUsageRecord[] = [
  {
    id: 'device-01',
    uuid: 'a3f19c72-8b4d-4f60-9a12-6e2c7d15b801',
    totalTokens: 128450,
    todayTokens: 8420,
    todayRequests: 18,
    dailyLimit: 50,
    lastActiveAt: '刚刚',
  },
  {
    id: 'device-02',
    uuid: 'b7d8240e-1c95-43a8-bfd3-52e0649ca312',
    totalTokens: 76420,
    todayTokens: 12860,
    todayRequests: 46,
    dailyLimit: 50,
    lastActiveAt: '3 分钟前',
  },
  {
    id: 'device-03',
    uuid: 'c4a09d31-7e62-4b85-901f-3d8a6c20e547',
    totalTokens: 39210,
    todayTokens: 2850,
    todayRequests: 9,
    dailyLimit: 30,
    lastActiveAt: '今天 13:42',
  },
  {
    id: 'device-04',
    uuid: 'd2e61b93-5f08-4a27-8c14-9b3d70e652fa',
    totalTokens: 214800,
    todayTokens: 19300,
    todayRequests: 50,
    dailyLimit: 50,
    lastActiveAt: '今天 12:18',
  },
  {
    id: 'device-05',
    uuid: 'e8c53a16-2d74-49b0-a631-0f9e84c72d5b',
    totalTokens: 15680,
    todayTokens: 0,
    todayRequests: 0,
    dailyLimit: 20,
    lastActiveAt: '昨天 20:06',
  },
];
