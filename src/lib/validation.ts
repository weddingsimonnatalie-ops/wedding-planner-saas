import { RsvpStatus, SupplierStatus, UserRole } from "@prisma/client";

// RSVP status validation
export const VALID_RSVP_STATUSES: RsvpStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PARTIAL",
  "DECLINED",
  "MAYBE",
];

export function isValidRsvpStatus(
  status: unknown
): status is RsvpStatus {
  return (
    typeof status === "string" &&
    VALID_RSVP_STATUSES.includes(status as RsvpStatus)
  );
}

// Supplier status validation
export const VALID_SUPPLIER_STATUSES: SupplierStatus[] = [
  "ENQUIRY",
  "QUOTED",
  "BOOKED",
  "COMPLETE",
  "CANCELLED",
];

export function isValidSupplierStatus(
  status: unknown
): status is SupplierStatus {
  return (
    typeof status === "string" &&
    VALID_SUPPLIER_STATUSES.includes(status as SupplierStatus)
  );
}

// User role validation
export const VALID_ROLES: UserRole[] = ["ADMIN", "VIEWER", "RSVP_MANAGER"];

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === "string" && VALID_ROLES.includes(role as UserRole);
}

// Input length limits
export const LENGTH_LIMITS = {
  // Person names
  firstName: 100,
  lastName: 100,
  userName: 100,
  contactName: 100,

  // Contact
  email: 255,
  phone: 50,
  website: 500,
  location: 255,

  // Short text
  title: 255,
  label: 255,
  supplierName: 255,
  tableName: 100,
  roomName: 100,
  categoryName: 100,
  mealOptionName: 100,
  courseName: 100,

  // Identifiers
  groupName: 100,
  coupleName: 100,
  venueName: 255,

  // Long text
  notes: 5000,
  dietaryNotes: 1000,
  venueAddress: 5000,
  description: 1000,
  appointmentNotes: 1000,
  taskNotes: 5000,
  tableNotes: 1000,

  // Password
  passwordMin: 8,
  passwordMax: 128,
} as const;

export type LengthLimitField = keyof typeof LENGTH_LIMITS;

/**
 * Validate that a string does not exceed its maximum length.
 * Returns an error message if invalid, null if valid.
 */
export function validateLength(
  value: string | null | undefined,
  field: LengthLimitField,
  required: boolean = false
): string | null {
  if (!value?.trim()) {
    return required ? `${field} is required` : null;
  }
  const max = LENGTH_LIMITS[field];
  if (value.length > max) {
    return `${field} must be ${max} characters or less`;
  }
  return null;
}

/**
 * Validate multiple fields and return all errors.
 */
export function validateFields(
  fields: Array<{ value: string | null | undefined; field: LengthLimitField; required?: boolean }>
): string[] {
  const errors: string[] = [];
  for (const { value, field, required } of fields) {
    const error = validateLength(value, field, required);
    if (error) errors.push(error);
  }
  return errors;
}