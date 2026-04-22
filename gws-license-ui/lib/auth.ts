import { PrismaAdapter } from '@auth/prisma-adapter'
import { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { db } from '@/lib/db'

type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db) as NextAuthOptions['adapter'],
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  session: {
    strategy: 'database',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true, lastLogin: true },
        })
        session.user.role = (dbUser?.role as UserRole) ?? 'VIEWER'
        // Update last login timestamp
        await db.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        })
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  debug: true,
  logger: {
    error(code, meta) { console.error('[next-auth][error]', code, meta) },
    warn(code) { console.warn('[next-auth][warn]', code) },
    debug(code, meta) { console.log('[next-auth][debug]', code, meta) },
  },
}

// Extend next-auth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      role: UserRole
    }
  }
}
