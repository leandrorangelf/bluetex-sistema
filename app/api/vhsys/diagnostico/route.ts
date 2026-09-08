import { createServerSupabase } from '@/lib/supabase-server'
import { requireVhsysAdmin, VhsysAuthError } from '@/lib/vhsys/auth'
import { VhsysClient } from '@/lib/vhsys/client'
import { getVhsysConfig } from '@/lib/vhsys/config'
import { avaliarFinanceiro } from '@/lib/vhsys/importers/financeiro'

// Compara o VHSYS com o que está no nosso sistema e explica o que não veio.
// GET /api/vhsys/diagnostico  (admin, somente leitura)

async function analisarDominio(
  client: VhsysClient,
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  domain: 'receber' | 'pagar',
) {
  const path = domain === 'receber' ? '/contas-receber' : '/contas-pagar'
  const rows = await client.list<Record<string, unknown>>(path)
  const avaliadas = avaliarFinanceiro(rows, domain)

  const { data: locais } = await supabase
    .from('btx_parcelas')
    .select('vhsys_id,status,valor')
    .eq('tipo', domain)
    .eq('origem_sistema', 'vhsys')
  const locaisPorId = new Map(
    (locais ?? []).map((l) => [String((l as { vhsys_id: unknown }).vhsys_id), l]),
  )

  const deveriaEntrar = avaliadas.filter((a) => a.motivo_exclusao === null)
  const faltando = deveriaEntrar.filter((a) => !locaisPorId.has(a.vhsys_id))
  const excluidas = avaliadas.filter((a) => a.motivo_exclusao !== null)

  return {
    total_no_vhsys: rows.length,
    passam_no_filtro: deveriaEntrar.length,
    no_nosso_sistema: locaisPorId.size,
    faltando_importar: faltando.length,
    faltando: faltando.slice(0, 50),
    excluidas_e_motivo: excluidas.slice(0, 50),
  }
}

export async function GET() {
  const supabase = await createServerSupabase()
  try {
    await requireVhsysAdmin(supabase)
    const client = new VhsysClient(getVhsysConfig())
    const [receber, pagar] = await Promise.all([
      analisarDominio(client, supabase, 'receber'),
      analisarDominio(client, supabase, 'pagar'),
    ])
    return Response.json({ receber, pagar })
  } catch (error) {
    if (error instanceof VhsysAuthError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'VHSYS_ERRO' },
      { status: 502 },
    )
  }
}
