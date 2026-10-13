export class MissingEnvError extends Error {
  constructor(name: string, reason = 'is not set') {
    super(`Environment variable ${name} ${reason}. Add it to .env.local — see .env.example.`)
    this.name = 'MissingEnvError'
  }
}

type Source = Record<string, string | undefined>

function required(source: Source, name: string): string {
  const value = source[name]
  if (!value) throw new MissingEnvError(name)
  return value
}

export function readSupabasePublicEnv(source: Source) {
  return {
    SUPABASE_URL: required(source, 'NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_PUBLISHABLE_KEY: required(source, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  } as const
}

export function readSupabaseSecretKey(source: Source): string {
  return required(source, 'SUPABASE_SECRET_KEY')
}

export function readWebsiteLeadIngestSecret(source: Source): string {
  return required(source, 'WEBSITE_LEADS_INGEST_SECRET')
}

// Microsoft 365 blocks SMTP AUTH while security defaults are enabled, so mail
// goes through the Graph API with an OAuth2 client-credentials grant instead of
// a mailbox password. These are read lazily at send time, never at import: a
// mail misconfiguration must not be able to break authentication or database
// access.
export function readGraphEnv(source: Source) {
  return {
    GRAPH_TENANT_ID: required(source, 'GRAPH_TENANT_ID'),
    GRAPH_CLIENT_ID: required(source, 'GRAPH_CLIENT_ID'),
    GRAPH_CLIENT_SECRET: required(source, 'GRAPH_CLIENT_SECRET'),
    MAIL_FROM: required(source, 'MAIL_FROM'),
  } as const
}

// The HIVE Origin offering feed. UNISON pulls it server-to-server with a bearer
// key that must equal HIVE's UNISON_OFFERINGS_API_KEY. Read lazily where the feed
// is fetched, never at import, and never expose either value as NEXT_PUBLIC.
export function readHiveOfferingsEnv(source: Source) {
  return {
    HIVE_OFFERINGS_URL: required(source, 'HIVE_OFFERINGS_URL'),
    HIVE_OFFERINGS_API_KEY: required(source, 'HIVE_OFFERINGS_API_KEY'),
  } as const
}

export function readAppUrl(source: Source): string {
  return required(source, 'NEXT_PUBLIC_APP_URL')
}

export type SupabasePublicEnv = ReturnType<typeof readSupabasePublicEnv>
export type HiveOfferingsEnv = ReturnType<typeof readHiveOfferingsEnv>
export type GraphEnv = ReturnType<typeof readGraphEnv>
