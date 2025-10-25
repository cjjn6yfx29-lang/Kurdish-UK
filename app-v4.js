// app-v4.js — Adds single-item PDF buttons to catalog and cart
const STORAGE = { PRODUCTS: 'pos_v3_products', TX: 'pos_v3_tx', THEME: 'pos_v3_theme' };
const BUSINESS = { name: 'EMAD UK TECH', address: 'Liverpool', email: '' };

let products = [], cart = [], transactions = [];
let barcodeDetector = null, videoStream = null, scanning=false;

function $(s){ return document.querySelector(s); }
function $all(s){ return Array.from(document.querySelectorAll(s)); }

function saveAll(){ localStorage.setItem(STORAGE.PRODUCTS, JSON.stringify(products)); localStorage.setItem(STORAGE.TX, JSON.stringify(transactions)); }
function loadAll(){ products = JSON.parse(localStorage.getItem(STORAGE.PRODUCTS) || '[]'); transactions = JSON.parse(localStorage.getItem(STORAGE.TX) || '[]'); }

function init(){
  loadAll();
  if(products.length===0){
    products = [
      { id:'p1', name:'Blue Pen', code:'BP001', cost:0.6, price:1.5 },
      { id:'p2', name:'Notebook A5', code:'NB-A5', cost:1.2, price:3.2 },
      { id:'p3', name:'Coffee Mug', code:'MUG01', cost:2.5, price:6.5 }
    ];
    saveAll();
  }
  bindUI();
  restoreTheme();
  renderAll();
  if('BarcodeDetector' in window) barcodeDetector = new BarcodeDetector({formats:['ean_13','ean_8','qr_code','code_128','upc_e']});
}

function bindUI(){
  $('#saveProduct').addEventListener('click', saveProduct);
  $('#newProduct').addEventListener('click', clearProductForm);
  $('#addByCode').addEventListener('click', ()=>addByCode($('#barcodeInput').value.trim()));
  $('#barcodeInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') addByCode(e.target.value.trim()); });
  $('#clearInput').addEventListener('click', ()=>$('#barcodeInput').value='');
  $('#clearCart').addEventListener('click', ()=>{ if(confirm('Clear cart?')){ cart=[]; renderCart(); } });
  $('#payBtn').addEventListener('click', ()=>{ if(cart.length===0){ alert('Cart empty'); return; } if(confirm('Complete sale and open receipt preview?')) completeSale(); });
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', ()=>$('#importFile').click());
  $('#importFile').addEventListener('change', (e)=>{ if(e.target.files[0]) importData(e.target.files[0]); });
  $('#downloadTx').addEventListener('click', downloadTransactions);
  $('#downloadCsv').addEventListener('click', downloadCsv);
  $('#themeToggle').addEventListener('click', toggleTheme);
  $('#cameraToggle').addEventListener('click', toggleCamera);
  $('#stopCamera').addEventListener('click', stopCamera);
  $('#discount').addEventListener('input', ()=>renderCart());
  $('#txList').addEventListener('click', (e)=>{
    const btn = e.target;
    if(btn.matches('[data-action="view"]')){ openReceiptView(btn.dataset.id, false); }
    else if(btn.matches('[data-action="pdf"]')){ openReceiptView(btn.dataset.id, true); }
  });
  // delegation for catalog and cart pdf buttons
  document.addEventListener('click', (e)=>{
    const b = e.target;
    if(b.matches('[data-action="pdf-item"]')){
      const payload = b.dataset.payload;
      if(payload) openSingleItemReceipt(JSON.parse(payload));
    }
  });
}

function renderAll(){ renderCatalog(); renderCart(); renderTransactions(); renderReports(); }

function renderCatalog(){
  const c = $('#catalogList'); c.innerHTML='';
  products.forEach(p=>{
    const el = document.createElement('div'); el.className='catalog-item';
    const payload = encodeURIComponent(JSON.stringify({ code:p.code, name:p.name, price:+p.price, qty:1 }));
    el.innerHTML = `<div><div><strong>${escape(p.name)}</strong></div><div class="meta">SKU: ${escape(p.code)} — £${(+p.price).toFixed(2)}</div></div>
      <div><button data-code="${p.code}">Add</button> <button data-action="pdf-item" data-payload='${JSON.stringify({code:p.code,name:p.name,price:+p.price,qty:1})}'>PDF</button> <button data-id="${p.id}" class="edit">Edit</button></div>`;
    el.querySelector('[data-code]').addEventListener('click', ()=>addToCartByCode(p.code));
    el.querySelector('.edit').addEventListener('click', ()=>editProduct(p.id));
    c.appendChild(el);
  });
}

