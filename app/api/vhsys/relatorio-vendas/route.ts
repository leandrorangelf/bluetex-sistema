import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { VhsysClient } from '@/lib/vhsys/client'
import { getVhsysConfig } from '@/lib/vhsys/config'
import { isoDate, money } from '@/lib/vhsys/normalizers'

// Relatório de vendas por cliente/mês direto da API do VHSYS, todo o
// histórico (sem o filtro de marco zero usado no fluxo de sincronização).
// Somente leitura: não grava nada no banco nem passa pelos triggers de
// estoque. Uso: GET /api/vhsys/relatorio-vendas (admin).
const STATUS_OK = ['atendido', 'faturado', 'emitido', 'concluido', 'concluído']

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
  mes: string
  qtd_vendas: number
  total_vendido: number
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
      const chave = `${cliente}::${mes}`
      const valor = money(pedido.valor_total_nota)

      const linha = porChave.get(chave)
      if (linha) {
        linha.qtd_vendas += 1
        linha.total_vendido = Math.round((linha.total_vendido + valor) * 100) / 100
      } else {
        porChave.set(chave, { cliente, mes, qtd_vendas: 1, total_vendido: valor })
      }
    }

    const linhas = [...porChave.values()].sort((a, b) => (
      a.cliente === b.cliente ? a.mes.localeCompare(b.mes) : a.cliente.localeCompare(b.cliente, 'pt-BR')
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
