// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

function fakeSupabase(user: { id: string } | null, role: string | null, unidade: string | null = null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: role ? { role, unidade, ativo: true } : null,
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

describe('requireVhsysSync', () => {
  it('admin sincroniza qualquer unidade', async () => {
    const { requireVhsysSync } = await import('@/lib/vhsys/auth')
    await expect(requireVhsysSync(fakeSupabase({ id: 'a' }, 'admin') as never, 'SC'))
      .resolves.toEqual({ userId: 'a', role: 'admin' })
  })

  it('usuário de unidade sincroniza a própria unidade', async () => {
    const { requireVhsysSync } = await import('@/lib/vhsys/auth')
    await expect(requireVhsysSync(fakeSupabase({ id: 'u' }, 'unidade', 'NEW BLUETEX MG') as never, 'MG'))
      .resolves.toEqual({ userId: 'u', role: 'unidade' })
  })

  it('usuário de unidade não sincroniza outra unidade', async () => {
    const { requireVhsysSync, VhsysAuthError } = await import('@/lib/vhsys/auth')
    await expect(requireVhsysSync(fakeSupabase({ id: 'u' }, 'unidade', 'NEW BLUETEX MG') as never, 'SC'))
      .rejects.toEqual(new VhsysAuthError(403, 'Você só pode sincronizar a sua própria unidade'))
  })

  it('diretoria e sessão ausente são rejeitadas', async () => {
    const { requireVhsysSync } = await import('@/lib/vhsys/auth')
    await expect(requireVhsysSync(fakeSupabase({ id: 'd' }, 'diretoria') as never, 'MG')).rejects.toMatchObject({ status: 403 })
    await expect(requireVhsysSync(fakeSupabase(null, null) as never, 'MG')).rejects.toMatchObject({ status: 401 })
  })
})
