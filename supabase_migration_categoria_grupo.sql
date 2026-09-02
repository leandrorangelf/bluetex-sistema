-- Adiciona classificação de grupo às categorias de despesa (Painel Executivo)
ALTER TABLE btx_categorias_despesas
  ADD COLUMN IF NOT EXISTS grupo TEXT NOT NULL DEFAULT 'outros'
  CHECK (grupo IN ('fornecedores','impostos','funcionarios','custos_fixos','outros'));