function saveProduct(){
  const name = $('#prodName').value.trim(); const code = $('#prodCode').value.trim();
  const cost = parseFloat($('#prodCost').value) || 0; const price = parseFloat($('#prodPrice').value) || 0;
  if(!name||!code||!price) return alert('Please enter name, code and price');
  const existing = products.find(x=>x.code===code);
  if(existing){ existing.name=name; existing.cost=cost; existing.price=price; }
  else products.push({ id:'p'+Date.now(), name, code, cost, price });
  saveAll(); renderAll(); clearProductForm();
}

function editProduct(id){
  const p = products.find(x=>x.id===id); if(!p) return;
  $('#prodName').value=p.name; $('#prodCode').value=p.code; $('#prodCost').value=p.cost; $('#prodPrice').value=p.price;
}

function clearProductForm(){ $('#prodName').value=''; $('#prodCode').value=''; $('#prodCost').value=''; $('#prodPrice').value=''; }

function addByCode(code){
  if(!code) return alert('Enter code');
  const p = products.find(x=>x.code===code); if(!p) return alert('Product not found');
  addToCartByCode(code); $('#barcodeInput').value='';
}

function addToCartByCode(code){
  const p = products.find(x=>x.code===code); if(!p) return;
  const found = cart.find(c=>c.code===code);
  if(found) found.qty++; else cart.push({ code:p.code, name:p.name, price:+p.price, cost:+p.cost, qty:1 });
  renderCart();
}

function renderCart(){
  const list = $('#cartList'); list.innerHTML='';
  cart.forEach((it, idx)=>{
    const el = document.createElement('div'); el.className='cart-item';
    el.innerHTML = `<div><div><strong>${escape(it.name)}</strong></div><div class="meta">SKU: ${escape(it.code)} — £${it.price.toFixed(2)} × ${it.qty}</div></div>
      <div><div>£${(it.price*it.qty).toFixed(2)}</div><div style="margin-top:6px"><button data-idx="${idx}" class="inc">+</button> <button data-idx="${idx}" class="dec">−</button> <button data-idx="${idx}" class="rm">Remove</button></div>
      <div style="margin-top:6px"><button data-action="pdf-item" data-payload='${JSON.stringify({code: 'CARTITEM', name: 'ITEMNAME', price: 0, qty: 1})}'>PDF</button></div>
      </div>`;
    list.appendChild(el);
  });
  // After building, update the pdf-item payloads properly (to avoid quoting/escaping issues)
  document.querySelectorAll('#cartList .cart-item').forEach((el, i)=>{
    const btn = el.querySelector('button[data-action="pdf-item"]');
    if(btn){ const it = cart[i]; btn.dataset.payload = JSON.stringify({ code: it.code, name: it.name, price: +it.price, qty: it.qty }); }
  });
  $all('.inc').forEach(b=>b.addEventListener('click', e=>{ cart[+e.target.dataset.idx].qty++; renderCart(); }));
  $all('.dec').forEach(b=>b.addEventListener('click', e=>{ const i=+e.target.dataset.idx; cart[i].qty--; if(cart[i].qty<=0) cart.splice(i,1); renderCart(); }));
  $all('.rm').forEach(b=>b.addEventListener('click', e=>{ cart.splice(+e.target.dataset.idx,1); renderCart(); }));
  $('#itemsCount').textContent = cart.reduce((s,i)=>s+i.qty,0);
  const subtotal = cart.reduce((s,i)=>s + i.qty*i.price,0);
  const discount = parseFloat($('#discount').value) || 0;
  const total = Math.max(0, subtotal - discount);
  $('#totalAmount').textContent = total.toFixed(2);
  renderReports();
}

function renderTransactions(){
  const c = $('#txList'); c.innerHTML='';
  if(transactions.length===0) return c.innerHTML='<div class="muted">No transactions yet.</div>';
  transactions.slice().reverse().forEach(tx=>{
    const el = document.createElement('div'); el.className='tx-item';
    el.innerHTML = `<div><strong>${escape(tx.id)}</strong><div class="meta">${new Date(tx.date).toLocaleString()} — £${(+tx.total).toFixed(2)}</div></div>
      <div><button data-action="pdf" data-id="${tx.id}">PDF</button> <button data-action="view" data-id="${tx.id}">View</button></div>`;
    c.appendChild(el);
  });
}

