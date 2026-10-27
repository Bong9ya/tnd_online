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
  return {passed};
}
module.exports=run;
if(require.main===module)console.log('PASS: '+run().passed+' checks');
