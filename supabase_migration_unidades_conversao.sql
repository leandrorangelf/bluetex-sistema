-- ============================================================
-- Migration: unidades de conversão configuráveis por produto
-- Execute no SQL Editor do Supabase (projeto já provisionado)
-- ============================================================

ALTER TABLE btx_produtos RENAME COLUMN carteiras_por_caixa TO fator_conversao;
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS unidade_base TEXT NOT NULL DEFAULT 'Carteira';
ALTER TABLE btx_produtos ADD COLUMN IF NOT EXISTS unidade_maior TEXT NOT NULL DEFAULT 'Caixa';
