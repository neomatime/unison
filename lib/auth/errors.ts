export class NotAuthenticatedError extends Error {
  constructor() {
    super('No authenticated user for this request.')
    this.name = 'NotAuthenticatedError'
  }
}

export class NoMembershipError extends Error {
  constructor() {
    super('This user has no active membership in any organization.')
    this.name = 'NoMembershipError'
  }
}
