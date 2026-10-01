import type { SupabaseClient } from '@supabase/supabase-js'
import type { VhsysClient } from './client'
import { melhorMatch, tokens, type LocalProduto } from './produto-match'

export interface LinhaMapaProduto {
  vhsys_id_produto: string
  cod_produto: string
  desc_vhsys: string
  produto_id: string | null
  produto_local: string | null
  ignorar: boolean
}

// Casa o catálogo do VHSYS com os produtos locais por nome e grava em
// btx_vhsys_produto_map — é essa tabela que faz compras/estoque do VHSYS
// reconhecerem um produto como "o mesmo" que o cadastrado aqui. Sem rodar
// isso depois de cadastrar um produto novo, as notas/estoque dele ficam
// ignorados pra sempre (ver /api/vhsys/produtos/mapa).
export async function atualizarMapaProdutos(
  supabase: SupabaseClient,
  client: VhsysClient,
  unidade: string,
): Promise<{ ligados: number; ignorados: number; mapa: LinhaMapaProduto[] }> {
  const vhsysProdutos = await client.list<Record<string, unknown>>('/produtos', {}, 250)

  // Todo produto ativo entra como candidato — inclusive o já vinculado antes
  // (origem_sistema vira 'vhsys' assim que um estoque é linkado, ver
  // supabase_schema.sql). Filtrar por manual/null aqui faria o recasamento
  // periódico "esquecer" vínculos antigos e sobrescrever com null.
  const { data: locaisRaw } = await supabase
    .from('btx_produtos')
    .select('id,nome')
    .eq('ativo', true)
  const locais: LocalProduto[] = (locaisRaw ?? []).map((p) => {
    const nome = String((p as { nome: unknown }).nome)
    return { id: String((p as { id: unknown }).id), nome, _tokens: tokens(nome) }
  })

  const linhas: LinhaMapaProduto[] = vhsysProdutos.map((row) => {
    const desc = String(row.desc_produto ?? '')
    const match = melhorMatch(desc, locais)
    return {
      vhsys_id_produto: String(row.id_produto),
      cod_produto: String(row.cod_produto ?? ''),
      desc_vhsys: desc,
      produto_id: match?.id ?? null,
      produto_local: match?.nome ?? null,
      ignorar: match === null,
    }
  })

  const { error } = await supabase.from('btx_vhsys_produto_map').upsert(
    linhas.map(({ produto_local: _omit, ...l }) => ({
      ...l,
      unidade,
      atualizado_em: new Date().toISOString(),
    })),
    { onConflict: 'unidade,vhsys_id_produto' },
  )
  if (error) throw new Error('MAPA_GRAVACAO_FALHOU')

  return {
    ligados: linhas.filter((l) => l.produto_id).length,
    ignorados: linhas.filter((l) => !l.produto_id).length,
    mapa: linhas,
  }
}
