// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { reconcileItem } from '@/lib/vhsys/reconcile'

const external = {
  domain: 'vendas' as const,
  externalId: '10',
  data: {
    numero_documento: '100',
    documento_pessoa: '12345678000199',
    data: '2026-07-10',
    pessoa_nome: 'Cliente A',
    valor_total: 250,
  },
}

describe('reconcileItem', () => {
  it('prioriza vínculo por ID VHSYS', () => {
    const result = reconcileItem(external, [{
      id: 'local-1',
      vhsys_id: '10',
      numero_documento: null,
      documento_pessoa: null,
      data: null,
      pessoa_nome: null,
      valor_total: 0,
    }])
    expect(result.classification).toBe('ja_vinculado')
  })

  it('reconhece documento, CNPJ e valor como correspondência exata', () => {
    const result = reconcileItem(external, [{
      id: 'local-2',
      vhsys_id: null,
      numero_documento: '100',
      documento_pessoa: '12345678000199',
      data: '2026-07-09',
      pessoa_nome: 'Outro',
      valor_total: 250,
    }])
    expect(result.classification).toBe('correspondencia_exata')
  })

  it('marca data, pessoa e valor como possível duplicidade', () => {
    const result = reconcileItem(external, [{
      id: 'local-3',
      vhsys_id: null,
      numero_documento: null,
      documento_pessoa: null,
      data: '2026-07-10',
      pessoa_nome: ' cliente a ',
      valor_total: 250,
    }])
    expect(result.classification).toBe('possivel_duplicidade')
  })

  it('não considera documentos vazios uma correspondência exata', () => {
    const withoutDocuments = {
      ...external,
      data: { ...external.data, numero_documento: '', documento_pessoa: '' },
    }
    const result = reconcileItem(withoutDocuments, [{
      id: 'local-4',
      vhsys_id: null,
      numero_documento: '',
      documento_pessoa: '',
      data: '2026-07-11',
      pessoa_nome: 'Outro',
      valor_total: 250,
    }])
    expect(result.classification).toBe('novo')
  })

  it('classifica ausência de candidato como novo', () => {
    expect(reconcileItem(external, []).classification).toBe('novo')
  })
})
