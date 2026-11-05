import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Landing } from '@/components/landing'
import {
  CANONICAL_PATH,
  COOKIE,
  DESCRIPTION_RANGE,
  TITLE_RANGE,
  VARIANTS,
  assignVariant,
  characterCount,
  inRange,
  isVariant,
  type Variant,
} from '@/lib/experiment'

type PracticaPageProps = {
  searchParams: Promise<{ preview?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

async function resolveVariant(searchParams: PracticaPageProps['searchParams']): Promise<{
  variant: Variant
  preview: Variant | null
}> {
  const params = await searchParams
  const requested = firstParam(params.preview)
  const preview = isVariant(requested) ? requested : null

  if (preview) {
    return { variant: preview, preview }
  }

  const store = await cookies()
  const visitorId = store.get(COOKIE.visitor)?.value
  const cookieVariant = store.get(COOKIE.variant)?.value

  if (typeof visitorId === 'string' && visitorId.length > 0) {
    if (isVariant(cookieVariant)) {
      return { variant: cookieVariant, preview: null }
    }
    return { variant: assignVariant(visitorId), preview: null }
  }

  // Sin cookies (crawler o primera visita sin contexto): control A estable.
  return { variant: 'a', preview: null }
}

export async function generateMetadata({ searchParams }: PracticaPageProps): Promise<Metadata> {
  const { variant, preview } = await resolveVariant(searchParams)
  const copy = VARIANTS[variant]

  return {
    title: { absolute: copy.seoTitle },
    description: copy.seoDescription,
    alternates: { canonical: CANONICAL_PATH },
    robots: preview
      ? { index: false, follow: false }
      : { index: true, follow: true },
  }
}

export default async function PracticaPage({ searchParams }: PracticaPageProps) {
  const { variant, preview } = await resolveVariant(searchParams)
  const copy = VARIANTS[variant]
  const titleLength = characterCount(copy.seoTitle)
  const descriptionLength = characterCount(copy.seoDescription)

  return (
    <main id="contenido" className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 md:py-14">
      <p className="font-mono text-[0.7rem] tracking-[0.16em] text-muted-foreground uppercase">
        {preview ? `Preview · copy ${variant.toUpperCase()} · noindex` : `Variante ${variant.toUpperCase()} · ${copy.name}`}
      </p>
      <p className="border-b border-border pb-4 text-sm text-muted-foreground">
        {preview
          ? `Estás viendo el copy ${preview.toUpperCase()} por query. No persiste, no registra impresión y lleva noindex.`
          : `Asignación estable por cookie. La oferta no cambia entre variantes.`}
      </p>
      <Landing variant={variant} preview={Boolean(preview)} />
      <div className="flex flex-wrap gap-2">
        <Link href="/practica?preview=a" className="rounded-md border border-border px-3 py-1.5 text-sm">
          Ver copy A
        </Link>
        <Link href="/practica?preview=b" className="rounded-md border border-border px-3 py-1.5 text-sm">
          Ver copy B
        </Link>
        <Link href="/bitacora" className="rounded-md border border-border px-3 py-1.5 text-sm">
          Bitácora
        </Link>
      </div>
      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl">Metadatos publicados en el servidor</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1 border-b border-border pb-3">
            <dt className="font-mono text-[0.7rem] tracking-[0.14em] text-muted-foreground uppercase">
              Title de {variant.toUpperCase()}
            </dt>
            <dd>{copy.seoTitle}</dd>
            <dd className="font-mono text-sm text-muted-foreground">
              {titleLength} caracteres · {inRange(titleLength, TITLE_RANGE) ? 'dentro de 50–60' : 'fuera de rango'}
            </dd>
          </div>
          <div className="flex flex-col gap-1 border-b border-border pb-3">
            <dt className="font-mono text-[0.7rem] tracking-[0.14em] text-muted-foreground uppercase">
              Description de {variant.toUpperCase()}
            </dt>
            <dd>{copy.seoDescription}</dd>
            <dd className="font-mono text-sm text-muted-foreground">
              {descriptionLength} caracteres ·{' '}
              {inRange(descriptionLength, DESCRIPTION_RANGE) ? 'dentro de 140–160' : 'fuera de rango'}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
