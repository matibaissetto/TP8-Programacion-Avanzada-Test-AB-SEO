import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { emptyLog, isVariant, type ExperimentLog, type Variant } from './experiment'

/**
 * Persistencia del experimento en SQLite local (sin Docker ni servicios externos).
 * Archivo: data/experiment.db (configurable con EXPERIMENT_DB_PATH).
 *
 * Esquema:
 * - visitors (id, variant, impressed_at, converted_at): asignación persistente
 *   por visitante; impressed_at / converted_at son la base de la idempotencia.
 * - events (id, visitor_id, variant, kind, created_at): log de eventos
 *   ('impression' | 'conversion') del que se derivan los conteos por variante.
 * - meta (key, value): banderas internas (migración legacy).
 *
 * Los conteos se calculan con COUNT(*) sobre events; nunca se guardan como
 * totales sueltos. Las escrituras usan transacciones (BEGIN IMMEDIATE) para que
 * recargas y doble clic concurrentes no dupliquen eventos.
 */

type Db = InstanceType<typeof DatabaseSync>

const SESSION_MS = 30 * 60 * 1000

function getDbPath(): string {
  const custom = process.env.EXPERIMENT_DB_PATH
  if (typeof custom === 'string' && custom.length > 0) return custom
  return join(process.cwd(), 'data', 'experiment.db')
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  variant TEXT NOT NULL CHECK (variant IN ('a', 'b')),
  impressed_at INTEGER,
  converted_at INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('a', 'b')),
  kind TEXT NOT NULL CHECK (kind IN ('impression', 'conversion')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_kind_variant ON events (kind, variant);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/** Migración única desde el legacy data/experiment.json, si existe. */
function migrateLegacy(db: Db): void {
  const legacyPath = join(process.cwd(), 'data', 'experiment.json')
  if (!existsSync(legacyPath)) return

  const already = db.prepare('SELECT value FROM meta WHERE key = ?').get('legacy_migrated')
  if (already) return

  db.exec('BEGIN IMMEDIATE')
  try {
    if (db.prepare('SELECT value FROM meta WHERE key = ?').get('legacy_migrated')) {
      db.exec('COMMIT')
      return
    }
    const raw = readFileSync(legacyPath, 'utf8')
    if (raw.trim().length === 0) {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('legacy_migrated', 'empty')
      db.exec('COMMIT')
      return
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('legacy_migrated', 'invalid')
      db.exec('COMMIT')
      return
    }
    const record = parsed as Record<string, unknown>

    const rawVisitors = typeof record.visitors === 'object' && record.visitors !== null
      ? (record.visitors as Record<string, unknown>)
      : {}
    const insertVisitor = db.prepare(
      'INSERT OR IGNORE INTO visitors (id, variant, impressed_at, converted_at) VALUES (?, ?, ?, ?)',
    )
    for (const [visitorId, entry] of Object.entries(rawVisitors)) {
      if (typeof visitorId !== 'string' || visitorId.length === 0) continue
      if (typeof entry !== 'object' || entry === null) continue
      const e = entry as Record<string, unknown>
      const variantValue = typeof e.variant === 'string' ? e.variant : null
      if (!isVariant(variantValue)) continue
      const impressedAt = typeof e.impressedAt === 'number' && Number.isFinite(e.impressedAt) ? Math.trunc(e.impressedAt) : null
      const convertedAt = typeof e.convertedAt === 'number' && Number.isFinite(e.convertedAt) ? Math.trunc(e.convertedAt) : null
      insertVisitor.run(visitorId, variantValue, impressedAt, convertedAt)
    }

    const rawLog = typeof record.log === 'object' && record.log !== null
      ? (record.log as Record<string, unknown>)
      : {}
    const insertEvent = db.prepare(
      'INSERT INTO events (visitor_id, variant, kind, created_at) VALUES (?, ?, ?, ?)',
    )
    const now = Date.now()
    for (const key of ['a', 'b'] as Variant[]) {
      const entry = rawLog[key]
      if (typeof entry !== 'object' || entry === null) continue
      const e = entry as Record<string, unknown>
      const impressions = typeof e.impressions === 'number' && Number.isFinite(e.impressions) && e.impressions > 0
        ? Math.trunc(e.impressions)
        : 0
      const conversions = typeof e.conversions === 'number' && Number.isFinite(e.conversions) && e.conversions > 0
        ? Math.trunc(e.conversions)
        : 0
      for (let i = 0; i < impressions; i++) {
        insertEvent.run(`migrated-${key}`, key, 'impression', now)
      }
      for (let i = 0; i < conversions; i++) {
        insertEvent.run(`migrated-${key}`, key, 'conversion', now)
      }
    }

    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('legacy_migrated', new Date().toISOString())
    db.exec('COMMIT')
  } catch {
    db.exec('ROLLBACK')
    // Si el JSON legacy está corrupto, la base sigue utilizable.
  }
}

function openDb(): Db {
  const path = getDbPath()
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(SCHEMA_SQL)
  migrateLegacy(db)
  return db
}

export function getVariantForVisitor(visitorId: string): Variant | null {
  if (typeof visitorId !== 'string' || visitorId.length === 0) return null
  const db = openDb()
  try {
    const row = db.prepare('SELECT variant FROM visitors WHERE id = ?').get(visitorId) as
      | Record<string, unknown>
      | undefined
    if (!row || !isVariant(typeof row.variant === 'string' ? row.variant : null)) return null
    return row.variant as Variant
  } finally {
    db.close()
  }
}

/**
 * Totales por variante calculados desde events.
 */
export function getExperimentLog(): ExperimentLog {
  const db = openDb()
  try {
    const log = emptyLog()
    const rows = db
      .prepare('SELECT variant, kind, COUNT(*) AS count FROM events GROUP BY variant, kind')
      .all() as Array<Record<string, unknown>>
    for (const row of rows) {
      const variant = row.variant
      const kind = row.kind
      const count = row.count
      if (!isVariant(typeof variant === 'string' ? variant : null)) continue
      if (kind !== 'impression' && kind !== 'conversion') continue
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) continue
      log[variant as Variant][kind === 'impression' ? 'impressions' : 'conversions'] = Math.trunc(count)
    }
    return log
  } finally {
    db.close()
  }
}

