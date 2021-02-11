SELECT n.nspname, p.proname
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON (n.oid = p.pronamespace)
WHERE p.prokind = 'f'
