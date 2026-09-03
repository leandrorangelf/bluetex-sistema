import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (entries: { name: string; value: string; options: CookieOptions }[]) => {
          for (const { name, value, options } of entries) {
            try {
              cookieStore.set(name, value, options)
            } catch {
              // Server Components cannot write response cookies.
            }
          }
        },
      },
    },
  )
}
