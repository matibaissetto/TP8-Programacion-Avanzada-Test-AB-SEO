# TP8 — Experimento A/B y SEO · Taller Norte

Landing ficticia "Taller Norte" con experimento A/B sobre el mensaje, sin cambiar la oferta. Dos variantes (A control / B tratamiento) servidas desde la misma URL indexable `/practica`, con metadatos SEO generados en el servidor, canonical fijo, preview no indexable, impresiones deduplicadas por sesión de 30 minutos y conversiones únicas por visitante persistidas en base local.

- Variante A (control): "Ocho semanas para un oficio que se puede cobrar." — CTA "Ver cupos de abril"
- Variante B (tratamiento): "El curso empieza el 14 de abril." + "El cupo, no." — CTA "Reservar mi lugar"
- Oferta idéntica: inicio 14 de abril, 8 semanas, cupo 12 personas, oficios carpintería / electricidad / cocina.

## Stack

- Next.js 16.4.0 + React 19 + TypeScript + Tailwind CSS 4
- App Router, proxy.ts (`/practica`)
- pnpm (no npm/yarn)
- Persistencia: SQLite real mediante `node:sqlite`. Visitantes y eventos en disco; métricas calculadas con `COUNT(*)`.

## Requisitos

- Node.js 24+ y pnpm 9.15.9 (versión fijada en `package.json` para reproducir la instalación).
- Conexión para `pnpm install` (solo la primera vez).

## Instalación

```bash
pnpm install
```

## Ejecución local

```bash
pnpm dev
# abre http://localhost:3000
```

URLs:

- Landing: http://localhost:3000/practica
- Bitácora (datos reales + caso fijo): http://localhost:3000/bitacora

## Base de datos

- Archivo: `data/experiment.db` (automático), configurable con `EXPERIMENT_DB_PATH`.
- SQLite con WAL y transacciones. No requiere servicios externos y sobrevive a reinicios.

## Reiniciar los datos del experimento

Detener el servidor, borrar `data/experiment.db`, sus auxiliares `-wal` y `-shm`, y cualquier `data/experiment.json` legacy para evitar reimportarlo y volver a levantar la app.

```powershell
Remove-Item data\experiment.db,data\experiment.db-wal,data\experiment.db-shm,data\experiment.json -ErrorAction SilentlyContinue
pnpm dev
```

## Preview A/B

- `/practica?preview=a` → muestra copy A, no escribe cookies, no registra impresión, lleva `noindex`, canonical `/practica`.
- `/practica?preview=b` → muestra copy B, misma semántica.
- Al salir del preview (quitar el query), vuelve la variante real asignada por cookie.

## Asignación y hash

- `assignVariant` usa hash estable FNV-1a 32 bits. Paridad par → A, impar → B.
- `assignVariant('lab-visitor-demo-01') === 'b'`.
- Visitante y variante duran 30 días (`lab_visitor`, `lab_variant`, path `/`, httpOnly).
- Impresiones: ventana de 30 minutos validada en SQLite; `lab_impressed` es auxiliar. Borrar esa cookie no duplica impresiones.
- Conversión: solo por clic en el CTA, una por visitante, validando visitante y variante. Cargar la página no convierte.

## SEO

- `generateMetadata` en el servidor: title/description según variante, canonical `/practica` sin query.
- Preview: title/description de la variante pedida + `noindex`.
- Crawler sin cookies: recibe control A estable (ver INFORME.md).

## Verificación

Ver `INFORME.md` y la checklist de pruebas del TP en la bitácora:

- `/bitacora` muestra dos bloques: datos reales (desde la base) y caso fijo (A 240/18, B 236/31 → 7,50% / 13,14% / 5,64 pp). Sin impresiones: "Pendiente".

## Build

```bash
pnpm build
```

El proyecto compila con `pnpm build`, sin omitir controles ni actualizar Next.js.

## Pruebas reproducibles

`node scripts/db-verify.mjs` ejecuta el código real de `lib/db.ts` en bases temporales y comprueba deduplicación, ventana de 30 minutos, métricas, hash, tasas y migración legacy (incluidos JSON corrupto y rollback). `node scripts/db-verify.ts` ofrece la misma prueba en Node.js 24+.

Para la prueba HTTP, usar una base separada de los datos habituales:

```powershell
pnpm build
$env:EXPERIMENT_DB_PATH = "$PWD/data/e2e.db"
pnpm start --port 3001
```

En otra terminal: `node scripts/e2e-verify.mjs`. Se puede elegir otro servidor mediante `BASE_URL`. El script verifica cookies, HTML SEO, previews, crawler, bitácora y la Server Action real, incluido doble envío. Admite datos previos y compara incrementos. No simula un clic de navegador; ese paso y el reinicio del servidor se comprueban por separado.

Si hay un `data/experiment.json` legacy, la base nueva lo importa una única vez. Para una prueba vacía, usar una copia de trabajo sin ese archivo o apartarlo temporalmente con el servidor detenido. Al terminar, detener el servidor de prueba y quitar `EXPERIMENT_DB_PATH` de esa terminal para volver a `data/experiment.db`.
