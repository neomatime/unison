import { NextResponse } from 'next/server'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { organization } = await getSessionContext()
    const { documentId } = await params
    const supabase = await createServerSupabase()
    const { data: document, error } = await (supabase as any)
      .from('documents')
      .select('storage_bucket,storage_path')
      .eq('organization_id', organization.id)
      .eq('id', documentId)
      .is('archived_at', null)
      .maybeSingle()
    if (error) return NextResponse.json({ message: error.message }, { status: 422 })
    if (!document) return NextResponse.json({ message: 'Document not found.' }, { status: 404 })

    const { data, error: signedUrlError } = await supabase.storage
      .from(document.storage_bucket)
      .createSignedUrl(document.storage_path, 60)
    if (signedUrlError) return NextResponse.json({ message: signedUrlError.message }, { status: 422 })
    return NextResponse.redirect(data.signedUrl, { status: 307 })
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'The document could not be downloaded.' }, { status: 500 })
  }
}
