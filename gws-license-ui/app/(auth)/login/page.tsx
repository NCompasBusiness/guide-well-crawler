import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { LoginButton } from '@/components/auth/LoginButton'

export default async function LoginPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/')

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-700">
      <div className="w-full max-w-sm space-y-8 rounded-2xl bg-white p-10 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GWS License Verification</h1>
          <p className="mt-2 text-sm text-gray-500">
            DME Supplier License Management Portal
          </p>
        </div>

        <div className="space-y-4">
          <LoginButton />
          <p className="text-center text-xs text-gray-400">
            Sign in with your GuideWell Source account.
            <br />
            Contact IT if you have access issues.
          </p>
        </div>

        <div className="border-t pt-4 text-center text-xs text-gray-400">
          GuideWell Source &mdash; Internal Use Only
        </div>
      </div>
    </div>
  )
}
