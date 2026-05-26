import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { kv } from './kv';

const ADMIN_TOKEN_KEY = 'admin:yt-token';

export async function getCachedAdminToken(): Promise<string | null> {
  try {
    const stored = await kv.get<{ accessToken: string; expiresAt: number; refreshToken?: string }>(ADMIN_TOKEN_KEY);
    if (!stored?.accessToken) return null;
    // Still valid for at least 60s
    if (stored.expiresAt && Date.now() < stored.expiresAt - 60_000) {
      return stored.accessToken;
    }
    // Try to refresh using the cached refresh token
    if (stored.refreshToken) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID ?? '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
          grant_type: 'refresh_token',
          refresh_token: stored.refreshToken,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const next = {
          accessToken: data.access_token as string,
          refreshToken: (data.refresh_token as string) ?? stored.refreshToken,
          expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
        };
        await kv.set(ADMIN_TOKEN_KEY, next);
        return next.accessToken;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function cacheAdminToken(
  accessToken: string | undefined,
  refreshToken: string | undefined,
  expiresAt: number | undefined,
) {
  if (!accessToken || !expiresAt) return;
  try {
    await kv.set(ADMIN_TOKEN_KEY, { accessToken, refreshToken, expiresAt });
  } catch {
    // ignore
  }
}

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    accessTokenExpires?: number;
    error?: 'RefreshAccessTokenError';
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      isAdmin?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: 'RefreshAccessTokenError';
    userId?: string;
  }
}

async function refreshAccessToken(token: any) {
  try {
    const url = 'https://oauth2.googleapis.com/token';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken ?? '',
      }),
    });
    const refreshed = await res.json();
    if (!res.ok) throw refreshed;
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' as const };
  }
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user) {
        const next = {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000,
          userId: user.id ?? token.sub,
        };
        if (isAdminEmail(user.email)) {
          await cacheAdminToken(next.accessToken, next.refreshToken, next.accessTokenExpires);
        }
        return next;
      }
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires - 60_000) {
        return token;
      }
      const refreshed = await refreshAccessToken(token);
      if (!refreshed.error && refreshed.accessToken && isAdminEmail(token.email as string | undefined)) {
        await cacheAdminToken(refreshed.accessToken, refreshed.refreshToken, refreshed.accessTokenExpires);
      }
      return refreshed;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.accessTokenExpires = token.accessTokenExpires;
      session.error = token.error;
      session.user.id = token.userId ?? token.sub;
      session.user.isAdmin = isAdminEmail(session.user.email);
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};
