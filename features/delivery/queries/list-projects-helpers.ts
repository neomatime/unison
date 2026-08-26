// ilike treats % and _ as wildcards and \ as its escape character. PostgREST
// adds a fourth: it rewrites * to % inside a like/ilike filter value before
// Postgres sees it, so an unescaped `*` widens the match exactly as `%` does
// (verified live: name=ilike.Client* matches "Client Onboarding"). Escape all
// four so a search term matches text rather than quietly returning more rows.
//
// One honest limitation: because PostgREST rewrites the * after we escape it,
// `\*` reaches Postgres as `\%` — a literal percent sign. So searching for a
// literal asterisk finds rows containing '%', not rows containing '*'. That is
// wrong-but-bounded; the unbounded failure (a search for `*` matching every
// row in the organisation) is what this closes. Matching a literal asterisk
// needs a different operator than ilike.
export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_*]/g, (match) => `\\${match}`)
}

// Only these three columns may be ordered on. Passing params.sort straight to
// .order() would let a query string name any column in the table.
export function sortColumn(sort: string | undefined): 'name' | 'status' | 'updated_at' {
  return sort === 'name' ? 'name' : sort === 'status' ? 'status' : 'updated_at'
}
