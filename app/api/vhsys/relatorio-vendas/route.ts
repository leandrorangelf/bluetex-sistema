import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { VhsysClient } from '@/lib/vhsys/client'
import { getVhsysConfig } from '@/lib/vhsys/config'
import { isoDate, money } from '@/lib/vhsys/normalizers'

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

function pedidoValido(order: Record<string, unknown>): boolean {
  const status = String(order.status_pedido ?? '').trim().toLocaleLowerCase('pt-BR')
  const lixeira = String(order.lixeira ?? 'Nao').trim().toLocaleLowerCase('pt-BR')
  const data = isoDate(order.data_pedido ?? order.data_emissao)
  return lixeira !== 'sim'
    && !status.includes('cancel')
    && STATUS_OK.some((s) => status.includes(s))
    && data !== null
}

interface LinhaRelatorio {
  cliente: string
  produto: string
  mes: string
  qtd_caixas: number
  valor: number
}

export async function GET() {
  const supabase = await createServerSupabase()
  try {
    await requireVhsysAdmin(supabase)

    const client = new VhsysClient(getVhsysConfig())
    const pedidos = await client.list<Record<string, unknown>>('/pedidos')
    const validos = pedidos.filter(pedidoValido)

    const porChave = new Map<string, LinhaRelatorio>()
    for (const pedido of validos) {
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
        const qtd = Number(item.qtde_produto ?? 0)
        const valor = money(item.valor_total_produto)

        const linha = porChave.get(chave)
        if (linha) {
          linha.qtd_caixas += qtd
          linha.valor = Math.round((linha.valor + valor) * 100) / 100
        } else {
          porChave.set(chave, { cliente, produto, mes, qtd_caixas: qtd, valor })
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
      total_pedidos_considerados: validos.length,
      total_pedidos_ignorados: pedidos.length - validos.length,
      linhas,
    })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    const code = error instanceof Error ? error.message : 'VHSYS_ERRO'
    return Response.json({ error: code }, { status: 502 })
  }
}
