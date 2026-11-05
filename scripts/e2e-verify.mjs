// Pruebas HTTP reales contra un servidor de producción. BASE_URL es configurable.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const BASE=process.env.BASE_URL || 'http://localhost:3001'
const manifest=JSON.parse(readFileSync(fileURLToPath(new URL('../.next/server/server-reference-manifest.json',import.meta.url)),'utf8'))
const actionId=Object.entries(manifest.node).find(([,v])=>v.exportedName==='recordConversion')?.[0]
assert.ok(actionId,'Compilar antes de ejecutar E2E')
const titles={a:'Cursos de oficio en ocho semanas, con salida laboral',b:'Abril abre cupos: cursos de oficio en grupos de 12'}
const descriptions={a:'Aprendé carpintería, electricidad o cocina en ocho semanas. Grupos de doce personas y práctica real, con una salida laboral que se puede cobrar.',b:'El 14 de abril empiezan grupos de doce. En la cohorte anterior, ocho de cada diez consiguieron trabajo en el rubro antes de los noventa días.'}
const jar=new Map()
async function request(path,cookies=jar,options={}){
 const headers={Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers}
 const response=await fetch(BASE+path,{...options,headers,redirect:'manual'})
 const set=response.headers.getSetCookie()
 const html=await response.text()
 assert.equal(response.status,200,`${path}: ${html.slice(0,120)}`)
 return {html,set}
}
function merge(lines){for(const line of lines){const pair=line.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1))}}
async function counts(){const {html}=await request('/bitacora');const values=[...html.matchAll(/<td class="py-3 font-mono">(.*?)<\/td>/g)].slice(0,6).map(m=>m[1].replace(/<!--.*?-->/g,'').trim());assert.equal(values.length,6);return {impressions:Number(values[0].replaceAll('.',''))+Number(values[3].replaceAll('.','')),conversions:Number(values[1].replaceAll('.',''))+Number(values[4].replaceAll('.','')),html}}
function seo(html,variant,preview){assert.ok(html.includes(`<title>${titles[variant]}</title>`));assert.ok(html.includes(`name="description" content="${descriptions[variant]}"`));assert.match(html,/<link rel="canonical" href="\/practica"/);assert.ok(html.includes(`name="robots" content="${preview?'noindex, nofollow':'index, follow'}"`))}
async function convert(preview=false,path='/practica',cookies=jar){return request(path,cookies,{method:'POST',headers:{'Next-Action':actionId,'Content-Type':'text/plain;charset=UTF-8',Origin:BASE,Referer:BASE+path},body:JSON.stringify([preview])})}
const initial=await counts()
const first=await request('/practica');merge(first.set)
assert.ok(jar.get('lab_visitor'));assert.ok(['a','b'].includes(jar.get('lab_variant')))
seo(first.html,jar.get('lab_variant'),false)
assert.ok(first.set.filter(v=>/lab_visitor=|lab_variant=/.test(v)).every(v=>/Max-Age=2592000/i.test(v)))
let current=await counts();assert.equal(current.impressions,initial.impressions+1);assert.equal(current.conversions,initial.conversions)
const assigned=[...jar]
await request('/practica');assert.equal((await counts()).impressions,current.impressions)
for(const v of ['a','b']){const p=await request('/practica?preview='+v);assert.equal(p.set.length,0);seo(p.html,v,true)}
assert.deepEqual([...jar],assigned)
seo((await request('/practica')).html,jar.get('lab_variant'),false)
await convert(true,'/practica?preview=b');assert.equal((await counts()).conversions,initial.conversions)
await convert(false,'/practica?preview=a');assert.equal((await counts()).conversions,initial.conversions)
await convert(false,'/practica',new Map());assert.equal((await counts()).conversions,initial.conversions)
const wrong=new Map(jar);wrong.set('lab_variant',jar.get('lab_variant')==='a'?'b':'a')
await convert(false,'/practica',wrong);assert.equal((await counts()).conversions,initial.conversions)
await convert();assert.equal((await counts()).conversions,initial.conversions+1)
await convert();assert.equal((await counts()).conversions,initial.conversions+1)
jar.delete('lab_impressed');await request('/practica');assert.equal((await counts()).impressions,current.impressions)
const beforeCrawler=await counts()
for(let i=0;i<2;i++){const crawler=await request('/practica',new Map(),{headers:{'User-Agent':'Googlebot'}});assert.equal(crawler.set.length,0);seo(crawler.html,'a',false)}
assert.equal((await counts()).impressions,beforeCrawler.impressions)
const anon=await request('/practica?preview=b',new Map());assert.equal(anon.set.length,0);seo(anon.html,'b',true)
const fixed=(await counts()).html
for(const value of ['7,50%','13,14%','5,64 pp']) assert.ok(fixed.includes(value))
console.log('PASS: primera visita +1; cookies 30 días; variante estable; SEO exacto en HTML; canonical; index/noindex; previews sin cookies, impresiones ni conversiones; carga sin conversión; acción real +1; doble acción deduplicada; visitante/variante inválidos; crawler A; bitácora y caso fijo.')
console.log('La prueba HTTP invoca la Server Action válida. El clic físico de UI se comprueba por separado.')
