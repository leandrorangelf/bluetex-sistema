-- ============================================================
-- Migration: catálogo editável de unidades de medida
-- Execute no SQL Editor do Supabase (depois de
-- supabase_migration_unidades_conversao.sql, já aplicada)
-- ============================================================

-- Catálogo de unidades
CREATE TABLE IF NOT EXISTS btx_unidades_medida (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE btx_unidades_medida ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btx_all_read_unidades_medida" ON btx_unidades_medida FOR SELECT USING (ativo=TRUE);
CREATE POLICY "btx_admin_all_unidades_medida" ON btx_unidades_medida FOR ALL USING (btx_get_my_role()='admin');

-- Migra os nomes já usados nos produtos existentes pro catálogo
INSERT INTO btx_unidades_medida(nome)
SELECT DISTINCT unidade_base FROM btx_produtos
UNION
SELECT DISTINCT unidade_maior FROM btx_produtos
ON CONFLICT (nome) DO NOTHING;

-- Novas colunas de referência em btx_produtos
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS unidade_base_id UUID REFERENCES btx_unidades_medida(id);
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS unidade_maior_id UUID REFERENCES btx_unidades_medida(id);

UPDATE btx_produtos p SET unidade_base_id = u.id
FROM btx_unidades_medida u WHERE u.nome = p.unidade_base;

UPDATE btx_produtos p SET unidade_maior_id = u.id
FROM btx_unidades_medida u WHERE u.nome = p.unidade_maior;

ALTER TABLE btx_produtos ALTER COLUMN unidade_base_id SET NOT NULL;
ALTER TABLE btx_produtos ALTER COLUMN unidade_maior_id SET NOT NULL;

ALTER TABLE btx_produtos DROP COLUMN unidade_base;
ALTER TABLE btx_produtos DROP COLUMN unidade_maior;
