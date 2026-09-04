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

  it('só considera produto de estoque que está no mapa', () => {
    const results = [{
      domain: 'estoque' as const,
      error: null,
      items: [
        { domain: 'estoque' as const, externalId: '111', data: { produto_nome: 'A' } },
        { domain: 'estoque' as const, externalId: '222', data: { produto_nome: 'B' } },
      ],
    }]
    expect(buildAnalysisItems(results, {}, new Set())).toHaveLength(0)
    expect(buildAnalysisItems(results, {}, new Set(['111'])).map((r) => r.vhsys_id))
      .toEqual(['111'])
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

  it('traz título liquidado tanto novo quanto já vinculado (importador já corta pelo marco zero)', () => {
    const rows = buildAnalysisItems([{
      domain: 'receber',
      error: null,
      items: [
        { domain: 'receber', externalId: 'novo-pago', data: { liquidado: true, valor_total: 50 } },
        { domain: 'receber', externalId: 'vinculado', data: { liquidado: true, valor_total: 0 } },
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

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.vhsys_id === 'novo-pago')).toEqual(expect.objectContaining({
      classificacao: 'novo', decisao: 'importar',
    }))
    expect(rows.find((r) => r.vhsys_id === 'vinculado')).toEqual(expect.objectContaining({
      classificacao: 'ja_vinculado', decisao: 'vincular',
    }))
  })
})
