export class MissingEnvError extends Error {
  constructor(name: string, reason = 'is not set') {
    super(`Environment variable ${name} ${reason}. Add it to .env.local — see .env.local.example.`)
    this.name = 'MissingEnvError'
  }
}

type Source = Record<string, string | undefined>

function required(source: Source, name: string): string {
  const value = source[name]
  if (!value) throw new MissingEnvError(name)
  return value
}

function requiredPort(source: Source, name: string): number {
  const value = Number(required(source, name))
  if (!Number.isInteger(value) || value <= 0) throw new MissingEnvError(name, 'is not a valid port')
  return value
}

export function readSupabaseEnv(source: Source) {
  return {
    SUPABASE_URL: required(source, 'NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_PUBLISHABLE_KEY: required(source, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    SUPABASE_SECRET_KEY: required(source, 'SUPABASE_SECRET_KEY'),
  } as const
}

export function readSmtpEnv(source: Source) {
  return {
    SMTP_HOST: required(source, 'SMTP_HOST'),
    SMTP_PORT: requiredPort(source, 'SMTP_PORT'),
    SMTP_USER: required(source, 'SMTP_USER'),
    SMTP_PASSWORD: required(source, 'SMTP_PASSWORD'),
    SMTP_FROM: required(source, 'SMTP_FROM'),
  } as const
}

export function readAppUrl(source: Source): string {
  return required(source, 'NEXT_PUBLIC_APP_URL')
}

export type SupabaseEnv = ReturnType<typeof readSupabaseEnv>
export type SmtpEnv = ReturnType<typeof readSmtpEnv>
