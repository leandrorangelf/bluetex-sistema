import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { vhsysUnidadePorCodigo } from '@/lib/vhsys/unidades'

// Lê o histórico de vendas já sincronizado (btx_vhsys_vendas_historico) —
// rápido, sem chamar o VHSYS. Filtros: unidade (obrigatório), ano, cliente,
// produto (os dois últimos por trecho, sem diferenciar maiúsculas/acentos
// exatos — usa ILIKE do Postgres).
// GET /api/vhsys/relatorio-vendas/historico?unidade=CODIGO&ano=YYYY&cliente=...&produto=... (admin)
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
    const cliente = url.searchParams.get('cliente')?.trim() || null
    const produto = url.searchParams.get('produto')?.trim() || null

    let query = supabase
      .from('btx_vhsys_vendas_historico')
      .select('cliente,produto,mes,qtd_caixas,qtd_bruta_vhsys,valor,sem_conversao,sincronizado_em')
      .eq('unidade_codigo', unidade.codigo)
      .order('cliente').order('mes').order('produto')
    if (ano) query = query.like('mes', `${ano}-%`)
    if (cliente) query = query.ilike('cliente', `%${cliente}%`)
    if (produto) query = query.ilike('produto', `%${produto}%`)

    const { data, error } = await query
    if (error) throw new Error('SUPABASE_QUERY_FALHOU')

    const linhas = (data ?? []) as {
      cliente: string; produto: string; mes: string
      qtd_caixas: number; qtd_bruta_vhsys: number; valor: number; sem_conversao: boolean
      sincronizado_em: string
    }[]

    const totalPorClienteMes = new Map<string, number>()
    for (const linha of linhas) {
      const chave = `${linha.cliente}::${linha.mes}`
      totalPorClienteMes.set(chave, (totalPorClienteMes.get(chave) ?? 0) + Number(linha.qtd_caixas))
    }

    const ultimaSincronizacao = linhas.reduce<string | null>(
      (max, linha) => (max === null || linha.sincronizado_em > max ? linha.sincronizado_em : max),
      null,
    )

    return Response.json({
      ultima_sincronizacao: ultimaSincronizacao,
      total_linhas: linhas.length,
      valor_total: linhas.reduce((soma, l) => soma + Number(l.valor), 0),
      linhas: linhas.map((linha) => ({
        ...linha,
        qtd_caixas: Number(linha.qtd_caixas),
        qtd_bruta_vhsys: Number(linha.qtd_bruta_vhsys),
        valor: Number(linha.valor),
        caixas_total_mes: totalPorClienteMes.get(`${linha.cliente}::${linha.mes}`) ?? Number(linha.qtd_caixas),
      })),
    })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    const code = error instanceof Error ? error.message : 'ERRO'
    console.error('[relatorio-vendas/historico]', code, error)
    return Response.json({ error: code }, { status: 500 })
  }
}
