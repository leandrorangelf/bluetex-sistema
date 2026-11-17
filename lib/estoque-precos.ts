import type { createClient } from '@/lib/supabase'
import {
  calcularPrecoMedioVenda, calcularPrecoMedioVendaHistorico, mesclarPrecoMedioVenda, preencherPrecosSemVenda,
  type LinhaHistoricoVendaVhsys, type VendaEstoqueDb,
} from '@/lib/estoque'
import { VHSYS_UNIDADES } from '@/lib/vhsys/unidades'

type Sb = ReturnType<typeof createClient>

// Preço médio de venda por produto e unidade — fonte única do Painel e da tela Estoque, pra o valor de
// estoque bater nas duas. Venda ativa do sistema tem prioridade; o histórico do VHSYS completa; quem
// ainda ficar sem preço usa a média das outras unidades do grupo (marcado em `estimados`).
export async function carregarPrecoMedioVendaPorUnidade(
  sb: Sb,
  produtos: { id: string; nome: string; fatorConversao: number }[],
  unidades: string[],
) {
  const comCodigo = unidades
    .map(unidade => ({ unidade, codigo: VHSYS_UNIDADES.find(u => u.unidade === unidade)?.codigo }))
    .filter((item): item is { unidade: string; codigo: string } => Boolean(item.codigo))

  const [vendasRes, historicoRes] = await Promise.all([
    sb.from('btx_vendas').select('unidade, itens:btx_vendas_itens(produto_id,qtd_carteiras,valor)').eq('ativo', true).in('unidade', unidades),
    // uma consulta por unidade: numa só (.in) o Supabase corta a resposta em 1.000 linhas
    Promise.all(comCodigo.map(item => sb.from('btx_vhsys_vendas_historico').select('produto,qtd_caixas,valor').eq('unidade_codigo', item.codigo))),
  ])
  const vendas = (vendasRes.data ?? []) as unknown as (VendaEstoqueDb & { unidade: string })[]

  const porProduto = new Map<string, Record<string, number>>()
  for (const unidade of unidades) {
    const indice = comCodigo.findIndex(item => item.unidade === unidade)
    const historico = indice >= 0 ? ((historicoRes[indice].data ?? []) as LinhaHistoricoVendaVhsys[]) : []
    const precoUnidade = mesclarPrecoMedioVenda(
      calcularPrecoMedioVenda(vendas.filter(venda => venda.unidade === unidade)),
      calcularPrecoMedioVendaHistorico(historico, produtos),
    )
    for (const [produtoId, preco] of precoUnidade) {
      const atual = porProduto.get(produtoId) ?? {}
      atual[unidade] = preco
      porProduto.set(produtoId, atual)
    }
  }
  return preencherPrecosSemVenda(porProduto, produtos.map(produto => produto.id), unidades)
}
