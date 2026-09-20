import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { buscarRegistroVendas } from '@/lib/vhsys/registro-vendas'
import { vhsysUnidadePorCodigo } from '@/lib/vhsys/unidades'

// Unidade com muito histórico pode passar dos 300s padrão da função —
// mesmo teto usado no relatório de vendas.
export const maxDuration = 800

// Busca o histórico completo de vendas no VHSYS, item a item, e grava em
// btx_vhsys_registro_vendas — tabela só de relatório pra exibir na aba
// Vendas, não aciona nenhum trigger de estoque. Substitui por completo o
// que já estava salvo pra esse escopo (ano+mês, só ano, ou a unidade
// inteira com ano=todos).
// POST /api/vhsys/registro-vendas/sincronizar?unidade=CODIGO&ano=YYYY|todos&mes=YYYY-MM (admin)
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

    const linhas = await buscarRegistroVendas(supabase, unidade, ano, mes)

    let deleteQuery = supabase
      .from('btx_vhsys_registro_vendas')
      .delete()
      .eq('unidade_codigo', unidade.codigo)
    if (mes) {
      const [anoMes, mesNum] = mes.split('-').map(Number)
      const proximoMes = mesNum === 12 ? `${anoMes + 1}-01-01` : `${anoMes}-${String(mesNum + 1).padStart(2, '0')}-01`
      deleteQuery = deleteQuery.gte('data_venda', `${mes}-01`).lt('data_venda', proximoMes)
    } else if (ano) {
      deleteQuery = deleteQuery.gte('data_venda', `${ano}-01-01`).lt('data_venda', `${Number(ano) + 1}-01-01`)
    }
    const { error: deleteError } = await deleteQuery
    if (deleteError) throw new Error('SUPABASE_DELETE_FALHOU')

    const agora = new Date().toISOString()
    const linhasInsert = linhas.map((linha) => ({
      unidade: unidade.unidade,
      unidade_codigo: unidade.codigo,
      pedido_vhsys_id: linha.pedidoVhsysId,
      numero_nf: linha.numeroNf,
      cliente: linha.cliente,
      data_venda: linha.dataVenda,
      produto_texto: linha.produtoTexto,
      produto_id: linha.produtoId,
      qtd_caixas: linha.qtdCaixas,
      qtd_bruta_vhsys: linha.qtdBrutaVhsys,
      valor: linha.valor,
      sem_conversao: linha.semConversao,
      sincronizado_em: agora,
    }))

    const TAMANHO_LOTE = 500
    for (let i = 0; i < linhasInsert.length; i += TAMANHO_LOTE) {
      const lote = linhasInsert.slice(i, i + TAMANHO_LOTE)
      const { error: insertError } = await supabase.from('btx_vhsys_registro_vendas').insert(lote)
      if (insertError) throw new Error('SUPABASE_INSERT_FALHOU')
    }

    return Response.json({ total_linhas: linhasInsert.length, sincronizado_em: agora })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    const code = error instanceof Error ? error.message : 'VHSYS_ERRO'
    console.error('[registro-vendas/sincronizar]', code, error)
    return Response.json({ error: code }, { status: 502 })
  }
}
