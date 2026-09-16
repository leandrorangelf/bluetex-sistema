-- Lista de exclusão do relatório de vendas VHSYS (produto ou cliente que a
-- unidade não trabalha mais e que estava inflando/distorcendo o total geral).
-- Filtra na leitura (btx_vhsys_vendas_historico continua com o dado bruto
-- intacto) — reversível, não apaga nada do histórico sincronizado.
CREATE TABLE IF NOT EXISTS btx_vhsys_relatorio_exclusoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade_codigo TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('produto','cliente')),
  valor TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unidade_codigo, tipo, valor)
);

ALTER TABLE btx_vhsys_relatorio_exclusoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "btx_admin_vhsys_relatorio_exclusoes" ON btx_vhsys_relatorio_exclusoes;
CREATE POLICY "btx_admin_vhsys_relatorio_exclusoes" ON btx_vhsys_relatorio_exclusoes
  FOR ALL USING (btx_get_my_role()='admin') WITH CHECK (btx_get_my_role()='admin');
