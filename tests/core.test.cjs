'use strict';
const assert = require('node:assert/strict');
const C = require('../core.js');
function run() {
  let passed = 0;
  const test = (name,fn) => { try { fn(); passed++; } catch(error) { error.message = name + ': ' + error.message; throw error; } };
  const p = extra => C.validateProduct({name:'테스트 상품',sku:'T-001',cost:4500,salePrice:12900,customerShipping:3000,shippingCost:3200,packingCost:300,feeRate:5.5,fixedFee:0,feeOnShipping:true,lowStock:5,...extra});
  const product = {id:'p1',...p(),createdAt:'2026-10-27T00:00:00.000Z'};
  const base = {version:1,products:[product],movements:[]};
  const movement = (id,type,quantity) => ({id,productId:'p1',type,quantity,note:'검증',at:'2026-10-27T01:00:00Z'});
  test('유료배송, 배송비 수수료, 원단위 반올림',() => {
    const c = C.calculate(p()); assert.equal(c.revenue,15900); assert.equal(c.fee,875); assert.equal(c.profit,7025);
    assert.ok(Math.abs(c.margin-44.1823899371)<0.0001);
  });
  test('배송비 수수료 제외',() => { const c=C.calculate(p({feeOnShipping:false}));assert.equal(c.fee,710);assert.equal(c.profit,7190); });
  test('무료배송과 추가 고정 수수료',() => { const c=C.calculate(p({customerShipping:0,fixedFee:100}));assert.equal(c.revenue,12900);assert.equal(c.fee,810);assert.equal(c.profit,4090); });
  test('0원 매출의 이익률과 손실',() => { const c=C.calculate(p({salePrice:0,customerShipping:0}));assert.equal(c.margin,null);assert.equal(c.profit,-8000); });
  test('수수료 100%에서도 손실을 숨기지 않음',() => assert.equal(C.calculate(p({feeRate:100})).profit,-8000));
  test('음수, 무한대, 소수 원화 거절',() => { for(const cost of [-1,Infinity,NaN,0.5,'','   ',null,true,[],{}]) assert.throws(() => p({cost})); });
  test('수수료율 범위와 정밀도 검증',() => { for(const feeRate of [-1,101,5.555]) assert.throws(() => p({feeRate}));assert.equal(p({feeRate:5.55}).feeRate,5.55); });
  test('상품 이름과 코드 정리',() => { assert.equal(p({name:'  원목  '}).name,'원목');assert.throws(() => p({name:'  '})); });
  test('입출고 누적 및 원본 상태 보존',() => { const s=C.recordMovement(base,movement('in','in',10));const t=C.recordMovement(s,movement('out','out',4));assert.equal(C.stockFor(t,'p1'),6);assert.equal(base.movements.length,0); });
  test('재고 전량 출고 후 품절',() => { const s=C.recordMovement(C.recordMovement(base,movement('in','in',5)),movement('out','out',5));assert.equal(C.stockFor(s,'p1'),0);assert.equal(C.stockStatus(0,5),'out'); });
  test('초과 출고는 저장되지 않음',() => { const s=C.recordMovement(base,movement('in','in',3));assert.throws(() => C.recordMovement(s,movement('out','out',4)),/현재 재고/);assert.equal(C.stockFor(s,'p1'),3); });
  test('0 또는 소수 수량과 음수 입고 거절',() => { for(const qty of [0,-1,1.5]) assert.throws(() => C.recordMovement(base,movement('in','in',qty))); });
  test('재고 상한과 중복 이력 거절',() => { const s=C.recordMovement(base,movement('in','in',1000000));assert.throws(() => C.recordMovement(s,movement('more','in',1)));assert.throws(() => C.recordMovement(s,movement('in','in',1))); });
  test('재고 부족 경계값',() => { assert.equal(C.stockStatus(5,5),'low');assert.equal(C.stockStatus(6,5),'normal'); });
  test('상품 코드 중복은 대소문자 무관',() => { assert.equal(C.uniqueSku(base,'t-001'),false);assert.equal(C.uniqueSku(base,'T-001','p1'),true); });
  test('백업 복원 후 수량 유지',() => { const s=C.recordMovement(base,movement('in','in',8));assert.deepEqual(C.validateState(JSON.parse(JSON.stringify(s))),s); });
  test('손상된 백업과 미래 형식 거절',() => { for(const value of [null,{},[],{version:2,products:[],movements:[]}])assert.throws(() => C.validateState(value)); });
  test('존재하지 않는 상품, 중복 상품 및 음수 재고 백업 거절',() => {
    assert.throws(() => C.validateState({...base,movements:[{...movement('x','in',1),productId:'missing'}]}));
    assert.throws(() => C.validateState({...base,products:[product,product]}));
    assert.throws(() => C.validateState({...base,movements:[movement('x','out',1)]}));
  });
  test('백업 안의 중복 코드와 중복 기록 거절',() => {
    assert.throws(() => C.validateState({...base,products:[product,{...product,id:'p2',sku:'t-001'}]}));
    assert.throws(() => C.validateState({...base,movements:[movement('x','in',1),movement('x','in',1)]}));
  });
  test('CSV 특수문자와 수식 주입 방지, 음수 금액 유지',() => {
    const csv=C.toCsv({...base,products:[{...product,name:'=SUM(1,2)',sku:'코드\"줄\\n',salePrice:0,customerShipping:0}]});
    assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('\"\\\'=SUM(1,2)\"'.replace('\\\'',"'")));assert.ok(csv.includes('\"-8,000\"')===false);assert.ok(csv.includes('\"-8000\"'));assert.ok(csv.includes('코드\"\"줄'));
  });

  test('매입처 이름은 선택 입력이고 공백을 정리함',() => {
    assert.equal(p().supplier,'');assert.equal(p({supplier:'  티앤디   물산  '}).supplier,'티앤디 물산');
    for(const supplier of [12,{},[],true,'가'.repeat(81)])assert.throws(() => p({supplier}));
  });
  test('매입처 필드가 없는 기존 백업도 재고와 비용을 유지함',() => {
    const legacy=JSON.parse(JSON.stringify(C.recordMovement(base,movement('legacy','in',9))));
    delete legacy.products[0].supplier;
    const restored=C.validateState(legacy);assert.equal(restored.products[0].supplier,'');
    assert.equal(C.stockFor(restored,'p1'),9);assert.equal(C.calculate(restored.products[0]).profit,7025);
    assert.deepEqual(restored.movements,legacy.movements);
  });
  const supplyProduct=(id,supplier,cost,sku=id)=>({id,...p({name:id,supplier,cost,sku}),createdAt:'2026-10-27T00:00:00Z'});
  const supplierState={version:1,products:[supplyProduct('a','공급사 A',100),supplyProduct('b','공급사 A',200),supplyProduct('c','공급사 B',300),supplyProduct('d','',400)],movements:[
    {id:'ma',productId:'a',type:'in',quantity:10,note:'입고',at:'2026-10-27T01:00:00Z'},
    {id:'mb',productId:'b',type:'in',quantity:3,note:'입고',at:'2026-10-27T01:00:00Z'},
    {id:'mc',productId:'c',type:'in',quantity:8,note:'입고',at:'2026-10-27T01:00:00Z'},
    {id:'md',productId:'a',type:'out',quantity:2,note:'출고',at:'2026-10-27T02:00:00Z'}]};
  test('공급사별 집계에 출고와 미지정·품절 상품을 반영함',() => {
    const groups=C.supplierSummaries(supplierState),a=groups.find(g=>g.name==='공급사 A'),unassigned=groups.find(g=>!g.name);
    assert.equal(a.productCount,2);assert.equal(a.stock,11);assert.equal(a.stockValue,1400n);assert.equal(a.lowStockCount,1);
    assert.equal(unassigned.productCount,1);assert.equal(unassigned.stock,0);assert.equal(unassigned.lowStockCount,1);
    assert.equal(groups.at(-1).key,'unassigned');assert.deepEqual(C.supplierSummaries(C.emptyState()),[]);
  });
  test('공급사 필터는 미지정과 예약어 같은 이름을 구분함',() => {
    assert.equal(C.filterBySupplier(supplierState.products,'supplier:공급사 A').length,2);
    assert.deepEqual(C.filterBySupplier(supplierState.products,'unassigned').map(x=>x.id),['d']);
    const special=[supplyProduct('special','unassigned',100)];
    assert.equal(C.filterBySupplier(special,C.supplierToken('unassigned')).length,1);
    assert.equal(C.filterBySupplier(special,'unassigned').length,0);
    assert.equal(C.filterBySupplier(special,'supplier:missing').length,0);
  });
  test('같은 상품 코드를 다른 공급사에는 등록할 수 있음',() => {
    const s={version:1,products:[supplyProduct('a','공급사 A',100,'SAME'),supplyProduct('b','공급사 B',200,'same')],movements:[]};
    assert.equal(C.validateState(s).products.length,2);
    assert.equal(C.uniqueSku(s,'same',undefined,'공급사 A'),false);
    assert.equal(C.uniqueSku(s,'same',undefined,'공급사 C'),true);
    assert.equal(C.uniqueSku(s,'same','a','공급사 A'),true);
    assert.throws(()=>C.validateState({...s,products:[s.products[0],{...s.products[1],supplier:'공급사 A'}]}));
  });
  test('매입처 일괄 이름 변경 후 상품 ID·원가·재고·이력 유지',() => {
    const changed=C.renameSupplier(supplierState,'공급사 A','  새 매입처  ');
    assert.equal(changed.products.filter(x=>x.supplier==='새 매입처').length,2);
    assert.equal(supplierState.products[0].supplier,'공급사 A');assert.deepEqual(changed.movements,supplierState.movements);
    assert.deepEqual(changed.products.map(x=>[x.id,x.cost]),supplierState.products.map(x=>[x.id,x.cost]));
    assert.equal(C.stockFor(changed,'a'),8);
  });
  test('매입처 이름 변경 시 중복·빈값·존재하지 않는 이름 거절',() => {
    for(const [before,after] of [['공급사 A','공급사 B'],['공급사 A',' '],['','새 이름'],['없는 매입처','새 이름']]) assert.throws(()=>C.renameSupplier(supplierState,before,after));
  });
  test('신규 백업은 매입처 이름과 입출고 이력을 함께 복원함',() => {
    const s={...supplierState,products:supplierState.products.map(x=>({...x,supplier:x.id==='a'?'A & <B> \"공급사\"':x.supplier}))};
    const result=C.validateState(JSON.parse(JSON.stringify(s)));
    assert.equal(result.products[0].supplier,'A & <B> \"공급사\"');assert.deepEqual(result.movements,s.movements.map(m=>({...m,at:new Date(m.at).toISOString()})));
  });
  test('매입처별 CSV는 선택 공급사만 포함하고 이름의 수식을 무력화함',() => {
    const csv=C.toCsv(supplierState,'supplier:공급사 A');
    assert.ok(csv.includes('매입처(공급사)'));assert.ok(csv.includes('공급사 A'));assert.ok(!csv.includes('공급사 B'));
    assert.equal(csv.split('\r\n').length,3);
    const formula={version:1,products:[supplyProduct('a','=SUM(1,2)',100)],movements:[]};
    assert.ok(C.toCsv(formula).includes("\"'=SUM(1,2)\""));
  });
  test('공급사 재고 원가 총액은 큰 수에서도 원 단위를 유지함',() => {
    const products=Array.from({length:10},(_,i)=>supplyProduct('huge'+i,'대량',1000000000));
    products.push(supplyProduct('one','대량',1));
    const movements=products.map((item,i)=>({id:'large'+i,productId:item.id,type:'in',quantity:i===10?1:1000000,note:'대량',at:'2026-10-27T00:00:00Z'}));
    assert.equal(C.supplierSummaries({version:1,products,movements})[0].stockValue,10000000000000001n);
  });

  return {passed};
}
module.exports=run;
if(require.main===module)console.log('PASS: '+run().passed+' checks');
