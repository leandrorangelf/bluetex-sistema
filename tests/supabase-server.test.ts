import { describe, expect, it, vi } from 'vitest'

const createServerClient = vi.fn(() => ({ auth: {} }))
vi.mock('@supabase/ssr', () => ({ createServerClient }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [{ name: 'sb-token', value: 'abc' }],
    set: vi.fn(),
  })),
}))

describe('createServerSupabase', () => {
  it('cria o cliente com URL, chave pública e cookies da sessão', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    const { createServerSupabase } = await import('@/lib/supabase-server')

    await createServerSupabase()

    expect(createServerClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon',
      expect.objectContaining({ cookies: expect.any(Object) }),
    )
  })
})