/**
 * Registra una impresión respetando la ventana de 30 minutos por visitante.
 * Devuelve true si se contó una impresión nueva, false si fue duplicada.
 */
export function recordImpression(visitorId: string, variant: Variant, now = Date.now()): boolean {
  if (typeof visitorId !== 'string' || visitorId.length === 0) return false
  if (!isVariant(variant)) return false

  const db = openDb()
  try {
    db.exec('BEGIN IMMEDIATE')
    try {
      const row = db.prepare('SELECT variant, impressed_at FROM visitors WHERE id = ?').get(visitorId) as
        | Record<string, unknown>
        | undefined

      if (row) {
        const persistedVariant = typeof row.variant === 'string' ? row.variant : null
        if (!isVariant(persistedVariant)) {
          db.exec('ROLLBACK')
          return false
        }
        const last = row.impressed_at
        const lastTs = typeof last === 'number' && Number.isFinite(last) ? last : null
        const withinSession = lastTs !== null && now - lastTs < SESSION_MS
        if (withinSession) {
          db.exec('COMMIT')
          return false
        }
        db.prepare('UPDATE visitors SET impressed_at = ? WHERE id = ?').run(now, visitorId)
        db.prepare(
          'INSERT INTO events (visitor_id, variant, kind, created_at) VALUES (?, ?, ?, ?)',
        ).run(visitorId, persistedVariant, 'impression', now)
        db.exec('COMMIT')
        return true
      }

      db.prepare(
        'INSERT INTO visitors (id, variant, impressed_at, converted_at) VALUES (?, ?, ?, NULL)',
      ).run(visitorId, variant, now)
      db.prepare(
        'INSERT INTO events (visitor_id, variant, kind, created_at) VALUES (?, ?, ?, ?)',
      ).run(visitorId, variant, 'impression', now)
      db.exec('COMMIT')
      return true
    } catch (err) {
      try { db.exec('ROLLBACK') } catch { /* noop */ }
      throw err
    }
  } finally {
    db.close()
  }
}

/**
 * Registra una conversión: una sola por visitante, solo si ya hubo impresión
 * y si la variante coincide con la asignada en la base.
 */
export function recordConversionForVisitor(visitorId: string, variant: Variant): boolean {
  if (typeof visitorId !== 'string' || visitorId.length === 0) return false
  if (!isVariant(variant)) return false

  const db = openDb()
  try {
    db.exec('BEGIN IMMEDIATE')
    try {
      const row = db.prepare(
        'SELECT variant, impressed_at, converted_at FROM visitors WHERE id = ?',
      ).get(visitorId) as Record<string, unknown> | undefined

      if (!row) {
        db.exec('COMMIT')
        return false
      }
      const persistedVariant = typeof row.variant === 'string' ? row.variant : null
      if (!isVariant(persistedVariant) || persistedVariant !== variant) {
        db.exec('COMMIT')
        return false
      }
      if (row.converted_at !== null && row.converted_at !== undefined) {
        db.exec('COMMIT')
        return false
      }
      if (typeof row.impressed_at !== 'number' || !Number.isFinite(row.impressed_at)) {
        db.exec('COMMIT')
        return false
      }
      const now = Date.now()
      db.prepare('UPDATE visitors SET converted_at = ? WHERE id = ?').run(now, visitorId)
      db.prepare(
        'INSERT INTO events (visitor_id, variant, kind, created_at) VALUES (?, ?, ?, ?)',
      ).run(visitorId, variant, 'conversion', now)
      db.exec('COMMIT')
      return true
    } catch (err) {
      try { db.exec('ROLLBACK') } catch { /* noop */ }
      throw err
    }
  } finally {
    db.close()
  }
}
