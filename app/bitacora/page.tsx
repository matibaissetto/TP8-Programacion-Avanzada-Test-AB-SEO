import type { Metadata } from 'next'
import Link from 'next/link'
import {
  HASH_EXAMPLE_ID,
  TEST_CASE,
  VARIANTS,
  assignVariant,
  conversionRate,
  formatCount,
  formatPoints,
  formatRate,
  rateGap,
  type ExperimentLog,
} from '@/lib/experiment'
import { getExperimentLog } from '@/lib/db'

export const metadata: Metadata = {
  title: 'Bitácora',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const ROWS = (['a', 'b'] as const)

function StatsTable({ log, caption }: { log: ExperimentLog; caption: string }) {
  return (
    <table className="w-full text-left text-sm">
      <caption className="mb-3 text-left text-muted-foreground">{caption}</caption>
      <thead>
        <tr className="border-b border-border">
          <th className="py-2 font-medium">Variante</th>
          <th className="py-2 font-medium">Impresiones</th>
          <th className="py-2 font-medium">Conversiones</th>
          <th className="py-2 font-medium">Tasa</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((variant) => (
          <tr key={variant} className="border-b border-border">
            <td className="py-3">
              {variant.toUpperCase()} · {VARIANTS[variant].name}
            </td>
            <td className="py-3 font-mono">{formatCount(log[variant].impressions)}</td>
            <td className="py-3 font-mono">{formatCount(log[variant].conversions)}</td>
            <td className="py-3 font-mono">{formatRate(conversionRate(log[variant]))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function BitacoraPage() {
  const realLog = getExperimentLog()

  return (
    <main id="contenido" className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 md:py-14">
      <p className="font-mono text-[0.7rem] tracking-[0.16em] text-muted-foreground uppercase">
        Bitácora · experimento y caso fijo
      </p>
      <section className="flex flex-col gap-4">
        <h1 className="max-w-2xl font-serif text-4xl tracking-tight text-balance md:text-5xl">
          Datos reales del experimento.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Estos conteos salen de la base local. Una impresión por sesión de 30 minutos. Una
          conversión por visitante, solo por clic en el CTA. No se declara ganador.
        </p>
        <StatsTable log={realLog} caption="Tasa = conversiones / impresiones. Sin impresiones: Pendiente." />
        <p className="font-mono text-sm">B − A = {formatPoints(rateGap(realLog))}</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl">Caso fijo de prueba</h2>
        <p className="max-w-2xl text-muted-foreground">
          Cohorte de referencia para validar la fórmula. No corresponde a la base real.
        </p>
        <StatsTable
          log={TEST_CASE}
          caption="A: 18 / 240 · B: 31 / 236 · Diferencia en puntos porcentuales."
        />
        <p className="font-mono text-sm">B − A = {formatPoints(rateGap(TEST_CASE))}</p>
        <p className="font-mono text-sm">
          assignVariant({`'${HASH_EXAMPLE_ID}'`}) → {assignVariant(HASH_EXAMPLE_ID).toUpperCase()}
        </p>
        <ul className="font-mono text-sm text-muted-foreground">
          <li>A: 18 / 240 = {formatRate(conversionRate(TEST_CASE.a))}</li>
          <li>B: 31 / 236 = {formatRate(conversionRate(TEST_CASE.b))}</li>
          <li>B − A = {formatPoints(rateGap(TEST_CASE))}</li>
        </ul>
      </section>

      <Link href="/practica" className="text-sm text-muted-foreground underline">
        Volver a la landing
      </Link>
    </main>
  )
}
