import { Cta } from '@/components/cta'
import { OFFER, VARIANTS, type Variant } from '@/lib/experiment'

export function Landing({ variant, preview = false }: { variant: Variant; preview?: boolean }) {
  const copy = VARIANTS[variant]

  return (
    <section className="grid gap-10 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:items-start">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 font-mono text-[0.7rem] tracking-[0.16em] text-muted-foreground uppercase">
            <span
              className={`size-2 rounded-full ${variant === 'a' ? 'bg-experiment-a' : 'bg-experiment-b'}`}
              aria-hidden
            />
            Taller Norte · copy {variant.toUpperCase()} · {copy.name}
          </p>
          <h1 className="max-w-xl font-serif text-4xl leading-[1.05] tracking-tight text-balance md:text-5xl">
            {copy.headline}
            {copy.emphasis ? (
              <>
                {' '}
                <em className="text-primary">{copy.emphasis}</em>
              </>
            ) : null}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">{copy.lede}</p>
        </div>
        <Cta label={copy.cta} preview={preview} />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          {OFFER.map((item) => (
            <div key={item.label} className="flex flex-col gap-1">
              <dt className="font-mono text-[0.7rem] tracking-[0.14em] text-muted-foreground uppercase">
                {item.label}
              </dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <figure className="flex flex-col gap-3">
        <div className="flex h-72 items-end rounded-lg border border-border bg-secondary p-6 md:h-96">
          <p className="max-w-xs font-serif text-3xl leading-tight">
            El banco, la viruta y el delantal.
          </p>
        </div>
        <figcaption className="text-sm text-muted-foreground">
          Si la cátedra pasó la foto, va en public/taller-norte.png. Taller Norte es ficticio.
        </figcaption>
      </figure>
    </section>
  )
}
