export function formatMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatData(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function converterParaUnidadeMaior(qtdBase: number, fatorConversao: number): string {
  const qtd = qtdBase / fatorConversao
  return qtd % 1 === 0 ? qtd.toString() : qtd.toFixed(2)
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

const ORDEM_PRODUTOS = ['GUDANG RED', 'GUDANG GREEN', 'CRETEC MENTA', 'CRETEC CEREJA', 'GUDANG TWIN TEN']

export function ordenarProdutos<T extends { nome: string }>(produtos: T[]): T[] {
  return [...produtos].sort((a, b) => {
    const ia = ORDEM_PRODUTOS.indexOf(a.nome)
    const ib = ORDEM_PRODUTOS.indexOf(b.nome)
    if (ia === -1 && ib === -1) return a.nome.localeCompare(b.nome)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}
