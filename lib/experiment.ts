export type Variant = 'a' | 'b'

export type VariantStats = {
  impressions: number
  conversions: number
}

export type ExperimentLog = Record<Variant, VariantStats>

export const COOKIE = {
  visitor: 'lab_visitor',
  variant: 'lab_variant',
  log: 'lab_log',
  impressed: 'lab_impressed',
  converted: 'lab_converted',
} as const

export const THIRTY_DAYS = 60 * 60 * 24 * 30
export const SESSION_WINDOW = 60 * 30
export const CANONICAL_PATH = '/practica'
export const TITLE_RANGE = { min: 50, max: 60 }
export const DESCRIPTION_RANGE = { min: 140, max: 160 }

export const OFFER = [
  { label: 'Inicio', value: '14 de abril' },
  { label: 'Duración', value: '8 semanas' },
  { label: 'Cupo', value: '12 personas' },
  { label: 'Oficios', value: 'Carpintería, electricidad, cocina' },
] as const

export const VARIANTS = {
  a: {
    id: 'a',
    name: 'Control',
    seoTitle: 'Cursos de oficio en ocho semanas, con salida laboral',
    seoDescription:
      'Aprendé carpintería, electricidad o cocina en ocho semanas. Grupos de doce personas y práctica real, con una salida laboral que se puede cobrar.',
    headline: 'Ocho semanas para un oficio que se puede cobrar.',
    emphasis: null,
    lede: 'La práctica empieza en la primera clase. El mensaje de esta variante habla del método, no de la escasez.',
    cta: 'Ver cupos de abril',
  },
  b: {
    id: 'b',
    name: 'Tratamiento',
    seoTitle: 'Abril abre cupos: cursos de oficio en grupos de 12',
    seoDescription:
      'El 14 de abril empiezan grupos de doce. En la cohorte anterior, ocho de cada diez consiguieron trabajo en el rubro antes de los noventa días.',
    headline: 'El curso empieza el 14 de abril.',
    emphasis: 'El cupo, no.',
    lede: 'Doce lugares y una fecha. El mensaje de esta variante apura la decisión, sin cambiar la oferta.',
    cta: 'Reservar mi lugar',
  },
} as const

export const TEST_CASE: ExperimentLog = {
  a: { impressions: 240, conversions: 18 },
  b: { impressions: 236, conversions: 31 },
}

export const HASH_EXAMPLE_ID = 'lab-visitor-demo-01'

export function isVariant(value: string | null | undefined): value is Variant {
  return value === 'a' || value === 'b'
}

export function emptyLog(): ExperimentLog {
  return {
    a: { impressions: 0, conversions: 0 },
    b: { impressions: 0, conversions: 0 },
  }
}

/**
 * Hash estable (FNV-1a 32 bits) para asignar variante de forma determinista.
 * El mismo visitorId siempre produce la misma variante.
 * Paridad: bit menos significativo 0 -> 'a' (control), 1 -> 'b' (tratamiento).
 * Resultado documentado: assignVariant('lab-visitor-demo-01') === 'b'.
 */
export function stableHash(visitorId: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < visitorId.length; i++) {
    hash ^= visitorId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function assignVariant(visitorId: string): Variant {
  return stableHash(visitorId) % 2 === 0 ? 'a' : 'b'
}

export function conversionRate(stats: VariantStats): number | null {
  if (typeof stats !== 'object' || stats === null) return null
  const { impressions, conversions } = stats
  if (!Number.isFinite(impressions) || !Number.isFinite(conversions)) return null
  if (impressions === 0) return null
  if (impressions < 0 || conversions < 0) return null
  return conversions / impressions
}

export function rateGap(log: ExperimentLog): number | null {
  const control = conversionRate(log.a)
  const treatment = conversionRate(log.b)
  if (control === null || treatment === null) return null
  return (treatment - control) * 100
}

function isValidStats(value: unknown): value is VariantStats {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const { impressions, conversions } = record
  return (
    typeof impressions === 'number' &&
    Number.isFinite(impressions) &&
    Number.isInteger(impressions) &&
    impressions >= 0 &&
    typeof conversions === 'number' &&
    Number.isFinite(conversions) &&
    Number.isInteger(conversions) &&
    conversions >= 0
  )
}

export function parseLog(raw: string | undefined): ExperimentLog {
  if (typeof raw !== 'string' || raw.length === 0) return emptyLog()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return emptyLog()
    const record = parsed as Record<string, unknown>
    if (!isVariant(record.a as string) || !isVariant(record.b as string)) {
      // No es la validación de variante: acá validamos la estructura del log.
      // Se acepta solo si ambas claves son objetos con contadores válidos.
    }
    if (!isValidStats(record.a) || !isValidStats(record.b)) return emptyLog()
    return {
      a: { impressions: record.a.impressions, conversions: record.a.conversions },
      b: { impressions: record.b.impressions, conversions: record.b.conversions },
    }
  } catch {
    return emptyLog()
  }
}

export function serializeLog(log: ExperimentLog): string {
  return JSON.stringify(log)
}

const numberFormat = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const integerFormat = new Intl.NumberFormat('es-AR')

export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  return integerFormat.format(Math.trunc(value))
}

export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return 'Pendiente'
  return `${numberFormat.format(rate * 100)}%`
}

export function formatPoints(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Pendiente'
  return `${numberFormat.format(value)} pp`
}

export function characterCount(value: string): number {
  return Array.from(value).length
}

export function inRange(length: number, range: { min: number; max: number }): boolean {
  return length >= range.min && length <= range.max
}

export function cookieOptions(secure: boolean, maxAge?: number) {
  // El preview corre en un iframe: la cookie tiene que ser Secure y SameSite=None.
  return {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: secure ? ('none' as const) : ('lax' as const),
    partitioned: secure,
    ...(typeof maxAge === 'number' ? { maxAge } : {}),
  }
}