function renderReports(){
  const sales = transactions.reduce((s,t)=>s + (+t.total),0);
  const profit = transactions.reduce((s,t)=> s + (t.items.reduce((ss,it)=> ss + (it.qty*(it.price - (it.cost||0))),0)),0);
  $('#reportSales').textContent = sales.toFixed(2);
  $('#reportProfit').textContent = profit.toFixed(2);
}

function completeSale(){
  const subtotal = cart.reduce((s,i)=>s + i.qty*i.price,0);
  const discount = parseFloat($('#discount').value) || 0;
  const total = Math.max(0, subtotal - discount);
  const tx = { id: 'TX' + Date.now(), date: new Date().toISOString(), items: JSON.parse(JSON.stringify(cart)), total, payment: $('#paymentMethod').value };
  transactions.push(tx); saveAll();
  // store tx.id to open in receipt page
  localStorage.setItem('pos_view_tx', tx.id);
  cart = []; $('#discount').value = 0;
  renderAll();
  // open receipt preview page in new tab
  openReceiptView(tx.id, false);
}

function openReceiptView(txId, autoPdf=false){
  saveAll();
  localStorage.removeItem('pos_view_single'); // clear any single-item payload
  localStorage.setItem('pos_view_tx', txId);
  if(autoPdf) localStorage.setItem('pos_view_auto_pdf','1'); else localStorage.removeItem('pos_view_auto_pdf');
  window.open('receipt.html', '_blank');
}

function openSingleItemReceipt(item){
  // item: { code, name, price, qty }
  saveAll();
  localStorage.setItem('pos_view_single', JSON.stringify(item));
  // mark auto_pdf off (user can click Download on page)
  localStorage.removeItem('pos_view_auto_pdf');
  window.open('receipt.html', '_blank');
}

function exportData(){
  const blob = new Blob([JSON.stringify({products,transactions},null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='pos-data.json'; a.click(); URL.revokeObjectURL(a.href);
}

function importData(file){
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const o = JSON.parse(e.target.result);
      if(Array.isArray(o.products)) products = o.products;
      if(Array.isArray(o.transactions)) transactions = o.transactions;
      saveAll(); renderAll(); alert('Imported data');
    }catch(err){ alert('Invalid file'); }
  };
  reader.readAsText(file);
}

function downloadTransactions(){ const blob = new Blob([JSON.stringify(transactions,null,2)], {type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='transactions.json'; a.click(); URL.revokeObjectURL(a.href); }
function downloadCsv(){ const rows=['id,date,total,items']; transactions.forEach(t=>{ const items = t.items.map(i=>`${i.name}(${i.qty}x)`).join('; '); rows.push(`${t.id},"${t.date}",${t.total},"${items}"`); }); const blob=new Blob([rows.join('\n')], {type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='transactions.csv'; a.click(); URL.revokeObjectURL(a.href); }

// Theme persistence
function toggleTheme(){ document.body.classList.toggle('light'); const isLight = document.body.classList.contains('light'); localStorage.setItem(STORAGE.THEME, isLight ? 'light' : 'dark'); $('#themeToggle').textContent = isLight ? '🌞' : '🌙'; }
function restoreTheme(){ const t = localStorage.getItem(STORAGE.THEME) || 'dark'; if(t==='light') document.body.classList.add('light'); $('#themeToggle').textContent = document.body.classList.contains('light') ? '🌞' : '🌙'; }

// Camera scanning
async function toggleCamera(){ const cam = document.getElementById('cameraContainer'); if(scanning){ stopCamera(); return; } if(!navigator.mediaDevices) return alert('Camera not supported'); try{ videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); document.getElementById('video').srcObject = videoStream; cam.classList.remove('hidden'); scanning = true; startScanning(); }catch(err){ alert('Camera error: ' + err.message); } }
function stopCamera(){ if(videoStream){ videoStream.getTracks().forEach(t=>t.stop()); videoStream=null; } document.getElementById('video').srcObject=null; document.getElementById('cameraContainer').classList.add('hidden'); scanning=false; }
async function startScanning(){ const video = document.getElementById('video'); const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d'); const loop = async ()=>{ if(!scanning || !video || video.readyState<2) return requestAnimationFrame(loop); canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video,0,0,canvas.width,canvas.height); try{ if(barcodeDetector){ const codes = await barcodeDetector.detect(canvas); if(codes && codes.length>0){ addByCode(codes[0].rawValue); stopCamera(); return; } } }catch(e){ console.warn('scan err', e); } requestAnimationFrame(loop); }; requestAnimationFrame(loop); }

function escape(s){ return (s+'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

document.addEventListener('DOMContentLoaded', init);
