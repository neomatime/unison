// The exact rule createArtefactAction (features/delivery/actions/project-governance.ts)
// already enforces inline for evidence URLs, extracted so this schema and any
// future one express it once rather than copying the try/catch a third time.
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
