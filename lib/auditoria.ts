export const TABELAS_AUDITADAS: Record<string, string> = {
  btx_parcelas: 'Parcela (a pagar/receber)',
  btx_vendas: 'Venda',
  btx_vendas_itens: 'Item de venda',
  btx_compras: 'Compra',
  btx_compras_itens: 'Item de compra',
  btx_ajustes_estoque: 'Ajuste de estoque',
  btx_estoque_inicial: 'Estoque inicial',
}

export const OPERACOES_LABEL: Record<string, string> = { INSERT: 'Criação', UPDATE: 'Edição', DELETE: 'Exclusão' }

const CAMPOS_IGNORADOS = new Set([
  'id', 'created_at', 'updated_at', 'vhsys_synced_at', 'vhsys_id', 'origem_sistema', 'unidade',
])

const LABEL_CAMPO: Record<string, string> = {
  vencimento: 'Vencimento', valor: 'Valor', status: 'Status', observacoes: 'Observações',
  numero_boleto: 'Nº boleto', forma_pagamento: 'Tipo', data_pagamento: 'Data de pagamento',
  ativo: 'Ativo', numero_nf: 'NF', motivo: 'Motivo', qtd_carteiras: 'Quantidade',
  categoria_vhsys: 'Categoria', nota_interna: 'Nota interna', tipo: 'Tipo', origem: 'Origem',
}

function formatarValorCampo(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (campo === 'ativo') return valor ? 'sim' : 'não'
  if (campo === 'valor') return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return String(valor)
}

export interface CampoAlterado { campo: string; label: string; antes: string; depois: string }

// Compara antes/depois de uma edição e devolve só o que realmente mudou —
// em vez de despejar a linha inteira, mostra "campo: valor antigo → novo".
export function diffRegistro(
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
): CampoAlterado[] {
  if (!antes || !depois) return []
  const campos = new Set([...Object.keys(antes), ...Object.keys(depois)])
  const alterados: CampoAlterado[] = []
  for (const campo of campos) {
    if (CAMPOS_IGNORADOS.has(campo)) continue
    const a = antes[campo]
    const d = depois[campo]
    if (JSON.stringify(a) === JSON.stringify(d)) continue
    alterados.push({
      campo,
      label: LABEL_CAMPO[campo] ?? campo,
      antes: formatarValorCampo(campo, a),
      depois: formatarValorCampo(campo, d),
    })
  }
  return alterados
}

// Resumo de um registro novo (INSERT) ou removido (DELETE) — poucos campos
// relevantes, não a linha inteira.
export function resumoRegistro(dados: Record<string, unknown> | null): string {
  if (!dados) return '—'
  const chavesPrioritarias = ['observacoes', 'numero_boleto', 'numero_nf', 'motivo', 'valor', 'vencimento']
  const partes = chavesPrioritarias
    .filter(c => dados[c] !== null && dados[c] !== undefined && dados[c] !== '')
    .map(c => `${LABEL_CAMPO[c] ?? c}: ${formatarValorCampo(c, dados[c])}`)
  return partes.length ? partes.join(' · ') : '—'
}
