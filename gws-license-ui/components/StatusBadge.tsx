import { cn, statusColor, statusLabel, runStatusColor, runStatusLabel } from '@/lib/utils'
import type { VerificationStatus, RunStatus } from '@/lib/utils'

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span className={cn('badge', statusColor(status))}>
      {statusLabel(status)}
    </span>
  )
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={cn('badge', runStatusColor(status))}>
      {status === 'RUNNING' && (
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
      )}
      {runStatusLabel(status)}
    </span>
  )
}
