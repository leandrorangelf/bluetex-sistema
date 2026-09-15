import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { VhsysClient } from '@/lib/vhsys/client'
import { getVhsysConfig } from '@/lib/vhsys/config'
import { isoDate, money } from '@/lib/vhsys/normalizers'
import { melhorMatch, tokens, type LocalProduto } from '@/lib/vhsys/produto-match'
import { vhsysUnidadePorCodigo } from '@/lib/vhsys/unidades'

// Relatório de vendas por cliente/produto/mês direto da API do VHSYS, todo o
// histórico (sem o filtro de marco zero usado no fluxo de sincronização).
// Somente leitura: não grava nada no banco nem passa pelos triggers de
// estoque. Uso: GET /api/vhsys/relatorio-vendas (admin).
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

interface LinhaRelatorio {
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

export async function GET(request: Request) {
  const supabase = await createServerSupabase()
  try {
    await requireVhsysAdmin(supabase)
    const url = new URL(request.url)
    const unidade = vhsysUnidadePorCodigo(url.searchParams.get('unidade') ?? '')
    if (!unidade) {
      return Response.json({ error: 'unidade inválida' }, { status: 400 })
    }
    const anoParam = url.searchParams.get('ano')
    const ano = anoParam && /^\d{4}$/.test(anoParam) ? anoParam : null

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
    // histórico isso demora/estoura timeout. Filtrar por ano antes evita
    // fazer essa busca cara pra pedidos que nem vão entrar no relatório.
    const validosNoAno = ano
      ? validos.filter((pedido) => isoDate(pedido.data_pedido ?? pedido.data_emissao)!.startsWith(ano))
      : validos

    const porChave = new Map<string, LinhaRelatorio>()
    for (const pedido of validosNoAno) {
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

    // total de caixas do cliente naquele mês, somando todos os produtos —
    // repetido em cada linha do grupo, pra dar contexto do volume total.
    const totalPorClienteMes = new Map<string, number>()
    for (const linha of porChave.values()) {
      const chaveGrupo = `${linha.cliente}::${linha.mes}`
      totalPorClienteMes.set(chaveGrupo, (totalPorClienteMes.get(chaveGrupo) ?? 0) + linha.qtd_caixas)
    }

    const linhas = [...porChave.values()]
      .map((linha) => ({
        ...linha,
        caixas_total_mes: totalPorClienteMes.get(`${linha.cliente}::${linha.mes}`) ?? linha.qtd_caixas,
      }))
      .sort((a, b) => (
        a.cliente !== b.cliente ? a.cliente.localeCompare(b.cliente, 'pt-BR')
          : a.mes !== b.mes ? a.mes.localeCompare(b.mes)
            : a.produto.localeCompare(b.produto, 'pt-BR')
      ))

    return Response.json({
      ano_selecionado: ano,
      total_pedidos_considerados: validosNoAno.length,
      total_pedidos_ignorados: validos.length - validosNoAno.length + Object.values(motivosExclusao).reduce((a, b) => a + b, 0),
      pedidos_fora_do_ano: validos.length - validosNoAno.length,
      motivos_exclusao: motivosExclusao,
      data_mais_antiga: dataMaisAntiga,
      data_mais_recente: dataMaisRecente,
      linhas,
    })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    const code = error instanceof Error ? error.message : 'VHSYS_ERRO'
    console.error('[relatorio-vendas]', code, error)
    return Response.json({ error: code }, { status: 502 })
  }
}
