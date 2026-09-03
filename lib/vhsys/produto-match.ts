// Casamento de nomes de produto VHSYS -> produto local, por sobreposição de
// tokens (ignora "El Poncio", GTIN, dígitos e afins). Sem dependência de servidor.
const RUIDO = new Set([
  'el', 'poncio', 'garam', 'gtin', 'gtin-8', 'tabaco', 'un', 'und', 'cx', 'caixa',
])

export function tokens(nome: string): string[] {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !RUIDO.has(t.toLowerCase()) && !/^\d+$/.test(t))
}

export interface LocalProduto { id: string; nome: string; _tokens: string[] }

export function melhorMatch(
  descVhsys: string,
  locais: LocalProduto[],
): LocalProduto | null {
  const alvo = tokens(descVhsys)
  let escolhido: LocalProduto | null = null
  let melhorDiff = Infinity
  for (const local of locais) {
    if (local._tokens.length === 0) continue
    if (!local._tokens.every((t) => alvo.includes(t))) continue
    const diff = Math.abs(alvo.length - local._tokens.length)
    if (diff < melhorDiff) {
      melhorDiff = diff
      escolhido = local
    }
  }
  return escolhido
}
