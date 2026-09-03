// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildAnalysisItems } from '@/lib/vhsys/analyze'

describe('buildAnalysisItems', () => {
  it('define decisões automáticas apenas para casos seguros', () => {
    const rows = buildAnalysisItems(
      [{
        domain: 'vendas',
        error: null,
        items: [
          { domain: 'vendas', externalId: 'new', data: { valor_total: 10 } },
          { domain: 'vendas', externalId: 'duplicate', data: {
            data: '2026-07-10',
            pessoa_nome: 'Cliente',
            valor_total: 20,
          } },
        ],
      }],
      {
        vendas: [{
          id: 'local',
          vhsys_id: null,
          numero_documento: null,
          documento_pessoa: null,
          data: '2026-07-10',
          pessoa_nome: 'Cliente',
          valor_total: 20,
        }],
      },
    )

    expect(rows[0].decisao).toBe('importar')
    expect(rows[1].classificacao).toBe('possivel_duplicidade')
    expect(rows[1].decisao).toBeNull()
  })

  it('transforma falha de domínio em item auditável sanitizado', () => {
    const rows = buildAnalysisItems(
      [{ domain: 'pagar', items: [], error: 'VHSYS_HTTP_403' }],
      {},
    )
    expect(rows).toEqual([expect.objectContaining({
      dominio: 'pagar',
      vhsys_id: 'erro:pagar',
      classificacao: 'erro',
      erro_sanitizado: 'VHSYS_HTTP_403',
    })])
  })

  it('ignora título histórico pago, mas atualiza o pago já vinculado', () => {
    const rows = buildAnalysisItems([{
      domain: 'receber',
      error: null,
      items: [
        { domain: 'receber', externalId: 'antigo', data: { liquidado: true } },
        { domain: 'receber', externalId: 'vinculado', data: { liquidado: true } },
      ],
    }], {
      receber: [{
        id: 'local',
        vhsys_id: 'vinculado',
        numero_documento: null,
        documento_pessoa: null,
        data: null,
        pessoa_nome: null,
        valor_total: 0,
      }],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(expect.objectContaining({
      vhsys_id: 'vinculado',
      classificacao: 'ja_vinculado',
      decisao: 'vincular',
    }))
  })
})
