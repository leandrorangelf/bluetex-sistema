import { describe, expect, it } from 'vitest'
import { calcularPrecoMedioVendaHistorico, type LinhaHistoricoVendaVhsys } from '@/lib/estoque'

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
