export class TenantNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Organization not found: ${identifier}`)
    this.name = 'TenantNotFoundError'
  }
}

export class TenantAccessDeniedError extends Error {
  constructor() {
    super('The current user does not have access to this organization.')
    this.name = 'TenantAccessDeniedError'
  }
}

