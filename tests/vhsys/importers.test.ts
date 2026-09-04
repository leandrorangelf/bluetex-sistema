// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

describe('importadores VHSYS', () => {
  it('mantém vendas faturadas desde o marco e carrega seus itens', async () => {
    const client = {
      list: vi.fn(async (path: string) => {
        if (path === '/pedidos') {
          return [
            { id_ped: 11, id_pedido: 1, data_pedido: '2026-08-31', status_pedido: 'Atendido' },
            {
              id_ped: 22,
              id_pedido: 2,
              data_pedido: '2026-09-01',
              status_pedido: 'Atendido',
              nome_cliente: 'Cliente A',
              valor_total_nota: '50.00',
            },
            { id_ped: 33, id_pedido: 3, data_pedido: '2026-09-02', status_pedido: 'Cancelado' },
            { id_ped: 44, id_pedido: 4, data_pedido: '2026-09-03', status_pedido: 'Atendido', lixeira: 'Sim' },
          ]
        }
        if (path === '/pedidos/22/produtos') {
          return [{
            id_produto: 9,
            desc_produto: 'Produto A',
            qtde_produto: '2',
            valor_total_produto: '50.00',
          }]
        }
        return []
      }),
    }
    const { importVendas } = await import('@/lib/vhsys/importers/vendas')

    const result = await importVendas(client as never)

    expect(result.map(item => item.externalId)).toEqual(['2'])
    expect(result[0].data.itens).toEqual([{
      produto_vhsys_id: '9',
      produto_nome: 'Produto A',
      quantidade: 2,
      valor: 50,
    }])
  })

  it('traz título aberto e liquidado (pra propagar baixa), no marco zero e com valor relevante', async () => {
    const client = {
      list: vi.fn().mockResolvedValue([
        { id_conta_rec: 1, liquidado_rec: 'Nao', valor_rec: '100.00', vencimento_rec: '2026-09-10', nome_cliente: 'BIANCA ROCHA' },
        { id_conta_rec: 2, liquidado_rec: 'Sim', valor_rec: '80.00', vencimento_rec: '2026-09-10', data_pagamento: '2026-09-05' },
        { id_conta_rec: 3, liquidado_rec: 'Nao', valor_rec: '50.00', vencimento_rec: '2026-08-01' },
        { id_conta_rec: 4, liquidado_rec: 'Nao', valor_rec: '0.06', vencimento_rec: '2026-09-15' },
        { id_conta_rec: 5, liquidado_rec: 'Nao', valor_rec: '90.00', vencimento_rec: '2026-09-15', lixeira: 'Sim' },
        { id_conta_rec: 6, liquidado_rec: 'Nao', valor_rec: '90.00', vencimento_rec: '2026-09-15', situacao: 'Conta estornada.' },
      ]),
    }
    const { importReceber } = await import('@/lib/vhsys/importers/financeiro')

    const result = await importReceber(client as never)

    expect(result.map((r) => r.externalId)).toEqual(['1', '2'])
    expect(result[0].data).toEqual(expect.objectContaining({
      status: 'pendente', liquidado: false, pessoa_nome: 'BIANCA ROCHA', observacoes: 'BIANCA ROCHA',
    }))
    expect(result[1].data).toEqual(expect.objectContaining({
      status: 'pago', liquidado: true, data_pagamento: '2026-09-05',
    }))
  })

  it('retorna somente contas Santander ativas', async () => {
    const client = {
      list: vi.fn().mockResolvedValue([
        {
          id_banco_cad: 1,
          numero_banco: '033',
          status_banco: 'Ativo',
          nome_banco_cad: 'Santander',
          saldo_atual: '50.10',
        },
        {
          id_banco_cad: 2,
          numero_banco: '001',
          status_banco: 'Ativo',
          saldo_atual: '99.00',
        },
      ]),
    }
    const { importBancos } = await import('@/lib/vhsys/importers/bancos')

    const result = await importBancos(client as never)

    expect(result).toHaveLength(1)
    expect(result[0].data.saldo_atual).toBe(50.1)
  })

  it('usa a posição atual dos produtos ativos como estoque', async () => {
    const client = {
      list: vi.fn().mockResolvedValue([
        {
          id_produto: 10,
          desc_produto: 'Produto A',
          status_produto: 'Ativo',
          estoque_produto: '12',
        },
        {
          id_produto: 20,
          desc_produto: 'Produto B',
          status_produto: 'Inativo',
          estoque_produto: '99',
        },
      ]),
    }
    const { importEstoque } = await import('@/lib/vhsys/importers/estoque')

    const result = await importEstoque(client as never)

    expect(result).toHaveLength(1)
    expect(result[0].data.quantidade_atual).toBe(12)
  })

  it('isola a falha de um domínio sem descartar os demais', async () => {
    const { runDomainImporters } = await import('@/lib/vhsys/importers')
    const results = await runDomainImporters({} as never, [
      ['vendas', async () => [{ domain: 'vendas', externalId: '1', data: {} }]],
      ['compras', async () => { throw new Error('VHSYS_HTTP_403') }],
    ])

    expect(results).toEqual([
      {
        domain: 'vendas',
        items: [{ domain: 'vendas', externalId: '1', data: {} }],
        error: null,
      },
      { domain: 'compras', items: [], error: 'VHSYS_HTTP_403' },
    ])
  })
})
