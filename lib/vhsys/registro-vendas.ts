import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { VhsysClient } from './client'
import { getVhsysConfig } from './config'
import { isoDate, money } from './normalizers'
import { melhorMatch, tokens, type LocalProduto } from './produto-match'
import type { VhsysUnidade } from './unidades'

const STATUS_OK = ['atendido', 'faturado', 'emitido', 'concluido', 'concluído']

interface VhsysOrderItem {
  id_produto?: number | string
  desc_produto?: string
  qtde_produto?: number | string
  valor_total_produto?: number | string
}

function pedidoValido(order: Record<string, unknown>): boolean {
  const status = String(order.status_pedido ?? '').trim().toLocaleLowerCase('pt-BR')
  const lixeira = String(order.lixeira ?? 'Nao').trim().toLocaleLowerCase('pt-BR')
  const data = isoDate(order.data_pedido ?? order.data_emissao)
  return lixeira !== 'sim'
    && !status.includes('cancel')
    && STATUS_OK.some((s) => status.includes(s))
    && data !== null
}

export interface LinhaRegistroVendas {
  pedidoVhsysId: string
  numeroNf: string | null
  cliente: string
  dataVenda: string
  produtoTexto: string
  produtoId: string | null
  qtdCaixas: number
  qtdBrutaVhsys: number
  valor: number
  semConversao: boolean
}

interface ProdutoLocal extends LocalProduto { fator_conversao: number }

// Histórico completo do VHSYS, um registro por item vendido (não agregado
// por mês) — pra exibir na aba Vendas como extrato consultável. Somente
// leitura no VHSYS: não grava nada lá, e não move estoque/saldo — quem
// grava (ou não) o resultado aqui é o chamador, numa tabela de relatório
// separada de btx_vendas.
export async function buscarRegistroVendas(
  supabase: SupabaseClient,
  unidade: VhsysUnidade,
  ano: string | null,
  mes: string | null = null,
): Promise<LinhaRegistroVendas[]> {
  const { data: produtosRaw } = await supabase
    .from('btx_produtos')
    .select('id,nome,fator_conversao')
    .eq('ativo', true)
  const produtosLocais: ProdutoLocal[] = (produtosRaw ?? []).map((p) => {
    const row = p as { id: unknown; nome: unknown; fator_conversao: unknown }
    const nome = String(row.nome)
    return { id: String(row.id), nome, _tokens: tokens(nome), fator_conversao: Number(row.fator_conversao) || 1 }
  })
  const fatorPorDescricao = new Map<string, { id: string; fator: number } | null>()

  const client = new VhsysClient(getVhsysConfig(unidade.codigo))
  const pedidos = await client.list<Record<string, unknown>>('/pedidos')
  const validos = pedidos.filter(pedidoValido)

  const validosNoAno = ano
    ? validos.filter((pedido) => isoDate(pedido.data_pedido ?? pedido.data_emissao)!.startsWith(ano))
    : validos
  const validosNoPeriodo = mes
    ? validosNoAno.filter((pedido) => isoDate(pedido.data_pedido ?? pedido.data_emissao)!.startsWith(mes))
    : validosNoAno

  const linhas: LinhaRegistroVendas[] = []
  for (const pedido of validosNoPeriodo) {
    const cliente = String(pedido.nome_cliente ?? 'Sem cliente').trim() || 'Sem cliente'
    const dataVenda = isoDate(pedido.data_pedido ?? pedido.data_emissao)!
    const numeroNf = String(pedido.numero_nfe ?? pedido.numero_nf ?? '').trim() || null
    const internalId = String(pedido.id_ped ?? pedido.id_pedido)
    const pedidoVhsysId = String(pedido.id_pedido ?? pedido.id_ped)
    const itens = await client.list<VhsysOrderItem>(`/pedidos/${encodeURIComponent(internalId)}/produtos`)

    for (const item of itens) {
      const produtoTexto = String(item.desc_produto ?? 'Sem produto').trim() || 'Sem produto'
      const qtdBruta = Number(item.qtde_produto ?? 0)
      const valor = money(item.valor_total_produto)

      if (!fatorPorDescricao.has(produtoTexto)) {
        const match = melhorMatch(produtoTexto, produtosLocais)
        const local = match ? produtosLocais.find((p) => p.id === match.id) : null
        fatorPorDescricao.set(produtoTexto, local ? { id: local.id, fator: local.fator_conversao } : null)
      }
      const matchInfo = fatorPorDescricao.get(produtoTexto) ?? null
      const qtd = matchInfo ? qtdBruta / matchInfo.fator : qtdBruta

      linhas.push({
        pedidoVhsysId,
        numeroNf,
        cliente,
        dataVenda,
        produtoTexto,
        produtoId: matchInfo?.id ?? null,
        qtdCaixas: Math.round(qtd * 100) / 100,
        qtdBrutaVhsys: qtdBruta,
        valor,
        semConversao: matchInfo === null,
      })
    }
  }

  return linhas
}
