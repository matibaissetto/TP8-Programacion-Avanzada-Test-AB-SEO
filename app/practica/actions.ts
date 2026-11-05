'use server'

import { cookies, headers } from 'next/headers'
import { COOKIE, isVariant } from '@/lib/experiment'
import { recordConversionForVisitor } from '@/lib/db'

export async function recordConversion(preview = false): Promise<{ status: 'ok' | 'ignored' }> {
  if (preview) return { status: 'ignored' }
  const referer = (await headers()).get('referer')
  if (referer && isVariant(new URL(referer).searchParams.get('preview'))) return { status: 'ignored' }
  const store = await cookies()
  const visitorId = store.get(COOKIE.visitor)?.value
  const variantValue = store.get(COOKIE.variant)?.value

  if (typeof visitorId !== 'string' || visitorId.length === 0) return { status: 'ignored' }
  if (!isVariant(variantValue)) return { status: 'ignored' }

  const counted = recordConversionForVisitor(visitorId, variantValue)
  return { status: counted ? 'ok' : 'ignored' }
}
