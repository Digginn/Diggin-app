---
title: Use Prepared Statements Correctly with Pooling
impact: HIGH
impactDescription: Avoid prepared statement conflicts in pooled environments
tags: prepared-statements, connection-pooling, transaction-mode
---

## Use Prepared Statements Correctly with Pooling

Prepared statements are tied to individual database connections. Supabase's Supavisor transaction mode does not support named prepared statements. Direct connections and session-mode pooling support them.

**Incorrect (named prepared statements with transaction pooling):**

```sql
-- Named prepared statement
prepare get_user as select * from users where id = $1;

-- In transaction mode pooling, next request may get different connection
execute get_user(123);
-- ERROR: prepared statement "get_user" does not exist
```

**Correct (use unnamed statements or session mode):**

```javascript
// node-postgres (pg): omit the query config's `name` to use an unnamed statement.
await client.query({
  text: 'select * from public.users where id = $1',
  values: [123],
});
```

Alternatively, use a direct connection or session-mode pooling when named prepared statements are required. `DEALLOCATE` after execution does not make them safe in transaction mode: separate statements can be routed to different backend connections.

Check your driver settings; they are not interchangeable:

```javascript
// Postgres.js (also used by Drizzle's postgres-js driver):
const sql = postgres(connectionString, { prepare: false });
```

For JDBC, set `prepareThreshold=0`. For node-postgres, omit `name`; `prepare: false` is not a node-postgres option. Always keep values parameterized.

References: [Supabase: Disabling Prepared Statements](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL), [node-postgres: Queries](https://node-postgres.com/features/queries)
