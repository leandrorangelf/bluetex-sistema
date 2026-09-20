'use client'

import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'
import VhsysSyncClient from './VhsysSyncClient'

export default function VhsysPage() {
  const { profile } = useAuth()

  if (profile?.role !== 'admin') {
    return (
      <div className="alert alert-red">
        A integração VHSYS é restrita a administradores.
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Integração VHSYS</h1>
          <div className="page-subtitle">
            6 unidades · Vendas, compras, estoque e boletos a receber
          </div>
        </div>
      </div>
      <VhsysSyncClient />
      <p style={{ marginTop: 16 }}>
        <Link href="/integracoes/vhsys/relatorio-vendas">
          Ver relatório de vendas por cliente/mês (todo o período)
        </Link>
      </p>
      <p style={{ marginTop: 8 }}>
        <Link href="/vendas">
          Ver extrato de vendas por NF/produto (aba Vendas — tem botão de sincronizar lá)
        </Link>
      </p>
    </div>
  )
}
