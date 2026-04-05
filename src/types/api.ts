import type {
  RsvpStatus,
  UserRole,
  SupplierStatus,
  PaymentStatus,
  TaskPriority,
  RecurringInterval,
  TableShape,
  Orientation,
} from "@prisma/client";

// =============================================================================
// COMMON TYPES
// =============================================================================

/** Standard error response */
export interface ApiErrorResponse {
  error: string;
}

/** Pagination metadata */
export interface PaginationMeta {
  total: number;
  hasMore: boolean;
}

// =============================================================================
// USER TYPES
// =============================================================================

export interface UserResponse {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  lockedUntil: Date | null;
  emailVerified: Date | null;
  createdAt: Date;
}

// =============================================================================
// GUEST TYPES
// =============================================================================

export interface GuestResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  groupName: string | null;
  isChild: boolean;
  rsvpToken: string;
  rsvpStatus: RsvpStatus;
  rsvpRespondedAt: Date | null;
  invitedToCeremony: boolean;
  invitedToReception: boolean;
  invitedToAfterparty: boolean;
  attendingCeremony: boolean | null;
  attendingReception: boolean | null;
  attendingAfterparty: boolean | null;
  mealChoice: string | null;
  dietaryNotes: string | null;
  tableId: string | null;
  table: { id: string; name: string } | null;
  seatNumber: number | null;
  isManualOverride: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuestListResponse extends PaginationMeta {
  guests: GuestResponse[];
}

// =============================================================================
// PLANNING CATEGORY TYPES
// =============================================================================

export interface PlanningCategoryResponse {
  id: string;
  name: string;
  colour: string;
  sortOrder: number;
  isActive: boolean;
  allocatedAmount?: number | null;
}

// =============================================================================
// SUPPLIER TYPES
// =============================================================================

export interface SupplierResponse {
  id: string;
  categoryId: string | null;
  category: PlanningCategoryResponse | null;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  contractValue: number | null;
  contractSigned: boolean;
  contractSignedAt: Date | null;
  status: SupplierStatus;
  createdAt: Date;
}

export interface SupplierListResponse extends PaginationMeta {
  suppliers: SupplierResponse[];
}

// =============================================================================
// PAYMENT TYPES
// =============================================================================

export interface PaymentResponse {
  id: string;
  supplierId: string;
  label: string;
  amount: number;
  dueDate: Date | null;
  paidDate: Date | null;
  status: PaymentStatus;
  notes: string | null;
  createdAt: Date;
}

export interface PaymentWithSupplierResponse extends PaymentResponse {
  supplier: {
    id: string;
    name: string;
  };
}

export interface PaymentListResponse extends PaginationMeta {
  payments: PaymentWithSupplierResponse[];
}

// =============================================================================
// APPOINTMENT TYPES
// =============================================================================

export interface AppointmentResponse {
  id: string;
  title: string;
  categoryId: string | null;
  category: PlanningCategoryResponse | null;
  date: Date;
  location: string | null;
  notes: string | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  reminderDays: number | null;
  reminderSent: boolean;
  createdAt: Date;
}

// =============================================================================
// TASK TYPES
// =============================================================================

export interface TaskResponse {
  id: string;
  title: string;
  notes: string | null;
  priority: TaskPriority;
  dueDate: Date | null;
  completedAt: Date | null;
  isCompleted: boolean;
  categoryId: string | null;
  category: PlanningCategoryResponse | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string | null; email: string; role: UserRole } | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  isRecurring: boolean;
  recurringInterval: RecurringInterval | null;
  recurringEndDate: Date | null;
  createdAt: Date;
}

export interface TaskListResponse extends PaginationMeta {
  tasks: TaskResponse[];
}

// =============================================================================
// MEAL OPTION TYPES
// =============================================================================

export interface MealOptionResponse {
  id: string;
  name: string;
  description: string | null;
  course: string | null;
  isActive: boolean;
  sortOrder: number;
}

// =============================================================================
// SEATING TYPES
// =============================================================================

