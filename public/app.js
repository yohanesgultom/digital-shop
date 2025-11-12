const currencySymbol = 'Rp';
const locale = 'id-ID';
const cartKey = 'local_cart';
const products = [];

// Simple SPA: products, cart, order (frontend only)
(function(){

  // Cart state persisted in localStorage
  let cart = loadCart();

  // DOM refs
  const productsEl = document.getElementById('products');
  const cartToggle = document.getElementById('cart-toggle');
  const cartDrawer = document.getElementById('cart-drawer');
  const closeCartBtn = document.getElementById('close-cart');
  const cartCountEl = document.getElementById('cart-count');
  const cartItemsEl = document.getElementById('cart-items');
  const cartTotalEl = document.getElementById('cart-total');
  const clearCartBtn = document.getElementById('clear-cart');
  const checkoutBtn = document.getElementById('checkout');
  const orderModal = document.getElementById('order-modal');
  const orderForm = document.getElementById('order-form');
  const cancelOrder = document.getElementById('cancel-order');
  const toastEl = document.getElementById('toast');
  // image modal refs
  const imageModal = document.getElementById('image-modal');
  const imageModalImg = document.getElementById('image-modal-img');
  const closeImageBtn = document.getElementById('close-image');

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    renderProducts();
    updateCartUI();
    attachEvents();
  });

  function attachEvents(){
    cartToggle.addEventListener('click', () => openCart(true));
    closeCartBtn.addEventListener('click', () => openCart(false));
    clearCartBtn.addEventListener('click', () => { cart = []; saveCart(); updateCartUI(); showToast('Cart cleared'); });
    checkoutBtn.addEventListener('click', () => openOrder(true));
    cancelOrder.addEventListener('click', () => openOrder(false));
    orderForm.addEventListener('submit', handleOrderSubmit);
  }

  function renderProducts(){
    productsEl.innerHTML = '';

    // fetch products from API
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        for (const p of data) {
          const card = document.createElement('article');
          card.className = 'card';
          card.innerHTML = `
            <img loading="lazy" src="${p.img}" alt="${escapeHtml(p.name)}" data-id="${p.id}">
            <div class="meta">
              <h3>${escapeHtml(p.name)}</h3>
              <p>${escapeHtml(p.desc)}</p>
              <div class="price-add">
                <div class="price">${currencySymbol} ${p.price.toLocaleString(locale)}</div>
                <button class="add-btn" data-id="${p.id}">Add</button>
              </div>
            </div>`;
          productsEl.appendChild(card);
          products.push(p);
        }

        // delegate clicks for add-button and image preview
        productsEl.addEventListener('click', (e) => {
          const btn = e.target.closest('.add-btn');
          if(btn){
            const id = btn.dataset.id;
            addToCart(id, 1);
            showToast('Added to cart');
            return;
          }
          const img = e.target.closest('img[data-id]');
          if(img && img.closest('.card')){
            const id = img.dataset.id;
            const prod = products.find(p=>p.id===id);
            if(prod){ openImageModal(true, prod.img, prod.name); }
          }
        });
      });
  }

  function addToCart(productId, qty){
    const prod = products.find(p => p.id === productId);
    if(!prod) return;
    const existing = cart.find(i => i.id === productId);
    // if(existing){ existing.qty += qty; }
    // else cart.push({id:prod.id,name:prod.name,price:prod.price,img:prod.img,qty});
    if (!existing) {
      cart.push({id:prod.id,name:prod.name,price:prod.price,img:prod.img,qty})
      saveCart();
      updateCartUI();
    }
  }

  function updateCartUI(){
    // count
    const count = cart.reduce((s,i)=>s+i.qty,0);
    cartCountEl.textContent = count;

    // items
    cartItemsEl.innerHTML = '';
    if(cart.length === 0){
      cartItemsEl.innerHTML = '<p>Your cart is empty.</p>';
    } else {
      cart.forEach(item => {
        const el = document.createElement('div');
        el.className = 'cart-item';
        el.innerHTML = `
          <img src="${item.img}" alt="${escapeHtml(item.name)}">
          <div class="ci-meta">
            <div><strong>${escapeHtml(item.name)}</strong></div>
            <div class="qty-controls">
              <button class="dec" data-id="${item.id}">-</button>
              <div>${item.qty}</div>
              <button class="inc" data-id="${item.id}">+</button>
              <div style="margin-left:auto;font-weight:700">${currencySymbol} ${(item.price*item.qty).toLocaleString(locale)}</div>
            </div>
          </div>
          <button class="remove" data-id="${item.id}">Remove</button>
        `;
        cartItemsEl.appendChild(el);
      });

      // delegate quantity and remove
      cartItemsEl.querySelectorAll('.inc').forEach(btn=>btn.addEventListener('click', e=>{
        const id = e.currentTarget.dataset.id; changeQty(id, 1);
      }));
      cartItemsEl.querySelectorAll('.dec').forEach(btn=>btn.addEventListener('click', e=>{
        const id = e.currentTarget.dataset.id; changeQty(id, -1);
      }));
      cartItemsEl.querySelectorAll('.remove').forEach(btn=>btn.addEventListener('click', e=>{
        const id = e.currentTarget.dataset.id; removeItem(id);
      }));
    }

    // total
    const total = cart.reduce((s,i)=>s+i.price*i.qty,0);
    cartTotalEl.textContent = `${currencySymbol} ${total.toLocaleString(locale)}`;
  }

  function changeQty(id, delta){
    const item = cart.find(i=>i.id===id);
    if(!item) return;
    item.qty += delta;
    if(item.qty < 1) item.qty = 1;
    saveCart();
    updateCartUI();
  }

  function removeItem(id){
    cart = cart.filter(i=>i.id!==id);
    saveCart();
    updateCartUI();
    showToast('Removed item');
  }

  function openCart(show){
    if(show){ cartDrawer.classList.add('open'); cartDrawer.setAttribute('aria-hidden','false'); }
    else { cartDrawer.classList.remove('open'); cartDrawer.setAttribute('aria-hidden','true'); }
  }

  function openOrder(show){
    if(show){ orderModal.setAttribute('aria-hidden','false'); }
    else { orderModal.setAttribute('aria-hidden','true'); }
  }

  // Image modal open/close
  function openImageModal(show, src, caption){
    if(show){
      imageModalImg.src = src || '';
      imageModalImg.alt = caption || '';
      imageModal.setAttribute('aria-hidden','false');
      // trap ESC
      document.addEventListener('keydown', imageModalKeydown);
    } else {
      imageModal.setAttribute('aria-hidden','true');
      imageModalImg.src = '';
      document.removeEventListener('keydown', imageModalKeydown);
    }
  }

  function imageModalKeydown(e){
    if(e.key === 'Escape') openImageModal(false);
  }

  // overlay and close handling
  closeImageBtn.addEventListener('click', ()=>openImageModal(false));
  imageModal.addEventListener('click', (e)=>{
    if(e.target === imageModal) openImageModal(false);
  });

  function handleOrderSubmit(e){
    e.preventDefault();
    if(cart.length===0){ showToast('Cart is empty'); return; }
    const orderFormData = new FormData(orderForm);
    const form = new FormData();
    form.append('email', orderFormData.get('email'));
    form.append('items', cart.map(item => item.id.replace('_preview', '')).join(','));
    form.append('receipt', orderFormData.get('receipt'));

    fetch('/api/order', {
      method: 'POST',
      body: form,
    })
    .then(res => {
      if(!res.ok) {
        const errorMessage = 'Order submission failed'
        showToast(errorMessage);
        throw new Error(errorMessage)
      };
      return res.json();
    })
    .then(data => {
      showToast('Order submitted successfully');
      // reset
      cart = [];
      saveCart();
      updateCartUI();
      openOrder(false);
      orderForm.reset();
    });
  }

  function saveCart(){ localStorage.setItem(cartKey, JSON.stringify(cart)); }
  function loadCart(){ try{ return JSON.parse(localStorage.getItem(cartKey)) || []; }catch(e){return []} }

  function showToast(msg,ms=2000){
    toastEl.textContent = msg; toastEl.classList.add('show');
    setTimeout(()=>toastEl.classList.remove('show'), ms);
  }

  // utility: simple html escape
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
})();
