(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TndCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX_MONEY=1000000000,MAX_STOCK=1000000;
function number(value,name,max,integer=true){
  if((typeof value!=='number'&&typeof value!=='string')||(typeof value==='string'&&!value.trim()))throw new Error(name+'을(를) 입력해주세요.');
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>max||(integer&&!Number.isSafeInteger(n)))throw new Error(name+'은(는) 0~'+max.toLocaleString('ko-KR')+(integer?' 사이의 정수':' 사이의 숫자')+'로 입력해주세요.');
  return n;
}
function label(value,name,max,required=false){if(typeof value!=='string')throw new Error(name+' 형식이 올바르지 않습니다.');const text=value.trim();if((required&&!text)||text.length>max)throw new Error(name+'은(는) '+max+'자 이내로 입력해주세요.');return text;}
function validateProduct(p){
  if(!p||typeof p!=='object')throw new Error('상품 정보가 올바르지 않습니다.');
  if(typeof p.feeOnShipping!=='boolean')throw new Error('배송비 수수료 설정을 확인해주세요.');
  const feeRate=number(p.feeRate,'판매 수수료율',100,false);
  if(Math.abs(feeRate*100-Math.round(feeRate*100))>0.000001)throw new Error('수수료율은 소수점 둘째 자리까지 입력해주세요.');
  return {name:label(p.name,'상품명',80,true),sku:label(p.sku??'','상품 코드',40),supplier:normalizeSupplier(p.supplier),cost:number(p.cost,'상품 원가',MAX_MONEY),salePrice:number(p.salePrice,'판매가',MAX_MONEY),customerShipping:number(p.customerShipping,'고객 배송비',MAX_MONEY),shippingCost:number(p.shippingCost,'실제 택배비',MAX_MONEY),packingCost:number(p.packingCost,'포장비',MAX_MONEY),feeRate,fixedFee:number(p.fixedFee,'추가 고정 수수료',MAX_MONEY),feeOnShipping:p.feeOnShipping,lowStock:number(p.lowStock,'재고 알림 기준',MAX_STOCK)};
}
function calculate(p){
  const revenue=p.salePrice+p.customerShipping,feeBase=p.salePrice+(p.feeOnShipping?p.customerShipping:0);
  const fee=Math.round(feeBase*p.feeRate/100)+p.fixedFee,totalCost=p.cost+p.shippingCost+p.packingCost+fee,profit=revenue-totalCost;
  return {revenue,feeBase,fee,totalCost,profit,margin:revenue>0?profit/revenue*100:null};
}
function emptyState(){return {version:1,products:[],movements:[]};}
function stockFor(state,id){return state.movements.reduce((n,m)=>m.productId===id?n+(m.type==='in'?m.quantity:-m.quantity):n,0);}
function stockStatus(qty,threshold){return qty===0?'out':qty<=threshold?'low':'normal';}
function uniqueSku(state,sku,exceptId,supplier=''){return !sku||!state.products.some(p=>p.id!==exceptId&&(p.supplier||'')===supplier&&p.sku.toLocaleLowerCase()===sku.toLocaleLowerCase());}
function identifier(v){return label(v,'식별자',100,true);}
function timestamp(v){if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw new Error('기록 날짜가 올바르지 않습니다.');return new Date(v).toISOString();}
function validateMovement(m,ids){
  if(!m||typeof m!=='object')throw new Error('입출고 기록이 올바르지 않습니다.');
  const productId=identifier(m.productId);
  if(!ids.has(productId))throw new Error('존재하지 않는 상품의 입출고 기록입니다.');
  if(m.type!=='in'&&m.type!=='out')throw new Error('입출고 구분이 올바르지 않습니다.');
  const quantity=number(m.quantity,'입출고 수량',MAX_STOCK);if(!quantity)throw new Error('입출고 수량은 1개 이상이어야 합니다.');
  return {id:identifier(m.id),productId,type:m.type,quantity,note:label(m.note??'','메모',200),at:timestamp(m.at)};
}
function recordMovement(state,input){
  const m=validateMovement(input,new Set(state.products.map(p=>p.id)));
  if(state.movements.some(item=>item.id===m.id))throw new Error('중복된 입출고 기록입니다.');
  const stock=stockFor(state,m.productId)+(m.type==='in'?m.quantity:-m.quantity);
  if(stock<0)throw new Error('출고 수량이 현재 재고보다 많습니다.');
  if(stock>MAX_STOCK)throw new Error('재고는 1,000,000개까지 관리할 수 있습니다.');
  return {...state,movements:[...state.movements,m]};
}
function validateState(input){
  if(!input||input.version!==1||!Array.isArray(input.products)||!Array.isArray(input.movements))throw new Error('지원하는 TND 백업 파일이 아닙니다.');
  if(input.products.length>5000||input.movements.length>100000)throw new Error('백업 파일의 상품 또는 입출고 기록이 너무 많습니다.');
  const ids=new Set(),skus=new Set();
  const products=input.products.map(item=>{
    const id=identifier(item.id),p=validateProduct(item),key=p.sku?JSON.stringify([p.supplier,p.sku.toLocaleLowerCase()]):'';
    if(ids.has(id)||(key&&skus.has(key)))throw new Error('중복된 상품 또는 상품 코드가 있습니다.');
    ids.add(id);if(key)skus.add(key);return {id,...p,createdAt:timestamp(item.createdAt)};
  });
  const movementIds=new Set(),totals=new Map();
  const movements=input.movements.map(item=>{
    const m=validateMovement(item,ids);if(movementIds.has(m.id))throw new Error('중복된 입출고 기록이 있습니다.');movementIds.add(m.id);
    const stock=(totals.get(m.productId)||0)+(m.type==='in'?m.quantity:-m.quantity);
    if(stock<0||stock>MAX_STOCK)throw new Error('입출고 이력의 재고 수량이 올바르지 않습니다.');
    totals.set(m.productId,stock);return m;
  });return {version:1,products,movements};
}

