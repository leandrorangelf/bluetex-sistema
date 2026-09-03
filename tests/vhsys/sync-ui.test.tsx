import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import VhsysSyncClient from '@/app/integracoes/vhsys/VhsysSyncClient'

afterEach(() => vi.unstubAllGlobals())

it('analisa, exige resolução de conflito e habilita confirmação', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'sync-1' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      sync: {
        id: 'sync-1',
        status: 'pronto',
        resumo: { novo: 1, possivel_duplicidade: 1 },
      },
      items: [
        {
          id: 'new',
          dominio: 'vendas',
          vhsys_id: '10',
          classificacao: 'novo',
          decisao: 'importar',
          local_id: null,
          dados_normalizados: { pessoa_nome: 'Cliente Novo', valor_total: 100 },
        },
        {
          id: 'conflict',
          dominio: 'vendas',
          vhsys_id: '20',
          classificacao: 'possivel_duplicidade',
          decisao: null,
          local_id: 'local-1',
          dados_normalizados: { pessoa_nome: 'Cliente Existente', valor_total: 200 },
        },
      ],
    }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<VhsysSyncClient />)

  fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }))

  await screen.findAllByText('Cliente Existente')
  expect(screen.getByText('2 registros analisados')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirmar sincronização' }))
    .toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: 'Vincular ao existente' }))

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Confirmar sincronização' }))
      .toBeEnabled()
  })
})
