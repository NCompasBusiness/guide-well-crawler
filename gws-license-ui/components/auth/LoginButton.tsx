'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'

export function LoginButton() {
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    setLoading(true)
    await signIn('azure-ad', { callbackUrl: '/' })
  }

  return (
    <button
      onClick={handleSignIn}
      disabled={loading}
      className="btn-primary w-full justify-center"
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 23 23" fill="none">
          <path d="M0 0h11v11H0z" fill="#f25022" />
          <path d="M12 0h11v11H12z" fill="#7fba00" />
          <path d="M0 12h11v11H0z" fill="#00a4ef" />
          <path d="M12 12h11v11H12z" fill="#ffb900" />
        </svg>
      )}
      {loading ? 'Signing in…' : 'Sign in with Microsoft'}
    </button>
  )
}
