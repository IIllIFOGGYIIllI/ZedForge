// Run with node tests/run-tests.mjs
// These checks exercise the browser engine's actual source functions without third-party dependencies.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const between=(a,b)=>{const x=code.indexOf(a),y=code.indexOf(b,x+a.length);assert(x>=0&&y>x,'Expected function markers found: '+a);return code.slice(x,y)};
const replaceField = new Function(between('function replaceField(','$(\'apply-boost\')')+';return replaceField;')();
const calculateBoost = new Function(between('function calculateBoost(','function makeBoost(')+';return calculateBoost;')();
const categorise = new Function(between('function categorise(','function getEconomy(')+';return categorise;')();
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS',name)}
check('Targeted replacement preserves other XML content',()=>{
 const input='<type name="Example"><nominal>48</nominal>\n    <min>31</min><lifetime>14400</lifetime><!-- keep me --></type>';
 const out=replaceField(input,'nominal',96);
 assert.equal(out,'<type name="Example"><nominal>96</nominal>\n    <min>31</min><lifetime>14400</lifetime><!-- keep me --></type>');
});
check('Quantity fields handle -1',()=>assert.equal(replaceField('<quantmin>-1</quantmin>','quantmin',100),'<quantmin>100</quantmin>'));
check('Unknown tags cannot be silently inserted',()=>assert.throws(()=>replaceField('<min>31</min>','nominal',4),/Could not safely edit/));
check('Decimal multiplier rounds to nearest integer',()=>assert.equal(calculateBoost(11,1.5,'multiply',false),17));
check('Zero quantities remain disabled during multiplication',()=>assert.equal(calculateBoost(0,5,'multiply',true),0));
check('Exact boosts preserve zeros unless explicitly included',()=>{assert.equal(calculateBoost(0,42,'exact',false),0);assert.equal(calculateBoost(0,42,'exact',true),42)});
const node=(name)=>({children:[{localName:'category',getAttribute:()=>name}]});
check('AmmoBox is classified as ammunition',()=>assert.equal(categorise(node('weapons'),'AmmoBox_556x45_20Rnd'),'ammo'));
check('Generic tools are not all building materials',()=>assert.equal(categorise(node('tools'),'AlarmClock_Blue'),'other'));
check('DayZ food category is respected',()=>assert.equal(categorise(node('food'),'Achar'),'food'));
const ids=[...code.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map(x=>x[1]);
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const known=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
check('Every referenced interface ID exists',()=>assert.deepEqual([...new Set(ids.filter(id=>!known.has(id)))],[]));
check('No external JavaScript is required',()=>assert(!/<script[^>]+src="https?:/i.test(html)));
check('Offline ZIP module is precached',()=>assert(readFileSync(new URL('../sw.js',import.meta.url),'utf8').includes('vendor/jszip.min.js')));
console.log('\n'+passed+' checks passed.');
