SELECT oid, typelem
FROM pg_catalog.pg_type
WHERE typlen = -1 AND typelem != 0 AND typarray = 0
