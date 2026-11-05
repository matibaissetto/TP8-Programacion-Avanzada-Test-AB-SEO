import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  COOKIE,
  SESSION_WINDOW,
  THIRTY_DAYS,
  assignVariant,
  cookieOptions,
  isVariant,
  type Variant,
} from './lib/experiment'
import { randomUUID } from 'node:crypto'
import { getVariantForVisitor, recordImpression } from './lib/db'

function isSecureRequest(request: NextRequest): boolean {
  return request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://')
}

function getVariantCookie(request: NextRequest): Variant | null {
  const value = request.cookies.get(COOKIE.variant)?.value
  return isVariant(value) ? value : null
}

function getVisitorCookie(request: NextRequest): string | null {
  const value = request.cookies.get(COOKIE.visitor)?.value
  return typeof value === 'string' && value.length > 0 ? value : null
}

function getImpressedCookie(request: NextRequest): string | null {
  const value = request.cookies.get(COOKIE.impressed)?.value
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function proxy(request: NextRequest) {
  const previewParam = request.nextUrl.searchParams.get('preview')
  const isPreview = isVariant(previewParam)

  if (isPreview || request.method !== 'GET') {
    // Preview: no escribe cookies, no asigna, no registra impresión.
    return NextResponse.next()
  }

  const secure = isSecureRequest(request)
  const response = NextResponse.next()

  let visitorId = getVisitorCookie(request)
  const cookieVariant = getVariantCookie(request)
  let variant = visitorId ? (getVariantForVisitor(visitorId) ?? assignVariant(visitorId)) : null

  if (!visitorId || !variant || cookieVariant !== variant) {
    // Crawler sin cookies: no se crea visitante ni se persiste variante.
    // Se sirve control A de forma estable (ver lib/experiment y README).
    const userAgent = (request.headers.get('user-agent') ?? '').toLowerCase()
    const isCrawler = /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|embedly|quora|outbrain|pinterest|googleother|bingbot/i.test(userAgent)
    if (isCrawler && !visitorId) {
      return response
    }

    if (!visitorId) {
      visitorId = randomUUID()
    }
    variant = variant ?? assignVariant(visitorId)

    response.cookies.set(COOKIE.visitor, visitorId, cookieOptions(secure, THIRTY_DAYS))
    response.cookies.set(COOKIE.variant, variant, cookieOptions(secure, THIRTY_DAYS))
  }

  // Si no hay variante válida tras la validación, se usa control A.
  const resolvedVariant: Variant = isVariant(variant) ? variant : 'a'

  // Impresión: una por sesión de 30 minutos.
  const impressed = getImpressedCookie(request)
  const counted = recordImpression(visitorId, resolvedVariant)
  if (counted || !impressed) {
    response.cookies.set(COOKIE.impressed, '1', cookieOptions(secure, SESSION_WINDOW))
  }

  // Canonical es siempre /practica, sin query (ver generateMetadata).

  return response
}

export const config = {
  matcher: ['/practica'],
}
