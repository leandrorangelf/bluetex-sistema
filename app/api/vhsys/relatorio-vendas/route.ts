import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { buscarRelatorioVendas } from '@/lib/vhsys/relatorio-vendas'
import { vhsysUnidadePorCodigo } from '@/lib/vhsys/unidades'

// Relatório de vendas por cliente/produto/mês direto da API do VHSYS, todo o
// histórico (sem o filtro de marco zero usado no fluxo de sincronização).
// Somente leitura: não grava nada no banco nem passa pelos triggers de
// estoque. Uso: GET /api/vhsys/relatorio-vendas?unidade=CODIGO&ano=YYYY (admin).
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

    const resultado = await buscarRelatorioVendas(supabase, unidade, ano)

    const totalPorClienteMes = new Map<string, number>()
    for (const linha of resultado.linhas) {
      const chaveGrupo = `${linha.cliente}::${linha.mes}`
      totalPorClienteMes.set(chaveGrupo, (totalPorClienteMes.get(chaveGrupo) ?? 0) + linha.qtd_caixas)
    }

    const linhas = resultado.linhas
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
      ano_selecionado: resultado.anoSelecionado,
      total_pedidos_considerados: resultado.totalPedidosConsiderados,
      total_pedidos_ignorados: resultado.totalPedidosIgnorados,
      pedidos_fora_do_ano: resultado.pedidosForaDoAno,
      motivos_exclusao: resultado.motivosExclusao,
      data_mais_antiga: resultado.dataMaisAntiga,
      data_mais_recente: resultado.dataMaisRecente,
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
