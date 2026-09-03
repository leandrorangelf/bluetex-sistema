// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

function fakeSupabase(user: { id: string } | null, role: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: role ? { role } : null,
          }),
        })),
      })),
    })),
  }
}

describe('requireVhsysAdmin', () => {
  it('rejeita sessão ausente', async () => {
    const { requireVhsysAdmin, VhsysAuthError } = await import('@/lib/vhsys/auth')
    await expect(requireVhsysAdmin(fakeSupabase(null, null) as never))
      .rejects.toEqual(new VhsysAuthError(401, 'Não autenticado'))
  })

  it('rejeita usuário que não é administrador', async () => {
    const { requireVhsysAdmin, VhsysAuthError } = await import('@/lib/vhsys/auth')
    await expect(requireVhsysAdmin(fakeSupabase({ id: 'u1' }, 'unidade') as never))
      .rejects.toEqual(new VhsysAuthError(403, 'Acesso restrito a administradores'))
  })

  it('retorna o ID do administrador autenticado', async () => {
    const { requireVhsysAdmin } = await import('@/lib/vhsys/auth')
    await expect(requireVhsysAdmin(fakeSupabase({ id: 'admin' }, 'admin') as never))
      .resolves.toEqual({ userId: 'admin' })
  })
})
