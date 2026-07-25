export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  message: string;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedData<T> = {
  items: T[];
  pagination: Pagination;
};

export type AdminProfile = {
  id: string;
  username: string;
  displayName: string | null;
};

export type LoginResult = {
  accessToken: string;
  expiresIn: string;
  admin: AdminProfile;
};

export type DashboardSummary = {
  identifiedCustomers: number;
  pendingCustomers: number;
  todayCreatedCustomers: number;
  todayPendingCustomers: number;
  todayDuplicateImports: number;
  todayFailedImports: number;
  totalImportLogs: number;
};

export type TelegramCustomerStatus = 'IDENTIFIED' | 'DISABLED';

export type CustomerListItem = {
  id: string;
  customerCode: string;
  telegramId: string;
  username: string | null;
  displayName: string | null;
  status: TelegramCustomerStatus;
  firstImportedById: string;
  firstImportedUsername: string | null;
  firstImportedName: string | null;
  firstImportedAt: string;
  firstImportSource: string;
  archiveMessageLink: string | null;
  lastObservedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDetail = CustomerListItem & {
  firstName?: string | null;
  lastName?: string | null;
  usernameNormalized?: string | null;
  archiveChatId?: string | null;
  archiveMessageId?: string | null;
  resolvedPendingRecords?: PendingCustomer[];
  importLogs?: ImportLogItem[];
};

export type PendingCustomerStatus =
  | 'PENDING_ID'
  | 'RESOLVED'
  | 'MERGED'
  | 'CANCELLED';

export type PendingCustomer = {
  id: string;
  pendingCode: string;
  visibleName: string | null;
  visibleUsername: string | null;
  note: string | null;
  failureReason: string;
  status: PendingCustomerStatus;
  operatorTelegramId: string;
  operatorUsername: string | null;
  operatorDisplayName: string | null;
  archiveMessageLink: string | null;
  resolvedCustomerId: string | null;
  resolvedByTelegramId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedCustomer?: CustomerListItem | null;
};

export type ResolvePendingResult = {
  kind: 'RESOLVED' | 'MERGED';
  pending: PendingCustomer;
  customer: CustomerListItem & { id: string };
};

export type ImportLogItem = {
  id: string;
  customerId: string | null;
  customerCode: string | null;
  targetTelegramId: string | null;
  operatorTelegramId: string;
  operatorUsername: string | null;
  operatorDisplayName: string | null;
  source: string;
  result: string;
  failureReason: string | null;
  archiveMessageLink: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AdminLoginLogItem = {
  id: string;
  adminUserId: string | null;
  username: string | null;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  failureReason: string | null;
  createdAt: string;
};

export const CUSTOMER_STATUSES = ['IDENTIFIED', 'DISABLED'] as const;
export const PENDING_STATUSES = [
  'PENDING_ID',
  'RESOLVED',
  'MERGED',
  'CANCELLED',
] as const;
export const IMPORT_RESULTS = [
  'CREATED',
  'DUPLICATE',
  'PROFILE_UPDATED',
  'PENDING_CREATED',
  'PENDING_RESOLVED',
  'PENDING_MERGED',
  'HIDDEN_SENDER',
  'INVALID',
  'FAILED',
] as const;
export const IMPORT_SOURCES = [
  'USER_PICKER_SINGLE',
  'USER_PICKER_BATCH',
  'FORWARDED_MESSAGE',
  'MANUAL_ID',
  'PENDING_RESOLUTION',
] as const;
export const CUSTOMER_SORT_FIELDS = [
  'firstImportedAt',
  'createdAt',
  'lastObservedAt',
  'customerCode',
] as const;
