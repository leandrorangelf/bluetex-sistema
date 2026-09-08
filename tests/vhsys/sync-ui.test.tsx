import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import VhsysSyncClient from '@/app/integracoes/vhsys/VhsysSyncClient'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('sincroniza em um clique e mostra o resultado por domínio', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    syncId: 'sync-1',
    totalItens: 34,
    domains: { receber: 'concluido', pagar: 'concluido', bancos: 'concluido' },
  }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<VhsysSyncClient />)

  fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }))

  await screen.findByText(/34 registros processados/)
  expect(fetchMock).toHaveBeenCalledWith('/api/vhsys/sync-auto', { method: 'POST' })
  expect(screen.getByText('Contas a receber')).toBeInTheDocument()
})

it('mostra erro quando a sincronização falha', async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: 'Configuração VHSYS incompleta' }), { status: 502 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  render(<VhsysSyncClient />)

  fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }))

  await screen.findByText('Configuração VHSYS incompleta')
})
