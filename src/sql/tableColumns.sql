SELECT attnum, attname, atttypid, attnotnull
FROM pg_catalog.pg_attribute attr
JOIN pg_catalog.pg_class cls on attr.attrelid = cls.oid
JOIN pg_catalog.pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE
    (cls.relkind = 'r'
    OR cls.relkind = 'v')
    AND nsp.nspname = ${schemaName}
    AND cls.relname = ${tableName}
ORDER BY attnum
