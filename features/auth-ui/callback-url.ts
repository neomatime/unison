import 'server-only'

import { headers } from 'next/headers'

import { resolveAppOrigin } from '@/lib/auth/app-origin'
import { readAppUrl } from '@/lib/env'

/** The address an email link returns to: the app's own origin plus the auth callback, carrying where to go next and which flow it is. */
export async function callbackUrl(next: string, flow: 'recovery' | 'verification') {
  const requestOrigin = (await headers()).get('origin')
  const origin = resolveAppOrigin(readAppUrl(process.env), requestOrigin)
  const callback = new URL('/auth/callback', origin)
  callback.searchParams.set('next', next)
  callback.searchParams.set('flow', flow)
  return callback.toString()
}
