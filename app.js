/* TND seller workspace — browser-local data; no third-party requests. */
(() => {
  'use strict';
  const C = window.TndCore, $ = id => document.getElementById(id);
  const KEY = 'tnd-online-workspace-v1';
  const fields = ['name','sku','supplier','cost','salePrice','customerShipping','shippingCost','packingCost','feeRate','fixedFee','feeOnShipping','lowStock'];
  const fmt = n => typeof n === 'bigint' ? n.toLocaleString('ko-KR') : Number(n).toLocaleString('ko-KR');
  const won = n => fmt(n) + '원';
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = n => '<svg aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  const uuid = () => window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const now = () => new Date().toISOString();
  let state = C.emptyState(), lastRaw = null, blocked = false, historyLimit = 100, toastTimer, activeSupplier = 'all', activeView = 'products';
  function alertStorage(message) { $('storage-error').textContent = message; $('storage-error').hidden = false; $('save-status').textContent = '저장 상태 확인 필요'; }
  function load() {
    try { lastRaw = localStorage.getItem(KEY); if (lastRaw !== null) state = C.validateState(JSON.parse(lastRaw)); $('save-status').innerHTML = '<span></span>' + (lastRaw ? '저장된 자료 불러옴' : '브라우저 자동 저장'); }
    catch (_) { blocked = true; alertStorage('저장된 자료를 읽을 수 없거나 브라우저 저장소가 차단되어 있습니다. 기존 자료를 덮어쓰지 않습니다. 백업으로 원본을 보관한 뒤 정상 백업 파일을 복원하거나 브라우저 저장 권한을 확인해주세요.'); }
  }
  function commit(next, replace = false) {
    if (blocked && !replace) throw new Error('저장소 상태를 확인해주세요. 현재 자료는 저장하지 않았습니다.');
    next = C.validateState(next);
    const encoded = JSON.stringify(next);
    try {
      if (localStorage.getItem(KEY) !== lastRaw) throw new Error('다른 창에서 자료가 변경되었습니다. 먼저 이 화면을 새로고침해주세요.');
      localStorage.setItem(KEY, encoded);
    } catch (error) {
      if (error.message.includes('다른 창')) throw error;
      alertStorage('브라우저에 저장하지 못했습니다. 저장 공간이나 권한을 확인해주세요. 입력은 저장되지 않았습니다.');
      throw new Error('저장하지 못했습니다. 저장 공간과 브라우저 권한을 확인해주세요.');
    }
    state = next; lastRaw = encoded; blocked = false;
    $('storage-error').hidden = true;
    $('save-status').innerHTML = '<span></span>모든 변경 저장됨';
    render();
  }
  function toast(message) { clearTimeout(toastTimer); $('toast').querySelector('span').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
  function formError(id, message) { $(id).textContent = message; $(id).hidden = !message; }
  function rawDraft(preview = false) {
    return Object.fromEntries(fields.map(key => [key, key === 'feeOnShipping' ? $(key).checked : preview && $(key).value === '' && !['sku','supplier'].includes(key) ? (key === 'name' ? '미리보기' : 0) : $(key).value]));
  }
  function preview() {
    try {
      const p = C.validateProduct(rawDraft(true)), c = C.calculate(p);
      $('preview-profit').innerHTML = fmt(c.profit) + '<span>원</span>';
      $('preview-profit').classList.toggle('negative', c.profit < 0);
      $('preview-margin').textContent = c.margin === null ? '이익률 —' : '이익률 ' + c.margin.toFixed(1) + '%';
      $('preview-revenue').textContent = won(c.revenue);
      $('preview-base-cost').textContent = won(p.cost + p.shippingCost + p.packingCost);
      $('preview-fee').textContent = won(c.fee);
      $('preview-rate').textContent = p.feeRate + '%';
    } catch (_) {
      $('preview-profit').textContent = '—'; $('preview-profit').classList.remove('negative');
      $('preview-margin').textContent = '입력값 확인';
      ['preview-revenue','preview-base-cost','preview-fee'].forEach(id => { $(id).textContent = '—'; });
    }
  }
  function resetEditor(focus = false) {
    $('product-form').reset(); $('product-id').value = '';
    $('supplier').value = activeSupplier.startsWith('supplier:') ? supplierLabel() : '';
    $('editor-title').textContent = '새 상품 등록';
    $('save-product-btn').innerHTML = icon('plus') + '<span>상품 등록</span>';
    $('cancel-edit-btn').hidden = true; $('initial-stock-field').hidden = false; $('stock-edit-hint').hidden = true;
    formError('form-error',''); preview();
    if (focus) $('name').focus({preventScroll:true});
  }
  function focusEditor() {
    switchView('products');
    document.querySelector('.calculator').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
    $('name').focus({preventScroll:true});
  }
  function editProduct(id) {
    const p = state.products.find(item => item.id === id); if (!p) return;
    resetEditor();
    fields.forEach(key => { if (key === 'feeOnShipping') $(key).checked = p[key]; else $(key).value = p[key]; });
    $('product-id').value = id; $('editor-title').textContent = '상품 정보 수정';
    $('save-product-btn').innerHTML = icon('check') + '<span>변경 사항 저장</span>';
    $('cancel-edit-btn').hidden = false; $('initial-stock-field').hidden = true; $('stock-edit-hint').hidden = false;
    preview(); focusEditor();
  }
  function supplierLabel(token = activeSupplier) {
    if (token === 'all') return '전체 매입처';
    if (token === 'unassigned') return '매입처 미지정';
    return token.slice('supplier:'.length);
  }
  function renderSupplierOptions(groups) {
    if (activeSupplier !== 'all' && !groups.some(group => group.key === activeSupplier)) activeSupplier = 'all';
    const options = '<option value="all">전체 매입처</option>' + groups.map(group => '<option value="' + esc(group.key) + '">' + esc(group.name || '매입처 미지정') + ' (' + fmt(group.productCount) + ')</option>').join('');
    ['supplier-filter','history-supplier-filter'].forEach(id => { $(id).innerHTML = options; $(id).value = activeSupplier; });
    $('supplier-options').innerHTML = groups.filter(group => group.name).map(group => '<option value="' + esc(group.name) + '"></option>').join('');
  }
  function renderSuppliers(groups) {
    $('supplier-count').textContent = fmt(groups.length);
    $('suppliers-empty').hidden = groups.length > 0;
    $('supplier-table-wrap').hidden = groups.length === 0;
    $('supplier-rows').innerHTML = groups.map(group => {
      const name = group.name || '매입처 미지정';
      return '<tr><td><div class="supplier-identity"><span class="supplier-monogram' + (!group.name ? ' muted' : '') + '">' + esc(group.name ? Array.from(group.name).slice(0,2).join('') : '—') + '</span><div class="supplier-name">' + esc(name) + '<span class="supplier-subtitle">' + (group.name ? '매입처별 상품 · 재고' : '상품 수정에서 매입처를 지정하세요') + '</span></div></div></td>' +
        '<td class="number">' + fmt(group.productCount) + '개</td><td class="number"><strong>' + fmt(group.stock) + '</strong>개</td><td class="number supplier-value">' + won(group.stockValue) + '</td>' +
        '<td class="number' + (group.lowStockCount ? ' supplier-low' : '') + '">' + fmt(group.lowStockCount) + '개 상품</td><td><div class="table-actions"><button class="supplier-view-button" data-supplier-action="view" data-supplier="' + esc(group.key) + '" aria-label="' + esc(name) + ' 상품 보기">상품 보기</button>' +
        (group.name ? '<button class="icon-button" data-supplier-action="rename" data-supplier="' + esc(group.key) + '" aria-label="' + esc(name) + ' 이름 변경">' + icon('edit') + '</button>' : '') + '</div></td></tr>';
    }).join('');
    const named = groups.filter(group => group.name).length;
    $('supplier-summary-note').textContent = '매입처 ' + fmt(named) + '곳' + (groups.some(group => !group.name) ? ' · 미지정 상품 별도 표시' : '');
  }
  function render() {
    const stocks = new Map(state.products.map(p => [p.id, 0]));
    state.movements.forEach(m => stocks.set(m.productId, stocks.get(m.productId) + (m.type === 'in' ? m.quantity : -m.quantity)));
    const groups = C.supplierSummaries(state);
    renderSupplierOptions(groups);
    const scoped = C.filterBySupplier(state.products,activeSupplier);
    const summaryProducts = activeView === 'suppliers' ? state.products : scoped;
    const stock = summaryProducts.reduce((n,p) => n + stocks.get(p.id), 0);
    const value = summaryProducts.reduce((n,p) => n + BigInt(p.cost) * BigInt(stocks.get(p.id)), 0n);
    const low = summaryProducts.filter(p => stocks.get(p.id) <= p.lowStock).length;
    const stats = {products:[summaryProducts.length,'개'], stock:[stock,'개'], value:[value,'원'], low:[low,'개 상품']};
    Object.entries(stats).forEach(([key,[n,unit]]) => { $('stat-' + key).innerHTML = fmt(n) + '<span>' + unit + '</span>'; });
    $('scope-label').textContent = (activeView === 'suppliers' ? '전체 매입처' : supplierLabel()) + ' 기준';
    $('clear-supplier').hidden = activeView === 'suppliers' || activeSupplier === 'all';
    $('nav-count').textContent = fmt(state.products.length); $('product-count').textContent = fmt(scoped.length);
    const query = $('search').value.trim().toLocaleLowerCase(), filter = $('stock-filter').value;
    const list = scoped.filter(p => (!query || (p.name + ' ' + p.sku + ' ' + p.supplier).toLocaleLowerCase().includes(query)) && (filter === 'all' || C.stockStatus(stocks.get(p.id),p.lowStock) === filter));
    $('product-empty').hidden = state.products.length > 0;
    $('no-results').hidden = state.products.length === 0 || list.length > 0;
    $('product-table-wrap').hidden = list.length === 0;
    $('list-summary').textContent = (activeSupplier === 'all' ? '' : supplierLabel() + ' · ') + (list.length === scoped.length ? '등록 상품 ' + fmt(scoped.length) + '개' : fmt(scoped.length) + '개 중 ' + fmt(list.length) + '개 표시');
    $('csv-btn').innerHTML = icon('down') + (activeSupplier === 'all' ? 'CSV 내보내기' : '매입처 CSV');
    $('csv-btn').title = '현재 매입처의 전체 상품 내보내기 (검색·재고 상태 필터 제외)';
    $('product-rows').innerHTML = list.map(p => {
      const c = C.calculate(p), qty = stocks.get(p.id), status = C.stockStatus(qty,p.lowStock), statusText = {normal:'정상',low:'재고 부족',out:'품절'}[status];
      return '<tr><td><div class="product-name-cell"><div class="product-initial">' + icon('box') + '</div><div><span class="product-name">' + esc(p.name) + '</span><span class="product-sku">' + esc(p.sku || '코드 미등록') + '</span><span class="product-supplier">' + esc(p.supplier || '매입처 미지정') + '</span></div></div></td>' +
        '<td class="number">' + won(p.cost) + '<span class="sub-number">판매 ' + won(p.salePrice) + '</span></td>' +
        '<td class="number"><span class="profit-number' + (c.profit < 0 ? ' negative' : '') + '">' + won(c.profit) + '</span><span class="sub-number">' + (c.margin === null ? '이익률 —' : c.margin.toFixed(1) + '%') + '</span></td>' +
        '<td class="number"><span class="stock-quantity">' + fmt(qty) + '</span><br><span class="stock-badge ' + status + '">' + statusText + '</span></td>' +
        '<td><div class="table-actions"><button class="movement-btn" data-action="movement" data-id="' + esc(p.id) + '" aria-label="' + esc(p.name) + ' 입출고">입출고</button><button class="icon-button" data-action="edit" data-id="' + esc(p.id) + '" aria-label="' + esc(p.name) + ' 수정">' + icon('edit') + '</button></div></td></tr>';
    }).join('');
    const ids = new Set(scoped.map(p => p.id)), history = state.movements.filter(m => ids.has(m.productId));
    $('history-count').textContent = fmt(history.length);
    $('history-empty').hidden = history.length > 0; $('history-table-wrap').hidden = !history.length;
    const names = new Map(state.products.map(p => [p.id,p]));
    $('history-rows').innerHTML = history.slice(-historyLimit).reverse().map(m => '<tr><td>' + esc(new Date(m.at).toLocaleString('ko-KR')) + '</td><td><strong>' + esc(names.get(m.productId).name) + '</strong><span class="product-supplier">' + esc(names.get(m.productId).supplier || '매입처 미지정') + '</span></td><td><span class="stock-badge ' + (m.type === 'in' ? 'normal' : 'out') + '">' + (m.type === 'in' ? '입고' : '출고') + '</span></td><td class="number">' + (m.type === 'in' ? '+' : '−') + fmt(m.quantity) + '</td><td>' + esc(m.note || '—') + '</td></tr>').join('');
    $('history-more').hidden = history.length <= historyLimit;
    renderSuppliers(groups);
  }
  function switchView(view) {
    activeView = view;
    ['products','history','suppliers'].forEach(name => { $(name + '-view').hidden = name !== view; });
    document.querySelectorAll('[data-view]').forEach(button => {
      const active = button.dataset.view === view; button.classList.toggle('active',active);
      if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    const titles = {products:['상품 관리','상품 수익 · 재고','원가부터 재고까지, 판매에 필요한 숫자를 한눈에.'],history:['입출고 이력','입출고 이력','매입처별로 재고가 움직인 순간을 확인하세요.'],suppliers:['매입처 관리','매입처별 상품 · 재고','공급사마다 다른 상품과 원가, 한곳에서 관리하세요.']};
    const [crumb,title,description] = titles[view];
    $('breadcrumb-current').textContent = crumb; $('page-title').textContent = title; $('page-description').textContent = description;
    render();
  }
  function selectSupplier(token) {
    activeSupplier = token; historyLimit = 100; render();
  }
  function openSupplierRename(name) {
    $('supplier-form').reset(); $('supplier-original').value = name; $('supplier-name').value = name;
    const count = state.products.filter(p => p.supplier === name).length;
    $('supplier-rename-note').textContent = fmt(count) + '개 상품의 매입처 이름을 함께 변경합니다. 재고와 입출고 기록은 유지됩니다.';
    formError('supplier-error',''); $('supplier-dialog').showModal(); $('supplier-name').focus(); $('supplier-name').select();
  }

  function updateMovement() {
    const id = $('movement-product-id').value, current = C.stockFor(state,id), value = $('movement-quantity').value;
    const qty = Number(value), type = document.querySelector('input[name="movement-type"]:checked').value;
    const after = current + (type === 'in' ? qty : -qty);
    $('movement-current').textContent = fmt(current);
    const valid = value !== '' && Number.isSafeInteger(qty) && qty > 0 && after >= 0 && after <= C.MAX_STOCK;
    $('movement-after').textContent = valid ? fmt(after) + '개' : '수량을 확인해주세요';
    $('movement-after').classList.toggle('negative', !valid);
  }
  function openMovement(id) {
    const p = state.products.find(item => item.id === id); if (!p) return;
    $('movement-form').reset(); $('movement-product-id').value = id; $('movement-product-name').textContent = p.name;
    formError('movement-error',''); updateMovement(); $('movement-dialog').showModal(); $('movement-quantity').focus(); $('movement-quantity').select();
  }
  function ask(title,message) {
    return new Promise(resolve => {
      const dialog = $('confirm-dialog');
      $('confirm-title').textContent = title; $('confirm-message').textContent = message;
      const close = () => { $('confirm-ok').onclick = null; $('confirm-cancel').onclick = null; dialog.removeEventListener('cancel',cancel); };
      const answer = yes => { close(); dialog.close(); resolve(yes); };
      const cancel = event => { event.preventDefault(); answer(false); };
      $('confirm-ok').onclick = () => answer(true); $('confirm-cancel').onclick = () => answer(false);
      dialog.addEventListener('cancel',cancel); dialog.showModal(); $('confirm-cancel').focus();
    });
  }
  function download(filename,text,type) {
    const url = URL.createObjectURL(new Blob([text],{type})), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1500);
  }
  const datePart = () => new Date().toLocaleDateString('sv-SE');
  $('product-form').addEventListener('input', () => { formError('form-error',''); preview(); });
  $('product-form').addEventListener('submit', event => {
    event.preventDefault(); formError('form-error','');
    try {
      const draft = C.validateProduct(rawDraft()), id = $('product-id').value;
      if (!C.uniqueSku(state,draft.sku,id,draft.supplier)) throw new Error('이 매입처에 이미 등록된 상품 코드입니다. 다른 코드를 입력해주세요.');
      let next;
      if (id) {
        if (!state.products.some(p => p.id === id)) throw new Error('수정할 상품을 찾을 수 없습니다. 다시 선택해주세요.');
        next = {...state, products:state.products.map(p => p.id === id ? {...p,...draft} : p)};
      } else {
        if (state.products.length >= 5000) throw new Error('상품은 5,000개까지 등록할 수 있습니다.');
        const qty = C.number($('initialStock').value,'최초 재고',C.MAX_STOCK), productId = uuid();
        next = {...state, products:[...state.products,{id:productId,...draft,createdAt:now()}]};
        if (qty) next = C.recordMovement(next,{id:uuid(),productId,type:'in',quantity:qty,note:'최초 재고',at:now()});
      }
      commit(next); resetEditor(); toast(id ? '상품 정보를 수정했습니다.' : '상품을 등록했습니다.');
    } catch (error) { formError('form-error',error.message); }
  });
  $('product-rows').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    if (button.dataset.action === 'edit') editProduct(button.dataset.id); else openMovement(button.dataset.id);
  });
  $('movement-form').addEventListener('input', () => { formError('movement-error',''); updateMovement(); });
  $('movement-form').addEventListener('submit', event => {
    event.preventDefault(); formError('movement-error','');
    try {
      if (state.movements.length >= 100000) throw new Error('입출고 기록이 관리 한도에 도달했습니다. 먼저 백업해주세요.');
      const next = C.recordMovement(state,{id:uuid(),productId:$('movement-product-id').value,type:document.querySelector('input[name="movement-type"]:checked').value,quantity:$('movement-quantity').value,note:$('movement-note').value,at:now()});
      commit(next); $('movement-dialog').close(); toast('입출고 기록을 저장했습니다.');
    } catch(error) { formError('movement-error',error.message); }
  });
  $('close-movement').addEventListener('click',() => $('movement-dialog').close());
  $('search').addEventListener('input',render); $('stock-filter').addEventListener('change',render);
  $('cancel-edit-btn').addEventListener('click',() => resetEditor());
  ['new-product-btn','empty-add-btn'].forEach(id => $(id).addEventListener('click',() => { resetEditor(); focusEditor(); }));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',() => switchView(button.dataset.view)));
  $('history-more').addEventListener('click',() => { historyLimit += 100; render(); });
  $('backup-btn').addEventListener('click',() => {
    try {
      const raw = localStorage.getItem(KEY);
      download('tnd-backup-' + datePart() + '.json',raw ?? JSON.stringify(state,null,2),'application/json;charset=utf-8');
      toast('백업 파일을 내려받았습니다.');
    } catch (_) { download('tnd-backup-' + datePart() + '.json',JSON.stringify(state,null,2),'application/json;charset=utf-8'); toast('현재 화면 자료를 백업했습니다.'); }
  });
  $('csv-btn').addEventListener('click',() => {
    if (!C.filterBySupplier(state.products,activeSupplier).length) { toast('먼저 상품을 등록해주세요.'); return; }
    download('tnd-products-' + datePart() + '.csv',C.toCsv(state,activeSupplier),'text/csv;charset=utf-8'); toast(supplierLabel() + ' 상품을 CSV로 내보냈습니다.');
  });
  $('restore-btn').addEventListener('click',() => $('restore-file').click());
  $('restore-file').addEventListener('change',async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 10000000) throw new Error('백업 파일은 10MB 이하만 불러올 수 있습니다.');
      const next = C.validateState(JSON.parse((await file.text()).replace(/^\uFEFF/,'')));
      if (!await ask('백업을 복원할까요?',fmt(next.products.length) + '개 상품과 ' + fmt(next.movements.length) + '개 입출고 기록을 불러옵니다.\n현재 브라우저의 자료가 교체됩니다. 필요한 자료는 먼저 백업해주세요.')) return;
      commit(next,true); resetEditor(); toast('백업 자료를 복원했습니다.');
    } catch (error) { toast(error instanceof SyntaxError ? 'JSON 백업 파일의 형식이 올바르지 않습니다.' : error.message); }
  });
  $('sample-btn').addEventListener('click',async () => {
    if (state.products.length && !await ask('예시 데이터로 교체할까요?','현재 브라우저의 자료를 3개 예시 상품으로 교체합니다.\n필요한 자료는 먼저 백업해주세요.')) return;
    try {
      let next = C.emptyState();
      const samples = [
        {name:'원목 안내판',sku:'SAMPLE-001',supplier:'우드파트너 (예시)',cost:4500,salePrice:12900,customerShipping:3000,shippingCost:3200,packingCost:300,feeRate:5.5,fixedFee:0,feeOnShipping:true,lowStock:5,quantity:24},
        {name:'무지 머그컵',sku:'SAMPLE-002',supplier:'리빙도매 (예시)',cost:3800,salePrice:9900,customerShipping:0,shippingCost:3000,packingCost:500,feeRate:6,fixedFee:0,feeOnShipping:false,lowStock:5,quantity:3},
        {name:'택배 포장 세트',sku:'SAMPLE-003',supplier:'우드파트너 (예시)',cost:1200,salePrice:4900,customerShipping:3000,shippingCost:3000,packingCost:100,feeRate:5,fixedFee:0,feeOnShipping:false,lowStock:10,quantity:0}
      ];
      samples.forEach(sample => {
        const id = uuid(), {quantity,...p} = sample;
        next.products.push({id,...C.validateProduct(p),createdAt:now()});
        if (quantity) next = C.recordMovement(next,{id:uuid(),productId:id,type:'in',quantity,note:'예시 · 최초 재고',at:now()});
      });
      commit(next); resetEditor(); switchView('products'); toast('예시 데이터입니다. 실제 상품으로 수정해 사용하세요.');
    } catch (error) { toast(error.message); }
  });

  ['supplier-filter','history-supplier-filter'].forEach(id => $(id).addEventListener('change',event => selectSupplier(event.target.value)));
  $('clear-supplier').addEventListener('click',() => selectSupplier('all'));
  $('supplier-add-product-btn').addEventListener('click',() => { resetEditor(); focusEditor(); $('supplier').focus({preventScroll:true}); });
  $('supplier-rows').addEventListener('click',event => {
    const button = event.target.closest('button[data-supplier-action]'); if (!button) return;
    if (button.dataset.supplierAction === 'view') {
      activeSupplier = button.dataset.supplier; $('search').value = ''; $('stock-filter').value = 'all'; switchView('products');
      $('main').scrollIntoView({block:'start'});
    } else openSupplierRename(button.dataset.supplier.slice('supplier:'.length));
  });
  $('close-supplier').addEventListener('click',() => $('supplier-dialog').close());
  $('supplier-form').addEventListener('input',() => formError('supplier-error',''));
  $('supplier-form').addEventListener('submit',event => {
    event.preventDefault(); formError('supplier-error','');
    try {
      const previous = $('supplier-original').value, name = C.normalizeSupplier($('supplier-name').value);
      const wasSelected = activeSupplier === C.supplierToken(previous), next = C.renameSupplier(state,previous,name);
      commit(next);
      if (wasSelected) { activeSupplier = C.supplierToken(name); render(); }
      if ($('supplier').value === previous) $('supplier').value = name;
      $('supplier-dialog').close(); toast('매입처 이름을 변경했습니다.');
    } catch(error) { formError('supplier-error',error.message); }
  });

  window.addEventListener('storage',event => {
    if (event.key !== KEY && event.key !== null) return;
    blocked = true;
    alertStorage('다른 창에서 자료가 변경되었습니다. 입력 충돌을 막기 위해 저장을 멈췄습니다. 이 화면을 새로고침한 뒤 계속해주세요.');
    if ($('movement-dialog').open) $('movement-dialog').close();
    if ($('supplier-dialog').open) $('supplier-dialog').close();
  });
  load(); render(); preview();
})();
