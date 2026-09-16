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

type MotivoExclusao = 'lixeira' | 'cancelado' | 'status_invalido' | 'sem_data'

function classificarPedido(order: Record<string, unknown>): MotivoExclusao | null {
  const status = String(order.status_pedido ?? '').trim().toLocaleLowerCase('pt-BR')
  const lixeira = String(order.lixeira ?? 'Nao').trim().toLocaleLowerCase('pt-BR')
  const data = isoDate(order.data_pedido ?? order.data_emissao)
  if (lixeira === 'sim') return 'lixeira'
  if (status.includes('cancel')) return 'cancelado'
  if (!STATUS_OK.some((s) => status.includes(s))) return 'status_invalido'
  if (data === null) return 'sem_data'
  return null
}

export interface LinhaRelatorioVendas {
  cliente: string
  produto: string
  mes: string
  qtd_caixas: number
  qtd_bruta_vhsys: number
  valor: number
  sem_conversao: boolean
}

interface ProdutoLocal extends LocalProduto {
  fator_conversao: number
}

// VHSYS devolve qtde_produto em carteiras (unidade base). Converte pra caixas
// usando o fator cadastrado no catálogo local (ex.: Cretec/Gudang Twin Ten =
// 500 carteiras/caixa, Gudang Red/Green = 480). Produto sem correspondência
// local fica sem conversão (mantém carteiras) e é sinalizado.
function buscarFator(desc: string, locais: ProdutoLocal[]): number | null {
  const match = melhorMatch(desc, locais)
  return match ? (locais.find((p) => p.id === match.id)?.fator_conversao ?? null) : null
}

export interface ResultadoRelatorioVendas {
  anoSelecionado: string | null
  totalPedidosConsiderados: number
  totalPedidosIgnorados: number
  pedidosForaDoAno: number
  motivosExclusao: Record<MotivoExclusao, number>
  dataMaisAntiga: string | null
  dataMaisRecente: string | null
  linhas: LinhaRelatorioVendas[]
}

// Busca todo o histórico de pedidos do VHSYS pra uma unidade, agrega por
// cliente/produto/mês e converte carteiras -> caixas usando o catálogo
// local. Somente leitura no VHSYS: não grava nada lá. Quem grava (ou não)
// o resultado aqui no nosso banco é o chamador.
export async function buscarRelatorioVendas(
  supabase: SupabaseClient,
  unidade: VhsysUnidade,
  ano: string | null,
  mes: string | null = null,
): Promise<ResultadoRelatorioVendas> {
  const { data: produtosRaw } = await supabase
    .from('btx_produtos')
    .select('id,nome,fator_conversao')
    .eq('ativo', true)
  const produtosLocais: ProdutoLocal[] = (produtosRaw ?? []).map((p) => {
    const row = p as { id: unknown; nome: unknown; fator_conversao: unknown }
    const nome = String(row.nome)
    return {
      id: String(row.id),
      nome,
      _tokens: tokens(nome),
      fator_conversao: Number(row.fator_conversao) || 1,
    }
  })
  const fatorPorDescricao = new Map<string, number | null>()

  const client = new VhsysClient(getVhsysConfig(unidade.codigo))
  const pedidos = await client.list<Record<string, unknown>>('/pedidos')

  // data mais antiga/recente entre TODOS os pedidos que o VHSYS devolveu
  // (válidos ou não), pra dar pra checar se falta histórico — se um período
  // não aparece aqui, o VHSYS nem devolveu, não é filtro nosso descartando.
  let dataMaisAntiga: string | null = null
  let dataMaisRecente: string | null = null
  const motivosExclusao: Record<MotivoExclusao, number> = {
    lixeira: 0, cancelado: 0, status_invalido: 0, sem_data: 0,
  }
  const validos: Record<string, unknown>[] = []
  for (const pedido of pedidos) {
    const data = isoDate(pedido.data_pedido ?? pedido.data_emissao)
    if (data !== null && (dataMaisAntiga === null || data < dataMaisAntiga)) dataMaisAntiga = data
    if (data !== null && (dataMaisRecente === null || data > dataMaisRecente)) dataMaisRecente = data

    const motivo = classificarPedido(pedido)
    if (motivo) {
      motivosExclusao[motivo] += 1
    } else {
      validos.push(pedido)
    }
  }

  // Buscar os itens é 1 chamada extra por pedido — em unidade com muito
  // histórico isso demora/estoura timeout (a função serverless tem um
  // limite de tempo). Filtrar por ano (e opcionalmente por mês, pra
  // unidade muito grande) antes evita fazer essa busca cara pra pedidos
  // que nem vão entrar no relatório.
  const validosNoAno = ano
    ? validos.filter((pedido) => isoDate(pedido.data_pedido ?? pedido.data_emissao)!.startsWith(ano))
    : validos
  const validosNoPeriodo = mes
    ? validosNoAno.filter((pedido) => isoDate(pedido.data_pedido ?? pedido.data_emissao)!.startsWith(mes))
    : validosNoAno

  const porChave = new Map<string, LinhaRelatorioVendas>()
  for (const pedido of validosNoPeriodo) {
    const cliente = String(pedido.nome_cliente ?? 'Sem cliente').trim() || 'Sem cliente'
    const data = isoDate(pedido.data_pedido ?? pedido.data_emissao)!
    const mes = data.slice(0, 7)
    const internalId = String(pedido.id_ped ?? pedido.id_pedido)
    const itens = await client.list<VhsysOrderItem>(
      `/pedidos/${encodeURIComponent(internalId)}/produtos`,
    )

    for (const item of itens) {
      const produto = String(item.desc_produto ?? 'Sem produto').trim() || 'Sem produto'
      const chave = `${cliente}::${produto}::${mes}`
      const qtdCarteiras = Number(item.qtde_produto ?? 0)
      const valor = money(item.valor_total_produto)

      if (!fatorPorDescricao.has(produto)) {
        fatorPorDescricao.set(produto, buscarFator(produto, produtosLocais))
      }
      const fator = fatorPorDescricao.get(produto) ?? null
      const qtd = fator ? qtdCarteiras / fator : qtdCarteiras
      const semConversao = fator === null

      const linha = porChave.get(chave)
      if (linha) {
        linha.qtd_caixas = Math.round((linha.qtd_caixas + qtd) * 100) / 100
        linha.qtd_bruta_vhsys += qtdCarteiras
        linha.valor = Math.round((linha.valor + valor) * 100) / 100
        linha.sem_conversao = linha.sem_conversao || semConversao
      } else {
        porChave.set(chave, {
          cliente,
          produto,
          mes,
          qtd_caixas: Math.round(qtd * 100) / 100,
          qtd_bruta_vhsys: qtdCarteiras,
          valor,
          sem_conversao: semConversao,
        })
      }
    }
  }

  return {
    anoSelecionado: ano,
    totalPedidosConsiderados: validosNoPeriodo.length,
    totalPedidosIgnorados:
      validos.length - validosNoPeriodo.length + Object.values(motivosExclusao).reduce((a, b) => a + b, 0),
    pedidosForaDoAno: validos.length - validosNoPeriodo.length,
    motivosExclusao,
    dataMaisAntiga,
    dataMaisRecente,
    linhas: [...porChave.values()],
  }
}
