// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { melhorMatch, tokens, type LocalProduto } from '@/lib/vhsys/produto-match'

const locais: LocalProduto[] = [
  'GUDANG RED', 'GUDANG GREEN', 'GUDANG TWIN TEN', 'CRETEC MENTA', 'CRETEC CEREJA',
].map((nome) => ({ id: nome, nome, _tokens: tokens(nome) }))

describe('mapa de produtos VHSYS', () => {
  it('casa nomes do VHSYS com o produto local certo', () => {
    expect(melhorMatch('El Poncio Gudang Red GTIN-8 78946552', locais)?.id).toBe('GUDANG RED')
    expect(melhorMatch('El Poncio Gudang Green', locais)?.id).toBe('GUDANG GREEN')
    expect(melhorMatch('El Poncio Gudang Garam Twin Ten Red', locais)?.id).toBe('GUDANG TWIN TEN')
    expect(melhorMatch('Cretec Cereja', locais)?.id).toBe('CRETEC CEREJA')
  })

  it('não casa produto que não é nosso', () => {
    expect(melhorMatch('Clean By Click', locais)).toBeNull()
    expect(melhorMatch('El Poncio Ignite', locais)).toBeNull()
    expect(melhorMatch('Tabaco Quebec Baunilha 25G', locais)).toBeNull()
  })
})
