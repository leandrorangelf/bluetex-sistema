export interface ParcelaGerada {
  numero_parcela: number
  vencimento: string
  valor: number
}

const round2 = (x: number) => Math.round(x * 100) / 100

// Vencimento da parcela `i` (0-based): mesmo dia-do-mês do primeiro vencimento
// somando `i` meses, com clamp ao último dia quando o mês de destino é mais curto
// (31/01 -> 28/02).
function vencimentoNoMes(primeiroVencimento: string, i: number): string {
  const [y, m, d] = primeiroVencimento.split('-').map(Number)
  const alvoMes = m - 1 + i
  const ano = y + Math.floor(alvoMes / 12)
  const mes = ((alvoMes % 12) + 12) % 12
  const ultimoDia = new Date(ano, mes + 1, 0).getDate()
  const dia = Math.min(d, ultimoDia)
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function gerarParcelas(valorTotal: number, primeiroVencimento: string, n: number): ParcelaGerada[] {
  if (n <= 1) {
    return [{ numero_parcela: 1, vencimento: primeiroVencimento, valor: round2(valorTotal) }]
  }
  const base = Math.floor((valorTotal / n) * 100) / 100
  const primeira = round2(valorTotal - base * (n - 1))
  return Array.from({ length: n }, (_, i) => ({
    numero_parcela: i + 1,
    vencimento: vencimentoNoMes(primeiroVencimento, i),
    valor: i === 0 ? primeira : base,
  }))
}
