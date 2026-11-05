// Ejecuta lib/db.ts real en una base temporal aislada.
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runInThisContext } from 'node:vm'
import { DatabaseSync } from 'node:sqlite'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const cache = new Map()
function load(path) {
  if (cache.has(path)) return cache.get(path).exports
  const module = { exports: {} }; cache.set(path, module)
  const code = ts.transpileModule(fs.readFileSync(join(root,path),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:path})(name=>name==='./experiment'?load('lib/experiment.ts'):require(name),module,module.exports)
  return module.exports
}
const originalCwd=process.cwd(), originalPath=process.env.EXPERIMENT_DB_PATH
const temp=fs.mkdtempSync(join(tmpdir(),'tp8-db-'))
process.chdir(temp); process.env.EXPERIMENT_DB_PATH=join(temp,'experiment.db')
try {
 const e=load('lib/experiment.ts'), d=load('lib/db.ts'), now=Date.now()
 assert.equal(e.assignVariant('lab-visitor-demo-01'),'b')
 assert.equal(e.formatRate(e.conversionRate(e.TEST_CASE.a)),'7,50%')
 assert.equal(e.formatRate(e.conversionRate(e.TEST_CASE.b)),'13,14%')
 assert.equal(e.formatPoints(e.rateGap(e.TEST_CASE)),'5,64 pp')
 assert.equal(e.formatRate(e.conversionRate({impressions:0,conversions:0})),'Pendiente')
 assert.equal(d.recordImpression('test','a',now),true)
 assert.equal(d.recordImpression('test','a',now+1),false)
 assert.equal(d.recordConversionForVisitor('missing','a'),false)
 assert.equal(d.recordConversionForVisitor('test','b'),false)
 assert.equal(d.recordConversionForVisitor('test','a'),true)
 assert.equal(d.recordConversionForVisitor('test','a'),false)
 assert.equal(d.recordImpression('test','a',now+1800000),true)
 assert.deepEqual(d.getExperimentLog(),{a:{impressions:2,conversions:1},b:{impressions:0,conversions:0}})
 assert.equal(fs.readFileSync(process.env.EXPERIMENT_DB_PATH).subarray(0,16).toString(),'SQLite format 3\0')
 console.log('PASS: SQLite real, métricas, duplicados, ventana de 30 minutos, validación, hash B, tasas y Pendiente')
 fs.mkdirSync('data')
 fs.writeFileSync('data/experiment.json',JSON.stringify({log:{a:{impressions:3,conversions:1}},visitors:{legacy:{variant:'a',impressedAt:now,convertedAt:now}}}))
 process.env.EXPERIMENT_DB_PATH=join(temp,'migration.db')
 const migrated=d.getExperimentLog()
 assert.equal(migrated.a.impressions,3);assert.equal(migrated.a.conversions,1)
 assert.deepEqual(d.getExperimentLog(),migrated)
 assert.equal(d.recordConversionForVisitor('legacy','a'),false)
 fs.writeFileSync('data/experiment.json','{corrupto')
 process.env.EXPERIMENT_DB_PATH=join(temp,'corrupt.db')
 assert.equal(d.recordImpression('valid','b'),true)
 assert.equal(d.getExperimentLog().b.impressions,1)
 fs.writeFileSync('data/experiment.json',JSON.stringify({log:{a:{impressions:3,conversions:1}}}))
 process.env.EXPERIMENT_DB_PATH=join(temp,'rollback.db')
 const db=new DatabaseSync(process.env.EXPERIMENT_DB_PATH)
 db.exec("CREATE TABLE events(id INTEGER PRIMARY KEY,visitor_id TEXT,variant TEXT,kind TEXT,created_at INTEGER); CREATE TRIGGER fail_migration BEFORE INSERT ON events WHEN (SELECT COUNT(*) FROM events)=1 BEGIN SELECT RAISE(ABORT,'test'); END;")
 assert.equal(d.getExperimentLog().a.impressions,0)
 db.exec('DROP TRIGGER fail_migration')
 assert.equal(d.getExperimentLog().a.impressions,3)
 assert.equal(d.getExperimentLog().a.conversions,1)
 db.close()
 console.log('PASS: migración única, JSON corrupto, rollback y reintento sin duplicados')
} finally {
 process.chdir(originalCwd)
 if(originalPath===undefined) delete process.env.EXPERIMENT_DB_PATH; else process.env.EXPERIMENT_DB_PATH=originalPath
 fs.rmSync(temp,{recursive:true,force:true})
}
