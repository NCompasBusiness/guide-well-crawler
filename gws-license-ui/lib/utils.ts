import { clsx, type ClassValue } from 'clsx'
import { format, formatDistanceToNow } from 'date-fns'
export type VerificationStatus =
  | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'NOT_FOUND' | 'ERROR' | 'MANUAL_REQUIRED' | 'PENDING'
export type RunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL'
export type ManualReason =
  | 'CAPTCHA_REQUIRED' | 'BROKEN_URL' | 'PASSWORD_PROTECTED'
  | 'COMPLEX_NAVIGATION' | 'SITE_UNAVAILABLE' | 'OTHER'
export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(date: Date | string | null): string {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

export function formatDateTime(date: Date | string | null): string {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

export function formatRelative(date: Date | string | null): string {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function statusLabel(status: VerificationStatus): string {
  const labels: Record<VerificationStatus, string> = {
    ACTIVE: 'Active',
    EXPIRED: 'Expired',
    TERMINATED: 'Terminated',
    NOT_FOUND: 'Not Found',
    ERROR: 'Error',
    MANUAL_REQUIRED: 'Manual Required',
    PENDING: 'Pending',
  }
  return labels[status]
}

export function statusColor(status: VerificationStatus): string {
  const colors: Record<VerificationStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    EXPIRED: 'bg-yellow-100 text-yellow-800',
    TERMINATED: 'bg-red-100 text-red-800',
    NOT_FOUND: 'bg-orange-100 text-orange-800',
    ERROR: 'bg-red-100 text-red-800',
    MANUAL_REQUIRED: 'bg-purple-100 text-purple-800',
    PENDING: 'bg-gray-100 text-gray-600',
  }
  return colors[status]
}

export function runStatusLabel(status: RunStatus): string {
  const labels: Record<RunStatus, string> = {
    PENDING: 'Pending',
    RUNNING: 'Running',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    PARTIAL: 'Partial',
  }
  return labels[status]
}

export function runStatusColor(status: RunStatus): string {
  const colors: Record<RunStatus, string> = {
    PENDING: 'bg-gray-100 text-gray-600',
    RUNNING: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    PARTIAL: 'bg-yellow-100 text-yellow-800',
  }
  return colors[status]
}

export function manualReasonLabel(reason: ManualReason | null): string {
  if (!reason) return '—'
  const labels: Record<ManualReason, string> = {
    CAPTCHA_REQUIRED: 'CAPTCHA Required',
    BROKEN_URL: 'Broken URL',
    PASSWORD_PROTECTED: 'Password Protected',
    COMPLEX_NAVIGATION: 'Complex Navigation',
    SITE_UNAVAILABLE: 'Site Unavailable',
    OTHER: 'Other',
  }
  return labels[reason]
}

export function paginationMeta(total: number, page: number, perPage: number) {
  const totalPages = Math.ceil(total / perPage)
  return {
    total,
    page,
    perPage,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  }
}
