'use client'

import { signOut } from 'next-auth/react'
import type { UserRole } from '@/lib/utils'

interface TopBarProps {
  user: {
    name?: string | null
    email?: string | null
    role: UserRole
  }
}

export function TopBar({ user }: TopBarProps) {
  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{user.name ?? user.email}</p>
          <p className="text-xs text-gray-500">{user.email}</p>
        </div>
        <div className="h-9 w-9 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-semibold">
          {(user.name ?? user.email ?? 'U').charAt(0).toUpperCase()}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="btn-secondary btn-sm"
          title="Sign out"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </header>
  )
}
