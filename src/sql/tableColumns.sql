SELECT attnum, attname, atttypid, attnotnull
FROM pg_catalog.pg_attribute
WHERE attrelid = ${tableOid}
ORDER BY attnum
