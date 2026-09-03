// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stubs = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  requireVhsysAdmin: vi.fn(),
  getVhsysConfig: vi.fn(),
  analyzeVhsys: vi.fn(),
  confirmVhsys: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabase: stubs.createServerSupabase,
}))
vi.mock('@/lib/vhsys/auth', () => ({
  requireVhsysAdmin: stubs.requireVhsysAdmin,
  VhsysAuthError: class VhsysAuthError extends Error {
    constructor(readonly status: number, message: string) {
      super(message)
    }
  },
}))
vi.mock('@/lib/vhsys/config', () => ({
  getVhsysConfig: stubs.getVhsysConfig,
}))
vi.mock('@/lib/vhsys/analyze', () => ({
  analyzeVhsys: stubs.analyzeVhsys,
}))
vi.mock('@/lib/vhsys/confirm', () => ({
  confirmVhsys: stubs.confirmVhsys,
}))
vi.mock('@/lib/vhsys/client', () => ({
  VhsysClient: class VhsysClient {},
}))

beforeEach(() => {
  stubs.createServerSupabase.mockResolvedValue({})
  stubs.requireVhsysAdmin.mockResolvedValue({ userId: 'admin' })
  stubs.getVhsysConfig.mockReturnValue({})
  stubs.analyzeVhsys.mockResolvedValue('sync-1')
  stubs.confirmVhsys.mockResolvedValue({ vendas: 'concluido' })
})

describe('POST /api/vhsys/sync/:id/confirm', () => {
  it('confirma decisões da execução autenticada', async () => {
    const { POST } = await import('@/app/api/vhsys/sync/[id]/confirm/route')
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ decisions: [] }),
    })
    const response = await POST(request, {
      params: Promise.resolve({ id: 'sync-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      domains: { vendas: 'concluido' },
    })
  })
})

describe('POST /api/vhsys/analyze', () => {
  it('cria análise autenticada e retorna o identificador', async () => {
    const { POST } = await import('@/app/api/vhsys/analyze/route')
    const response = await POST()

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 'sync-1' })
  })

  it('não devolve detalhes internos quando a análise falha', async () => {
    stubs.analyzeVhsys.mockRejectedValueOnce(new Error('segredo interno'))
    const { POST } = await import('@/app/api/vhsys/analyze/route')
    const response = await POST()

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'Não foi possível analisar os dados do VHSYS.',
    })
  })
})
