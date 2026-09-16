import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { buscarRelatorioVendas } from '@/lib/vhsys/relatorio-vendas'
import { vhsysUnidadePorCodigo } from '@/lib/vhsys/unidades'

// Unidade com muito histórico (ex.: GB SP) pode passar dos 300s padrão da
// função — busca os itens pedido a pedido. 800s é o teto do plano Pro com
// Fluid Compute; ainda assim, pra unidade muito grande, sincronizar por mês
// (parâmetro `mes`) é mais seguro que o ano inteiro de uma vez.
export const maxDuration = 800

// Busca o histórico de vendas no VHSYS e grava agregado (cliente/produto/mês)
// em btx_vhsys_vendas_historico — separado de btx_vendas de propósito, não
// aciona nenhum trigger de estoque. Substitui por completo o que já estava
// salvo pra esse escopo (ano+mês, só ano, ou a unidade inteira com
// ano=todos), pra refletir cancelamentos/edições feitas no VHSYS desde a
// última sincronização.
// POST /api/vhsys/relatorio-vendas/sincronizar?unidade=CODIGO&ano=YYYY|todos&mes=YYYY-MM (admin)
export async function POST(request: Request) {
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
    const mesParam = url.searchParams.get('mes')
    const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : null

    const resultado = await buscarRelatorioVendas(supabase, unidade, ano, mes)

    let deleteQuery = supabase
      .from('btx_vhsys_vendas_historico')
      .delete()
      .eq('unidade_codigo', unidade.codigo)
    if (mes) {
      deleteQuery = deleteQuery.eq('mes', mes)
    } else if (ano) {
      deleteQuery = deleteQuery.like('mes', `${ano}-%`)
    }
    const { error: deleteError } = await deleteQuery
    if (deleteError) throw new Error('SUPABASE_DELETE_FALHOU')

    const agora = new Date().toISOString()
    const linhas = resultado.linhas.map((linha) => ({
      unidade_codigo: unidade.codigo,
      cliente: linha.cliente,
      produto: linha.produto,
      mes: linha.mes,
      qtd_caixas: linha.qtd_caixas,
      qtd_bruta_vhsys: linha.qtd_bruta_vhsys,
      valor: linha.valor,
      sem_conversao: linha.sem_conversao,
      sincronizado_em: agora,
    }))

    const TAMANHO_LOTE = 500
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
      const lote = linhas.slice(i, i + TAMANHO_LOTE)
      const { error: insertError } = await supabase.from('btx_vhsys_vendas_historico').insert(lote)
      if (insertError) throw new Error('SUPABASE_INSERT_FALHOU')
    }

    return Response.json({
      unidade: unidade.codigo,
      ano_selecionado: resultado.anoSelecionado,
      linhas_gravadas: linhas.length,
      total_pedidos_considerados: resultado.totalPedidosConsiderados,
      sincronizado_em: agora,
    })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    const code = error instanceof Error ? error.message : 'VHSYS_ERRO'
    console.error('[relatorio-vendas/sincronizar]', code, error)
    return Response.json({ error: code }, { status: 502 })
  }
}
