SELECT
  oid,
  typname,
  array(
    SELECT enumlabel
    FROM pg_catalog.pg_enum e
    WHERE e.enumtypid = t.oid
    ORDER BY e.enumsortorder
  )::text[] AS labels
FROM pg_catalog.pg_type t
WHERE t.typtype = 'e'
