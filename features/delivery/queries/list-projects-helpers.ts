// ilike treats % and _ as wildcards and \ as its escape character — escape all
// three so a search for a literal underscore matches the text, not more rows.
export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

// Only these three columns may be ordered on. Passing params.sort straight to
// .order() would let a query string name any column in the table.
export function sortColumn(sort: string | undefined): 'name' | 'status' | 'updated_at' {
  return sort === 'name' ? 'name' : sort === 'status' ? 'status' : 'updated_at'
}
