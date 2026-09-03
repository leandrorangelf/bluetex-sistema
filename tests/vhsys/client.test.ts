// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('VhsysClient', () => {
  it('envia tokens somente nos cabeçalhos do servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 200,
      status: 'success',
      paging: { total: 0, offset: 0, limit: 250, limit_max: 250 },
      data: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { VhsysClient } = await import('@/lib/vhsys/client')
    const client = new VhsysClient({
      baseUrl: 'https://api.example.test',
      accessToken: 'access',
      secretAccessToken: 'secret',
      timeoutMs: 5000,
    })

    await client.list('/clientes')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).not.toContain('access')
    expect(new Headers(init.headers).get('access-token')).toBe('access')
    expect(new Headers(init.headers).get('secret-access-token')).toBe('secret')
  })

  it('percorre todas as páginas sem repetir registros', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 200,
        status: 'success',
        paging: { total: 3, offset: 0, limit: 2, limit_max: 250 },
        data: [{ id: 1 }, { id: 2 }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 200,
        status: 'success',
        paging: { total: 3, offset: 2, limit: 2, limit_max: 250 },
        data: [{ id: 3 }],
      })))
    vi.stubGlobal('fetch', fetchMock)
    const { VhsysClient } = await import('@/lib/vhsys/client')
    const client = new VhsysClient({
      baseUrl: 'https://api.example.test',
      accessToken: 'access',
      secretAccessToken: 'secret',
      timeoutMs: 5000,
    })

    await expect(client.list<{ id: number }>('/pedidos', {}, 2))
      .resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retorna código sanitizado quando a API rejeita a autenticação', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'token secret exposto pelo provedor' }),
      { status: 403 },
    )))
    const { VhsysClient } = await import('@/lib/vhsys/client')
    const client = new VhsysClient({
      baseUrl: 'https://api.example.test',
      accessToken: 'access',
      secretAccessToken: 'secret',
      timeoutMs: 5000,
    })

    await expect(client.list('/clientes')).rejects.toThrow('VHSYS_HTTP_403')
  })
})

describe('getVhsysConfig', () => {
  it('rejeita ambiente incompleto sem revelar valores', async () => {
    const { getVhsysConfig } = await import('@/lib/vhsys/config')
    expect(() => getVhsysConfig()).toThrow('Configuração VHSYS incompleta')
  })
})
