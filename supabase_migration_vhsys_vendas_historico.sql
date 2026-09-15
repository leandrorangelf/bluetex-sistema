-- Histórico agregado de vendas do VHSYS (cliente/produto/mês por unidade),
-- alimentado pela sincronização manual em /integracoes/vhsys/relatorio-vendas.
-- Separado de btx_vendas de propósito: não aciona os triggers de auditoria
-- de estoque, então trazer histórico antigo aqui não desalinha o estoque
-- atual do sistema.
CREATE TABLE IF NOT EXISTS btx_vhsys_vendas_historico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade_codigo TEXT NOT NULL,
  cliente TEXT NOT NULL,
  produto TEXT NOT NULL,
  mes TEXT NOT NULL,
  qtd_caixas NUMERIC(12,2) NOT NULL DEFAULT 0,
  qtd_bruta_vhsys NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  sem_conversao BOOLEAN NOT NULL DEFAULT FALSE,
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unidade_codigo, cliente, produto, mes)
);

CREATE INDEX IF NOT EXISTS btx_vhsys_vendas_historico_unidade_mes_idx
  ON btx_vhsys_vendas_historico(unidade_codigo, mes);

ALTER TABLE btx_vhsys_vendas_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "btx_admin_vhsys_vendas_historico" ON btx_vhsys_vendas_historico;
CREATE POLICY "btx_admin_vhsys_vendas_historico" ON btx_vhsys_vendas_historico
  FOR ALL USING (btx_get_my_role()='admin') WITH CHECK (btx_get_my_role()='admin');
