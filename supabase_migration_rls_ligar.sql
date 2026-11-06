-- ============================================================
-- Liga o RLS nas tabelas btx_* que estavam com RLS desligado ("Unrestricted").
-- As políticas por unidade já existiam, mas não eram aplicadas.
-- Antes de ligar, dá leitura à diretoria (que só tinha política nas tabelas filhas).
-- O robô do VHSYS usa service role e ignora o RLS.
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'btx_ajustes_estoque','btx_caixa_mensal','btx_categorias_despesas','btx_clientes',
    'btx_compras','btx_despesas','btx_estoque_inicial','btx_fornecedores',
    'btx_parcelas','btx_produtos','btx_vendas'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'btx_diretoria_read_' || substr(t, 5), t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (btx_get_my_role() = ''diretoria'')',
      'btx_diretoria_read_' || substr(t, 5), t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'btx_ajustes_estoque','btx_caixa_mensal','btx_categorias_despesas','btx_clientes',
    'btx_compras','btx_despesas','btx_estoque_inicial','btx_fornecedores',
    'btx_parcelas','btx_produtos','btx_profiles','btx_vendas'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