export interface TableResponse {
  id: string;
  roomId: string;
  name: string;
  shape: TableShape;
  capacity: number;
  positionX: number;
  positionY: number;
  rotation: number;
  width: number;
  height: number;
  locked: boolean;
  colour: string;
  notes: string | null;
  guests: GuestResponse[];
  createdAt: Date;
}

export interface RoomElementResponse {
  id: string;
  roomId: string;
  type: string;
  label: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  locked: boolean;
}

export interface RoomResponse {
  id: string;
  name: string;
  widthMetres: number;
  heightMetres: number;
  tables: TableResponse[];
  elements: RoomElementResponse[];
}

// =============================================================================
// SETTINGS TYPES
// =============================================================================

export interface WeddingConfigResponse {
  id: number;
  coupleName: string;
  weddingDate: Date | null;
  reminderEmail: string | null;
  ceremonyEnabled: boolean;
  ceremonyName: string;
  ceremonyLocation: string | null;
  mealEnabled: boolean;
  mealName: string;
  mealLocation: string | null;
  eveningPartyEnabled: boolean;
  eveningPartyName: string;
  eveningPartyLocation: string | null;
  rehearsalDinnerEnabled: boolean;
  rehearsalDinnerName: string;
  rehearsalDinnerLocation: string | null;
}

// =============================================================================
// DASHBOARD TYPES
// =============================================================================

export interface DashboardStatsResponse {
  weddingDate: string | null;
  coupleName: string;
  guestStats: {
    total: number;
    accepted: number;
    partial: number;
    declined: number;
    pending: number;
    percentResponded: number;
  };
  seatingStats: {
    assigned: number;
    receptionEligible: number;
  };
  budgetStats: {
    totalContracted: number;
    totalPaid: number;
    totalRemaining: number;
  };
  supplierStatusBreakdown: Array<{
    status: SupplierStatus;
    count: number;
  }>;
  upcomingPayments: Array<{
    id: string;
    label: string;
    amount: number;
    dueDate: string | null;
    status: PaymentStatus;
    supplierName: string;
  }>;
  upcomingAppointments: Array<{
    id: string;
    title: string;
    date: string;
    location: string | null;
    supplierName: string | null;
    categoryName: string | null;
    categoryColour: string | null;
  }>;
  overduePayments: Array<{
    id: string;
    label: string;
    amount: number;
    dueDate: string;
    supplierName: string;
  }>;
  upcomingTasks: Array<{
    id: string;
    title: string;
    priority: TaskPriority;
    dueDate: string | null;
    isOverdue: boolean;
    categoryName: string | null;
    categoryColour: string | null;
    assignedToName: string | null;
  }>;
}

// =============================================================================
// ATTACHMENT TYPES
// =============================================================================

export interface AttachmentResponse {
  id: string;
  supplierId: string;
  filename: string;
  storedAs: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

// =============================================================================
// AUTH TYPES
// =============================================================================

export interface LoginPreflightResponse {
  valid: boolean;
  requires2FA: boolean;
  locked?: boolean;
  lockedUntil?: Date;
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
  hasBackupCodes: boolean;
}

// =============================================================================
// HEALTH CHECK TYPE
// =============================================================================

export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  database: "connected" | "disconnected";
  redis: "connected" | "disconnected" | "not_configured";
  timestamp: string;
}

// =============================================================================
// REQUEST BODY TYPES (existing)
// =============================================================================

export interface SupplierCreateBody {
  name: string;
  categoryId?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  notes?: string | null;
  contractValue?: number | null;
  status?: SupplierStatus;
}

export interface SupplierUpdateBody extends Partial<SupplierCreateBody> {}

export interface TableUpdateBody {
  name?: string;
  shape?: TableShape;
  capacity?: number;
  positionX?: number;
  positionY?: number;
  rotation?: number;
  width?: number;
  height?: number;
  locked?: boolean;
  colour?: string;
  notes?: string | null;
  orientation?: Orientation;
}

export interface RoomElementInput {
  type: string;
  label?: string | null;
  positionX: number;
  positionY: number;
  width?: number;
  height?: number;
  rotation?: number;
  color?: string;
  locked?: boolean;
}

export interface RoomUpdateBody {
  name?: string;
  widthMetres?: number;
  heightMetres?: number;
  elements?: RoomElementInput[];
}