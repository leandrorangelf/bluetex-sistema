-- ============================================================
-- Novas unidades: NEW BLUETEX CE, MA, SP, GO
-- Amplia os CHECKs de unidade e semeia as categorias de despesa padrão (molde = MG).
-- Mantém os valores legados 'GB SP/CE/MA' (já existem dados), que não aparecem no app.
-- btx_vhsys_saldos_bancarios continua só MG (integração VHSYS é da MG).
-- ============================================================
DO $$
DECLARE
  t TEXT;
  lista TEXT := $l$'NEW BLUETEX MG','NEW BLUETEX SC','NEW BLUETEX AM','NEW BLUETEX CE','NEW BLUETEX MA','NEW BLUETEX SP','NEW BLUETEX GO','GB SP','GB CE','GB MA'$l$;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'btx_profiles','btx_fornecedores','btx_clientes','btx_categorias_despesas','btx_estoque_inicial',
    'btx_compras','btx_vendas','btx_despesas','btx_parcelas','btx_caixa_mensal','btx_ajustes_estoque',
    'btx_vhsys_sincronizacoes','btx_vhsys_estoque_atual','btx_vhsys_produto_map'
  ] LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_unidade_check');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (unidade IN (%s))', t, t || '_unidade_check', lista);
  END LOOP;
END $$;

-- Categorias padrão (mesmo conjunto da MG) para cada unidade nova
INSERT INTO btx_categorias_despesas (unidade, nome, grupo)
SELECT u.unidade, c.nome, c.grupo
FROM (VALUES ('NEW BLUETEX CE'),('NEW BLUETEX MA'),('NEW BLUETEX SP'),('NEW BLUETEX GO')) AS u(unidade)
CROSS JOIN (
  SELECT nome, grupo FROM btx_categorias_despesas WHERE unidade = 'NEW BLUETEX MG' AND ativo
) c
WHERE NOT EXISTS (
  SELECT 1 FROM btx_categorias_despesas x WHERE x.unidade = u.unidade AND x.nome = c.nome
);
