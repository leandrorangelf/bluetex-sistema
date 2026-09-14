import type { Unidade } from '@/types'

export interface VhsysUnidade {
  // Código curto usado nas variáveis de ambiente (VHSYS_ACCESS_TOKEN_<codigo>) e
  // nas rotas de API (?unidade=<codigo>).
  codigo: string
  unidade: Unidade
}

export const VHSYS_UNIDADES: VhsysUnidade[] = [
  { codigo: 'MG', unidade: 'NEW BLUETEX MG' },
  { codigo: 'SC', unidade: 'NEW BLUETEX SC' },
  { codigo: 'AM', unidade: 'NEW BLUETEX AM' },
  { codigo: 'GB_SP', unidade: 'GB SP' },
  { codigo: 'GB_CE', unidade: 'GB CE' },
  { codigo: 'GB_MA', unidade: 'GB MA' },
]

export function vhsysUnidadePorCodigo(codigo: string): VhsysUnidade | null {
  return VHSYS_UNIDADES.find((u) => u.codigo === codigo) ?? null
}
