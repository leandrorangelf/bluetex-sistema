export function formatMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatData(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function carteirasParaCaixas(carteiras: number, carteiras_por_caixa: number): string {
  const caixas = carteiras / carteiras_por_caixa
  return caixas % 1 === 0 ? caixas.toString() : caixas.toFixed(2)
}

export function getMesLabel(mes: number): string {
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mes - 1] ?? ''
}

export function getMesAnoLabel(mes: number, ano: number): string {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${meses[mes - 1]} ${ano}`
}

export function hoje(): string {
  return new Date().toISOString().split('T')[0]
}

export function mesAtual(): number {
  return new Date().getMonth() + 1
}

export function anoAtual(): number {
  return new Date().getFullYear()
}
