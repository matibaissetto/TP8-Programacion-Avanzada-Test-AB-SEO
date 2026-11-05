'use client'

import { useState, useTransition } from 'react'
import { recordConversion } from '@/app/practica/actions'

export function Cta({ label, preview = false }: { label: string; preview?: boolean }) {
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await recordConversion(preview)
            setDone((previous) => previous || result.status === 'ok')
          })
        }}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {label}
      </button>
      <p className="max-w-md text-sm text-muted-foreground">
        {done
          ? 'Conversión registrada (una por visitante).'
          : 'La conversión se anota solo acá. Cargar la página no cuenta.'}
      </p>
    </div>
  )
}