function normalizeSupplier(value){return label(value??'','매입처(공급사)',80).replace(/\s+/g,' ');}
function supplierToken(name){return name?'supplier:'+name:'unassigned';}
function filterBySupplier(products,token='all'){return token==='all'?products.slice():products.filter(p=>supplierToken(p.supplier||'')===token);}
function supplierSummaries(state){
  const stocks=new Map(state.products.map(p=>[p.id,0]));
  state.movements.forEach(m=>stocks.set(m.productId,stocks.get(m.productId)+(m.type==='in'?m.quantity:-m.quantity)));
  const groups=new Map();
  state.products.forEach(p=>{
    const name=p.supplier||'',key=supplierToken(name),qty=stocks.get(p.id)||0;
    if(!groups.has(key))groups.set(key,{key,name,productCount:0,stock:0,stockValue:0n,lowStockCount:0});
    const group=groups.get(key);group.productCount++;group.stock+=qty;group.stockValue+=BigInt(p.cost)*BigInt(qty);
    if(qty<=p.lowStock)group.lowStockCount++;
  });
  return [...groups.values()].sort((a,b)=>!a.name?1:!b.name?-1:a.name.localeCompare(b.name,'ko-KR'));
}
function renameSupplier(state,oldName,newName){
  const previous=normalizeSupplier(oldName),next=normalizeSupplier(newName);
  if(!previous||!next)throw new Error('매입처 이름을 입력해주세요.');
  if(!state.products.some(p=>p.supplier===previous))throw new Error('변경할 매입처를 찾을 수 없습니다.');
  if(next!==previous&&state.products.some(p=>p.supplier===next))throw new Error('이미 존재하는 매입처 이름입니다. 다른 이름을 입력해주세요.');
  return {...state,products:state.products.map(p=>p.supplier===previous?{...p,supplier:next}:p)};
}

function csvCell(value){let text=String(value??'');if(typeof value==='string'&&/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function toCsv(state,token='all'){
  const rows=[['상품명','상품코드','매입처(공급사)','상품원가','판매가','고객배송비','실제택배비','포장비','수수료율(%)','고정수수료','배송비수수료포함','예상수수료','예상이익','이익률(%)','현재재고','재고알림기준']];
  filterBySupplier(state.products,token).forEach(p=>{const c=calculate(p);rows.push([p.name,p.sku,p.supplier||'',p.cost,p.salePrice,p.customerShipping,p.shippingCost,p.packingCost,p.feeRate,p.fixedFee,p.feeOnShipping?'예':'아니오',c.fee,c.profit,c.margin===null?'':Math.round(c.margin*10)/10,stockFor(state,p.id),p.lowStock]);});
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
return Object.freeze({MAX_STOCK,number,validateProduct,calculate,emptyState,stockFor,stockStatus,uniqueSku,recordMovement,validateState,toCsv,normalizeSupplier,supplierToken,filterBySupplier,supplierSummaries,renameSupplier});
});
