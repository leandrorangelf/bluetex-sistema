import { describe, expect, it } from 'vitest'
import { calcularPrecoMedioVendaHistorico, preencherPrecosSemVenda, type LinhaHistoricoVendaVhsys } from '@/lib/estoque'

describe('preencherPrecosSemVenda', () => {
  const unidades = ['NEW BLUETEX MG', 'NEW BLUETEX SC', 'NEW BLUETEX AM', 'GB SP']

  it('unidade sem preço herda a média das outras do mesmo grupo e é marcada como estimada', () => {
    const { precos, estimados } = preencherPrecosSemVenda(new Map([['p1', { 'NEW BLUETEX MG': 100, 'NEW BLUETEX AM': 200 }]]), ['p1'], unidades)

    expect(precos.get('p1')!['NEW BLUETEX SC']).toBe(150)
    expect(estimados.has('p1|NEW BLUETEX SC')).toBe(true)
    expect(precos.get('p1')!['NEW BLUETEX MG']).toBe(100)
    expect(estimados.has('p1|NEW BLUETEX MG')).toBe(false)
  })

  it('GB não herda preço de NEW BLUETEX (empresas diferentes)', () => {
    const { precos } = preencherPrecosSemVenda(new Map([['p1', { 'NEW BLUETEX MG': 100 }]]), ['p1'], unidades)
    expect(precos.get('p1')!['GB SP']).toBeUndefined()
  })

  it('sem nenhuma referência, continua sem preço', () => {
    const { precos, estimados } = preencherPrecosSemVenda(new Map(), ['p1'], unidades)
    expect(precos.get('p1')).toEqual({})
    expect(estimados.size).toBe(0)
  })
})

const produtosLocais = [{ id: 'p1', nome: 'GUDANG RED', fatorConversao: 480 }]

describe('calcularPrecoMedioVendaHistorico', () => {
  it('ignora linhas com menos de meia caixa (quantidade lançada errada no VHSYS)', () => {
    const normais: LinhaHistoricoVendaVhsys[] = [{ produto: 'El Poncio Gudang Red', qtd_caixas: 10, valor: 77000 }]
    const comErro: LinhaHistoricoVendaVhsys[] = [...normais, { produto: 'El Poncio Gudang Red', qtd_caixas: 0.03, valor: 540000 }]

    expect(calcularPrecoMedioVendaHistorico(comErro, produtosLocais).get('p1'))
      .toBe(calcularPrecoMedioVendaHistorico(normais, produtosLocais).get('p1'))
  })

  it('sem outra venda, o produto fica sem preço em vez de um preço absurdo', () => {
    const soErro: LinhaHistoricoVendaVhsys[] = [{ produto: 'El Poncio Gudang Red', qtd_caixas: 0.03, valor: 540000 }]
    expect(calcularPrecoMedioVendaHistorico(soErro, produtosLocais).has('p1')).toBe(false)
  })

  it('meia caixa ou mais continua valendo', () => {
    const meia: LinhaHistoricoVendaVhsys[] = [{ produto: 'El Poncio Gudang Red', qtd_caixas: 0.5, valor: 3850 }]
    expect(calcularPrecoMedioVendaHistorico(meia, produtosLocais).get('p1')).toBeCloseTo(3850 / (0.5 * 480))
  })
})
