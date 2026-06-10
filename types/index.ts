export type Unidade = 'NEW BLUETEX MG' | 'NEW BLUETEX SC' | 'NEW BLUETEX AM'
export type Role = 'admin' | 'unidade'
export type TipoParcela = 'pagar' | 'receber'
export type OrigemParcela = 'compra' | 'venda' | 'despesa' | 'manual'
export type StatusParcela = 'pendente' | 'pago' | 'cancelado'

export const UNIDADES: Unidade[] = ['NEW BLUETEX MG', 'NEW BLUETEX SC', 'NEW BLUETEX AM']

export interface Profile {
  id: string; nome: string; role: Role; unidade: Unidade | null; ativo: boolean; created_at: string
}
export interface Produto {
  id: string; nome: string; carteiras_por_caixa: number; ativo: boolean; created_at: string
}
export interface Fornecedor {
  id: string; unidade: Unidade; nome: string; cnpj: string | null; telefone: string | null
  email: string | null; observacoes: string | null; ativo: boolean; created_at: string
}
export interface Cliente {
  id: string; unidade: Unidade; nome: string; cnpj: string | null; telefone: string | null
  email: string | null; observacoes: string | null; ativo: boolean; created_at: string
}
export interface CategoriaDespesa {
  id: string; unidade: Unidade; nome: string; ativo: boolean; created_at: string
}
export interface EstoqueInicial {
  id: string; unidade: Unidade; produto_id: string; mes: number; ano: number
  qtd_carteiras: number; created_at: string; updated_at: string; produto?: Produto
}
export interface CompraItem {
  id: string; compra_id: string; produto_id: string; qtd_carteiras: number; valor: number
  produto?: Produto
}
export interface Compra {
  id: string; unidade: Unidade; fornecedor_id: string | null
  data_compra: string; numero_nf: string | null; valor_total: number; valor_st?: number
  observacoes: string | null; ativo: boolean; created_at: string
  fornecedor?: Fornecedor; itens?: CompraItem[]
}
export interface VendaItem {
  id: string; venda_id: string; produto_id: string; qtd_carteiras: number; valor: number
  produto?: Produto
}
export interface Venda {
  id: string; unidade: Unidade; cliente_id: string | null
  data_venda: string; numero_nf: string | null; valor_total: number; valor_st?: number
  observacoes: string | null; ativo: boolean; created_at: string
  cliente?: Cliente; itens?: VendaItem[]
}
export interface Despesa {
  id: string; unidade: Unidade; categoria_id: string | null; fornecedor_id: string | null
  data_despesa: string; numero_nf: string | null; descricao: string; valor_total: number
  observacoes: string | null; ativo: boolean; created_at: string
  categoria?: CategoriaDespesa; fornecedor?: Fornecedor
}
export interface Parcela {
  id: string; unidade: Unidade; tipo: TipoParcela; origem: OrigemParcela; origem_id: string | null
  numero_parcela: number; vencimento: string; valor: number; status: StatusParcela
  numero_boleto: string | null; data_pagamento: string | null; observacoes: string | null
  ativo: boolean; created_at: string
}
export interface CaixaMensal {
  id: string; unidade: Unidade; mes: number; ano: number; saldo_inicial: number
  created_at: string; updated_at: string
}
export interface AjusteEstoque {
  id: string; unidade: Unidade; produto_id: string; mes: number; ano: number
  qtd_carteiras: number; motivo: string | null; ativo: boolean; created_at: string
  produto?: Produto
}
