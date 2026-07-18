
window.app = {
  user: null,
  globalData: { products: [], promotions: [], branches: [], channels: [], interests: [], heroBanners: [], gridBanners: [], popupBanners: [], giftMappings: [] },
  cart: [],
  currentRoute: '',

  menuConfig: [
      { label: 'MAIN MENU', isCategory: true, roles: ['Admin', 'Manager', 'Sales'] },
      { id: 'dashboard', icon: 'fa-tachometer-alt', label: 'Dashboard', roles: ['Admin', 'Manager', 'Sales'] },
      { id: 'pos', icon: 'fa-shopping-cart', label: 'Pre Order', roles: ['Admin', 'Manager', 'Sales'] },
      { id: 'orders', icon: 'fa-file-invoice-dollar', label: 'Orders', roles: ['Admin', 'Manager', 'Sales'] },
      { label: 'ANALYTICS & REPORTS', isCategory: true, roles: ['Admin', 'Manager', 'Sales'] },
      { id: 'analytics', icon: 'fa-chart-pie', label: 'Sales Analytics', roles: ['Admin', 'Manager'] },
      { id: 'target', icon: 'fa-crosshairs', label: 'Target & Forecast', roles: ['Admin', 'Manager'] },
      { id: 'invoice', icon: 'fa-file-invoice', label: 'ใบเสนอราคา/ใบแจ้งหนี้', roles: ['Admin', 'Manager', 'Sales'] },
      { label: 'SETTINGS', isCategory: true, roles: ['Admin', 'Manager'] },
      { 
        id: 'admin_settings', icon: 'fa-cogs', label: 'ตั้งค่าระบบ', roles: ['Admin', 'Manager'],
        isParent: true,
        children: [
          { label: 'Master Data', isCategory: true, roles: ['Admin'] },
          { id: 'products', icon: 'fa-box-open', label: 'Products', roles: ['Admin'] },
          { id: 'branches', icon: 'fa-store-alt', label: 'Branches', roles: ['Admin'] },
          { id: 'channels', icon: 'fa-network-wired', label: 'Channels', roles: ['Admin'] },
          { id: 'members', icon: 'fa-users', label: 'Members', roles: ['Admin'] },
          { id: 'inventorylog', icon: 'fa-boxes', label: 'Inventory', roles: ['Admin'] },
          { label: 'Promotions', isCategory: true, roles: ['Admin', 'Manager'] },
          { id: 'giftmappings', icon: 'fa-project-diagram', label: 'Set Premium', roles: ['Admin', 'Manager'] },
          { id: 'autopromotions', icon: 'fa-magic', label: 'Auto Promotions', roles: ['Admin', 'Manager'] },
          { id: 'promotions', icon: 'fa-tags', label: 'Promotions', roles: ['Admin'] },
          { id: 'interests', icon: 'fa-heart', label: 'Interests', roles: ['Admin'] },
          { label: 'ตั้งค่าระบบ', isCategory: true, roles: ['Admin'] },
          { id: 'systemsettings', icon: 'fa-sliders-h', label: 'ตั้งค่าระบบ', roles: ['Admin'] },
          { label: 'System', isCategory: true, roles: ['Admin'] },
          { id: 'auditlog', icon: 'fa-history', label: 'Audit', roles: ['Admin'] }
        ]
      }
  ],

  // Escape ข้อความก่อนแทรกลง innerHTML ทุกครั้งที่ข้อมูลมาจากชีต/ผู้ใช้ — ป้องกัน XSS
  esc: function(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  // สำหรับค่าที่ฝังเป็น string literal ใน onclick="fn('...')" — escape เป็น JS string ก่อน แล้วค่อย escape HTML
  escAttrJs: function(v) {
    return window.app.esc(String(v === null || v === undefined ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  },

  // 5B.1 — esc ข้อความแล้ว highlight คำค้น: หา match บน raw text, esc ทีละ segment แล้วครอบ <mark>
  // (ปลอดภัยกว่า replace หลัง esc ทั้งก้อน เพราะคำค้นจะไม่มีวัน match เข้าไปใน entity เช่น &amp;)
  highlightEsc: function(raw, term) {
    const s = String(raw === null || raw === undefined ? '' : raw);
    term = (term || '').toString().trim();
    if (!term) return window.app.esc(s);
    const lower = s.toLowerCase();
    const t = term.toLowerCase();
    let out = '', i = 0;
    while (true) {
      const idx = lower.indexOf(t, i);
      if (idx === -1) { out += window.app.esc(s.slice(i)); break; }
      out += window.app.esc(s.slice(i, idx));
      out += '<mark class="bg-amber-100 text-inherit rounded px-0.5">' + window.app.esc(s.slice(idx, idx + t.length)) + '</mark>';
      i = idx + t.length;
    }
    return out;
  },

  // 5B.5 — ปุ่ม submit ต้อง disabled + spinner ระหว่างรอ API กัน double-submit
  // คืนฟังก์ชัน restore — ผู้เรียกต้องเรียกใน finally เสมอ; ถ้าปุ่ม disabled อยู่แล้วคืน no-op (บอกว่ามีงานค้าง)
  buttonBusy: function(btn, text) {
    if (!btn || btn.tagName !== 'BUTTON' || btn.disabled) return null;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i>' + window.app.esc(text || 'กำลังบันทึก...');
    return function() { btn.disabled = false; btn.innerHTML = orig; };
  },

  // Empty/error state มาตรฐานเดียวทั้งระบบ (5A.4) — คืน HTML string
  // opts.onclick ต้องเป็นโค้ดที่เราเขียนเองเท่านั้น (ห้ามมีข้อมูลผู้ใช้) เพราะฝังลง attribute ตรงๆ
  emptyState: function(opts) {
    opts = opts || {};
    const icon = opts.icon || 'fa-inbox';
    const actionBtn = opts.actionLabel
      ? '<button type="button" class="mt-1 px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-indigo-700 transition-colors" onclick="' + opts.onclick + '">' + window.app.esc(opts.actionLabel) + '</button>'
      : '';
    return '<div class="flex flex-col items-center justify-center text-center py-10 px-6">'
      + '<div class="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center mb-4"><i class="fas ' + icon + ' text-2xl"></i></div>'
      + '<p class="font-bold text-slate-700 text-sm mb-1">' + window.app.esc(opts.title || 'ไม่มีข้อมูล') + '</p>'
      + (opts.subtitle ? '<p class="text-xs text-slate-400 mb-4 max-w-sm leading-relaxed">' + window.app.esc(opts.subtitle) + '</p>' : '')
      + actionBtn
      + '</div>';
  },

  showLoading: function(text) {
    Swal.fire({ 
      toast: true, 
      position: 'bottom-end', 
      showConfirmButton: false, 
      width: 'auto',
      padding: '0',
      html: '<div class="flex items-center space-x-2.5 px-4 h-full w-full"><svg class="animate-spin h-4 w-4 text-indigo-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span class="text-[13px] font-black text-indigo-900 tracking-wide whitespace-nowrap">' + (text || 'กำลังโหลดข้อมูล...') + '</span></div>',
      customClass: { 
        popup: '!bg-white !shadow-[0_5px_20px_rgba(0,0,0,0.15)] !rounded-lg !border !border-slate-200 !h-[38px] !min-h-[38px] !max-h-[38px] !p-0 !flex !items-center !justify-center !mb-5 !mr-5',
        htmlContainer: '!m-0 !p-0 !h-full !flex !items-center'
      } 
    }); 
  },
  hideLoading: function() { Swal.close(); },

  toast: function(title, icon = 'success') {
    Swal.fire({
      toast: true, position: 'bottom-end', showConfirmButton: false, timer: 3000,
      timerProgressBar: true, icon: icon, title: title,
      customClass: { popup: '!rounded-xl shadow-lg border border-slate-100', title: '!text-sm !font-bold !text-slate-800' }
    });
  },

  formatPhone: function(el) {
    let val = el.value.replace(/\D/g, '');
    if (val.length > 3 && val.length <= 6) val = val.slice(0, 3) + '-' + val.slice(3);
    else if (val.length > 6) val = val.slice(0, 3) + '-' + val.slice(3, 6) + '-' + val.slice(6, 10);
    el.value = val;
    if (val.replace(/-/g,'').length === 10) { el.classList.remove('border-slate-200','border-rose-500'); el.classList.add('border-emerald-500','ring-emerald-200'); }
    else { el.classList.remove('border-emerald-500','ring-emerald-200'); el.classList.add('border-slate-200'); }
  },

  formatIdCard: function(el) {
    let val = el.value.replace(/\D/g, '');
    let res = '';
    if (val.length > 0) res += val.substring(0,1);
    if (val.length > 1) res += '-' + val.substring(1,5);
    if (val.length > 5) res += '-' + val.substring(5,10);
    if (val.length > 10) res += '-' + val.substring(10,12);
    if (val.length > 12) res += '-' + val.substring(12,13);
    el.value = res;
    if (val.length === 13) { el.classList.remove('border-slate-200','border-rose-500'); el.classList.add('border-emerald-500','ring-emerald-200'); }
    else { el.classList.remove('border-emerald-500','ring-emerald-200'); el.classList.add('border-slate-200'); }
  },

  formatImageUrl: function(url, size='w500') {
    if (!url || url.trim() === '-' || url.trim() === '') return "https://via.placeholder.com/150?text=No+Image";
    if (url.includes(',')) url = url.split(',')[0].trim();
    const driveRegex = /(?:drive\.google\.com\/.*[?&]id=|drive\.google\.com\/file\/d\/)([^/?&]+)/;
    const match = url.match(driveRegex);
    if (match && match[1]) return 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=' + size;
    return url;
  },
  parseImageUrls: function(urlsStr) {
    if (!urlsStr || urlsStr.trim() === '-' || urlsStr.trim() === '') return ["https://via.placeholder.com/150?text=No+Image"];
    return urlsStr.split(',').map(u => {
        let trimmed = u.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/(?:drive\.google\.com\/.*[?&]id=|drive\.google\.com\/file\/d\/)([^/?&]+)/);
        return (match && match[1]) ? 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w1000' : trimmed;
    }).filter(u => u);
  },

  // รอบ 10 — อัปโหลดรูปเข้า Google Drive ผ่าน UPLOAD_IMAGE (Admin เท่านั้น)
  // ย่อฝั่ง client ก่อนส่ง: ด้านยาวสุด 1200px, jpeg 0.85 (png คงเป็น png รักษาความโปร่งใส)
  // สำเร็จ → callback(url); พลาด → Swal error (ผู้เรียกไม่ต้องจัดการ error เอง)
  uploadImage: async function(file, callback) {
    try {
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ กรุณาเลือกไฟล์รูป');
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ กรุณาลองใหม่'));
        r.readAsDataURL(file);
      });
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('ไฟล์รูปเสียหายหรือไม่รองรับ'));
        im.src = dataUrl;
      });
      const MAX_SIDE = 1200;
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const isPng = file.type === 'image/png';
      const outMime = isPng ? 'image/png' : 'image/jpeg';
      const outDataUrl = canvas.toDataURL(outMime, 0.85);
      const base64Data = outDataUrl.substring(outDataUrl.indexOf(',') + 1);
      const baseName = (file.name || 'image').replace(/\.[^.]*$/, '');
      const res = await window.app.api('UPLOAD_IMAGE', { fileName: baseName + (isPng ? '.png' : '.jpg'), mimeType: outMime, base64Data: base64Data });
      if (res && res.status === 'success' && res.url) {
        if (callback) callback(res.url);
      } else {
        throw new Error(res && res.message ? res.message : 'อัปโหลดรูปไม่สำเร็จ');
      }
    } catch (e) {
      Swal.fire('อัปโหลดรูปไม่สำเร็จ', (e && e.message) || 'Unknown Error', 'error');
    }
  },

  // wiring กลางของปุ่มอัปโหลด: input[type=file].onchange → spinner ที่ปุ่ม → เติม URL ลงช่อง + อัปเดตพรีวิว
  // เติมค่าผ่าน .value (DOM property) จึงไม่ต้อง esc; ไม่ block ส่วนอื่นของฟอร์ม — ปุ่มอัปโหลดตัวเดียวที่ disabled
  handleImageUpload: async function(fileInput, targetInputId, previewId, btnId) {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ''; // ให้เลือกไฟล์เดิมซ้ำได้ (onchange ยิงอีกครั้ง)
    if (!file) return;
    const btn = btnId ? document.getElementById(btnId) : null;
    const restore = window.app.buttonBusy(btn, 'กำลังอัปโหลด...') || function(){};
    try {
      await window.app.uploadImage(file, function(url) {
        const target = document.getElementById(targetInputId);
        if (target) {
          target.value = url;
          target.dispatchEvent(new Event('input')); // ให้ oninput เดิมของช่อง (เช่นพรีวิว login BG) ทำงานต่อ
        }
        if (previewId) {
          const pv = document.getElementById(previewId);
          if (pv) { pv.src = window.app.formatImageUrl(url); pv.classList.remove('hidden'); }
        }
      });
    } finally {
      restore();
    }
  },

  printReceipt: function(orderId, pay) {
     const printWindow = window.open('', '_blank');
     if (!printWindow) {
        Swal.fire('ข้อผิดพลาด', 'กรุณาอนุญาต Pop-up เพื่อพิมพ์ใบจอง', 'error');
        return;
     }
     const d = new Date();
     const dateStr = d.toLocaleDateString('th-TH') + ' ' + d.toLocaleTimeString('th-TH');

     // รองรับทั้งชื่อ field จาก checkout payload (cart/customerName/contactPhone) และชื่อเดิม
     const esc = window.app.esc;
     const items = pay.items || pay.cart || [];
     const customer = esc(pay.customer || pay.customerName || '-');
     const phone = esc(pay.phone || pay.contactPhone || '-');

     let subTotal = 0;
     let itemsHtml = '';
     items.forEach(item => {
        let p = parseFloat((item.Price||'0').toString().replace(/[^\d.\-]/g,''));
        let t = p * item.qty;
        subTotal += t;
        itemsHtml += `
          <tr style="border-bottom: 1px dashed #cbd5e1;">
            <td style="padding: 10px 0; text-align: left;">
              <div style="font-weight: bold; font-size: 14px;">${esc(item['Product Name'])}</div>
              <div style="font-size: 12px; color: #64748b;">SKU: ${esc(item.SKU)}</div>
            </td>
            <td style="padding: 10px 0; text-align: center;">${item.qty}</td>
            <td style="padding: 10px 0; text-align: right;">${p.toLocaleString()}</td>
            <td style="padding: 10px 0; text-align: right; font-weight: bold;">${t.toLocaleString()}</td>
          </tr>
        `;
        // 7.2 — พิมพ์ของแถมของสินค้าชิ้นนี้ใต้สินค้าหลัก (แสดง "ฟรี" — ห้ามบวกเข้า subTotal ยอดเงินมาจากสินค้าหลัก+ส่วนลดเท่านั้น)
        const gifts = [].concat(item.brandGifts || [], item.channelGifts || []);
        gifts.forEach(g => {
           if (!g || !g.name) return;
           const gQty = parseInt(g.qty, 10) || 1;
           itemsHtml += `
          <tr style="border-bottom: 1px dashed #e2e8f0;">
            <td colspan="2" style="padding: 4px 0 4px 14px; text-align: left; font-size: 12px; color: #64748b;">— ของแถม: ${esc(g.name)} x${gQty}</td>
            <td style="padding: 4px 0; text-align: right; font-size: 12px; color: #64748b;"></td>
            <td style="padding: 4px 0; text-align: right; font-size: 12px; color: #64748b; font-weight: bold;">ฟรี</td>
          </tr>
           `;
        });
     });

     const discountVal = parseFloat(pay.discount || 0);
     const grandTotal = Math.max(0, subTotal - discountVal);
     let discountsHtml = '';
     if (pay.discounts && pay.discounts.length > 0) {
        pay.discounts.forEach(dc => {
           discountsHtml += `<div>${esc(dc.name)}: -${parseFloat(dc.value||0).toLocaleString()} ฿</div>`;
        });
     } else if (discountVal > 0) {
        discountsHtml = `<div>ส่วนลดโปรโมชั่น: -${discountVal.toLocaleString()} ฿</div>`;
     }
     
     const html = `
     <!DOCTYPE html>
     <html lang="th">
     <head>
       <meta charset="UTF-8">
       <title>ใบจองสินค้า (Booking Receipt)</title>
       <style>
         @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
         body { font-family: 'Sarabun', 'Helvetica', sans-serif; margin: 0; padding: 20px; color: #1e293b; background: #fff; }
         .receipt-container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; }
         .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 15px; }
         .header h1 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; }
         .header p { margin: 5px 0 0 0; font-size: 14px; color: #64748b; }
         .info-section { display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 13px; line-height: 1.6; }
         .info-section div { flex: 1; }
         .info-section strong { color: #0f172a; display: block; margin-bottom: 4px; font-size: 14px; }
         table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
         th { border-bottom: 2px solid #1e293b; padding: 10px 0; font-size: 13px; color: #0f172a; }
         .totals { text-align: right; font-size: 14px; border-top: 2px solid #1e293b; padding-top: 15px; line-height: 1.8; color: #334155; }
         .totals .grand-total { font-size: 18px; font-weight: bold; margin-top: 10px; color: #0f172a; }
         .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 20px; }
         .badge { display: inline-block; padding: 4px 10px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: bold; margin-bottom: 15px; font-size: 13px; }
         @media print {
           body { padding: 0; background: #fff; }
           .receipt-container { border: none; padding: 0; max-width: 100%; }
           @page { margin: 10mm; }
         }
       </style>
     </head>
     <body>
       <div class="receipt-container">
         <div class="header">
           <h1>ใบเสร็จรับเงินชั่วคราว / ใบจองสินค้า</h1>
           <p>Booking Receipt</p>
         </div>
         
         <div class="info-section">
           <div>
             <strong>ข้อมูลลูกค้า (Customer)</strong>
             ชื่อ-สกุล: ${customer}<br>
             เบอร์โทร: ${phone}<br>
             อีเมล: ${esc(pay.email || '-')}<br>
             เลขบัตรปชช./พาสปอร์ต: ${esc(pay.idCard || '-')}
           </div>
           <div style="text-align: right;">
             <strong>ข้อมูลการจอง (Booking)</strong>
             Order ID: <span style="font-size: 15px; font-weight: bold; color: #0f172a;">${orderId}</span><br>
             วันที่ทำรายการ: ${dateStr}<br>
             สาขา: ${esc(pay.branch)}<br>
             พนักงานผู้รับจอง: ${esc(pay.bkStaffName)}<br>
             เลขที่ใบเสร็จรับเงิน: ${esc(pay.receiptNo || '-')}
           </div>
         </div>
         
         <table>
           <thead>
             <tr>
               <th style="text-align: left;">รายการสินค้า (Item)</th>
               <th style="text-align: center; width: 60px;">จำนวน</th>
               <th style="text-align: right; width: 100px;">ราคา/หน่วย</th>
               <th style="text-align: right; width: 100px;">จำนวนเงิน</th>
             </tr>
           </thead>
           <tbody>
             ${itemsHtml}
           </tbody>
         </table>
         
         <div class="totals">
           <div>รวมเป็นเงิน (Sub Total): ${subTotal.toLocaleString()} ฿</div>
           ${discountsHtml}
           <div class="grand-total">ยอดสุทธิ (Grand Total): ${grandTotal.toLocaleString()} ฿</div>
           ${(parseFloat(pay.depositAmount)||0) > 0 ? `
           <div style="margin-top: 8px; color: #059669; font-weight: bold;">เงินมัดจำรับแล้ว (Deposit Paid): ${parseFloat(pay.depositAmount).toLocaleString()} ฿</div>
           <div style="font-weight: bold;">ยอดคงเหลือชำระวันรับสินค้า (Balance Due): ${Math.max(0, grandTotal - parseFloat(pay.depositAmount)).toLocaleString()} ฿</div>` : ''}
         </div>
         
         <div class="footer">
           <p>ขอบคุณที่ใช้บริการ / Thank you for your preorder</p>
           <p>เอกสารฉบับนี้ใช้เป็นหลักฐานในการรับสินค้า กรุณานำมาแสดงในวันรับสินค้า</p>
         </div>
       </div>
       <script>
         window.onload = function() {
           window.print();
         }
       <\/script>
     </body>
     </html>
     `;
     printWindow.document.open();
     printWindow.document.write(html);
     printWindow.document.close();
  },

  invoice: {
     init: function() {
        // ห้ามใช้ flag กันรันซ้ำ — ทุกครั้งที่เข้าหน้า template ถูกฉีดใหม่ ต้อง init ใหม่เสมอ
        // (เดิมมี this.initialized ทำให้เข้าหน้าครั้งที่ 2 ตารางว่าง/เลขที่เอกสารไม่ถูกสร้าง)
        this.addRow();
        
        const whtInput = document.getElementById('invWhtPct');
        if(whtInput) {
           whtInput.addEventListener('input', function() {
              const p = document.getElementById('invWhtPctPrint');
              if(p) p.innerText = this.value + '%';
           });
        }
        
        const d = new Date();
        const yy = d.getFullYear().toString().slice(-2);
        const mm = (d.getMonth()+1).toString().padStart(2,'0');
        const dd = d.getDate().toString().padStart(2,'0');
        const rand = Math.floor(Math.random() * 1000).toString().padStart(3,'0');
        
        const invNoEl = document.getElementById('invNoInput');
        if(invNoEl) invNoEl.value = 'INV-' + yy + mm + dd + '-' + rand;
        
        const dateEl = document.getElementById('invDateInput');
        if(dateEl) {
           dateEl.value = d.getFullYear() + '-' + mm + '-' + dd;
        }
        
        const staffEl = document.getElementById('invStaffName');
        if(staffEl && window.app.user && window.app.user.Name) {
           staffEl.value = window.app.user.Name;
        }
     },
     changeLogo: function(input) {
        if(input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.getElementById('invLogoImg');
                if(img) img.src = e.target.result;
            }
            reader.readAsDataURL(input.files[0]);
        }
     },
     addRow: function() {
        const tbody = document.getElementById('invTbody');
        if(!tbody) return;
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50";
        tr.innerHTML = `
           <td class="p-2 text-center text-slate-500 font-bold inv-row-num text-sm">1</td>
           <td class="p-2"><input type="text" class="w-full border-none outline-none focus:bg-white text-sm p-1 placeholder-slate-300" placeholder="รายละเอียด"></td>
           <td class="p-2"><input type="number" class="inv-qty w-full border-none outline-none focus:bg-white text-center text-sm p-1" value="1" min="1" onchange="window.app.invoice.calc()" onkeyup="window.app.invoice.calc()"></td>
           <td class="p-2"><input type="number" class="inv-price w-full border-none outline-none focus:bg-white text-right text-sm p-1" value="0" min="0" onchange="window.app.invoice.calc()" onkeyup="window.app.invoice.calc()"></td>
           <td class="p-2 text-right font-bold text-slate-800 text-sm"><span class="inv-line-total">0.00</span></td>
           <td class="p-2 text-center no-print"><button onclick="window.app.invoice.removeRow(this)" class="text-rose-400 hover:text-rose-600"><i class="fas fa-times"></i></button></td>
        `;
        tbody.appendChild(tr);
        this.updateRowNumbers();
        this.calc();
     },
     removeRow: function(btn) {
        btn.closest('tr').remove();
        this.updateRowNumbers();
        this.calc();
     },
     updateRowNumbers: function() {
        document.querySelectorAll('.inv-row-num').forEach((td, i) => td.innerText = i + 1);
     },
     calc: function() {
        let sub = 0;
        document.querySelectorAll('#invTbody tr').forEach(tr => {
            const q = parseFloat(tr.querySelector('.inv-qty').value) || 0;
            const p = parseFloat(tr.querySelector('.inv-price').value) || 0;
            const t = q * p;
            const lt = tr.querySelector('.inv-line-total');
            if(lt) lt.innerText = t.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
            sub += t;
        });
        
        const subTotalEl = document.getElementById('invSubTotal');
        if(subTotalEl) subTotalEl.innerText = sub.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
        
        let vat = 0;
        const vatChk = document.getElementById('invVatChk');
        if(vatChk && vatChk.checked) {
            vat = sub * 0.07;
        }
        const vatEl = document.getElementById('invVat');
        if(vatEl) vatEl.innerText = vat.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
        
        const whtInput = document.getElementById('invWhtPct');
        let whtPct = whtInput ? parseFloat(whtInput.value) || 0 : 0;
        let wht = sub * (whtPct / 100);
        const whtEl = document.getElementById('invWht');
        if(whtEl) whtEl.innerText = '-' + wht.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
        
        let net = sub + vat - wht;
        const netEl = document.getElementById('invNet');
        if(netEl) netEl.innerText = net.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
     }
  },

  refreshGlobalData: async function() {
    try {
      const res = await window.app.api('GET_ALL_DATA', {});
      if (res && res.status === 'success') {
        window.app.globalData = res;
        window.app.preloadBanners();
      }
    } catch(e) {
      console.error("Failed to refresh global data:", e);
    }
  },

  // พรีโหลดรูป Banner ทันทีหลังได้ข้อมูล — browser จะ cache ไว้ก่อนถึงหน้า Dashboard
  preloadBanners: function() {
    const g = window.app.globalData || {};
    (g.heroBanners || []).forEach(b => { const im = new Image(); im.src = window.app.formatImageUrl(b.url, 'w1600'); });
    (g.gridBanners || []).forEach(b => { const im = new Image(); im.src = window.app.formatImageUrl(b.url, 'w1000'); });
    (g.popupBanners || []).forEach(b => { const im = new Image(); im.src = window.app.formatImageUrl(b.url); });
  },
  
  showModal: function(modalId) {
    const el = document.getElementById(modalId);
    if(el) {
        el.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
  },
  
  hideModal: function(modalId) {
    const el = document.getElementById(modalId);
    if(el) {
        el.classList.add('hidden');
        document.body.style.overflow = '';
    }
  },

  showPopupBanner: function() {
    if(!this.globalData.popupBanners || this.globalData.popupBanners.length === 0) return;
    if(sessionStorage.getItem('tg_popup_shown')) return;
    
    const modal = document.getElementById('popupBannerModal');
    const content = document.getElementById('popupBannerContent');
    
    if(modal && content) {
        let html = '';
        this.globalData.popupBanners.forEach(item => {
            let img = this.esc(this.formatImageUrl(item.url));
            let linkTag = item.link ? `<a href="${this.esc(item.link)}" target="_blank" class="block w-full h-full cursor-pointer">` : '';
            let endLinkTag = item.link ? `</a>` : '';
            html += `${linkTag}<img src="${img}" class="w-full h-auto object-contain rounded-2xl shadow-lg border border-white/10">${endLinkTag}`;
        });
        content.innerHTML = html;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        sessionStorage.setItem('tg_popup_shown', 'true');
    }
  },

  closePopupBanner: function() {
    const modal = document.getElementById('popupBannerModal');
    if(modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
  },

  getWeekString: function(dateStr) {
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Unknown Week";
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    let yearStart = new Date(d.getFullYear(), 0, 1);
    let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getFullYear() + " - W" + String(weekNo).padStart(2, '0');
  },
  
  toggleMobileMenu: function() {
    const panel = document.getElementById('mobileMenuPanel');
    if(panel) panel.classList.toggle('hidden');
  },
  
  toggleSidebar: function() {
    const sidebar = document.getElementById('desktopSidebar');
    const showBtn = document.getElementById('desktopShowSidebarBtn');
    const mainWrapper = document.getElementById('mainContentWrapper');
    if (sidebar.classList.contains('lg:flex')) {
       sidebar.classList.remove('lg:flex');
       sidebar.classList.add('lg:hidden');
       if(showBtn) showBtn.style.display = 'flex';
       if(mainWrapper) {
          mainWrapper.classList.remove('lg:w-[calc(100%-260px)]');
          mainWrapper.classList.add('lg:w-full');
       }
    } else {
       sidebar.classList.remove('lg:hidden');
       sidebar.classList.add('lg:flex');
       if(showBtn) showBtn.style.display = 'none';
       if(mainWrapper) {
          mainWrapper.classList.remove('lg:w-full');
          mainWrapper.classList.add('lg:w-[calc(100%-260px)]');
       }
    }
  },
  
  closeMobileMenu: function() {
    const panel = document.getElementById('mobileMenuPanel');
    if(panel && !panel.classList.contains('hidden')) panel.classList.add('hidden');
  },
  
  init: function() {
    setInterval(() => {
      const d = new Date();
      const clk = document.getElementById('clock');
      if(clk) clk.innerText = d.toLocaleString('th-TH');
    }, 1000);

    const storedUser = sessionStorage.getItem('tg_pos_user');
    if (storedUser) {
      window.app.user = JSON.parse(storedUser);
      window.app.renderLayout();
    } else {
      window.app.renderLogin();
    }
    window.addEventListener('hashchange', () => window.app.route());
  },

  initDB: async function() {
    Swal.fire({
       title: 'กำลังตรวจสอบและสร้างฐานข้อมูล...',
       html: 'กรุณารอสักครู่ ระบบกำลังตั้งค่าแผ่นงานและข้อมูลทดสอบ',
       allowOutsideClick: false,
       didOpen: () => { Swal.showLoading(); }
    });
    try {
      const res = await new Promise((resolve, reject) => {
        google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).setupDatabase(window.app.user);
      });
      Swal.fire({ icon: 'success', title: 'สร้างฐานข้อมูลสำเร็จ!', text: 'กรุณาเข้าสู่ระบบด้วย admin / admin123', confirmButtonColor: '#4f46e5' });
    } catch(e) {
      Swal.fire('ข้อผิดพลาด', e.toString(), 'error');
    }
  },

  renderLogin: function() {
    const el = document.getElementById('app');
    const tmpl = document.getElementById('tmpl-login');
    if(el && tmpl) {
        el.innerHTML = tmpl.innerHTML;
        google.script.run.withSuccessHandler(bgUrl => {
            const bgEl = document.getElementById('loginBg');
            if(bgEl && bgUrl) {
                bgEl.style.backgroundImage = `url('${window.app.formatImageUrl(bgUrl)}')`;
                bgEl.classList.remove('opacity-30');
                bgEl.classList.add('opacity-100');
            }
        }).getPublicConfig();
    }
  },

  renderLayout: async function() {
    const el = document.getElementById('app');
    const tmpl = document.getElementById('tmpl-main');
    if(el && tmpl) el.innerHTML = tmpl.innerHTML;
    
    if(document.getElementById('headerUserName')) document.getElementById('headerUserName').innerText = window.app.user.Name;
    if(document.getElementById('headerRole')) document.getElementById('headerRole').innerText = window.app.user.Role;
    if(document.getElementById('mobileUserName')) document.getElementById('mobileUserName').innerText = window.app.user.Name;
    if(document.getElementById('mobileRole')) document.getElementById('mobileRole').innerText = window.app.user.Role;
    
    window.app.buildMenu();
    window.app.showLoading('กำลังเข้าสู่ระบบ...');
    
    try {
      const res = await window.app.api('GET_ALL_DATA', {});
      Swal.close();
      if(res && res.status === 'success') {
         window.app.globalData = res;
         window.app.preloadBanners();
         if(!window.location.hash) window.location.hash = '#dashboard';
         window.app.route();

         setTimeout(() => { window.app.showPopupBanner(); }, 500);
         
      } else {
         Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', 'error');
         window.app.logout();
      }
    } catch(err) {
      Swal.close();
      Swal.fire('Session หมดอายุ', 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง', 'error');
      window.app.logout();
    }
  },

  checkMenuAccess: function(menuId, defaultRoles) {
      if(!window.app.user) return false;
      const uRole = window.app.user.Role;
      if (uRole === 'Admin') return true; 
      
      const allowed = window.app.user['Accessible Menus'];
      if (allowed && allowed.trim() !== '') {
          if (allowed.trim() === '*' || allowed.trim().toUpperCase() === 'ALL') return true;
          // เทียบรายเมนูแบบตรงตัว — การใช้ substring includes เคยทำให้สิทธิ์ 'autopromotions' เปิดเมนู 'promotions' ได้
          const list = allowed.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          if (list.includes(menuId.toLowerCase())) return true;
          // รอบ 9 — สมาชิกเก่าอาจระบุ id หน้า settings เดิม (เช่น 'bookingsettings') ไว้ใน Accessible Menus:
          // ให้นับเป็นสิทธิ์เข้าหน้า systemsettings ที่ยุบรวมแล้วด้วย
          if (menuId === 'systemsettings') return window.app.systemSettings.tabs.some(t => list.includes(t.id));
          return false;
      }
      return defaultRoles.includes(uRole); 
  },

  buildMenu: function() {
    const deskNav = document.getElementById('desktopMenu');
    const mobNav = document.getElementById('mobileMenu');
    if(!deskNav || !mobNav) return;
    
    let deskHtmlStr = '';
    let mobHtmlStr = '';
    
    this.menuConfig.forEach(m => {
      if(m.isCategory) {
          if (this.checkMenuAccess('category', m.roles)) {
              deskHtmlStr += `<div class="px-4 pt-4 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">${m.label}</div>`;
              mobHtmlStr += `<div class="px-4 pt-4 pb-2 text-[11px] font-black text-slate-400 uppercase tracking-widest mt-1">${m.label}</div>`;
          }
      } else if(m.isParent) {
          let childDeskHtml = '';
          let childMobHtml = '';
          let hasChildAccess = false;
          
          m.children.forEach(child => {
             if(child.isCategory) {
                 if(this.checkMenuAccess('category', child.roles)) {
                    childDeskHtml += `<div class="px-3 pt-3 pb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">${child.label}</div>`;
                    childMobHtml += `<div class="px-4 pt-3 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">${child.label}</div>`;
                 }
             } else if(this.checkMenuAccess(child.id, child.roles)) {
                childDeskHtml += `<a href="#${child.id}" class="nav-link block px-3 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all" id="nav-desk-${child.id}"><i class="fas ${child.icon} mr-2 w-4 text-center opacity-50 text-[11px]"></i>${child.label}</a>`;
                childMobHtml += `<a href="#${child.id}" class="nav-link block px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all" id="nav-mob-${child.id}" onclick="window.app.closeMobileMenu()"><i class="fas ${child.icon} mr-2 w-4 text-center opacity-50 text-[11px]"></i>${child.label}</a>`;
                hasChildAccess = true;
             }
          });

          if(hasChildAccess) { 
             deskHtmlStr += `<div>
                <button onclick="document.getElementById('desk-sub-${m.id}').classList.toggle('hidden')" class="w-full text-left px-3 py-3 rounded-xl text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex justify-between items-center" id="nav-desk-${m.id}">
                  <span><i class="fas ${m.icon} mr-3 w-5 text-center opacity-70"></i>${m.label}</span>
                  <i class="fas fa-chevron-down text-[10px] opacity-50"></i>
                </button>
                <div id="desk-sub-${m.id}" class="hidden pl-8 pr-2 py-1 space-y-0.5 bg-slate-50/50 rounded-xl mt-1">
                   ${childDeskHtml}
                </div>
             </div>`;

             mobHtmlStr += `<div>
               <button onclick="document.getElementById('sub-${m.id}').classList.toggle('hidden')" class="w-full text-left px-4 py-3 rounded-xl text-base font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex justify-between items-center" id="nav-mob-${m.id}">
                 <span><i class="fas ${m.icon} mr-3 w-5 text-center opacity-70"></i>${m.label}</span>
                 <i class="fas fa-chevron-down text-sm"></i>
               </button>
               <div id="sub-${m.id}" class="hidden pl-6 pr-2 py-2 space-y-1 bg-slate-50/50 rounded-xl mt-1 border border-slate-100/50">
                  ${childMobHtml}
               </div>
             </div>`;
          }
      } else {
          if(this.checkMenuAccess(m.id, m.roles)) {
             deskHtmlStr += `<a href="#${m.id}" class="nav-link flex items-center px-3 py-3 rounded-xl text-sm font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all w-full" id="nav-desk-${m.id}"><i class="fas ${m.icon} mr-3 w-5 text-center opacity-70"></i>${m.label}</a>`;
             mobHtmlStr += `<a href="#${m.id}" class="nav-link block px-4 py-3 rounded-xl text-base font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all" id="nav-mob-${m.id}" onclick="window.app.closeMobileMenu()"><i class="fas ${m.icon} mr-3 w-5 text-center opacity-70 text-sm"></i>${m.label}</a>`;
          }
      }
    });
    
    deskNav.innerHTML = deskHtmlStr;
    mobNav.innerHTML = mobHtmlStr;
  },

  route: function() {
    if (window.app.pos && window.app.pos.countdownInterval) {
      clearInterval(window.app.pos.countdownInterval);
      window.app.pos.countdownInterval = null;
    }
    if(!window.app.user) return window.app.renderLogin();
    const hash = window.location.hash.substring(1) || 'dashboard';
    window.app.currentRoute = hash;

    // รอบ 9 — hash เก่าของ 6 หน้า settings ที่ยุบรวมเป็น systemsettings: redirect แล้วเปิด tab เดิม (bookmark เก่าต้องไม่เจอหน้าตาย)
    // ใช้ location.replace เพื่อไม่ทิ้ง history entry ของ hash เก่า (กดย้อนกลับแล้วไม่วนredirect)
    if (window.app.systemSettings.tabs.some(t => t.id === hash)) {
      window.app.systemSettings.pendingTab = hash;
      window.location.replace('#systemsettings');
      return;
    }

    const targetMenu = this.menuConfig.flatMap(x => x.children || [x]).find(x => x.id === hash);
    if (!targetMenu || !this.checkMenuAccess(hash, targetMenu.roles)) {
       Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลในส่วนนี้', 'warning');
       window.location.hash = '#dashboard';
       return;
    }
    
    document.querySelectorAll('.nav-link').forEach(el => {
       el.classList.remove('bg-indigo-600', 'text-white', 'hover:bg-indigo-700', 'bg-indigo-50', 'text-indigo-600', 'active-link');
       if(el.id.startsWith('nav-desk-')) el.classList.add('text-slate-500', 'hover:bg-indigo-50', 'hover:text-indigo-600');
       if(el.id.startsWith('nav-mob-')) el.classList.add('text-slate-600', 'hover:bg-indigo-50', 'hover:text-indigo-600');
    });
    
    const deskActive = document.getElementById('nav-desk-' + hash);
    const mobActive = document.getElementById('nav-mob-' + hash);
    
    if(deskActive) {
      deskActive.classList.remove('text-slate-500', 'hover:bg-indigo-50');
      deskActive.classList.add('bg-indigo-600', 'text-white', 'hover:bg-indigo-700', 'active-link');
      if(document.getElementById('pageTitle')) document.getElementById('pageTitle').innerText = deskActive.innerText;
    }
    if(mobActive) {
      mobActive.classList.remove('text-slate-600', 'hover:bg-indigo-50');
      mobActive.classList.add('bg-indigo-50', 'text-indigo-600', 'active-link');
    }

    const content = document.getElementById('page-content');
    if(!content) return;
    
    try {
      switch(hash) {
        case 'dashboard': 
          const dbTmpl = document.getElementById('tmpl-dashboard');
          if(dbTmpl) content.innerHTML = dbTmpl.innerHTML; 
          window.app.dashboard.init(); 
          break;
        case 'analytics':
          window.app.analytics.init();
          break;
        case 'target':
          window.app.target.init();
          break;
        case 'pos': 
          const posTmpl = document.getElementById('tmpl-pos');
          if(posTmpl) content.innerHTML = posTmpl.innerHTML; 
          window.app.pos.init(); 
          break;
        case 'systemsettings':
          window.app.systemSettings.init();
          break;
        case 'products': 
          window.app.grid.init('Products', 'SKU', [
            { key: 'SKU', label: 'SKU', type: 'text' }, 
            { key: 'Product Name', label: 'Product Name', type: 'text' },
            { key: 'Model', label: 'Model', type: 'text' },
            { key: 'Product Group', label: 'Product Group', type: 'text' },
            { key: 'Capacity', label: 'Capacity', type: 'text' }, 
            { key: 'Color', label: 'Color', type: 'text' },
            { key: 'Image URL', label: 'Image URL', type: 'text' }, 
            { key: 'Price', label: 'Price', type: 'number' },
            { key: 'Original Price', label: 'ราคาเดิม (เว้นว่างถ้าไม่ลดราคา)', type: 'number' },
            { key: 'Stock', label: 'Stock', type: 'number' },
            { key: 'Unit', label: 'Unit', type: 'text' },
            { key: 'Category', label: 'Category', type: 'select', options: ['โมบาย', 'อุปกรณ์เสริม', 'ของแถมแบรนด์', 'ของแถมช่องทาง'] },
            { key: 'Status', label: 'Status', type: 'select', options: ['เปิด', 'ปิด'] },
            { key: 'Channel', label: 'Channel Allowed', type: 'multi_select_channel' }
          ]); break;
        case 'autopromotions':
          window.app.grid.init('AutoPromotions', 'Buy Category', [
            { key: 'Buy Category', label: 'หมวดหมู่สินค้าที่ซื้อ', type: 'text' },
            { key: 'Get Discount Category', label: 'หมวดหมู่สินค้าที่ได้ส่วนลด', type: 'text' },
            { key: 'Discount Percent', label: 'เปอร์เซ็นต์ส่วนลด (%)', type: 'number' },
            { key: 'Message Suggest', label: 'ข้อความเชียร์ขาย (รองรับ HTML)', type: 'text' },
            { key: 'Message Apply', label: 'ข้อความเมื่อได้รับส่วนลด (รองรับ HTML)', type: 'text' },
            { key: 'Status', label: 'สถานะ', type: 'select', options: ['Active', 'Inactive'] }
          ], window.app.user.Role === 'Manager'); break; // Manager: อ่านได้ แก้ไม่ได้ (backend เป็น Admin-only)
        case 'giftmappings': 
          window.app.grid.init('GiftMappings', 'Mapping ID', [
            { key: 'Mapping ID', label: 'รหัสเงื่อนไข (เช่น GM-001)', type: 'text' }, 
            { key: 'Target Mobile (SKU or Group)', label: 'SKU/Product Name หรือ กลุ่มสินค้า (* = ทุกรุ่น)', type: 'text' }, 
            { key: 'Channel', label: 'ช่องทางการขาย', type: 'multi_select_channel' }, 
            { key: 'Brand Gifts', label: 'ของแถมแบรนด์', type: 'multi_select_brand_gifts' }, 
            { key: 'Channel Gifts', label: 'ของแถมช่องทาง', type: 'multi_select_channel_gifts' }, 
            { key: 'Status', label: 'สถานะการใช้', type: 'select', options: ['เปิด', 'ปิด'] }
        ], window.app.user.Role === 'Manager'); break; // Manager: อ่านได้ แก้ไม่ได้ (backend เป็น Admin-only)
        case 'interests': window.app.grid.init('Interests', 'Interest Name', [{ key: 'Interest Name', label: 'Interest', type: 'text' }, { key: 'Status', label: 'Status', type: 'select', options: ['เปิด', 'ปิด'] }]); break;
        case 'branches': window.app.grid.init('Branches', 'Branch Code', [{ key: 'Channel', label: 'Channel', type: 'text' }, { key: 'Branch Code', label: 'Branch Code', type: 'text' }, { key: 'Branch Name', label: 'Branch Name', type: 'text' }, { key: 'Area', label: 'Area', type: 'text' }, { key: 'Mall', label: 'Mall', type: 'text' }, { key: 'Region', label: 'Region', type: 'text' }, { key: 'Province', label: 'Province', type: 'text' }, { key: 'Type Name', label: 'Type Name', type: 'text' }]); break;
        case 'channels': window.app.grid.init('Channels', 'Channel ID', [{ key: 'Channel ID', label: 'ID', type: 'text' }, { key: 'Channel Name', label: 'Name', type: 'text' }, { key: 'Description', label: 'Desc', type: 'text' }]); break;
        case 'members': window.app.grid.init('Members', 'Username', [
            { key: 'Username', label: 'Username', type: 'text' }, 
            { key: 'Password', label: 'Password (เว้นว่างถ้าไม่เปลี่ยน)', type: 'password' }, 
            { key: 'Role', label: 'Role', type: 'select', options: ['Admin', 'Manager', 'Sales'] }, 
            { key: 'Name', label: 'Name', type: 'text' }, 
            { key: 'Branch Code', label: 'Branch Code', type: 'text' },
            { key: 'Accessible Menus', label: 'สิทธิ์การเข้าถึงเมนู (* = ให้ทั้งหมด)', type: 'multi_select_menu' }
        ]); break;
        case 'promotions': window.app.grid.init('Promotions', 'Promo ID', [{ key: 'Promo ID', label: 'ID', type: 'text' }, { key: 'Promo Name', label: 'Name', type: 'text' }, { key: 'Discount Type', label: 'Type', type: 'select', options: ['Fixed', 'Percent'] }, { key: 'Value', label: 'Value', type: 'number' }, { key: 'Status', label: 'Status', type: 'select', options: ['เปิด', 'ปิด'] }]); break;
        case 'inventorylog': window.app.grid.init('InventoryLog', 'Log ID', [{ key: 'Log ID', label: 'Log ID', type: 'readonly' }, { key: 'Timestamp', label: 'Date', type: 'readonly' }, { key: 'SKU', label: 'SKU', type: 'readonly' }, { key: 'Action', label: 'Action', type: 'readonly' }, { key: 'Qty', label: 'Qty', type: 'readonly' }, { key: 'Branch', label: 'Branch', type: 'readonly' }, { key: 'User', label: 'User', type: 'readonly' }], true); break;
        case 'auditlog': window.app.grid.init('AuditLog', 'Log ID', [{ key: 'Log ID', label: 'Log ID', type: 'readonly' }, { key: 'Timestamp', label: 'Date', type: 'readonly' }, { key: 'User', label: 'User', type: 'readonly' }, { key: 'Action', label: 'Action', type: 'readonly' }, { key: 'Details', label: 'Details', type: 'readonly' }], true); break;
        case 'invoice': 
            const tInv = document.getElementById('tmpl-invoice');
            if(tInv) {
               content.innerHTML = tInv.innerHTML;
               window.app.invoice.init();
            }
            break;
        case 'orders':
          let isSalesRole = (window.app.user.Role === 'Sales');
          window.app.grid.init('Orders', 'OrderID', [
            { key: '_rowIndex', type: 'hidden' }, 
            { key: 'OrderID', label: 'เลขที่บิล', type: 'readonly' },
            { key: 'Timestamp', label: 'วันที่', type: 'readonly' },
            { key: 'Channel', label: 'Channel', type: 'readonly' },
            { key: 'Branch Code', label: 'Branch Code', type: 'readonly' },
            { key: 'Customer Name', label: 'ชื่อ-สกุล', type: 'datalist', listId: 'customerList' },
            { key: 'Contact Number', label: 'เบอร์โทร', type: 'text' },
            { key: 'Email', label: 'Email', type: 'text' },
            { key: 'ID Card_Passport', label: 'เลขที่บัตรประชาชน', type: 'text' },
            { key: 'Code Handraiser', label: 'Code Handraiser', type: 'text' },
            { key: 'SKU', label: 'SKU', type: 'readonly' },
            { key: 'Product Name', label: 'สินค้า', type: 'product_select' },
            { key: 'Qty', label: 'จำนวน', type: 'number', onchange: 'window.app.grid.calcOrderTotal()' },
            { key: 'Unit Price', label: 'ราคาต่อหน่วย', type: 'number', onchange: 'window.app.grid.calcOrderTotal()' },
            { key: 'Promo', label: 'Promo', type: 'text' },
            { key: 'Reservation Status', label: 'ประเภทการจอง', type: 'select', options: ['จอง T (มีการจอง)', 'จอง F (สวมสิทธิ์การจอง)'] },
            { key: 'Staff', label: 'Staff', type: 'text' },
            { key: 'Booking Phone', label: 'Booking Phone', type: 'text' },
            { key: 'Customer Interests', label: 'Customer Interests', type: 'text' },
            { key: 'Remark', label: 'Remark', type: 'text' },
            { key: 'Row Total', label: 'ยอดรวม', type: 'readonly' },
            { key: 'Order Status', label: 'สถานะออเดอร์', type: 'select', options: ['Pending', 'Completed', 'Cancelled'] },
            { key: 'Receipt No', label: 'เลขที่ใบเสร็จ', type: 'text' },
            { key: 'Deposit', label: 'เงินมัดจำ', type: 'number' }
          ], isSalesRole); break;
      }
    } catch(err) {
      console.error(err);
      Swal.fire('ข้อผิดพลาดระบบ', err.message, 'error');
    }
  },

  api: function(action, payload) {
    // google.script.run ไม่มี timeout ในตัว — ถ้า handler ไม่ถูกเรียกกลับ Promise จะค้างตลอดกาล
    const call = new Promise((resolve, reject) => {
      google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).apiHandler(action, payload, window.app.user);
    });
    const timeout = new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error('การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่');
        err.isTimeout = true; // ให้ผู้เรียก (เช่น CHECKOUT) แสดงข้อความเฉพาะทางได้
        reject(err);
      }, 45000);
    });
    return Promise.race([call, timeout]);
  },

  handleLogin: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wait...';
    const res = await this.api('LOGIN', { username: document.getElementById('loginUsername').value, password: document.getElementById('loginPassword').value });
    if(res && res.status === 'success') {
      window.app.user = res.user; sessionStorage.setItem('tg_pos_user', JSON.stringify(window.app.user));
      Swal.fire({icon: 'success', title: 'Welcome', text: res.user.Name, timer: 1500, showConfirmButton: false});
      window.app.renderLayout();
    } else {
      Swal.fire('Error', res ? res.message : 'Unknown Error', 'error'); btn.disabled = false; btn.innerHTML = 'เข้าสู่ระบบ';
    }
  },

  logout: function() {
    if(window.app.dashboard.refreshTimer) clearInterval(window.app.dashboard.refreshTimer);
    if(window.app.dashboard.slider.timer) clearInterval(window.app.dashboard.slider.timer);
    if(window.app.pos && window.app.pos.countdownInterval) clearInterval(window.app.pos.countdownInterval);
    window.app.user = null; sessionStorage.removeItem('tg_pos_user'); window.location.hash = ''; window.app.renderLogin();
    sessionStorage.removeItem('tg_popup_shown');
    // เครื่องหน้าร้านใช้ร่วมกันหลายคน — ตะกร้าและชื่อ/เบอร์พนักงานที่จำไว้ต้องไม่ติดไปถึงผู้ใช้คนถัดไป
    localStorage.removeItem('tg_cart');
    sessionStorage.removeItem('tg_bk_staff');
    sessionStorage.removeItem('tg_bk_phone');
    if (window.app.pos) window.app.pos.cartData = [];
  },

  dashboard: {
    rawOrders: [], filteredOrders: [], charts: {}, refreshTimer: null,
    
    slider: {
        index: 0, count: 0, timer: null,
        init: function(data) {
            this.count = data.length; this.index = 0;
            let track = document.getElementById('sliderTrack'); let dots = document.getElementById('sliderDots');
            if(!track || !dots) return;
            
            let trackHtml = ''; let dotsHtml = '';
            data.forEach((item, i) => {
                let img = window.app.esc(window.app.formatImageUrl(item.url, 'w1600'));
                let linkTag = item.link ? `<a href="${window.app.esc(item.link)}" target="_blank" class="block w-full h-full">` : `<div class="w-full h-full">`;
                let endLinkTag = item.link ? `</a>` : `</div>`;
                trackHtml += `<div class="w-full h-full shrink-0 skeleton">${linkTag}<img src="${img}" loading="eager" fetchpriority="high" class="w-full h-full object-cover opacity-0 transition-opacity duration-500" onload="this.style.opacity=1; var s=this.closest('.skeleton'); if(s) s.classList.remove('skeleton');">${endLinkTag}</div>`;
                dotsHtml += `<button onclick="window.app.dashboard.slider.goTo(${i})" class="h-2.5 rounded-full transition-all duration-300 focus:outline-none ${i===0?'bg-white w-8 shadow-sm':'bg-white/50 w-2.5 hover:bg-white/80'}"></button>`;
            });
            track.innerHTML = trackHtml; dots.innerHTML = dotsHtml;
            this.startAuto();
        },
        updateDOM: function() {
            let track = document.getElementById('sliderTrack'); let dots = document.getElementById('sliderDots');
            if(track) track.style.transform = `translateX(-${this.index * 100}%)`;
            if(dots) {
                Array.from(dots.children).forEach((dot, i) => {
                    dot.className = i === this.index ? "h-2.5 rounded-full transition-all duration-300 focus:outline-none bg-white w-8 shadow-sm" : "h-2.5 rounded-full transition-all duration-300 focus:outline-none bg-white/50 w-2.5 hover:bg-white/80";
                });
            }
        },
        next: function() { this.index = (this.index + 1) % this.count; this.updateDOM(); this.startAuto(); },
        prev: function() { this.index = (this.index - 1 + this.count) % this.count; this.updateDOM(); this.startAuto(); },
        goTo: function(idx) { this.index = idx; this.updateDOM(); this.startAuto(); },
        startAuto: function() {
            if(this.timer) clearInterval(this.timer);
            if(this.count > 1) { this.timer = setInterval(() => { this.next(); }, 5000); }
        }
    },

    renderBanners: function() {
        const heroData = window.app.globalData.heroBanners || [];
        const gridData = window.app.globalData.gridBanners || [];

        const heroWrap = document.getElementById('dashHeroWrap');
        if(heroData.length > 0) {
            if(heroWrap) heroWrap.classList.remove('hidden');
            this.slider.init(heroData);
        } else {
            if(heroWrap) heroWrap.classList.add('hidden');
        }

        const gridWrap = document.getElementById('dashPromoGridWrap');
        const gridBox = document.getElementById('dashPromoGrid');
        if(gridData.length > 0) {
            if(gridWrap) gridWrap.classList.remove('hidden');
            let html = '';
            gridData.forEach((item, idx) => {
                let formattedUrl = window.app.esc(window.app.formatImageUrl(item.url, 'w1000'));
                let baseClass = "rounded-3xl overflow-hidden shadow-sm group relative bg-white border border-slate-100 h-[160px] md:h-[200px] skeleton";
                if(idx === 0 && gridData.length >= 3) baseClass += " md:col-span-2 md:row-span-2 md:h-full";

                let linkTag = item.link ? `<a href="${window.app.esc(item.link)}" target="_blank" class="block w-full h-full relative">` : `<div class="w-full h-full relative">`;
                let endLinkTag = item.link ? `</a>` : `</div>`;
                let textOverlay = item.details ? `<div class="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end max-h-full overflow-y-auto custom-scrollbar"><p class="text-white text-sm md:text-base font-bold drop-shadow-md text-shadow-sm leading-relaxed whitespace-pre-wrap break-words">${window.app.esc(item.details)}</p></div>` : '';

                html += `<div class="${baseClass}">${linkTag}<img src="${formattedUrl}" loading="eager" class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 opacity-0" style="transition: opacity .5s, transform .7s;" onload="this.style.opacity=1; var s=this.closest('.skeleton'); if(s) s.classList.remove('skeleton');">${textOverlay}${endLinkTag}</div>`;
            });
            if(gridBox) gridBox.innerHTML = html;
        } else {
            if(gridWrap) gridWrap.classList.add('hidden');
        }
    },

    init: async function() {
      if(window.app.user.Role === 'Sales') {
        document.querySelectorAll('.admin-filter').forEach(el => el.style.display = 'none');
      }
      window.app.showLoading('กำลังโหลดข้อมูล...');
      
      try {
        const res = await window.app.api('GET_ADVANCED_DASHBOARD', {});
        Swal.close();
        if(res && res.status === 'success') {
          this.rawOrders = res.data.orders.map(o => {
             let bInfo = window.app.globalData.branches.find(b => b['Branch Code'] === o['Branch Code']) || {};
             let pInfo = window.app.globalData.products.find(p => p.SKU == o.SKU) || {};
             o.Mall = bInfo.Mall || '-'; o.Region = bInfo.Region || '-'; o.Province = bInfo.Province || '-'; o['Type Name'] = bInfo['Type Name'] || '-'; 
             o.Category = pInfo.Category || '-'; o.Model = pInfo.Model || '-'; o.Capacity = pInfo.Capacity || '-';
             return o;
          });
          
          this.renderBanners();

          const bSel = document.getElementById('dashBranch'); const sSel = document.getElementById('dashSales');
          if(bSel && sSel) {
            let bHtml = '<option value="ALL">ทุกสาขา</option>';
            [...new Set(window.app.globalData.branches.map(b => b['Branch Code']))].forEach(b => { if(b) bHtml += '<option value="' + window.app.esc(b) + '">' + window.app.esc(b) + '</option>'; });
            bSel.innerHTML = bHtml;
            
            let sHtml = '<option value="ALL">ทุกคน</option>';
            res.data.members.forEach(m => { if(m.Name && (m.Role === 'Sales' || m.Role === 'Manager')) sHtml += '<option value="' + window.app.esc(m.Name) + '">' + window.app.esc(m.Name) + '</option>'; });
            sSel.innerHTML = sHtml;
          }
          
          const now = new Date();
          const dStart = document.getElementById('dashStartDate');
          const dEnd = document.getElementById('dashEndDate');
          // ห้ามใช้ toISOString() สร้างค่าวันที่ — เป็น UTC ทำให้วันเลื่อนถอยหลัง 1 วันในโซน UTC+7
          const toLocalKey = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
          if(dStart) dStart.value = toLocalKey(new Date(now.getFullYear(), now.getMonth(), 1));
          if(dEnd) dEnd.value = toLocalKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
          this.applyFilters(); this.startAutoRefresh();
        } else {
          this.renderLoadError(res ? res.message : 'ไม่สามารถโหลดข้อมูล Dashboard ได้');
        }
      } catch(err) {
        Swal.close(); console.error(err);
        this.renderLoadError(err.message);
      }
    },
    // error state มาตรฐาน (5A.4) พร้อมปุ่มลองใหม่ — ห้ามเงียบเฉยตาม error contract
    renderLoadError: function(msg) {
      const emptyEl = document.getElementById('dashEmptyState');
      if (!emptyEl) { Swal.fire('Error', msg, 'error'); return; }
      emptyEl.innerHTML = window.app.emptyState({
        icon: 'fa-exclamation-triangle',
        title: 'โหลดข้อมูลไม่สำเร็จ',
        subtitle: msg,
        actionLabel: 'ลองใหม่',
        onclick: 'window.app.dashboard.init()'
      });
      emptyEl.classList.remove('hidden');
    },
    startAutoRefresh: function() {
      if(this.refreshTimer) clearInterval(this.refreshTimer);
      this.refreshTimer = setInterval(async () => {
        if(window.app.currentRoute !== 'dashboard') return; 
        const stat = document.getElementById('dashSyncStatus'); if(stat) { stat.classList.remove('bg-slate-100','text-slate-600'); stat.classList.add('bg-emerald-50','text-emerald-600'); }
        try {
          const res = await window.app.api('GET_ADVANCED_DASHBOARD', {});
          if(res && res.status === 'success') { 
            this.rawOrders = res.data.orders.map(o => {
               let bInfo = window.app.globalData.branches.find(b => b['Branch Code'] === o['Branch Code']) || {};
               let pInfo = window.app.globalData.products.find(p => p.SKU == o.SKU) || {};
               o.Mall = bInfo.Mall || '-'; o.Region = bInfo.Region || '-'; o.Province = bInfo.Province || '-'; o['Type Name'] = bInfo['Type Name'] || '-'; 
               o.Category = pInfo.Category || '-'; o.Model = pInfo.Model || '-'; o.Capacity = pInfo.Capacity || '-';
               return o;
            });
            this.applyFilters(); 
          }
        } catch(e) {}
        setTimeout(() => { if(stat) { stat.classList.remove('bg-emerald-50','text-emerald-600'); stat.classList.add('bg-slate-100','text-slate-600'); } }, 1500);
      }, 30000); 
    },
    resetFilters: function() { 
      ['dashStartDate','dashEndDate','dashBranch','dashSales'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.value = id.includes('Date') ? '' : 'ALL';
      });
      this.applyFilters(); 
    },
    applyFilters: function() {
      const elSD = document.getElementById('dashStartDate'); const elED = document.getElementById('dashEndDate');
      const elB = document.getElementById('dashBranch'); const elS = document.getElementById('dashSales');
      const sD = elSD ? elSD.value : ''; const eD = elED ? elED.value : '';
      const b = elB ? elB.value : 'ALL'; const s = elS ? elS.value : 'ALL';

      this.filteredOrders = this.rawOrders.filter(o => {
        if (sD && new Date(o.Timestamp) < new Date(sD + "T00:00:00")) return false;
        if (eD && new Date(o.Timestamp) > new Date(eD + "T23:59:59")) return false;
        if (b !== 'ALL' && o['Branch Code'] !== b) return false;
        if (s !== 'ALL' && o['Staff'] !== s) return false;
        return true;
      });
      // ช่วง/ตัวกรองที่เลือกไม่มีออเดอร์ — แสดง empty state มาตรฐาน (5A.4) เหนือ KPI (KPI ยังแสดงค่า 0 ตามจริง)
      const emptyEl = document.getElementById('dashEmptyState');
      if (emptyEl) {
        if (this.filteredOrders.length === 0) {
          const hasAnyOrder = this.rawOrders.length > 0;
          emptyEl.innerHTML = window.app.emptyState({
            icon: 'fa-calendar-times',
            title: hasAnyOrder ? 'ไม่มีออเดอร์ในช่วงที่เลือก' : 'ยังไม่มีออเดอร์ในระบบ',
            subtitle: hasAnyOrder ? 'ลองขยายช่วงวันที่ หรือล้างตัวกรองเพื่อดูออเดอร์ทั้งหมด' : 'เมื่อมีการคีย์ออเดอร์แรก ข้อมูลสรุปจะแสดงที่นี่',
            actionLabel: hasAnyOrder ? 'ล้างตัวกรอง' : '',
            onclick: hasAnyOrder ? 'window.app.dashboard.resetFilters()' : ''
          });
          emptyEl.classList.remove('hidden');
        } else {
          emptyEl.classList.add('hidden');
          emptyEl.innerHTML = '';
        }
      }
      this.updateKPIs(); this.renderCharts(); this.renderPromotionsTable(); this.renderGiftsTable(); this.renderInterestsTable();
    },
    updateKPIs: function() {
      let t = 0; let u = new Set(); let completedOrders = new Set();
      let resT = 0; let resF = 0;
      let totalMobiles = 0; let totalAccessories = 0;
      const orderResStatusMap = {};
      this.filteredOrders.forEach(o => { if(o['Reservation Status'] && o['Reservation Status'].trim() !== '') { orderResStatusMap[o.OrderID] = o['Reservation Status']; } });

      this.filteredOrders.forEach(o => {
        if (o['Order Status'] !== 'Cancelled') { 
            let rTotal = parseFloat((o['Row Total'] || '0').toString().replace(/,/g,''));
            t += isNaN(rTotal) ? 0 : rTotal;
            u.add(o.OrderID);
            if (o['Order Status'] === 'Completed') completedOrders.add(o.OrderID);
            
            let isMobile = o.Category === 'โมบาย';
            let isAcc = o.Category === 'อุปกรณ์เสริม';
            if (isMobile || isAcc) {
                let qty = parseInt(o.Qty || 0); if(isNaN(qty)) qty = 0;
                if(isMobile) totalMobiles += qty;
                if(isAcc) totalAccessories += qty;
                
                let rStatus = o['Reservation Status'] || orderResStatusMap[o.OrderID] || '';
                if(rStatus.includes('จอง T')) resT += qty;
                if(rStatus.includes('จอง F')) resF += qty;
            }
        }
      });
      
      if(document.getElementById('dashKpiTotal')) document.getElementById('dashKpiTotal').innerText = '฿' + t.toLocaleString();
      if(document.getElementById('dashKpiMobiles')) document.getElementById('dashKpiMobiles').innerText = totalMobiles; 
      if(document.getElementById('dashKpiAccessories')) document.getElementById('dashKpiAccessories').innerText = totalAccessories; 
      if(document.getElementById('dashKpiResT')) document.getElementById('dashKpiResT').innerText = resT;
      if(document.getElementById('dashKpiResF')) document.getElementById('dashKpiResF').innerText = resF;
      if(document.getElementById('dashKpiConv')) document.getElementById('dashKpiConv').innerText = (u.size>0 ? ((completedOrders.size/u.size)*100).toFixed(1) : 0) + '%';
      if(document.getElementById('dashKpiAov')) document.getElementById('dashKpiAov').innerText = '฿' + (u.size>0 ? (t/u.size) : 0).toLocaleString();
    },
    renderCharts: function() {
      if (typeof ChartDataLabels !== 'undefined') {
          Chart.register(ChartDataLabels);
          Chart.defaults.set('plugins.datalabels', {
              color: '#334155',
              font: { family: 'Prompt', weight: 'bold', size: 10 },
              align: 'end',
              anchor: 'end',
              offset: 4,
              formatter: function(value) { return value > 0 ? value.toLocaleString() : ''; }
          });
      }
      const validCategories = ['โมบาย', 'อุปกรณ์เสริม'];
      const isDevice = (o) => o && o.Category && validCategories.includes(o.Category.toString().trim());

      const trendData = {}; 
      this.filteredOrders.forEach(o => { 
        if(o['Order Status'] !== 'Cancelled' && isDevice(o)) { 
          let d = new Date(o.Timestamp).toLocaleDateString('th-TH'); 
          let qty = parseInt(o.Qty || 0); trendData[d] = (trendData[d] || 0) + (isNaN(qty) ? 0 : qty); 
        }
      });
      this.createChart('chartSalesTrend', 'line', Object.keys(trendData), Object.values(trendData), 'จำนวนเครื่อง', '#4f46e5');
      
      const weeklyTrend = {};
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] !== 'Cancelled' && isDevice(o)) {
          let w = window.app.getWeekString(o.Timestamp);
          let qty = parseInt(o.Qty || 0); weeklyTrend[w] = (weeklyTrend[w] || 0) + (isNaN(qty) ? 0 : qty);
        }
      });
      const sortedWeeks = Object.keys(weeklyTrend).sort();
      this.createChart('chartWeeklyTrend', 'bar', sortedWeeks, sortedWeeks.map(w => weeklyTrend[w]), 'จำนวนเครื่อง', '#2563eb');

      const modelsData = {}; 
      let grandTotalQty = 0;
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] === 'Cancelled' || !isDevice(o)) return;
        let mName = o.Model && o.Model !== '-' ? o.Model : o['Product Name'];
        if (o.Capacity && o.Capacity !== '-' && o.Capacity.trim() !== '') mName += ` (${o.Capacity})`;
        let qty = parseInt(o.Qty || 0); if(isNaN(qty)) qty = 0;
        modelsData[mName] = (modelsData[mName] || 0) + qty;
        grandTotalQty += qty;
      });
      let sortedModels = Object.keys(modelsData).sort((a,b) => modelsData[b] - modelsData[a]).slice(0, 15);
      
      if(this.charts['chartModelAdvanced']) this.charts['chartModelAdvanced'].destroy();
      const ctxModel = document.getElementById('chartModelAdvanced');
      if(ctxModel) {
        this.charts['chartModelAdvanced'] = new Chart(ctxModel.getContext('2d'), {
            type: 'bar',
            data: { labels: sortedModels, datasets: [{ label: 'จำนวนเครื่อง', data: sortedModels.map(m => modelsData[m]), backgroundColor: '#4f46e5', borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, grace: '15%' }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { footer: (tooltipItems) => { let mName = tooltipItems[0].label; let part = modelsData[mName] || 0; let percent = grandTotalQty > 0 ? ((part / grandTotalQty) * 100).toFixed(1) : 0; return 'คิดเป็นสัดส่วน: ' + percent + '% ของยอดจองทั้งหมด'; } } } } }
        });
      }

      // Promotions summary is rendered as a table via renderPromotionsTable()

      const buildCountChart = (field, canvasId, colorHex) => {
          const counts = {};
          this.filteredOrders.forEach(o => {
            if (o['Order Status'] !== 'Cancelled' && isDevice(o) && o[field] && o[field] !== '-') {
              let qty = parseInt(o.Qty || 0); counts[o[field]] = (counts[o[field]] || 0) + (isNaN(qty) ? 0 : qty);
            }
          });
          let labels = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
          let data = labels.map(l => counts[l]);
          this.createChart(canvasId, 'bar', labels, data, 'จำนวนเครื่อง', colorHex);
      };
      
      buildCountChart('Mall', 'chartMall', '#17a2b8'); buildCountChart('Region', 'chartRegion', '#10b981');
      buildCountChart('Province', 'chartProvince', '#f59e0b'); buildCountChart('Type Name', 'chartType', '#8b5cf6');

      const branchCounts = {};
      this.filteredOrders.forEach(o => { if(o['Order Status'] !== 'Cancelled' && isDevice(o)) { let qty = parseInt(o.Qty || 0); branchCounts[o['Branch Code']] = (branchCounts[o['Branch Code']] || 0) + (isNaN(qty) ? 0 : qty); } });
      let sortedBranches = Object.keys(branchCounts).sort((a,b)=>branchCounts[b]-branchCounts[a]).slice(0, 10);
      this.createChart('chartTopBranches', 'bar', sortedBranches, sortedBranches.map(b=>branchCounts[b]), 'จำนวนเครื่องรวม', '#4f46e5');

      const salesCounts = {};
      this.filteredOrders.forEach(o => { if(o['Order Status'] !== 'Cancelled' && isDevice(o) && o['Staff']) { let qty = parseInt(o.Qty || 0); salesCounts[o['Staff']] = (salesCounts[o['Staff']] || 0) + (isNaN(qty) ? 0 : qty); } });
      let sortedSales = Object.keys(salesCounts).sort((a,b)=>salesCounts[b]-salesCounts[a]).slice(0, 10);
      this.createChart('chartSalesRank', 'bar', sortedSales, sortedSales.map(s=>salesCounts[s]), 'จำนวนเครื่อง', '#2563eb', true);

      // Gifts summary is rendered as a table via renderGiftsTable()

      // Data for Channel vs Model (Split Mobile and Accessories)
      const channelModelDataMobile = {};
      const channelModelDataAcc = {};
      const allChannelsMobile = new Set();
      const allChannelsAcc = new Set();
      
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] === 'Cancelled' || !isDevice(o)) return;
        let mName = o.Model && o.Model !== '-' ? o.Model : o['Product Name'];
        if (o.Capacity && o.Capacity !== '-' && o.Capacity.trim() !== '') mName += ` (${o.Capacity})`;
        
        let ch = o.Channel || 'Unknown';
        let qty = parseInt(o.Qty || 0); if(isNaN(qty)) qty = 0;
        
        if (o.Category === 'โมบาย') {
            allChannelsMobile.add(ch);
            if(!channelModelDataMobile[mName]) channelModelDataMobile[mName] = { total: 0, channels: {} };
            channelModelDataMobile[mName].total += qty;
            channelModelDataMobile[mName].channels[ch] = (channelModelDataMobile[mName].channels[ch] || 0) + qty;
        } else if (o.Category === 'อุปกรณ์เสริม') {
            allChannelsAcc.add(ch);
            if(!channelModelDataAcc[mName]) channelModelDataAcc[mName] = { total: 0, channels: {} };
            channelModelDataAcc[mName].total += qty;
            channelModelDataAcc[mName].channels[ch] = (channelModelDataAcc[mName].channels[ch] || 0) + qty;
        }
      });
      
      const renderStackedChart = (canvasId, dataMap, channelsSet) => {
          let topModels = Object.keys(dataMap).sort((a,b) => dataMap[b].total - dataMap[a].total).slice(0, 15);
          let datasets = [];
          let colorsChannel = ['#4f46e5', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#f43f5e', '#64748b'];
          let chIdx = 0;
          
          Array.from(channelsSet).forEach(ch => {
             let dataPoints = topModels.map(m => dataMap[m].channels[ch] || 0);
             if (dataPoints.some(v => v > 0)) {
                 datasets.push({
                     label: ch,
                     data: dataPoints,
                     backgroundColor: colorsChannel[chIdx % colorsChannel.length],
                     borderRadius: 4
                 });
                 chIdx++;
             }
          });
          
          if(this.charts[canvasId]) this.charts[canvasId].destroy();
          const ctx = document.getElementById(canvasId);
          if(ctx) {
            this.charts[canvasId] = new Chart(ctx.getContext('2d'), {
                type: 'bar',
                data: { labels: topModels, datasets: datasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    indexAxis: 'y',
                    scales: { 
                        x: { stacked: true, grid: { color: '#f1f5f9' }, grace: '15%' }, 
                        y: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Prompt', size: 10 } } } 
                    },
                    plugins: {
                        legend: { display: true, position: 'top', labels: { font: { family: 'Prompt' } } },
                        datalabels: {
                            color: '#fff',
                            font: { family: 'Prompt', weight: 'bold', size: 10 },
                            anchor: 'center',
                            align: 'center',
                            formatter: (val) => val > 0 ? val : ''
                        }
                    }
                }
            });
          }
      };

      renderStackedChart('chartChannelModelMobile', channelModelDataMobile, allChannelsMobile);
      renderStackedChart('chartChannelModelAcc', channelModelDataAcc, allChannelsAcc);
    },
    renderPromotionsTable: function() {
      const tbody = document.getElementById('tablePromotionsBody'); if(!tbody) return;
      const promoData = {}; const promoProcessed = new Set(); let totalPromos = 0;
      const isDevice = (o) => { const validCat = ['โมบาย', 'อุปกรณ์เสริม']; return o.Category && validCat.includes(o.Category.toString().trim()); };
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] !== 'Cancelled' && !promoProcessed.has(o.OrderID)) {
           let orderItems = this.filteredOrders.filter(x => x.OrderID === o.OrderID);
           if(orderItems.some(x => isDevice(x))) {
               let firstRow = orderItems[0];
               if(firstRow && firstRow.Promo && firstRow.Promo !== '-') { promoData[firstRow.Promo] = (promoData[firstRow.Promo] || 0) + 1; totalPromos++; }
           }
           promoProcessed.add(o.OrderID);
        }
      });
      const sorted = Object.keys(promoData).sort((a,b) => promoData[b]-promoData[a]);
      if(sorted.length===0){ tbody.innerHTML='<tr><td colspan="3" class="text-center p-6 text-slate-400">ไม่มีข้อมูลโปรโมชั่น</td></tr>'; return; }
      let html = '';
      sorted.forEach(k => {
          let p = totalPromos > 0 ? ((promoData[k]/totalPromos)*100).toFixed(1) : '0.0';
          html +='<tr class="hover:bg-slate-50 transition-colors"><td class="py-4 px-4 text-slate-700 font-medium whitespace-nowrap">'+window.app.esc(k)+'</td><td class="py-4 px-4 text-center font-black text-pink-600 whitespace-nowrap">'+promoData[k]+'</td><td class="py-4 px-4 text-center whitespace-nowrap"><div class="flex items-center gap-2 justify-end"><span class="text-xs text-slate-500 w-8 text-right">'+p+'%</span><div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="bg-pink-500 h-full rounded-full" style="width:'+p+'%"></div></div></div></td></tr>';
      });
      tbody.innerHTML = html;
    },

    renderGiftsTable: function() {
      const tbody = document.getElementById('tableGiftsBody'); if(!tbody) return;
      const giftCounts = {}; let totalGifts = 0;
      const isGift = (o) => o.Category && o.Category.toString().trim().includes('ของแถม');
      this.filteredOrders.forEach(o => {
         if(o['Order Status'] !== 'Cancelled' && isGift(o)) {
            let name = o['Product Name'] || '';
            let qty = parseInt(o.Qty || 0); if(isNaN(qty)) qty = 0;
            giftCounts[name] = (giftCounts[name] || 0) + qty; totalGifts += qty;
         }
      });
      const sorted = Object.keys(giftCounts).sort((a,b) => giftCounts[b]-giftCounts[a]);
      if(sorted.length===0){ tbody.innerHTML='<tr><td colspan="3" class="text-center p-6 text-slate-400">ไม่มีข้อมูลของแถม</td></tr>'; return; }
      let html = '';
      sorted.forEach(k => {
          let p = totalGifts > 0 ? ((giftCounts[k]/totalGifts)*100).toFixed(1) : '0.0';
          html +='<tr class="hover:bg-slate-50 transition-colors"><td class="py-4 px-4 text-slate-700 font-medium whitespace-nowrap">'+window.app.esc(k)+'</td><td class="py-4 px-4 text-center font-black text-emerald-600 whitespace-nowrap">'+giftCounts[k]+'</td><td class="py-4 px-4 text-center whitespace-nowrap"><div class="flex items-center gap-2 justify-end"><span class="text-xs text-slate-500 w-8 text-right">'+p+'%</span><div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="bg-emerald-500 h-full rounded-full" style="width:'+p+'%"></div></div></div></td></tr>';
      });
      tbody.innerHTML = html;
    },

    renderInterestsTable: function() {
      const tbody = document.getElementById('tableInterestsBody'); if(!tbody) return;
      let tbodyHtml = ''; let counts = {}; let totalInterests = 0; const ordersById = {};
      this.filteredOrders.forEach(o => {
        if(o['Order Status'] !== 'Cancelled') {
           if(!ordersById[o.OrderID]) ordersById[o.OrderID] = [];
           ordersById[o.OrderID].push(o);
        }
      });
      
      const validCat = ['โมบาย', 'อุปกรณ์เสริม'];
      Object.values(ordersById).forEach(orderLines => {
         let hasDevice = orderLines.some(x => x.Category && validCat.includes(x.Category.toString().trim()));
         if(hasDevice) {
             let firstRow = orderLines.find(r => r['Customer Interests'] && r['Customer Interests'].trim() !== ""); 
             if(firstRow) {
                 firstRow['Customer Interests'].split(',').forEach(i => {
                    let interest = i.trim();
                    if (interest) { counts[interest] = (counts[interest] || 0) + 1; totalInterests++; }
                 });
             }
         }
      });
      const sorted = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
      if(sorted.length===0){ tbody.innerHTML='<tr><td colspan="3" class="text-center p-6 text-slate-400">ไม่มีข้อมูลความสนใจ</td></tr>'; return; }
      sorted.forEach(k => { 
          let p = ((counts[k]/totalInterests)*100).toFixed(1); 
          tbodyHtml +='<tr class="hover:bg-slate-50 transition-colors"><td class="py-4 px-4 text-slate-700 font-medium whitespace-nowrap">'+window.app.esc(k)+'</td><td class="py-4 px-4 text-center font-black text-indigo-600 whitespace-nowrap">'+counts[k]+'</td><td class="py-4 px-4 text-center whitespace-nowrap"><div class="flex items-center gap-2 justify-end"><span class="text-xs text-slate-500 w-8 text-right">'+p+'%</span><div class="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="bg-indigo-500 h-full rounded-full" style="width:'+p+'%"></div></div></div></td></tr>'; 
      });
      tbody.innerHTML = tbodyHtml;
    },
    createChart: function(id, type, lbls, data, lblName='Data', col=null, isHoriz=false) {
      if(window.app.dashboard.charts[id]) window.app.dashboard.charts[id].destroy();
      const el = document.getElementById(id); if(!el) return;
      const ctx = el.getContext('2d');
      
      const themeColor = col || '#4f46e5';
      let datasetConfig = {
        label: lblName,
        data: data,
        borderWidth: type === 'line' ? 2.5 : 0,
        borderRadius: type === 'bar' ? (isHoriz ? [0, 8, 8, 0] : [8, 8, 0, 0]) : 0
      };
      
      if (type === 'line') {
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, hexToRgba(themeColor, 0.18));
        gradient.addColorStop(1, hexToRgba(themeColor, 0.0));
        
        datasetConfig.borderColor = themeColor;
        datasetConfig.backgroundColor = gradient;
        datasetConfig.fill = true;
        datasetConfig.tension = 0.4;
        datasetConfig.pointBackgroundColor = '#ffffff';
        datasetConfig.pointBorderColor = themeColor;
        datasetConfig.pointBorderWidth = 2;
        datasetConfig.pointRadius = 4;
        datasetConfig.pointHoverRadius = 6;
      } else {
        datasetConfig.backgroundColor = themeColor;
      }
      
      function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }

      window.app.dashboard.charts[id] = new Chart(ctx, {
        type: type,
        data: {
          labels: lbls,
          datasets: [datasetConfig]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: isHoriz ? 'y' : 'x',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f172a',
              titleFont: { family: 'Prompt', size: 12, weight: '700' },
              bodyFont: { family: 'Prompt', size: 11, weight: '400' },
              padding: 10,
              cornerRadius: 10,
              displayColors: false,
              titleColor: '#ffffff',
              bodyColor: '#e2e8f0'
            }
          },
          scales: {
            y: {
              grid: { color: 'rgba(226, 232, 240, 0.4)', drawBorder: false },
              ticks: {
                color: '#64748b',
                font: { family: 'Prompt', size: 10, weight: '500' }
              },
              grace: '15%'
            },
            x: {
              grid: { display: false, drawBorder: false },
              ticks: {
                color: '#64748b',
                font: { family: 'Prompt', size: 10, weight: '500' }
              },
              grace: '15%'
            }
          }
        }
      });
    },
    switchTab: function(tabId) {
      document.querySelectorAll('.dash-tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.dash-tab').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'border-indigo-600', 'font-bold');
        btn.classList.add('text-slate-500', 'border-transparent', 'font-semibold');
      });
      
      const activeContent = document.getElementById('tab-content-' + tabId);
      if(activeContent) activeContent.classList.remove('hidden');
      
      const activeBtn = document.getElementById('tab-btn-' + tabId);
      if(activeBtn) {
        activeBtn.classList.remove('text-slate-500', 'border-transparent', 'font-semibold');
        activeBtn.classList.add('text-indigo-600', 'border-indigo-600', 'font-bold');
      }
      
      // Re-render charts for active tab to adjust sizing correctly
      this.renderCharts();
    },
    exportCSV: function() {
      if(window.app.dashboard.filteredOrders.length===0) return Swal.fire('ไม่มีข้อมูล', '', 'warning');
      const headers = Object.keys(window.app.dashboard.filteredOrders[0]); 
      let csvContent = "\uFEFF" + headers.join(",") + "\r\n";
      window.app.dashboard.filteredOrders.forEach(row => { 
        csvContent += headers.map(h => '"' + (row[h]?row[h].toString().replace(/"/g, '""'):"") + '"').join(",") + "\r\n"; 
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const lnk = document.createElement("a");
      lnk.href = url;
      // ชื่อไฟล์ต้องเป็นวันที่ local — toISOString เป็น UTC ทำให้วันเลื่อนถอยหลังช่วงก่อน 7 โมงเช้า (โซน +7)
      const _d = new Date();
      lnk.download = 'Report_' + _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0') + '.csv';
      document.body.appendChild(lnk); 
      lnk.click(); 
      document.body.removeChild(lnk);
    }
  },

  analytics: {
    chart: null,
    init: async function() {
      const content = document.getElementById('page-content');
      const tmpl = document.getElementById('tmpl-analytics');
      if(content && tmpl) content.innerHTML = tmpl.innerHTML;
      
      window.app.showLoading('กำลังโหลดข้อมูล...');
      try {
        const res = await window.app.api('GET_TABLE', { tableName: 'Orders' });
        Swal.close();
        if(res && res.status === 'success') {
           this.render(res.data);
        } else {
           this.renderLoadError(res ? res.message : 'ไม่สามารถโหลดข้อมูลยอดขายได้');
        }
      } catch(e) {
        Swal.close(); this.renderLoadError(e.message);
      }
    },
    renderLoadError: function(msg) {
      const content = document.getElementById('analytics-content');
      if (!content) { Swal.fire('Error', msg, 'error'); return; }
      content.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl shadow-sm">' + window.app.emptyState({
        icon: 'fa-exclamation-triangle',
        title: 'โหลดข้อมูลไม่สำเร็จ',
        subtitle: msg,
        actionLabel: 'ลองใหม่',
        onclick: 'window.app.analytics.init()'
      }) + '</div>';
    },
    render: function(orders) {
      // กัน async race: ผู้ใช้อาจสลับหน้าไปแล้วก่อนข้อมูลโหลดเสร็จ — element ปลายทางไม่อยู่ ห้ามเขียนทับ
      const analyticsEl = document.getElementById('analytics-content');
      if (!analyticsEl) return;
      const settings = window.app.globalData.settings || {};
      const startStr = settings.ReserveStart;
      const endStr = settings.ReserveEnd;
      if(!startStr || !endStr) {
         const canSetup = window.app.user && window.app.user.Role === 'Admin';
         analyticsEl.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl shadow-sm">' + window.app.emptyState({
           icon: 'fa-clock',
           title: 'ยังไม่ได้ตั้งค่าช่วงเวลาการจอง',
           subtitle: 'กรุณาตั้งค่า วันเริ่ม-วันสิ้นสุดการจอง ในเมนู "ตั้งเวลารับจองสินค้า" ก่อนใช้งานหน้านี้',
           actionLabel: canSetup ? 'ไปตั้งค่าช่วงเวลาการจอง' : '',
           onclick: canSetup ? "location.hash='bookingsettings'" : ''
         }) + '</div>';
         return;
      }
      
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      const now = new Date();
      
      const formatTh = (d) => { const m=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; return `${d.getDate()} ${m[d.getMonth()]} ${(d.getFullYear()+543).toString().substring(2)}`; };
      const rangeEl = document.getElementById('analyticsDateRange');
      if (rangeEl) rangeEl.innerText = `(${formatTh(startDate)} - ${formatTh(endDate)})`;
      
      const totalDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
      let currentDays = Math.max(0, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
      if (now > endDate) currentDays = totalDays;
      
      const validOrders = orders.filter(o => o['Order Status'] !== 'Cancelled' && o['Order Status'] !== 'ยกเลิก' && o.Timestamp);
      let totalMobile = 0;
      let totalAcc = 0;
      
      const dailyMobile = {};
      const dailyAcc = {};
      
      const products = window.app.globalData.products || [];
      const getCat = (sku) => {
         const p = products.find(x => x.SKU === sku);
         return p ? (p.Category || '').toString().trim() : '';
      };

      // แปลงวันที่เป็น key รูปแบบ YYYY-MM-DD (local time) — รองรับทั้ง ISO และ display string จาก sheet
      const toDateKey = (dt) => dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
      const startKey = toDateKey(startDate);
      const endKey = toDateKey(new Date(startDate.getTime() + (totalDays * 24*60*60*1000)));
      const nowKey = toDateKey(now);

      validOrders.forEach(o => {
          let cat = getCat(o.SKU);
          if (cat.includes('ของแถม')) return;

          let qty = parseInt(o.Qty || 0);
          if(isNaN(qty)) qty = 0;
          let tsObj = new Date(o.Timestamp);
          if (isNaN(tsObj)) return;
          let d = toDateKey(tsObj);
          if (d < startKey || d > endKey) return; // นอกช่วงการจอง — ตัดออกทั้ง KPI และกราฟให้ตรงกัน
          
          if (cat === 'โมบาย') {
             totalMobile += qty;
             dailyMobile[d] = (dailyMobile[d] || 0) + qty;
          } else if (cat === 'อุปกรณ์เสริม') {
             totalAcc += qty;
             dailyAcc[d] = (dailyAcc[d] || 0) + qty;
          }
      });
      
      const totalSales = totalMobile + totalAcc;
      const avgPerDayMobile = currentDays > 0 ? (totalMobile / currentDays) : 0;
      const avgPerDayAcc = currentDays > 0 ? (totalAcc / currentDays) : 0;
      
      const forecastedTotal = Math.round((avgPerDayMobile + avgPerDayAcc) * totalDays);
      
      const tTot = document.getElementById('anKpiTotal'); if(tTot) tTot.innerText = totalSales.toLocaleString();
      const tMob = document.getElementById('anKpiMobile'); if(tMob) tMob.innerText = totalMobile.toLocaleString();
      const tAcc = document.getElementById('anKpiAcc'); if(tAcc) tAcc.innerText = totalAcc.toLocaleString();
      const tFor = document.getElementById('anKpiForecast'); if(tFor) tFor.innerText = forecastedTotal.toLocaleString();
      
      let labels = [];
      let actualMobile = [];
      let forecastMobile = [];
      let actualAcc = [];
      let forecastAcc = [];
      
      let cumMobile = 0;
      let cumAcc = 0;
      let projectedMobile = 0;
      let projectedAcc = 0;
      
      let dailyMobileArr = [];
      let dailyAccArr = [];
      
      let lastActualIdx = -1;
      for(let i=0; i<=totalDays; i++) {
         let d = new Date(startDate.getTime() + (i * 24*60*60*1000));
         let dStr = toDateKey(d);
         labels.push(dStr);

         let dMob = dailyMobile[dStr] || 0;
         let dAcc = dailyAcc[dStr] || 0;

         if (dStr <= nowKey) {
            lastActualIdx = i;
            cumMobile += dMob;
            cumAcc += dAcc;
            
            dailyMobileArr.push(dMob);
            dailyAccArr.push(dAcc);
            
            projectedMobile = cumMobile;
            projectedAcc = cumAcc;
            
            actualMobile.push(cumMobile);
            forecastMobile.push(null);
            
            actualAcc.push(cumAcc);
            forecastAcc.push(null);
         } else {
            actualMobile.push(null);
            
            let pMob = Math.round(avgPerDayMobile);
            let pAcc = Math.round(avgPerDayAcc);
            
            dailyMobileArr.push(pMob);
            dailyAccArr.push(pAcc);
            
            projectedMobile += avgPerDayMobile;
            forecastMobile.push(Math.round(projectedMobile)); 
            
            actualAcc.push(null);
            projectedAcc += avgPerDayAcc;
            forecastAcc.push(Math.round(projectedAcc));
         }
      }
      
      if(lastActualIdx > -1 && lastActualIdx < totalDays) {
          // Connect the dashed line to the last point of the solid line
          forecastMobile[lastActualIdx] = actualMobile[lastActualIdx];
          forecastAcc[lastActualIdx] = actualAcc[lastActualIdx];
      }
      
      const ctx = document.getElementById('chartAnalytics');
      if(!ctx) return;
      if(this.chart) this.chart.destroy();
      
      if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);
      
      this.chart = new Chart(ctx.getContext('2d'), {
         type: 'line',
         data: {
            labels: labels,
            datasets: [
               { label: 'โมบาย (Actual)', data: actualMobile, dailyData: dailyMobileArr, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6 },
               { label: 'โมบาย (Forecast)', data: forecastMobile, dailyData: dailyMobileArr, borderColor: '#93c5fd', borderDash: [5, 5], tension: 0.4, borderWidth: 3, pointRadius: 0, pointHoverRadius: 4 },
               { label: 'อุปกรณ์เสริม (Actual)', data: actualAcc, dailyData: dailyAccArr, borderColor: '#ec4899', backgroundColor: 'rgba(236, 72, 153, 0.1)', fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6 },
               { label: 'อุปกรณ์เสริม (Forecast)', data: forecastAcc, dailyData: dailyAccArr, borderColor: '#f9a8d4', borderDash: [5, 5], tension: 0.4, borderWidth: 3, pointRadius: 0, pointHoverRadius: 4 }
            ]
         },
         options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
               datalabels: { 
                  display: true, 
                  align: 'top', 
                  color: function(ctx) { return ctx.dataset.borderColor; },
                  font: { size: 9, weight: 'bold' },
                  formatter: function(value, ctx) {
                     if (value === null) return '';
                     if (ctx.dataset.label.includes('Forecast')) return ''; // ซ่อนตัวเลขบนเส้นฟอแคช
                     let daily = ctx.dataset.dailyData[ctx.dataIndex];
                     if (daily === 0 && ctx.dataset.label.includes('Actual')) return '';
                     return '+' + daily;
                  }
               }, 
               legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
               tooltip: {
                  callbacks: {
                     label: function(ctx) {
                        let val = ctx.raw;
                        let daily = ctx.dataset.dailyData[ctx.dataIndex];
                        return `${ctx.dataset.label}: ${val} (รายวัน: +${daily})`;
                     }
                  }
               }
            },
            scales: { y: { beginAtZero: true, grid: { borderDash: [2,4], color: '#f1f5f9' } }, x: { grid: { display: false } } },
            interaction: { mode: 'index', intersect: false }
         }
      });
    }
  },

  target: {
    init: async function() {
      const content = document.getElementById('page-content');
      const tmpl = document.getElementById('tmpl-target');
      if(content && tmpl) content.innerHTML = tmpl.innerHTML;
      
      window.app.showLoading('กำลังโหลดข้อมูลเป้าหมาย...');
      try {
        const resOrders = await window.app.api('GET_TABLE', { tableName: 'Orders' });
        const resTarget = await window.app.api('GET_TABLE', { tableName: 'Target' });
        Swal.close();
        if(resOrders && resOrders.status === 'success' && resTarget && resTarget.status === 'success') {
           this.render(resTarget.data, resOrders.data);
        } else {
           this.renderLoadError('ไม่พบข้อมูล กรุณาตรวจสอบว่ามีชีต "Target" แล้วหรือไม่');
        }
      } catch(e) {
        Swal.close(); this.renderLoadError(e.message);
      }
    },
    renderLoadError: function(msg) {
      const tbody = document.getElementById('targetTableBody');
      if (!tbody) { Swal.fire('Error', msg, 'error'); return; }
      tbody.innerHTML = '<tr><td colspan="5">' + window.app.emptyState({
        icon: 'fa-exclamation-triangle',
        title: 'โหลดข้อมูลไม่สำเร็จ',
        subtitle: msg,
        actionLabel: 'ลองใหม่',
        onclick: 'window.app.target.init()'
      }) + '</td></tr>';
    },
    render: function(targets, orders) {
      // กัน async race: element อาจถูกเปลี่ยนหน้าไปแล้วระหว่างรอข้อมูล
      const targetBodyEl = document.getElementById('targetTableBody');
      if (!targetBodyEl) return;
      const settings = window.app.globalData.settings || {};
      const startStr = settings.ReserveStart;
      const endStr = settings.ReserveEnd;
      if(!startStr || !endStr) {
         const canSetup = window.app.user && window.app.user.Role === 'Admin';
         targetBodyEl.innerHTML = '<tr><td colspan="5">' + window.app.emptyState({
           icon: 'fa-clock',
           title: 'ยังไม่ได้ตั้งค่าช่วงเวลาการจอง',
           subtitle: 'กรุณาตั้งค่า วันเริ่ม-วันสิ้นสุดการจอง ในเมนู "ตั้งเวลารับจองสินค้า" ก่อนใช้งานหน้านี้',
           actionLabel: canSetup ? 'ไปตั้งค่าช่วงเวลาการจอง' : '',
           onclick: canSetup ? "location.hash='bookingsettings'" : ''
         }) + '</td></tr>';
         return;
      }
      
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      const now = new Date();
      
      const formatTh = (d) => { const m=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; return `${d.getDate()} ${m[d.getMonth()]} ${(d.getFullYear()+543).toString().substring(2)}`; };
      const rangeEl = document.getElementById('targetDateRange');
      if (rangeEl) rangeEl.innerText = `(${formatTh(startDate)} - ${formatTh(endDate)})`;
      
      const totalDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
      let currentDays = Math.max(0, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
      if (now > endDate) currentDays = totalDays;
      
      const validOrders = orders.filter(o => o['Order Status'] !== 'Cancelled' && o['Order Status'] !== 'ยกเลิก' && o.Timestamp);
      const salesByName = {};
      let totalMobileQty = 0;

      const products = window.app.globalData.products || [];
      const getCat = (sku) => {
         const p = products.find(x => x.SKU === sku);
         return p ? (p.Category || '').toString().trim() : '';
      };

      const branches = window.app.globalData.branches || [];

      // หา key ของคอลัมน์ Area ใน Branches แบบไม่สนตัวพิมพ์ (Area / AREA / area)
      const areaKey = branches.length > 0
         ? (Object.keys(branches[0]).find(k => k.toLowerCase().trim() === 'area') || 'Area')
         : 'Area';

      validOrders.forEach(o => {
          let cat = getCat(o.SKU);
          if (cat === 'โมบาย') {
             let qty = parseInt(o.Qty || 0);
             if(!isNaN(qty) && qty > 0) {
                 totalMobileQty += qty;
                 let staff = (o['Staff'] || '').toString().trim().toUpperCase();
                 let branchInput = (o['Branch Code'] || '').toString().trim().toUpperCase();

                 if (staff) salesByName[staff] = (salesByName[staff] || 0) + qty;

                 const bInfo = branches.find(b =>
                     (b['Branch Code'] || '').toString().trim().toUpperCase() === branchInput ||
                     (b['Branch Name'] || '').toString().trim().toUpperCase() === branchInput
                 );

                 if (bInfo) {
                     let area = (bInfo[areaKey] || '').toString().trim().toUpperCase();
                     let branchName = (bInfo['Branch Name'] || '').toString().trim().toUpperCase();
                     let branchCode = (bInfo['Branch Code'] || '').toString().trim().toUpperCase();

                     if (area) salesByName[area] = (salesByName[area] || 0) + qty;
                     if (branchName) salesByName[branchName] = (salesByName[branchName] || 0) + qty;
                     if (branchCode && branchCode !== branchName) salesByName[branchCode] = (salesByName[branchCode] || 0) + qty;
                 } else {
                     // หาสาขาไม่เจอ — นับด้วยค่าที่บันทึกมาตรงๆ เผื่อชื่อใน Target ตรงกับค่านี้
                     if (branchInput) salesByName[branchInput] = (salesByName[branchInput] || 0) + qty;
                     salesByName['UNKNOWN AREA'] = (salesByName['UNKNOWN AREA'] || 0) + qty;
                 }
             }
          }
      });
      
      let html = '';
      if(!targets || targets.length === 0) {
          html = '<tr><td colspan="5" class="text-center py-8 text-slate-500">ไม่มีข้อมูลในชีต Target</td></tr>';
      } else {
          let actualKeys = Object.keys(targets[0]).filter(k => k !== '_rowIndex');
          
          let nameKey = actualKeys.find(k => k.toLowerCase() === 'area' || k.includes('Area') || k.includes('สาขา') || k.includes('พนักงาน') || k.includes('ชื่อ') || k.includes('รับเป้า')) || actualKeys[0];
          let targetKey = actualKeys.find(k => k !== nameKey && (k === 'เป้า' || k.includes('เป้า') || k.toLowerCase().includes('target'))) || actualKeys.find(k => k !== nameKey) || actualKeys[1];
          
          
          let totalTargetSum = 0;
          let totalActualSum = 0;
          let totalForecastSum = 0;
          
          targets.forEach(t => {
              let name = (t[nameKey] || '').toString().trim();
              if(!name) return;
              
              // ลบลูกน้ำ (comma) ออกก่อนแปลงเป็นตัวเลข เพื่อป้องกันปัญหาการดึงข้อมูลผิดพลาด
              let targetValStr = (t[targetKey] || '').toString().replace(/,/g, '').trim();
              let targetVal = parseFloat(targetValStr) || 0;
              let upperName = name.toUpperCase();
              // "ALL" / "ALL BRANCHES" = ยอดรวมโมบายทุกสาขา
              let actualVal = (upperName === 'ALL' || upperName === 'ALL BRANCHES') ? totalMobileQty : (salesByName[upperName] || 0);
              
              let displayName = name;
              if (window.app.globalData.branches) {
                  const bInfo = window.app.globalData.branches.find(b => b['Branch Code'] === name || b['Branch Name'] === name);
                  if (bInfo) displayName = bInfo['Branch Name'];
              }
              if (displayName === name && window.app.globalData.members) {
                  const mInfo = window.app.globalData.members.find(m => m['Username'] === name || m['Name'] === name);
                  if (mInfo) displayName = mInfo['Name'] || mInfo['Username'];
              }
              
              const eName = window.app.esc(name); const eDisp = window.app.esc(displayName);
              let nameHtml = displayName === name ? eName : `${eDisp} <span class="text-[10px] text-slate-400 font-normal block md:inline md:ml-1">(${eName})</span>`;
              
              let avgPerDay = currentDays > 0 ? (actualVal / currentDays) : 0;
              let forecastVal = Math.round(avgPerDay * totalDays);
              let diffVal = actualVal - targetVal;
              
              totalTargetSum += targetVal;
              totalActualSum += actualVal;
              totalForecastSum += forecastVal;
              
              let diffClass = diffVal >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
              let diffIcon = diffVal >= 0 ? '<i class="fas fa-arrow-up mr-1"></i>' : '<i class="fas fa-arrow-down mr-1"></i>';
              
              html += `
              <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                 <td class="py-4 px-4 font-bold text-slate-800">${nameHtml}</td>
                 <td class="py-4 px-4 text-center text-slate-600">${targetVal.toLocaleString()}</td>
                 <td class="py-4 px-4 text-center font-bold text-indigo-600">${actualVal.toLocaleString()}</td>
                 <td class="py-4 px-4 text-center"><span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${diffClass}">${diffIcon}${diffVal > 0 ? '+' : ''}${diffVal.toLocaleString()}</span></td>
                 <td class="py-4 px-4 text-center font-bold text-amber-500">${forecastVal.toLocaleString()}</td>
              </tr>
              `;
          });
          
          let tDiff = totalActualSum - totalTargetSum;
          let tDiffClass = tDiff >= 0 ? 'text-emerald-600' : 'text-rose-600';
          let tDiffIcon = tDiff >= 0 ? '<i class="fas fa-arrow-up mr-1"></i>' : '<i class="fas fa-arrow-down mr-1"></i>';
          html += `
              <tr class="bg-indigo-50/50 border-t-2 border-indigo-100">
                 <td class="py-4 px-4 font-black text-indigo-900 text-right">รวมทั้งหมด:</td>
                 <td class="py-4 px-4 text-center font-black text-indigo-900">${totalTargetSum.toLocaleString()}</td>
                 <td class="py-4 px-4 text-center font-black text-indigo-700">${totalActualSum.toLocaleString()}</td>
                 <td class="py-4 px-4 text-center font-black ${tDiffClass}">${tDiffIcon}${tDiff > 0 ? '+' : ''}${tDiff.toLocaleString()}</td>
                 <td class="py-4 px-4 text-center font-black text-amber-600">${totalForecastSum.toLocaleString()}</td>
              </tr>
          `;
      }
      
      targetBodyEl.innerHTML = html;
    }
  },

  pos: {
    cartData: [],
    cartAutoDiscount: 0,
    currentImages: [],
    currentImageIndex: 0,
    // 6A — สถานะ variant ที่เลือกบนการ์ด (per Model, คงอยู่ข้ามการ re-render จาก filter/search)
    cardState: {},
    // 6A — group object ล่าสุดของแต่ละ Model จาก renderProducts (ไว้ re-render การ์ดเดี่ยวตอนสลับ variant)
    cardGroups: {},
    // 6B — ตัวกรอง storefront (ทำงานร่วมกับช่องค้นหา + channel เดิมใน filter())
    storeFilters: { category: '', group: '', capacity: '', priceRange: '', sort: '' },
    // 6B — ชื่อ popover ที่เปิดอยู่ ('cap'|'price'|'sort'|null) — ปิดด้วยคลิกนอก/Esc
    openPopover: null,
    countdownInterval: null,
    isBookingBlocked: false,
    bookingBlockedMessage: '',
    isSubmitting: false,
    pendingRequestId: null, // idempotency key ของออเดอร์ที่กำลังคีย์ — คงค่าไว้ข้าม retry จนกว่า server ยืนยันบันทึกแล้ว
    
    startCountdown: function() {
      if (this.countdownInterval) clearInterval(this.countdownInterval);
      
      const timerBanner = document.getElementById('posTimerBanner');
      const periodText = document.getElementById('posTimerPeriodText');
      const timerDisplay = document.getElementById('posTimerCountdownDisplay');
      const timerBadge = document.getElementById('posTimerBadge');
      
      if (!timerBanner || !timerDisplay) return;
      
      const settings = window.app.globalData.settings || {};
      const startStr = settings.ReserveStart;
      const endStr = settings.ReserveEnd;
      
      if (!startStr || !endStr) {
        timerBanner.classList.add('hidden');
        return;
      }
      
      timerBanner.classList.remove('hidden');
      
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      
      const options = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
      const startFormatted = isNaN(startDate.getTime()) ? startStr : startDate.toLocaleDateString('th-TH', options);
      const endFormatted = isNaN(endDate.getTime()) ? endStr : endDate.toLocaleDateString('th-TH', options);
      if (periodText) periodText.innerText = `${startFormatted} - ${endFormatted}`;
      
      const updateTimer = () => {
        const now = new Date();
        
        if (now < startDate) {
          if (timerBadge) {
            timerBadge.innerText = 'สถานะ';
            timerBadge.className = 'text-xs font-bold text-amber-500 mr-2 uppercase tracking-wide';
          }
          timerDisplay.innerHTML = `
            <div class="px-3 py-1.5 rounded-xl bg-amber-500 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-sm">
              <i class="fas fa-lock"></i> ยังไม่เปิดจอง
            </div>
          `;
          this.togglePOSBookingBlock(true, 'ยังไม่เปิดให้บริการจองสินค้า');
        } else if (now > endDate) {
          if (timerBadge) {
            timerBadge.innerText = 'สถานะ';
            timerBadge.className = 'text-xs font-bold text-rose-500 mr-2 uppercase tracking-wide';
          }
          timerDisplay.innerHTML = `
            <div class="px-3 py-1.5 rounded-xl bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-sm">
              <i class="fas fa-lock"></i> สิ้นสุดเวลาจองแล้ว
            </div>
          `;
          this.togglePOSBookingBlock(true, 'สิ้นสุดระยะเวลารับจองสินค้าแล้ว');
        } else {
          if (timerBadge) {
            timerBadge.innerText = 'เหลือเวลาจอง';
            timerBadge.className = 'text-[10px] font-bold text-indigo-600 mr-2 uppercase tracking-wide animate-pulse';
          }
          
          const diff = endDate - now;
          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((diff % (1000 * 60)) / 1000);
          
          timerDisplay.innerHTML = `
            <div class="flex items-center gap-1.5">
              <div class="flex flex-col items-center bg-slate-900 text-white px-2 py-0.5 rounded-lg shadow-sm min-w-[32px]">
                <span class="text-xs font-black">${String(days).padStart(2, '0')}</span>
                <span class="text-[7px] text-slate-400 font-bold uppercase -mt-0.5">วัน</span>
              </div>
              <div class="text-slate-400 font-bold text-xs">:</div>
              <div class="flex flex-col items-center bg-slate-900 text-white px-2 py-0.5 rounded-lg shadow-sm min-w-[32px]">
                <span class="text-xs font-black">${String(hours).padStart(2, '0')}</span>
                <span class="text-[7px] text-slate-400 font-bold uppercase -mt-0.5">ชม.</span>
              </div>
              <div class="text-slate-400 font-bold text-xs">:</div>
              <div class="flex flex-col items-center bg-slate-900 text-white px-2 py-0.5 rounded-lg shadow-sm min-w-[32px]">
                <span class="text-xs font-black">${String(mins).padStart(2, '0')}</span>
                <span class="text-[7px] text-slate-400 font-bold uppercase -mt-0.5">น.</span>
              </div>
              <div class="text-slate-400 font-bold text-xs">:</div>
              <div class="flex flex-col items-center bg-slate-950 text-rose-500 px-2 py-0.5 rounded-lg shadow-sm min-w-[32px] border border-rose-500/10">
                <span class="text-xs font-black">${String(secs).padStart(2, '0')}</span>
                <span class="text-[7px] text-rose-400 font-bold uppercase -mt-0.5">วิ.</span>
              </div>
            </div>
          `;
          
          this.togglePOSBookingBlock(false);
        }
      };
      
      updateTimer();
      this.countdownInterval = setInterval(updateTimer, 1000);
    },
    
    togglePOSBookingBlock: function(isBlocked, message = '') {
      this.isBookingBlocked = isBlocked;
      this.bookingBlockedMessage = message;
      
      const overlay = document.getElementById('bookingBlockOverlay');
      const titleEl = document.getElementById('bookingBlockTitle');
      if (overlay) {
        if (isBlocked) {
          if (titleEl) titleEl.innerText = message;
          overlay.classList.remove('hidden');
          setTimeout(() => overlay.style.opacity = '1', 10);
        } else {
          overlay.style.opacity = '0';
          setTimeout(() => overlay.classList.add('hidden'), 300);
        }
      }
      
      const checkoutBtn = document.querySelector('[onclick="window.app.pos.openCheckoutModal()"]');
      if (checkoutBtn) {
        if (isBlocked) {
          checkoutBtn.disabled = true;
          checkoutBtn.className = 'w-full h-full bg-slate-200 text-slate-400 text-sm font-bold rounded-lg cursor-not-allowed transition-all flex items-center justify-center';
        } else {
          checkoutBtn.disabled = false;
          checkoutBtn.className = 'w-full h-full bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-900 hover:to-black text-white text-sm font-bold rounded-lg shadow-sm hover:shadow-md transition-all flex items-center justify-center group';
        }
      }
    },

    init: function() {
      const c = localStorage.getItem('tg_cart'); if(c) this.cartData = JSON.parse(c);
      const chSel = document.getElementById('posChannelSelect'); const bSel = document.getElementById('posBranchSelect');
      if(!chSel || !bSel) return;
      
      if(window.app.user.Role === 'Sales') {
        chSel.innerHTML = '<option value="' + window.app.esc(window.app.user.Channel) + '">' + window.app.esc(window.app.user.Channel) + '</option>';
        bSel.innerHTML = '<option value="' + window.app.esc(window.app.user['Branch Code']) + '">' + window.app.esc(window.app.user['Branch Name']) + ' (' + window.app.esc(window.app.user['Branch Code']) + ')</option>';
        chSel.disabled = true; bSel.disabled = true;
      } else {
        const channels = [...new Set(window.app.globalData.branches.map(b => b.Channel))].filter(Boolean);
        let chHtml = '<option value="">-- เลือกช่องทาง --</option>';
        channels.forEach(ch=>{ chHtml += '<option value="' + window.app.esc(ch) + '">' + window.app.esc(ch) + '</option>'; });
        chSel.innerHTML = chHtml;
        

        bSel.innerHTML='<option value="">-- เลือกช่องทางก่อน --</option>'; 
        chSel.disabled = false; bSel.disabled = false;
      }
      this.populateSelects(); this.renderStoreHeader(); this.filter(); this.renderCart(); this.checkCriteria();
      this.startCountdown();
    },
    populateSelects: function() {
      const pContainer = document.getElementById('cartPromosContainer');
      if(pContainer) {
        pContainer.innerHTML = '';
        this.addPromoRow();
      }
      const intContainer=document.getElementById('dynamicInterests'); 
      if(intContainer) { 
          let intHtml = ''; 
          window.app.globalData.interests.forEach((i, idx)=>{ if(i.Status==='เปิด') intHtml += '<div class="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors bg-white"><label class="flex items-center space-x-3 cursor-pointer w-full"><input type="checkbox" class="form-check-input w-5 h-5 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500" id="chkInt' + idx + '" value="' + window.app.esc(i['Interest Name']) + '"><span class="text-sm font-bold text-slate-700 select-none">' + window.app.esc(i['Interest Name']) + '</span></label></div>'; });
          intContainer.innerHTML = intHtml;
      }
    },
    addPromoRow: function() {
      const container = document.getElementById('cartPromosContainer');
      if(!container) return;
      
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 mb-2 animate-fade-in';
      
      let optionsHtml = '<option value="">-- ไม่ใช้ส่วนลด --</option>';
      window.app.globalData.promotions.forEach(p => {
        if(p.Status === 'เปิด') {
          // โปร Percent เก็บชนิดไว้ใน data attribute — มูลค่าส่วนลดจริงคำนวณจาก subtotal ใน getPromoDiscounts
          const dType = (p['Discount Type'] || 'Fixed').toString().trim();
          const dVal = parseFloat((p.Value || 0).toString().replace(/[^\d.\-]/g, '')) || 0;
          const label = dType === 'Percent' ? p['Promo Name'] + ' (' + dVal + '%)' : p['Promo Name'];
          optionsHtml += `<option value="${dVal}" data-dtype="${window.app.esc(dType)}" data-name="${window.app.esc(p['Promo Name'])}">${window.app.esc(label)}</option>`;
        }
      });
      
      row.innerHTML = `
        <select class="cart-promo-select flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all" onchange="window.app.pos.updateTotal()">
           ${optionsHtml}
        </select>
        <button type="button" onclick="window.app.pos.removePromoRow(this)" class="w-8 h-8 flex items-center justify-center text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-100 transition-colors shrink-0 shadow-sm" title="ลบส่วนลดนี้">
           <i class="fas fa-trash-alt text-[0.7rem]"></i>
        </button>
      `;
      
      container.appendChild(row);
      this.updateTotal();
    },
    removePromoRow: function(btn) {
      const row = btn.parentElement;
      if(row) {
        row.remove();
      }
      this.updateTotal();
    },
    // แหล่งความจริงเดียวของส่วนลดจาก dropdown (ใช้ทั้ง updateTotal และ submitCheckout)
    // Fixed = จำนวนบาทตรงๆ / Percent = pct% ของยอดรวมสินค้าในตะกร้า ณ ขณะนั้น
    getPromoDiscounts: function() {
      let subtotal = 0;
      this.cartData.forEach(i => { let pr = parseFloat((i.Price||'0').toString().replace(/[^\d.\-]/g,'')); subtotal += (isNaN(pr)?0:pr) * i.qty; });
      const list = [];
      document.querySelectorAll('.cart-promo-select').forEach(el => {
        if (!el.value) return;
        const opt = el.options[el.selectedIndex];
        const raw = parseFloat(el.value || 0);
        if (isNaN(raw) || raw <= 0) return;
        const dType = opt ? (opt.getAttribute('data-dtype') || 'Fixed') : 'Fixed';
        const name = opt ? (opt.getAttribute('data-name') || opt.text) : '';
        const value = dType === 'Percent' ? (subtotal * raw / 100) : raw;
        if (value > 0) list.push({ name: name, value: value });
      });
      return list;
    },
    onChannelChange: function() {
      const ch = document.getElementById('posChannelSelect').value; const bSel = document.getElementById('posBranchSelect');
      if(!bSel) return;
      let bHtml = '<option value="">-- กรุณาเลือกสาขา --</option>';
      if(ch) { window.app.globalData.branches.filter(b => b.Channel === ch).forEach(b => { bHtml += '<option value="' + window.app.esc(b['Branch Code']) + '">' + window.app.esc(b['Branch Name']) + ' (' + window.app.esc(b['Branch Code']) + ')</option>'; }); }
      bSel.innerHTML = bHtml;
      
      
      this.checkCriteria(); this.filter();
    },
    checkCriteria: function() {
      const ch = document.getElementById('posChannelSelect'); const br = document.getElementById('posBranchSelect'); const ov = document.getElementById('criteriaOverlay');
      if(!ch || !br || !ov) return;
      if(ch.value && br.value) {
          ov.style.opacity = '0'; setTimeout(()=>ov.classList.add('hidden'), 300);
      } else {
          ov.classList.remove('hidden'); setTimeout(()=>ov.style.opacity = '1', 10);
      }
    },
    filterTimer: null,
    // 5B.1 — debounce 250ms กันการ render การ์ดใหม่ทุก keystroke (ปุ่มล้างคำค้นเรียก filter() ตรงได้เลย)
    filterDebounced: function() {
      clearTimeout(this.filterTimer);
      this.filterTimer = setTimeout(() => this.filter(), 250);
    },
    filter: function() {
      const searchEl = document.getElementById('searchProduct');
      if(!searchEl) return;
      const term = searchEl.value.trim().toLowerCase();
      const currentChannel = document.getElementById('posChannelSelect').value;
      window.app.globalData.products = window.app.globalData.products || [];
      // 6B — ตัวกรอง storefront ทำงานร่วมกับคำค้น + channel เดิม; ราคาจากชีตอาจมี comma ต้องถอดก่อน parse
      const f = this.storeFilters;
      // parse ทนต่อเซลล์ที่ format เป็นสกุลเงิน (เช่น "฿49,900.00") — ตัดทุกอย่างที่ไม่ใช่ตัวเลข/จุด/ลบ
      const priceOf = (p) => parseFloat(String(p.Price || '0').replace(/[^\d.\-]/g, '')) || 0;
      const inPrice = (p) => {
        if (!f.priceRange) return true;
        const v = priceOf(p);
        if (f.priceRange === 'lt10') return v < 10000;
        if (f.priceRange === '10-30') return v >= 10000 && v <= 30000;
        if (f.priceRange === '30-50') return v > 30000 && v <= 50000;
        if (f.priceRange === 'gt50') return v > 50000;
        return true;
      };
      const list = window.app.globalData.products.filter(p => {
        const matchType = p.Status==='เปิด';
        // ค้นได้ทั้ง ชื่อสินค้า / SKU / รุ่น / กลุ่มสินค้า (case-insensitive)
        const matchSearch = !term || ['Product Name', 'SKU', 'Model', 'Product Group'].some(k => (p[k] || '').toString().toLowerCase().includes(term));
        const matchChannel = (currentChannel && p.Channel) ? p.Channel.includes(currentChannel) : true;
        return matchType && matchSearch && matchChannel
          && (!f.category || (p.Category || '').trim() === f.category)
          && (!f.group || (p['Product Group'] || '').trim() === f.group)
          && (!f.capacity || (p.Capacity || '').trim() === f.capacity)
          && inPrice(p);
      });
      // เรียงลำดับ: แนะนำ = ตามลำดับชีต (ไม่แตะ), ราคาต่ำ-สูง / สูง-ต่ำ เรียงก่อน group เพื่อให้ตำแหน่งการ์ดตามราคา variant แรก
      if (f.sort === 'asc') list.sort((a, b) => priceOf(a) - priceOf(b));
      else if (f.sort === 'desc') list.sort((a, b) => priceOf(b) - priceOf(a));
      this.renderProducts(list);
    },
    // 6B — มี filter storefront ตัวใดตัวหนึ่ง active อยู่ไหม (ใช้โชว์ปุ่มล้างตัวกรอง + เลือก empty state)
    storeFiltersActive: function() {
      const f = this.storeFilters;
      return !!(f.category || f.group || f.capacity || f.priceRange || f.sort);
    },
    // 6B — header ของ storefront: แถว category tiles → แถว sub-chips รุ่น (Product Group) → แถว filter chips
    // re-render ทั้งแถบทุกครั้งที่ตัวกรองเปลี่ยน (popover ถูกสร้างใหม่ในสถานะปิดเสมอ)
    renderStoreHeader: function() {
      const bar = document.getElementById('storeFilterBar');
      if (!bar) return;
      this.openPopover = null;
      const esc = window.app.esc, escJs = window.app.escAttrJs;
      const f = this.storeFilters;
      const prods = (window.app.globalData.products || []).filter(p => p.Status === 'เปิด');

      // --- แถว 1: category tiles (ทั้งหมด ซ้ายสุด + รูปสินค้าตัวแทนของหมวด) ---
      const cats = [...new Set(prods.map(p => (p.Category || '').trim()).filter(Boolean))];
      const repImg = {};
      prods.forEach(p => {
        const c = (p.Category || '').trim();
        if (c && !repImg[c] && p['Image URL']) repImg[c] = window.app.formatImageUrl(p['Image URL']);
      });
      const tileHtml = (val, label, img) => {
        const sel = f.category === val;
        return '<button type="button" class="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white shrink-0 transition-all '
          + (sel ? 'border-slate-900 shadow-[inset_0_0_0_1px_#0f172a]' : 'border-slate-200 hover:border-slate-400')
          + '" onclick="window.app.pos.setStoreCategory(\'' + escJs(val) + '\')" aria-label="หมวด ' + esc(label) + '">'
          + '<span class="text-[11px] font-bold ' + (sel ? 'text-slate-900' : 'text-slate-600') + '">' + esc(label) + '</span>'
          + (img ? '<img src="' + esc(img) + '" loading="lazy" alt="" aria-hidden="true" onerror="this.remove()" class="w-8 h-8 object-contain pointer-events-none">' : '')
          + '</button>';
      };
      let html = '<div class="flex gap-2 overflow-x-auto custom-scrollbar pb-2 mb-1">' + tileHtml('', 'ทั้งหมด', null);
      cats.forEach(c => { html += tileHtml(c, c, repImg[c] || null); });
      html += '</div>';

      // --- แถว 2: sub-chips รุ่น (Product Group ของหมวดที่เลือก) — เส้นใต้ตัวที่ active ---
      const groupSource = f.category ? prods.filter(p => (p.Category || '').trim() === f.category) : prods;
      const groups = [...new Set(groupSource.map(p => (p['Product Group'] || '').trim()).filter(g => g && g !== '-'))];
      if (groups.length > 0) {
        const chip = (val, label) => {
          const sel = f.group === val;
          return '<button type="button" class="px-1 pb-1 text-xs whitespace-nowrap border-b-2 transition-colors '
            + (sel ? 'border-slate-900 text-slate-900 font-bold' : 'border-transparent text-slate-500 hover:text-slate-900')
            + '" onclick="window.app.pos.setStoreGroup(\'' + escJs(val) + '\')">' + esc(label) + '</button>';
        };
        html += '<div class="flex gap-4 overflow-x-auto custom-scrollbar mb-2">' + chip('', 'ทั้งหมด');
        groups.forEach(g => { html += chip(g, g); });
        html += '</div>';
      }

      // --- แถว 3: filter chips แบบ dropdown (ความจุ / ราคา / เรียงลำดับ) + ล้างตัวกรอง + ผลลัพธ์ n รายการ ---
      const capVal = (c) => {
        const m = String(c).match(/([\d.]+)\s*(TB|GB|MB)?/i);
        if (!m) return Number.MAX_VALUE;
        let v = parseFloat(m[1]);
        const u = (m[2] || 'GB').toUpperCase();
        if (u === 'TB') v *= 1024; else if (u === 'MB') v /= 1024;
        return v;
      };
      const caps = [...new Set(prods.map(p => (p.Capacity || '').trim()).filter(c => c && c !== '-'))].sort((a, b) => capVal(a) - capVal(b));
      const priceOpts = [
        { val: '', label: 'ทุกช่วงราคา' }, { val: 'lt10', label: 'ต่ำกว่า 10,000' }, { val: '10-30', label: '10,000 - 30,000' },
        { val: '30-50', label: '30,000 - 50,000' }, { val: 'gt50', label: 'มากกว่า 50,000' }
      ];
      const sortOpts = [ { val: '', label: 'แนะนำ' }, { val: 'asc', label: 'ราคาต่ำ - สูง' }, { val: 'desc', label: 'ราคาสูง - ต่ำ' } ];
      // ป้ายบน chip = ค่าที่เลือกอยู่ (ถ้ามี) + จุดดำบอกว่า filter ตัวนี้ active
      const popChip = (name, key, baseLabel, opts, current) => {
        const active = current !== '';
        const curLabel = active ? (opts.find(o => o.val === current) || {}).label || current : baseLabel;
        let h = '<span class="store-pop-wrap relative inline-block">';
        h += '<button type="button" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all '
          + (active ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-400')
          + '" onclick="window.app.pos.toggleFilterPopover(\'' + name + '\')" aria-label="ตัวกรอง' + esc(baseLabel) + '" aria-haspopup="true">'
          + (active ? '<span class="w-1.5 h-1.5 rounded-full bg-slate-900 shrink-0"></span>' : '')
          + esc(curLabel) + '<i class="fas fa-chevron-down text-[8px]"></i></button>';
        h += '<div id="storePop_' + name + '" class="store-pop hidden absolute left-0 top-full mt-2 z-30 min-w-[160px] bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">';
        opts.forEach(o => {
          const sel = o.val === current;
          h += '<button type="button" class="w-full flex items-center justify-between gap-3 text-left px-3 py-1.5 text-xs rounded-lg hover:bg-slate-100 '
            + (sel ? 'font-bold text-slate-900' : 'text-slate-600')
            + '" onclick="window.app.pos.setStoreFilter(\'' + key + '\',\'' + escJs(o.val) + '\')">'
            + '<span>' + esc(o.label) + '</span>' + (sel ? '<i class="fas fa-check text-[9px]"></i>' : '') + '</button>';
        });
        h += '</div></span>';
        return h;
      };
      html += '<div class="flex items-center gap-2 flex-wrap mb-3">';
      if (caps.length > 0) html += popChip('cap', 'capacity', 'ความจุ', [{ val: '', label: 'ทุกความจุ' }].concat(caps.map(c => ({ val: c, label: c }))), f.capacity);
      html += popChip('price', 'priceRange', 'ราคา', priceOpts, f.priceRange);
      html += popChip('sort', 'sort', 'เรียงลำดับ', sortOpts, f.sort);
      if (this.storeFiltersActive()) {
        html += '<button type="button" class="px-3 py-1.5 rounded-full text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-transparent transition-colors" onclick="window.app.pos.clearStoreFilters(false)"><i class="fas fa-times mr-1"></i>ล้างตัวกรอง</button>';
      }
      html += '<span id="storeResultCount" class="ml-auto text-[11px] font-bold text-slate-400 whitespace-nowrap"></span>';
      html += '</div>';

      bar.innerHTML = html;
    },
    setStoreCategory: function(cat) {
      this.storeFilters.category = cat;
      this.storeFilters.group = ''; // เปลี่ยนหมวด = รายการรุ่นเปลี่ยน — ล้างตัวเลือกรุ่นเดิม
      this.renderStoreHeader();
      this.filter();
    },
    setStoreGroup: function(g) {
      this.storeFilters.group = g;
      this.renderStoreHeader();
      this.filter();
    },
    setStoreFilter: function(key, val) {
      if (!(key in this.storeFilters)) return;
      this.storeFilters[key] = val;
      this.renderStoreHeader(); // สร้าง header ใหม่ = popover ปิดไปด้วย
      this.filter();
    },
    clearStoreFilters: function(alsoSearch) {
      this.storeFilters = { category: '', group: '', capacity: '', priceRange: '', sort: '' };
      if (alsoSearch) {
        const s = document.getElementById('searchProduct');
        if (s) s.value = '';
      }
      this.renderStoreHeader();
      this.filter();
    },
    toggleFilterPopover: function(name) {
      const wasOpen = this.openPopover === name;
      this.closeFilterPopovers();
      if (!wasOpen) {
        const el = document.getElementById('storePop_' + name);
        if (el) { el.classList.remove('hidden'); this.openPopover = name; }
      }
    },
    closeFilterPopovers: function() {
      document.querySelectorAll('.store-pop').forEach(el => el.classList.add('hidden'));
      this.openPopover = null;
    },
    renderProducts: function(products) {
      const row = document.getElementById('productGrid'); 
      if(!row) return;
      
      const searchEl = document.getElementById('searchProduct');
      const resultCountEl = document.getElementById('storeResultCount');
      // ค้นหา/กรอง (6B) แล้วไม่เจอสินค้า — empty state มาตรฐาน (5A.4) พร้อมปุ่มล้างตัวกรอง+คำค้น
      // กรณีไม่มีทั้งคำค้นและตัวกรอง (กำลังโหลด) คงแสดง skeleton เดิม
      const hasQuery = searchEl && searchEl.value.trim() !== '';
      if(products.length === 0 && (hasQuery || this.storeFiltersActive())) {
        if (resultCountEl) resultCountEl.textContent = 'ผลลัพธ์ 0 รายการ';
        row.innerHTML = window.app.emptyState({
          icon: 'fa-search',
          title: 'ไม่พบสินค้าตามเงื่อนไข',
          subtitle: 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อแสดงสินค้าทั้งหมดของช่องทางนี้',
          actionLabel: 'ล้างตัวกรอง',
          onclick: "window.app.pos.clearStoreFilters(true)"
        });
        return;
      }
      if(products.length === 0 && searchEl && searchEl.value === '') {
         let skel = '<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">';
         for(let k=0; k<12; k++) { skel += '<div class="bg-white border border-slate-100 p-3 rounded-2xl shadow-sm"><div class="skeleton mb-4" style="height:100px; width:100%;"></div><div class="skeleton mb-3" style="height:12px; width:80%;"></div><div class="skeleton" style="height:14px; width:40%;"></div></div>'; }
         skel += '</div>'; row.innerHTML = skel; return;
      }

      // Group products
      const grouped = {};
      const renderedList = [];
      this.cardGroups = {}; // 6A — สร้างใหม่ทุกรอบ render ให้ตรงกับผล filter ปัจจุบัน
      products.forEach(p => {
        if(p.Status !== 'เปิด') return;
        const isGift = (p.Category||'').includes('ของแถม');

        if (!isGift && p.Model && p.Model !== '-' && p.Model !== '') {
            if (!grouped[p.Model]) {
                grouped[p.Model] = {
                    isGroup: true,
                    Model: p.Model,
                    'Product Name': p.Model,
                    Category: p.Category,
                    Price: p.Price,
                    'Image URL': p['Image URL'],
                    Stock: 0,
                    products: []
                };
                renderedList.push(grouped[p.Model]);
                this.cardGroups[p.Model] = grouped[p.Model];
            }
            grouped[p.Model].products.push(p);
            // Stock มาจาก getDisplayValues — อาจมี comma (เช่น "1,200") ต้องถอดก่อน parse
            grouped[p.Model].Stock += (parseInt(String(p.Stock || '0').replace(/[^\d.\-]/g, ''), 10) || 0);

            let currMin = parseFloat((grouped[p.Model].Price||'0').toString().replace(/[^\d.\-]/g,'')) || 0;
            let pPrice = parseFloat((p.Price||'0').toString().replace(/[^\d.\-]/g,'')) || 0;
            if (pPrice < currMin || currMin === 0) grouped[p.Model].Price = p.Price;
        } else {
            renderedList.push(p);
        }
      });

      // คำค้นปัจจุบัน — ใช้ highlight ชื่อสินค้าบนการ์ด (5B.1)
      const searchTerm = searchEl ? searchEl.value.trim() : '';

      // 6B — "ผลลัพธ์ n รายการ" นับตามการ์ดที่แสดงจริง (รุ่นเดียวกันหลาย SKU นับเป็น 1 การ์ด)
      if (resultCountEl) resultCountEl.textContent = 'ผลลัพธ์ ' + renderedList.length + ' รายการ';

      // 6A — POS storefront: สไตล์ scoped ด้วย .pos-storefront เท่านั้น ห้ามรั่วไปหน้าอื่น
      let html = '<div class="pos-storefront grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">';
      renderedList.forEach(p => { html += this.cardHtml(p, searchTerm); });
      html += '</div>';
      row.innerHTML = html;
    },
    // 6A — แปลงชื่อสีจากชีตเป็น hex สำหรับจุดสีบนการ์ด (เทียบแบบ includes, ไม่รู้จัก = เทา + title บอกชื่อ)
    colorHex: function(name) {
      const n = String(name || '').toLowerCase();
      const table = [
        ['titanium black', '#3a3a3c'], ['jet black', '#0f0f0f'], ['phantom black', '#1a1a1c'],
        ['black', '#000000'], ['graphite', '#41424c'],
        ['titanium gray', '#8a8d8f'], ['titanium grey', '#8a8d8f'], ['gray', '#8e8e93'], ['grey', '#8e8e93'],
        ['silver', '#d8d8d8'], ['titanium', '#c2bcb2'], ['natural', '#c2bcb2'],
        ['white', '#ffffff'], ['clear', '#f1f5f9'], ['cream', '#f2e6d0'], ['beige', '#e8dcc8'],
        ['navy', '#1e3a5f'], ['blue', '#3b5bdb'], ['sky', '#7dd3fc'], ['cyan', '#22d3ee'],
        ['red', '#dc2626'], ['green', '#15803d'], ['mint', '#a7f3d0'], ['lime', '#a3e635'],
        ['yellow', '#facc15'], ['gold', '#e3c8a0'], ['purple', '#7c3aed'], ['violet', '#8b5cf6'], ['lavender', '#c4b5fd'],
        ['pink', '#f472b6'], ['orange', '#ea580c'], ['brown', '#8b5e3c'], ['bronze', '#b08d57'], ['coral', '#fb7185']
      ];
      for (let i = 0; i < table.length; i++) { if (n.includes(table[i][0])) return table[i][1]; }
      return '#cbd5e1';
    },
    // 6A — HTML การ์ดสินค้า 1 ใบ (ใช้ทั้ง render ทั้งกริดและ re-render การ์ดเดียวตอนสลับ variant)
    cardHtml: function(p, searchTerm) {
      const esc = window.app.esc, escJs = window.app.escAttrJs;
      const stockOf = (v) => parseInt(String(v.Stock || '0').replace(/[^\d.\-]/g, ''), 10) || 0; // Stock จาก getDisplayValues อาจมี comma/format
      const isGift = (p.Category || '').includes('ของแถม');

      let variant = p, dotsHtml = '', chipsHtml = '';
      if (p.isGroup) {
        const vars = p.products;
        // default = variant แรกที่มีสต๊อก (หมดทุกตัวเอาตัวแรก); state คงอยู่ข้าม re-render
        let st = this.cardState[p.Model];
        if (!st) {
          const first = vars.find(v => stockOf(v) > 0) || vars[0];
          st = this.cardState[p.Model] = { cap: first.Capacity, color: first.Color };
        }
        // resolve: combo ตรง → สีเดิมความจุใดก็ได้ → ตัวแรก (กัน state ค้างจาก filter รอบก่อน)
        variant = vars.find(v => v.Color === st.color && v.Capacity === st.cap)
               || vars.find(v => v.Color === st.color)
               || vars[0];
        st.cap = variant.Capacity; st.color = variant.Color;

        const colors = [...new Set(vars.map(v => v.Color).filter(c => c && c !== '-'))];
        const caps = [...new Set(vars.map(v => v.Capacity).filter(c => c && c !== '-'))];

        // จุดสี: สูงสุด 4 จุด + "+n" (กดแล้วเปิด modal เดิมซึ่งมีตัวเลือกครบ — fallback จอแคบตามสเปก)
        const maxDots = 4;
        const shown = colors.length > maxDots + 1 ? colors.slice(0, maxDots) : colors;
        shown.forEach(col => {
          const colStock = vars.filter(v => v.Color === col).reduce((s, v) => s + stockOf(v), 0);
          const sel = col === st.color;
          dotsHtml += '<button type="button" class="color-dot' + (colStock <= 0 ? ' oos' : '') + (sel ? ' ring-2 ring-slate-900 ring-offset-1' : '')
            + ' w-[18px] h-[18px] rounded-full border border-slate-300 shrink-0 transition-all" style="background:' + esc(this.colorHex(col))
            + '" title="' + esc(col) + '" aria-label="สี ' + esc(col) + '" onclick="window.app.pos.selectCardVariant(\'' + escJs(p.Model) + '\',\'\',\'' + escJs(col) + '\')"></button>';
        });
        if (colors.length > maxDots + 1) {
          dotsHtml += '<button type="button" class="text-[10px] font-bold text-slate-500 hover:text-slate-900 shrink-0" aria-label="ดูสีทั้งหมด" onclick="window.app.pos.openAddToCartModal(\'MODEL:' + escJs(p.Model) + '\')">+' + (colors.length - maxDots) + '</button>';
        }

        // chip ความจุ: โชว์ทุกความจุของรุ่น — ตัวที่ไม่มีในสีที่เลือกจางลง (กดได้ ระบบสลับสีให้)
        caps.forEach(cap => {
          const existsInColor = vars.some(v => v.Color === st.color && v.Capacity === cap);
          const sel = cap === st.cap;
          chipsHtml += '<button type="button" class="px-2 py-1 rounded-lg border text-[10px] transition-all '
            + (sel ? 'border-slate-900 font-bold text-slate-900 shadow-[inset_0_0_0_1px_#0f172a]' : 'border-slate-200 text-slate-500 hover:border-slate-400')
            + (existsInColor ? '' : ' opacity-40')
            + '" onclick="window.app.pos.selectCardVariant(\'' + escJs(p.Model) + '\',\'' + escJs(cap) + '\',\'\')">' + esc(cap) + '</button>';
        });
      }

      const pName = esc(variant['Product Name']); // สำหรับ attribute (title/alt) — ห้ามมี <mark>
      const dispName = p.isGroup ? p.Model : p['Product Name'];
      const dispNameHtml = window.app.highlightEsc(dispName, searchTerm || '');
      // parse ทนต่อเซลล์ format สกุลเงิน (เช่น "฿49,900.00") — เก็บเฉพาะตัวเลข/จุด/ลบ
      const priceNum = parseFloat(String(variant.Price || '0').replace(/[^\d.\-]/g, '')) || 0;
      const price = priceNum.toLocaleString();
      // 6C.1 — Original Price เป็นป้าย display-only ต่อ variant (ราคาคิดเงินจริงคือ Price เสมอ)
      // แสดงเฉพาะ originalPrice > price เท่านั้น — ค่าว่าง/0/น้อยกว่า = การ์ดหน้าตาเหมือนเดิมเป๊ะ
      const origNum = parseFloat(String(variant['Original Price'] || '0').replace(/[^\d.\-]/g, '')) || 0;
      const hasSave = origNum > priceNum;
      const savePct = hasSave ? Math.floor(((origNum - priceNum) / origNum) * 100) : 0;
      const stockNum = stockOf(variant);
      const outOfStock = stockNum <= 0;
      const imgUrl = window.app.formatImageUrl(variant['Image URL']);
      const cardKey = p.isGroup ? p.Model : ('SKU:' + p.SKU);

      // Stock badge มุมขวาบน (ตาม variant ที่เลือกอยู่): >10 เขียว / 1-10 เหลือง / 0 เทา
      let stockBadge = '';
      if (stockNum > 10) stockBadge = '<div class="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold shadow-sm pointer-events-none">มีสินค้า</div>';
      else if (stockNum > 0) stockBadge = '<div class="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold shadow-sm pointer-events-none">เหลือ ' + stockNum + ' ชิ้น</div>';
      else stockBadge = '<div class="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 border border-slate-300 text-[10px] font-bold pointer-events-none">สินค้าหมด</div>';

      const giftTag = isGift ? '<div class="absolute top-2 left-2 px-2 py-1 bg-slate-200 text-slate-600 text-[0.6rem] font-bold rounded-lg z-10">สินค้าแถม</div>' : '';
      // 6C.1 — ป้าย "ลด n%" มุมซ้ายบน (ปัดลง); ถ้าเป็นของแถม (gift tag ใช้มุมซ้ายอยู่) เลื่อนลงมาใต้ tag
      const savePctBadge = (hasSave && savePct > 0)
        ? '<div class="absolute ' + (isGift ? 'top-9' : 'top-2') + ' left-2 z-10 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold shadow-sm pointer-events-none">ลด ' + savePct + '%</div>'
        : '';

      // 6C.2 — ป้ายโปร bundle จาก AutoPromotions (Active + Get Discount Category ตรงหมวดสินค้า)
      // ข้อความสร้างจากตัวเลข/หมวดในชีตเท่านั้น (esc ทุกค่า) — ห้ามใช้ Message Suggest ที่เป็น HTML บนการ์ด
      // ชีตว่างใช้ fallback rule เดียวกับ checkAutoPromotions เพื่อให้ป้ายตรงกับส่วนลดที่เกิดจริงตอน checkout
      let bundleBadge = '';
      {
        let bRules = (window.app.globalData.autoPromotions || []);
        if (bRules.length === 0) bRules = [{ 'Buy Category': 'โมบาย', 'Get Discount Category': 'อุปกรณ์เสริม', 'Discount Percent': 10, 'Status': 'Active' }];
        const myCat = (variant.Category || '').toString().trim();
        let best = null;
        bRules.forEach(r => {
          if ((r.Status || '').toString().trim().toLowerCase() !== 'active') return;
          if ((r['Get Discount Category'] || '').toString().trim() !== myCat) return;
          const pct = parseFloat(r['Discount Percent']) || 0;
          if (pct > 0 && (!best || pct > best.pct)) best = { pct: pct, buyCat: (r['Buy Category'] || '').toString().trim() };
        });
        // หลาย rule ตรงหมวดเดียวกัน — โชว์เฉพาะ % สูงสุดอันเดียว การ์ดต้องไม่รก
        if (best) bundleBadge = '<div><span class="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100 font-bold">ลด ' + esc(best.pct) + '% เมื่อซื้อคู่ ' + esc(best.buyCat) + '</span></div>';
      }

      // ปุ่มจอง: path เดิมทั้งหมด — เปิด addToCartModal ด้วย SKU ของ variant ที่เลือก (จำนวน/ของแถม/validation อยู่ใน modal เดิม)
      let bookBtn = '';
      if (!isGift) {
        if (outOfStock) bookBtn = '<button type="button" disabled class="w-full py-2 rounded-full bg-slate-100 text-slate-400 text-xs font-bold cursor-not-allowed border border-slate-200">สินค้าหมด</button>';
        else bookBtn = '<button type="button" class="w-full py-2 rounded-full bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition-colors" onclick="window.app.pos.openAddToCartModal(\'' + escJs(variant.SKU) + '\')" aria-label="จอง ' + pName + '">จอง</button>';
      }

      let card = '<div class="pos-card relative flex flex-col h-full bg-white border border-[#e5e7eb] rounded-[14px] overflow-hidden' + (isGift ? ' opacity-80' : '') + '" data-card-key="' + esc(cardKey) + '">';
      card +=      giftTag;
      card +=      savePctBadge;
      card +=      stockBadge;
      card += '    <div class="h-[130px] p-[10px] flex items-center justify-center bg-white">';
      card += '       <img src="' + esc(imgUrl) + '" loading="lazy" onerror="this.onerror=null;this.src=\'https://via.placeholder.com/150?text=No+Image\';" alt="' + pName + '" class="max-h-full max-w-full object-contain transition-transform duration-300">';
      card += '    </div>';
      card += '    <div class="p-3 pt-1 flex flex-col flex-1 gap-2">';
      card += '      <div class="font-bold text-[#0f172a] text-[12px] md:text-[15px] line-clamp-2 leading-tight" title="' + esc(dispName) + '">' + dispNameHtml + '</div>';
      card +=      bundleBadge;
      if (dotsHtml) card += '<div class="flex items-center gap-1.5 flex-wrap">' + dotsHtml + '</div>';
      if (chipsHtml) card += '<div class="flex items-center gap-1.5 flex-wrap">' + chipsHtml + '</div>';
      if (p.isGroup) card += '<div class="text-[10px] text-slate-500 line-clamp-1" title="' + pName + '">' + pName + '</div>';
      card += '      <div class="mt-auto pt-1">';
      card += '        <div class="text-[#0f172a] font-black text-base' + (hasSave ? '' : ' mb-2') + '">฿' + price + '</div>';
      if (hasSave) {
        card += '    <div class="flex items-center gap-1.5 flex-wrap mb-2"><span class="text-[10px] text-rose-600 font-bold">ประหยัด ฿' + (origNum - priceNum).toLocaleString() + '</span><span class="text-[10px] text-slate-400 line-through">เดิม ฿' + origNum.toLocaleString() + '</span></div>';
      }
      card +=          bookBtn;
      card += '      </div>';
      card += '    </div>';
      card += '</div>';
      return card;
    },
    // 6A — สลับ variant บนการ์ด: ส่ง cap หรือ color อย่างใดอย่างหนึ่ง (อีกตัวส่ง '' = คงของเดิม/ปรับอัตโนมัติ)
    selectCardVariant: function(model, cap, color) {
      const grp = this.cardGroups[model]; const st = this.cardState[model];
      if (!grp || !st) return;
      const vars = grp.products;
      const stockOf = (v) => parseInt(String(v.Stock || '0').replace(/[^\d.\-]/g, ''), 10) || 0;
      if (color) {
        st.color = color;
        if (!vars.some(v => v.Color === color && v.Capacity === st.cap)) {
          const cand = vars.filter(v => v.Color === color);
          const pick = cand.find(v => stockOf(v) > 0) || cand[0];
          if (pick) st.cap = pick.Capacity;
        }
      } else if (cap) {
        st.cap = cap;
        if (!vars.some(v => v.Capacity === cap && v.Color === st.color)) {
          const cand = vars.filter(v => v.Capacity === cap);
          const pick = cand.find(v => stockOf(v) > 0) || cand[0];
          if (pick) st.color = pick.Color;
        }
      }
      this.updateCardVariant(model);
    },
    // 6A — re-render เฉพาะการ์ดของ model นั้น (รูป/ราคา/badge/ปุ่มจอง อัปเดตทันที ไม่ต้อง render ทั้งกริด)
    updateCardVariant: function(model) {
      const grp = this.cardGroups[model];
      if (!grp) return;
      const key = (window.CSS && CSS.escape) ? CSS.escape(model) : model.replace(/"/g, '\\"');
      const el = document.querySelector('#productGrid [data-card-key="' + key + '"]');
      if (!el) return;
      const searchEl = document.getElementById('searchProduct');
      el.outerHTML = this.cardHtml(grp, searchEl ? searchEl.value.trim() : '');
    },
    openAddToCartModal: function(id) {
      if (this.isBookingBlocked) {
        return Swal.fire('ไม่สามารถดำเนินการได้', this.bookingBlockedMessage || 'ไม่อยู่ในช่วงเวลาการจองสินค้า', 'warning');
      }
      
      const modalVarSel = document.getElementById('modalVariantSelection');
      let isModelGroup = id.startsWith('MODEL:');
      let prod = null;
      let groupProducts = [];
      
      if (isModelGroup) {
          let modelName = id.substring(6);
          // Only show variants that are in current channel and active
          const currentChannel = document.getElementById('posChannelSelect').value;
          groupProducts = window.app.globalData.products.filter(p => p.Model === modelName && p.Status === 'เปิด' && (!currentChannel || !p.Channel || p.Channel.includes(currentChannel)));
          if (groupProducts.length === 0) return Swal.fire('สินค้าหมด', 'สินค้ารุ่นนี้ไม่มีสต๊อกในระบบสำหรับช่องทางที่เลือก', 'warning');
          
          prod = groupProducts[0]; 
          if (modalVarSel) modalVarSel.classList.remove('hidden');
          this.currentGroupProducts = groupProducts;
          this.renderVariantOptions(prod.Capacity, prod.Color);
          
      } else {
          prod = window.app.globalData.products.find(p=>p.SKU==id); 
          if(!prod||prod.Stock<=0) return Swal.fire('สินค้าหมด','สินค้าชิ้นนี้ไม่มีสต๊อกในระบบ','warning');
          if (modalVarSel) modalVarSel.classList.add('hidden');
          this.currentGroupProducts = null;
          this.updateModalWithProduct(prod);
      }
      
      if(prod && prod.Category === 'โมบาย') {
         let mobileCount = this.cartData.filter(i => i.Category === 'โมบาย').reduce((sum, i) => sum + i.qty, 0);
         if(mobileCount >= 1) {
             return Swal.fire('สิทธิ์ออเดอร์เต็ม', 'สามารถทำรายการจองสินค้าประเภท โมบาย ได้เพียง 1 เครื่อง ต่อ 1 ออเดอร์เท่านั้น', 'warning');
         }
      }

      window.app.showModal('addToCartModal');
    },
    renderVariantOptions: function(selectedCapacity, selectedColor) {
        const groupProducts = this.currentGroupProducts;
        if (!groupProducts) return;
        
        const capacities = [...new Set(groupProducts.map(p => p.Capacity).filter(c => c && c !== '-'))];
        if (capacities.length > 0 && !capacities.includes(selectedCapacity)) selectedCapacity = capacities[0];
        
        let capHtml = '';
        capacities.forEach(cap => {
            let isSelected = cap === selectedCapacity;
            let btnClass = isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600';
            capHtml += `<button type="button" class="px-2 md:px-2.5 py-1 md:py-1.5 border rounded-lg text-[9px] md:text-[10px] font-bold transition-all ${btnClass}" onclick="window.app.pos.selectVariant('${window.app.escAttrJs(cap)}', '${window.app.escAttrJs(selectedColor)}')">${window.app.esc(cap)}</button>`;
        });
        const capOptEl = document.getElementById('modalCapacityOptions');
        if (capOptEl) capOptEl.innerHTML = capHtml || '<span class="text-[9px] md:text-[10px] text-slate-400">ไม่มีตัวเลือกความจุ</span>';
        
        const productsForCap = groupProducts.filter(p => (!selectedCapacity || p.Capacity === selectedCapacity));
        const colors = [...new Set(productsForCap.map(p => p.Color).filter(c => c && c !== '-'))];
        
        if (colors.length > 0 && !colors.includes(selectedColor)) selectedColor = colors[0];
        
        let colHtml = '';
        colors.forEach(col => {
            let isSelected = col === selectedColor;
            let p = productsForCap.find(x => x.Color === col);
            let outOfStock = p && p.Stock <= 0;
            
            let btnClass = '';
            if (outOfStock) {
                btnClass = 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed';
                colHtml += `<button type="button" class="px-2 md:px-2.5 py-1 md:py-1.5 border rounded-lg text-[9px] md:text-[10px] font-bold transition-all ${btnClass}" disabled>${window.app.esc(col)}</button>`;
            } else {
                btnClass = isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600';
                colHtml += `<button type="button" class="px-2 md:px-2.5 py-1 md:py-1.5 border rounded-lg text-[9px] md:text-[10px] font-bold transition-all ${btnClass}" onclick="window.app.pos.selectVariant('${window.app.escAttrJs(selectedCapacity)}', '${window.app.escAttrJs(col)}')">${window.app.esc(col)}</button>`;
            }
        });
        const colOptEl = document.getElementById('modalColorOptions');
        if (colOptEl) colOptEl.innerHTML = colHtml || '<span class="text-[9px] md:text-[10px] text-slate-400">ไม่มีตัวเลือกสี</span>';
        
        let targetProduct = productsForCap.find(p => p.Color === selectedColor) || productsForCap[0] || groupProducts[0];
        this.updateModalWithProduct(targetProduct);
    },
    selectVariant: function(capacity, color) {
        this.renderVariantOptions(capacity, color);
    },
    setModalImage: function(index) {
        if (!this.currentImages || this.currentImages.length === 0) return;
        if (index < 0) index = this.currentImages.length - 1;
        if (index >= this.currentImages.length) index = 0;
        this.currentImageIndex = index;
        
        document.getElementById('modalProdImg').src = this.currentImages[index];
        
        const thumbContainer = document.getElementById('modalThumbnails');
        if (thumbContainer && this.currentImages.length > 1) {
            Array.from(thumbContainer.children).forEach((img, i) => {
                if (i === index) {
                    img.classList.add('border-indigo-500', 'scale-105');
                    img.classList.remove('border-slate-200');
                } else {
                    img.classList.remove('border-indigo-500', 'scale-105');
                    img.classList.add('border-slate-200');
                }
            });
        }
    },
    prevImage: function(e) { if(e) e.stopPropagation(); this.setModalImage(this.currentImageIndex - 1); },
    nextImage: function(e) { if(e) e.stopPropagation(); this.setModalImage(this.currentImageIndex + 1); },
    updateModalWithProduct: function(prod) {
      if (!prod) return;
      document.getElementById('modalProdSKU').value = prod.SKU; 
      document.getElementById('modalProdName').innerText = prod['Product Name']; 
      document.getElementById('modalProdPrice').innerText = '฿' + (prod.Price ? (parseFloat(prod.Price.toString().replace(/[^\d.\-]/g,'')) || 0).toLocaleString() : '0');
      document.getElementById('modalProdStock').innerText = '(มีสินค้า: ' + prod.Stock + ')'; 
      document.getElementById('modalProdQty').value = 1; 
      document.getElementById('modalProdQty').max = (prod.Category === 'โมบาย') ? 1 : prod.Stock; 
      this.currentImages = window.app.parseImageUrls(prod['Image URL']);
      
      const thumbContainer = document.getElementById('modalThumbnails');
      const btnPrev = document.getElementById('btnPrevImg');
      const btnNext = document.getElementById('btnNextImg');
      
      if (thumbContainer) {
          if (this.currentImages.length > 1) {
              thumbContainer.innerHTML = this.currentImages.map((u, i) => `<img src="${u}" onclick="window.app.pos.setModalImage(${i})" class="w-12 h-12 md:w-16 md:h-16 object-cover rounded-xl border-2 border-slate-200 hover:border-indigo-500 cursor-pointer shadow-sm transition-all">`).join('');
              thumbContainer.classList.remove('hidden');
              if(btnPrev) btnPrev.classList.remove('hidden');
              if(btnNext) btnNext.classList.remove('hidden');
          } else {
              thumbContainer.innerHTML = '';
              thumbContainer.classList.add('hidden');
              if(btnPrev) btnPrev.classList.add('hidden');
              if(btnNext) btnNext.classList.add('hidden');
          }
      }
      this.setModalImage(0);
      
      const bGifts = document.getElementById('modalBrandGifts'); 
      const cGifts = document.getElementById('modalChannelGifts');
      const currentChannel = document.getElementById('posChannelSelect').value;
      const sku = prod.SKU;
      
      let bGiftsHTML = '';
      let cGiftsHTML = '';

      let allowedBrandGifts = [];
      let allowedChannelGifts = [];
      let hasMapping = false;

      const mappings = (window.app.globalData.giftMappings || []).filter(m => {
          if(m.Status !== 'เปิด') return false;
          const mCh = (m.Channel || '').trim().toLowerCase();
          const chMatch = (mCh === 'all' || mCh === '' || mCh.includes(currentChannel.toLowerCase()));
          if(!chMatch) return false;

          const target = (m['Target Mobile (SKU or Group)'] || '').trim();
          const skuLower = sku.toLowerCase();
          const productNameLower = (prod['Product Name'] || '').trim().toLowerCase();
          const groupLower = (prod['Product Group'] || '').trim().toLowerCase();
          
          if (target === '*' || target.toUpperCase() === 'ALL') return true;
          
          const targets = target.split(',').map(t => t.trim().toLowerCase());
          return targets.some(t => {
              if (t === skuLower) return true; 
              if (t === productNameLower && productNameLower !== '') return true;
              if (t === groupLower && groupLower !== '') return true; 
              if (t.includes('*')) {
                  const regexStr = '^' + t.replace(/\*/g, '.*') + '$';
                  try { 
                      const regex = new RegExp(regexStr);
                      if (regex.test(skuLower) || regex.test(productNameLower)) return true; 
                  } catch(e){}
              }
              
              const subTargets = t.split(' / ').map(st => st.trim());
              if (subTargets.length > 1) {
                  return subTargets.some(st => {
                      if (st === skuLower) return true; 
                      if (st === productNameLower && productNameLower !== '') return true;
                      if (st === groupLower && groupLower !== '') return true; 
                      return false;
                  });
              }
              return false;
          });
      });

      if (mappings.length > 0) {
          hasMapping = true;
          mappings.forEach(m => {
              if(m['Brand Gifts']) allowedBrandGifts.push(...m['Brand Gifts'].split(',').map(s=>s.trim().toLowerCase()).filter(s=>s!==''));
              if(m['Channel Gifts']) allowedChannelGifts.push(...m['Channel Gifts'].split(',').map(s=>s.trim().toLowerCase()).filter(s=>s!==''));
          });
      }

      window.app.globalData.products.forEach((p, idx)=>{ 
        if(p.Status==='เปิด'){ 
          let pNameLower = p['Product Name'].toLowerCase();
          
          if(p.Category==='ของแถมแบรนด์' && hasMapping && allowedBrandGifts.some(g => g === '*' || pNameLower.includes(g))) {
            bGiftsHTML += `<div class="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-sm mb-2 hover:bg-slate-50 transition-colors"><input class="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-500 bg-slate-50 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer shrink-0" type="checkbox" value="${window.app.esc(p['Product Name'])}" id="bgift${idx}" onchange="document.getElementById('bgiftQty${idx}').disabled = !this.checked"><label class="flex-1 text-[9px] md:text-[10px] font-normal text-slate-700 break-words whitespace-normal cursor-pointer select-none" for="bgift${idx}">${window.app.esc(p['Product Name'])} <span class="text-emerald-600 font-bold ml-1">(คงเหลือ ${p.Stock})</span></label><input type="number" id="bgiftQty${idx}" class="w-12 md:w-14 px-1.5 py-1 text-[10px] md:text-[11px] font-bold text-center border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shrink-0" value="1" min="1" max="${p.Stock}" disabled></div>`; 
          } 
          else if(p.Category==='ของแถมช่องทาง' && hasMapping && allowedChannelGifts.some(g => g === '*' || pNameLower.includes(g))) {
            cGiftsHTML += `<div class="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-sm mb-2 hover:bg-slate-50 transition-colors"><input class="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-500 bg-slate-50 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer shrink-0" type="checkbox" value="${window.app.esc(p['Product Name'])}" id="cgift${idx}" onchange="document.getElementById('cgiftQty${idx}').disabled = !this.checked"><label class="flex-1 text-[9px] md:text-[10px] font-normal text-slate-700 break-words whitespace-normal cursor-pointer select-none" for="cgift${idx}">${window.app.esc(p['Product Name'])} <span class="text-indigo-600 font-bold ml-1">(คงเหลือ ${p.Stock})</span></label><input type="number" id="cgiftQty${idx}" class="w-12 md:w-14 px-1.5 py-1 text-[10px] md:text-[11px] font-bold text-center border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shrink-0" value="1" min="1" max="${p.Stock}" disabled></div>`; 
          }
        } 
      });

      if(!hasMapping || bGiftsHTML === '') bGiftsHTML = '<div class="text-sm font-medium text-slate-400 p-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">ไม่มีของแถมสำหรับสินค้ารุ่นนี้</div>';
      if(!hasMapping || cGiftsHTML === '') cGiftsHTML = '<div class="text-sm font-medium text-slate-400 p-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">ไม่มีของแถมสำหรับสินค้ารุ่นนี้</div>';

      if(bGifts) bGifts.innerHTML = bGiftsHTML;
      if(cGifts) cGifts.innerHTML = cGiftsHTML;
    },
    confirmAddToCart: function() {
      if (this.isBookingBlocked) {
        return Swal.fire('ไม่สามารถดำเนินการได้', this.bookingBlockedMessage || 'ไม่อยู่ในช่วงเวลาการจองสินค้า', 'warning');
      }
      const sku=document.getElementById('modalProdSKU').value; const qty=parseInt(document.getElementById('modalProdQty').value); 
      const p = window.app.globalData.products.find(x=>x.SKU==sku); 
      
      if (p.Category === 'โมบาย') {
          let currentMobileQty = this.cartData.filter(i => i.Category === 'โมบาย').reduce((sum, i) => sum + i.qty, 0);
          if (currentMobileQty + qty > 1) {
              return Swal.fire('ข้อจำกัดการจอง', 'สินค้าประเภท โมบาย จำกัดสิทธิ์จองได้ออเดอร์ละ 1 เครื่อง', 'warning');
          }
      }

      const bGifts = []; let giftError = false;
      const modelCounts = {};
      
      document.querySelectorAll('#modalBrandGifts input[type="checkbox"]:checked').forEach(cb => {
         const gQty = parseInt(document.getElementById(cb.id.replace('bgift','bgiftQty')).value) || 1;
         const pData = window.app.globalData.products.find(x => x['Product Name'] === cb.value);
         if (pData) {
            if (gQty > pData.Stock) giftError = true;
            let model = pData.Model || 'UNKNOWN';
            if (model !== '-' && model !== '') {
               if (!modelCounts[model]) modelCounts[model] = 0;
               modelCounts[model] += gQty;
            }
         }
         bGifts.push({name: cb.value, qty: gQty});
      });
      
      const cGifts = [];
      document.querySelectorAll('#modalChannelGifts input[type="checkbox"]:checked').forEach(cb => {
         const gQty = parseInt(document.getElementById(cb.id.replace('cgift','cgiftQty')).value) || 1;
         const pData = window.app.globalData.products.find(x => x['Product Name'] === cb.value);
         if (pData) {
            if (gQty > pData.Stock) giftError = true;
            let model = pData.Model || 'UNKNOWN';
            if (model !== '-' && model !== '') {
               if (!modelCounts[model]) modelCounts[model] = 0;
               modelCounts[model] += gQty;
            }
         }
         cGifts.push({name: cb.value, qty: gQty});
      });

      if (giftError) return Swal.fire('สต๊อกของแถมไม่พอ', 'คุณเลือกจำนวนของแถมเกินกว่าที่มีในคลังคงเหลือ', 'warning');
      
      for (let model in modelCounts) {
         if (modelCounts[model] > 1) {
             return Swal.fire('ข้อจำกัดของแถม', 'ของแถมรุ่นเดียวกัน (' + model + ') สามารถเลือกได้สูงสุด 1 ชิ้นเท่านั้น', 'warning');
         }
      }
      
      const ex = this.cartData.find(i=>i.SKU==sku && JSON.stringify(i.brandGifts)===JSON.stringify(bGifts) && JSON.stringify(i.channelGifts)===JSON.stringify(cGifts));
      if(ex){ if(ex.qty+qty>p.Stock) return Swal.fire('สต๊อกไม่พอ','','warning'); ex.qty+=qty; } 
      else { if(qty>p.Stock) return Swal.fire('สต๊อกไม่พอ','','warning'); this.cartData.push({...p, qty:qty, brandGifts:bGifts, channelGifts:cGifts}); }
      
      window.app.hideModal('addToCartModal'); 
      this.saveAndRender();
      Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2500 }).fire({ icon: 'success', title: 'เพิ่มลงตะกร้าแล้ว' });
    },
    updateQtyInCart: function(idx, c) {
      const itm = this.cartData[idx]; const p = window.app.globalData.products.find(x=>x.SKU==itm.SKU);
      if (c > 0 && p.Category === 'โมบาย') {
          // นับเฉพาะ mobile ชิ้นอื่น (ไม่รวมชิ้นที่กำลังแก้)
          let otherMobile = this.cartData.filter((i, i_idx) => i.Category === 'โมบาย' && i_idx !== idx).reduce((sum, i) => sum + i.qty, 0);
          if (otherMobile + itm.qty + c > 1) { return Swal.fire('จำกัดจำนวน', 'สินค้าประเภท โมบาย จำกัดสิทธิ์จองได้ออเดอร์ละ 1 เครื่อง', 'warning'); }
      }
      itm.qty+=c;
      if(itm.qty>p.Stock){ itm.qty=p.Stock; Swal.fire('คลังจำกัด','จำนวนสิทธิ์เกินสต๊อกสินค้าหลัก','warning'); }
      if(itm.qty<=0) this.cartData.splice(idx,1);
      this.saveAndRender();
      this.checkAutoPromotions();
    },
    removeCartItem: function(idx) { this.cartData.splice(idx, 1); this.saveAndRender(); },
    saveAndRender: function() {
      // ตะกร้าเปลี่ยน = ความพยายามคีย์ออเดอร์ใหม่ — ต้องได้ idempotency key ใหม่ ไม่งั้น server จะมองเป็นออเดอร์ซ้ำ
      this.pendingRequestId = null;
      localStorage.setItem('tg_cart', JSON.stringify(this.cartData)); this.renderCart(); this.updateTotal();
    },
    checkAutoPromotions: function() {
        const suggestBox = document.getElementById('cartAutoSuggest');
        const autoRow = document.getElementById('autoDiscountRow');
        const autoDisp = document.getElementById('cartAutoDiscountDisplay');
        if(!suggestBox || !autoRow) return 0;
        
        suggestBox.innerHTML = '';
        suggestBox.classList.add('hidden');
        autoRow.classList.add('hidden');
        autoRow.classList.remove('flex');
        
        let rules = (window.app.globalData && window.app.globalData.autoPromotions) || [];
        if (rules.length === 0) {
            rules = [{
                'Buy Category': 'โมบาย', 'Get Discount Category': 'อุปกรณ์เสริม', 'Discount Percent': 10,
                'Message Suggest': 'ลูกค้าซื้อมือถือแล้ว! เสนอขายอุปกรณ์เสริม (เคส/ฟิล์ม/หัวชาร์จ) ตอนนี้ <strong class="text-rose-900">รับส่วนลดอุปกรณ์เสริม 10% ทันที</strong> (ระบบคำนวณให้อัตโนมัติ)',
                'Message Apply': 'ลูกค้าได้รับส่วนลดอุปกรณ์เสริม 10% เรียบร้อยแล้ว', 'Status': 'Active'
            }];
        }
        
        let activeRules = rules.filter(r => (r.Status || '').toString().trim().toLowerCase() === 'active');
        
        let totalAutoDiscount = 0;
        let appliedRules = [];
        let suggestRules = [];
        
        let catTotals = {};
        let catCounts = {};
        this.cartData.forEach(item => {
            let cat = (item.Category || '').toString().trim();
            let p = parseFloat((item.Price||'0').toString().replace(/[^\d.\-]/g,''));
            catTotals[cat] = (catTotals[cat] || 0) + ((isNaN(p) ? 0 : p) * item.qty);
            catCounts[cat] = (catCounts[cat] || 0) + item.qty;
        });
        
        for (let rule of activeRules) {
            let buyCat = (rule['Buy Category'] || '').toString().trim();
            let getCat = (rule['Get Discount Category'] || '').toString().trim();
            let discountPct = parseFloat(rule['Discount Percent']) || 0;
            let msgSuggest = rule['Message Suggest'] || `เสนอขาย ${getCat} เพิ่ม รับส่วนลด ${discountPct}%`;
            let msgApply = rule['Message Apply'] || `ได้รับส่วนลด ${getCat} ${discountPct}% เรียบร้อยแล้ว`;
            
            if (catCounts[buyCat] > 0) {
                if (catCounts[getCat] > 0) {
                    let ruleDiscount = (catTotals[getCat] * discountPct) / 100;
                    totalAutoDiscount += ruleDiscount;
                    appliedRules.push({ msg: msgApply, val: ruleDiscount, pct: discountPct, getCat: getCat });
                } else {
                    suggestRules.push(msgSuggest);
                }
            }
        }
        
        if (appliedRules.length > 0) {
            let texts = appliedRules.map(r => r.msg + ` (ลดไป ฿${r.val.toLocaleString()})`).join('<br>');
            suggestBox.innerHTML = `
              <div class="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-3 shadow-sm flex items-start gap-3 transition-all">
                 <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-magic"></i></div>
                 <div>
                    <h6 class="text-[15px] font-bold text-indigo-800 leading-tight mb-1">Bundle Promotion ทำงานแล้ว!</h6>
                    <p class="text-[13px] text-indigo-700 leading-snug">${texts}</p>
                 </div>
              </div>
            `;
            suggestBox.classList.remove('hidden');
            autoRow.classList.remove('hidden');
            autoRow.classList.add('flex');
            if(autoDisp) autoDisp.innerText = '-฿' + totalAutoDiscount.toLocaleString();
            this.autoDiscountDesc = appliedRules.map(r => `${r.pct}% หมวด ${r.getCat}`).join(' + ');
        } else if (suggestRules.length > 0) {
            let texts = suggestRules.join('<br><br>');
            suggestBox.innerHTML = `
              <div class="bg-gradient-to-r from-rose-50 to-red-50 border border-rose-200 rounded-xl p-3 shadow-sm flex items-start gap-3 animate-[pulse_2s_ease-in-out_infinite]">
                 <div class="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-lightbulb"></i></div>
                 <div>
                    <h6 class="text-[15px] font-bold text-rose-800 leading-tight mb-1">ผู้ช่วยขายอัจฉริยะ (Smart Suggest)</h6>
                    <p class="text-[13px] text-rose-700 leading-snug">${texts}</p>
                 </div>
              </div>
            `;
            suggestBox.classList.remove('hidden');
        }
        
        return totalAutoDiscount;
    },
    renderCart: function() {
      const cD = document.getElementById('cartItems'); const cL = document.getElementById('cartCount'); const flC = document.getElementById('floatingCartCount');
      if(!cD) return;
      if(this.cartData.length===0){ 
          cD.innerHTML='<div class="h-full min-h-[200px] flex flex-col items-center justify-center text-slate-400 opacity-70"><i class="fas fa-shopping-bag text-5xl mb-4"></i><p class="text-sm font-bold uppercase tracking-wider">ยังไม่มีสินค้าในตะกร้า</p></div>'; 
          if(cL) cL.innerText='0'; 
          if(flC) flC.innerText='0';
          return; 
      }
      
      let html=''; let c=0; 
      this.cartData.forEach((i, idx)=>{ 
        c+=i.qty; let gHtml=''; 
        if(i.channelGifts && i.channelGifts.length > 0) {
            gHtml += '<div class="mt-3 p-2 bg-indigo-50/50 rounded-lg"><div class="text-[0.65rem] font-bold text-indigo-500 uppercase tracking-wider mb-1">ของแถมช่องทาง</div>';
            i.channelGifts.forEach(g => gHtml+=`<div class="text-[11px] font-normal text-slate-600 mb-0.5"><i class="fas fa-check text-indigo-400 mr-1 text-[0.6rem]"></i> ` + window.app.esc(g.name) + (g.qty > 1 ? ` <span class="font-bold text-indigo-600">(x${g.qty})</span>` : '') + `</div>`);
            gHtml += '</div>';
        }
        if(i.brandGifts && i.brandGifts.length > 0) {
            gHtml += '<div class="mt-2 p-2 bg-emerald-50/50 rounded-lg"><div class="text-[0.65rem] font-bold text-emerald-500 uppercase tracking-wider mb-1">ของแถมแบรนด์</div>';
            i.brandGifts.forEach(g => gHtml+=`<div class="text-[11px] font-normal text-slate-600 mb-0.5"><i class="fas fa-check text-emerald-400 mr-1 text-[0.6rem]"></i> ` + window.app.esc(g.name) + (g.qty > 1 ? ` <span class="font-bold text-emerald-600">(x${g.qty})</span>` : '') + `</div>`);
            gHtml += '</div>';
        }
        let pPrice = i.Price ? (parseFloat(i.Price.toString().replace(/[^\d.\-]/g,'')) || 0).toLocaleString() : '0';
        
        html+='<div class="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm mb-4 relative group hover:shadow-md transition-shadow">';
        html+='  <div class="pr-6"><h6 class="text-sm font-bold text-slate-800 leading-tight mb-1">' + window.app.esc(i['Product Name']) + '</h6></div>';
        html+=   gHtml;
        html+='  <div class="flex justify-between items-end mt-4 pt-4 border-t border-slate-100">';
        html+='    <div class="text-indigo-600 font-black text-lg">฿' + pPrice + '</div>';
        html+='    <div class="flex bg-slate-50 rounded-xl border border-slate-200 items-center overflow-hidden p-1">';
        html+='      <button aria-label="ลดจำนวน" class="w-8 h-8 flex items-center justify-center text-slate-500 bg-white rounded-lg shadow-sm hover:bg-slate-100 hover:text-rose-500 transition-colors" onclick="window.app.pos.updateQtyInCart(' + idx + ',-1)"><i class="fas fa-minus text-[0.7rem]"></i></button>';
        html+='      <span class="w-10 text-center text-sm font-black text-slate-800">' + i.qty + '</span>';
        html+='      <button aria-label="เพิ่มจำนวน" class="w-8 h-8 flex items-center justify-center text-slate-500 bg-white rounded-lg shadow-sm hover:bg-slate-100 hover:text-indigo-500 transition-colors" onclick="window.app.pos.updateQtyInCart(' + idx + ',1)"><i class="fas fa-plus text-[0.7rem]"></i></button>';
        html+='    </div>';
        html+='  </div>';
        html+='  <button class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-rose-500 rounded-lg transition-colors" title="ลบสินค้า" aria-label="ลบสินค้าออกจากตะกร้า" onclick="window.app.pos.removeCartItem(' + idx + ')"><i class="fas fa-trash-alt text-[0.8rem]"></i></button>';
        html+='</div>'; 
      }); 
      cD.innerHTML=html; 
      if(cL) cL.innerText=c;
      if(flC) flC.innerText=c;
    },
    toggleCart: function() {
        const drawer = document.getElementById('cartDrawer');
        const overlay = document.getElementById('cartOverlay');
        if(!drawer || !overlay) return;
        
        if (drawer.classList.contains('translate-x-full')) {
            overlay.classList.remove('hidden');
            setTimeout(() => {
                overlay.classList.remove('opacity-0');
                drawer.classList.remove('translate-x-full');
            }, 10);
        } else {
            drawer.classList.add('translate-x-full');
            overlay.classList.add('opacity-0');
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 300);
        }
    },
    updateTotal: function() {
      let s = 0; this.cartData.forEach(i=>{ let price = parseFloat((i.Price||'0').toString().replace(/[^\d.\-]/g,'')); s += (isNaN(price)?0:price) * i.qty; });
      
      let d = 0;
      this.getPromoDiscounts().forEach(x => { d += x.value; });
      
      let autoDiscount = this.checkAutoPromotions();
      this.cartAutoDiscount = autoDiscount;
      
      let t = s - d - autoDiscount;
      if(document.getElementById('cartSubtotal')) document.getElementById('cartSubtotal').innerText = '฿'+s.toLocaleString(); 
      if(document.getElementById('cartDiscount')) document.getElementById('cartDiscount').innerText = '-฿'+d.toLocaleString(); 
      if(document.getElementById('cartTotal')) document.getElementById('cartTotal').innerText = '฿'+(t>0?t:0).toLocaleString();
    },
    openCheckoutModal: function() {
      if (this.isBookingBlocked) {
        return Swal.fire('ไม่สามารถดำเนินการได้', this.bookingBlockedMessage || 'ไม่อยู่ในช่วงเวลาการจองสินค้า', 'warning');
      }
      const chSel = document.getElementById('posChannelSelect');
      const brSel = document.getElementById('posBranchSelect');
      if(this.cartData.length===0) return Swal.fire('ตะกร้าว่างเปล่า','กรุณาเลือกสินค้าลงตะกร้าก่อน','warning');
      if(!chSel || !chSel.value) return Swal.fire('ยังไม่เลือกช่องทาง','กรุณาเลือกช่องทางการขายก่อน','warning');
      if(!brSel || !brSel.value) return Swal.fire('ยังไม่เลือกสาขา','กรุณาเลือกสาขาที่ทำรายการก่อน','warning');
      
      const drawer = document.getElementById('cartDrawer');
      if (drawer && !drawer.classList.contains('translate-x-full')) {
          this.toggleCart();
      }

      // 5B.2 — prefill ชื่อ/เบอร์พนักงานจากออเดอร์ก่อนหน้าของเครื่องนี้ (ไม่ทับค่าที่ผู้ใช้พิมพ์ค้างไว้)
      const stEl = document.getElementById('bkStaffName');
      const phEl = document.getElementById('bkPhone');
      if (stEl && !stEl.value) stEl.value = sessionStorage.getItem('tg_bk_staff') || '';
      if (phEl && !phEl.value) phEl.value = sessionStorage.getItem('tg_bk_phone') || '';

      window.app.showModal('checkoutModal');
    },
    submitCheckout: async function() {
      if (this.isSubmitting) return; // กันกดยืนยันซ้ำระหว่างรอผล CHECKOUT — ออเดอร์ซ้ำ
      const custName = document.getElementById('coCustomer').value;
      const phone = document.getElementById('coPhone').value.replace(/\D/g, '');
      const email = document.getElementById('coEmail').value;
      const idCard = document.getElementById('coIdCard').value.replace(/\D/g, '');
      const bkStaffName = document.getElementById('bkStaffName').value.trim();
      const bkPhone = document.getElementById('bkPhone').value.replace(/\D/g, '').trim();
      
      if(!custName || !phone || !email || !idCard || !bkStaffName || !bkPhone) { 
          return window.app.toast('กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบถ้วน', 'warning'); 
      }
      
      if(phone.length !== 10) {
          return window.app.toast('เบอร์โทรศัพท์ลูกค้าไม่ถูกต้อง (ต้องเป็น 10 หลัก)', 'warning');
      }
      
      if(!email.includes('@')) {
          return window.app.toast('กรุณากรอกอีเมลให้ถูกต้อง (ต้องมีสัญลักษณ์ @)', 'warning');
      }
      
      if(bkPhone.length !== 10) {
          return window.app.toast('เบอร์พนักงานไม่ถูกต้อง (ต้องเป็น 10 หลัก)', 'warning');
      }
      
      let rs=null; document.getElementsByName('resStatus').forEach(r=>{if(r.checked) rs=r.value;}); if(!rs) return Swal.fire('เลือกเงื่อนไขจอง','กรุณาระบุว่าเป็นการจอง T หรือ จอง F','warning');

      const receiptNo = (document.getElementById('coReceiptNo') ? document.getElementById('coReceiptNo').value : '').trim();
      const depositAmount = parseFloat(document.getElementById('coDeposit') ? document.getElementById('coDeposit').value : 0) || 0;
      // จอง T (มัดจำจองจริง) บังคับต้องมีใบเสร็จและเงินมัดจำ
      if (rs.includes('จอง T')) {
          if (!receiptNo) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกเลขที่ใบเสร็จรับเงินมัดจำ', 'warning');
          if (depositAmount <= 0) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกจำนวนเงินมัดจำ (ต้องมากกว่า 0)', 'warning');
      }
      
      // ส่วนลดมาจาก getPromoDiscounts ที่เดียว (รองรับโปร Percent) — ชื่อที่ส่ง backend เป็น Promo Name เพียวๆ เพื่อให้ validate ตรงชีตได้
      const discountsList = this.getPromoDiscounts();
      let totalDiscountVal = 0;
      discountsList.forEach(x => { totalDiscountVal += x.value; });
      
      if (this.cartAutoDiscount > 0) {
        discountsList.push({ name: 'ส่วนลดพิเศษ (Auto Bundle ' + (this.autoDiscountDesc || '') + ')', value: this.cartAutoDiscount });
        totalDiscountVal += this.cartAutoDiscount;
      }
      
      const ints=[]; document.querySelectorAll('#dynamicInterests input[type="checkbox"]:checked').forEach(e=>ints.push(e.value));

      // Idempotency key: สร้างครั้งเดียวต่อความพยายามคีย์ออเดอร์นี้ — ถ้ากดยืนยันซ้ำหลัง timeout ต้องส่ง id เดิม
      // เพื่อให้ server จับซ้ำได้ ล้างเฉพาะเมื่อ server ยืนยันว่าบันทึกแล้ว (สำเร็จ/duplicate)
      if (!this.pendingRequestId) {
        this.pendingRequestId = 'REQ-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      }

      const pay = {
        clientRequestId: this.pendingRequestId,
        cart:this.cartData, channel: document.getElementById('posChannelSelect').value, branch: document.getElementById('posBranchSelect').value, 
        customerName: custName, contactPhone: phone, email: email, idCard: idCard, codeHandraiser: document.getElementById('coCodeHandraiser').value,
        customerInterests:ints.join(', '), resStatus:rs, bkStaffName:document.getElementById('bkStaffName').value, bkPhone:document.getElementById('bkPhone').value, remark:document.getElementById('coRemark').value, 
        promo: discountsList.map(x => x.name).join(' + ') || '-',
        discount: totalDiscountVal,
        discounts: discountsList,
        receiptNo: receiptNo,
        depositAmount: depositAmount
      };
      
      window.app.hideModal('checkoutModal'); 
      
      setTimeout(async () => {
          if((await Swal.fire({ title: 'ยืนยันการบันทึกใบจอง?', text: "กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนกดยืนยันออเดอร์", icon: 'question', showCancelButton: true, confirmButtonColor: '#0f172a', confirmButtonText: 'ยืนยันการจอง', cancelButtonText: 'ย้อนกลับ' })).isConfirmed) {
             if (window.app.pos.isSubmitting) return;
             window.app.pos.isSubmitting = true;
             const btnSubmit = document.querySelector('[onclick="window.app.pos.submitCheckout()"]');
             if (btnSubmit) btnSubmit.disabled = true;
             window.app.showLoading('กำลังบันทึกข้อมูล...');
             try {
               const res = await window.app.api('CHECKOUT', pay);
               // ปลดล็อกทันทีที่ CHECKOUT คืนผล — งานหลังบ้าน (รีเฟรชข้อมูล) ห้ามกั้นการคีย์ออเดอร์ถัดไป
               window.app.pos.isSubmitting = false;
               if (btnSubmit) btnSubmit.disabled = false;
               if(res && res.status==='success'){
                  // server ยืนยันว่าออเดอร์ถูกบันทึกแล้ว (ใหม่หรือซ้ำ) — ล้าง idempotency key ให้ออเดอร์ถัดไปได้ key ใหม่
                  window.app.pos.pendingRequestId = null;
                  // 5B.2 — จำชื่อ/เบอร์พนักงานไว้ prefill ออเดอร์ถัดไป (per เครื่อง ไม่ใช่ per user — ล้างตอน logout)
                  sessionStorage.setItem('tg_bk_staff', bkStaffName);
                  sessionStorage.setItem('tg_bk_phone', bkPhone);
                  if (res.duplicate) {
                    // ยิงซ้ำจาก timeout/คีย์ซ้ำ — ออเดอร์เดิมถูกบันทึกไปแล้ว ไม่ต้องเด้ง success dialog ซ้ำ
                    window.app.toast('ออเดอร์นี้ถูกบันทึกไปแล้ว (เลขที่ ' + res.orderId + ')', 'warning');
                  } else {
                  Swal.fire({
                    title: 'สำเร็จ',
                    text: 'จัดเก็บข้อมูลใบจองเข้าระบบเรียบร้อยแล้ว',
                    icon: 'success',
                    showCancelButton: true,
                    confirmButtonText: '<i class="fas fa-print mr-1"></i> พิมพ์ใบจอง',
                    cancelButtonText: 'ปิด (Close)',
                    confirmButtonColor: '#3b82f6',
                    cancelButtonColor: '#94a3b8'
                  }).then((result) => {
                    if (result.isConfirmed) {
                      window.app.printReceipt(res.orderId, pay);
                    }
                  });
                  }
                  localStorage.removeItem('tg_cart'); window.app.pos.cartData=[];
                  window.app.pos.saveAndRender(); 
                  ['coCustomer','coPhone','coEmail','coIdCard','coCodeHandraiser','bkStaffName','bkPhone','coRemark','coReceiptNo','coDeposit'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
                  document.getElementsByName('resStatus').forEach(r => r.checked = false);
                  
                  const pContainer = document.getElementById('cartPromosContainer');
                  if(pContainer) {
                    pContainer.innerHTML = '';
                    window.app.pos.addPromoRow();
                  }
                  
                  document.querySelectorAll('#dynamicInterests input[type="checkbox"]').forEach(c=>c.checked=false);
                  // ออเดอร์บันทึกสำเร็จไปแล้ว — ถ้ารีเฟรชข้อมูลพลาด ห้ามเด้ง error ให้ผู้ใช้เข้าใจผิดว่าจองไม่สำเร็จ
                  try {
                    const newGlobal = await window.app.api('GET_ALL_DATA', {});
                    if(newGlobal && newGlobal.status === 'success') window.app.globalData = newGlobal;
                    window.app.pos.filter();
                  } catch(refreshErr) { console.warn('รีเฟรชข้อมูลหลังบันทึกออเดอร์ไม่สำเร็จ (สต๊อกบนการ์ดอาจยังเป็นค่าเก่า):', refreshErr); }
               } else { Swal.fire('ระบบขัดข้อง',res ? res.message : 'Error', 'error'); }
             } catch(e) {
               // timeout ≠ บันทึกไม่สำเร็จ — ออเดอร์อาจเข้าแล้ว (idempotency key กันซ้ำอยู่) อย่าให้ผู้ใช้รีบคีย์ใหม่ทันที
               if (e && e.isTimeout) Swal.fire('การเชื่อมต่อช้า', 'กรุณาตรวจสอบหน้ารายการจองก่อนคีย์ซ้ำ — หากออเดอร์ยังไม่เข้า กดยืนยันอีกครั้งได้ (ระบบกันบันทึกซ้ำให้)', 'warning');
               else Swal.fire('เกิดข้อผิดพลาด', e.message, 'error');
             }
             finally {
               window.app.pos.isSubmitting = false;
               if (btnSubmit) btnSubmit.disabled = false;
             }
          }
      }, 350);
    }
  },

  grid: {
    tableName: '', idField: '', columns: [], dataList: [], filteredDataList: [], currentPage: 1, pageSize: 20, isReadonly: false, sortCol: '', sortAsc: true,
    init: async function(table, idCol, cols, readonly=false) {
      this.tableName = table; this.idField = idCol; this.columns = cols; this.isReadonly = readonly;
      const content = document.getElementById('page-content');
      const tmpl = document.getElementById('tmpl-datagrid');
      if(content && tmpl) content.innerHTML = tmpl.innerHTML;
      const btn = document.getElementById('gridAddBtn');
      if(btn) btn.style.display = (readonly || table==='Orders') ? 'none' : 'flex';
      // ปุ่ม Export CSV เฉพาะหน้า Orders (5B.3) — สลับ hidden/flex เป็นคู่ ห้ามให้สอง class อยู่พร้อมกัน
      const exBtn = document.getElementById('gridExportBtn');
      if(exBtn) {
        if (table === 'Orders') { exBtn.classList.remove('hidden'); exBtn.classList.add('flex'); }
        else { exBtn.classList.add('hidden'); exBtn.classList.remove('flex'); }
      }
      
      let h = '<tr>'; 
      this.columns.forEach(c => { 
        if(c.type!=='hidden') h+=`<th onclick="window.app.grid.sortColumn('${c.key}')" class="sticky top-0 z-20 bg-indigo-50 border-b border-indigo-100 py-3 px-4 text-left text-[11px] font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-indigo-100 transition-colors">${c.label} <i class="fas fa-sort text-indigo-300 ml-1"></i></th>`; 
      }); 
      if(!readonly) h += `<th class="sticky top-0 z-20 bg-indigo-50 border-b border-indigo-100 py-3 px-4 text-right text-[11px] font-bold text-indigo-900 uppercase tracking-wider whitespace-nowrap">จัดการ</th>`;
      h += '</tr>'; 
      const head = document.getElementById('dataGridHead');
      if(head) head.innerHTML = h; 
      this.loadData();
    },
    loadData: async function() {
      window.app.showLoading(); 
      try {
        const res = await window.app.api('GET_TABLE', { tableName: this.tableName }); 
        Swal.close();
        if(res && res.status === 'success') {
          this.dataList = res.data;
          this.filteredDataList = this.dataList;
          this.currentPage = 1;
          this.renderPage(1);
        }
        else { this.renderLoadError(res ? res.message : 'ไม่สามารถโหลดข้อมูลได้'); }
      } catch(e) { Swal.close(); this.renderLoadError(e.message); }
    },
    // error state มาตรฐาน (5A.4) — แสดงในตารางพร้อมปุ่มลองใหม่ แทนการเด้ง Swal อย่างเดียว
    renderLoadError: function(msg) {
      const tbody = document.getElementById('dataGridBody');
      if (!tbody) { Swal.fire('Error', msg, 'error'); return; }
      tbody.innerHTML = '<tr><td colspan="' + this.visibleColCount() + '">' + window.app.emptyState({
        icon: 'fa-exclamation-triangle',
        title: 'โหลดข้อมูลไม่สำเร็จ',
        subtitle: msg,
        actionLabel: 'ลองใหม่',
        onclick: 'window.app.grid.loadData()'
      }) + '</td></tr>';
    },
    renderPage: function(page) {
      this.currentPage = page;
      const totalPages = Math.ceil(this.filteredDataList.length / this.pageSize) || 1;
      if (this.currentPage > totalPages) this.currentPage = totalPages;
      if (this.currentPage < 1) this.currentPage = 1;
      const start = (this.currentPage - 1) * this.pageSize;
      const pageData = this.filteredDataList.slice(start, start + this.pageSize);
      this.renderTable(pageData, start);
      
      const pgContainer = document.getElementById('gridPagination');
      if (pgContainer) {
        pgContainer.innerHTML = `<div class="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-slate-100 bg-white rounded-b-2xl gap-3">
          <div class="text-xs font-medium text-slate-500">แสดง ${this.filteredDataList.length === 0 ? 0 : start + 1} ถึง ${Math.min(start + this.pageSize, this.filteredDataList.length)} จากทั้งหมด ${this.filteredDataList.length} รายการ</div>
          <div class="flex items-center space-x-2">
            <button onclick="window.app.grid.renderPage(${this.currentPage - 1})" class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-xs font-bold transition-colors" ${this.currentPage === 1 ? 'disabled' : ''}>ก่อนหน้า</button>
            <span class="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-50 rounded-lg border border-slate-100">หน้า ${this.currentPage} / ${totalPages}</span>
            <button onclick="window.app.grid.renderPage(${this.currentPage + 1})" class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-xs font-bold transition-colors" ${this.currentPage === totalPages ? 'disabled' : ''}>ถัดไป</button>
          </div>
        </div>`;
      }
    },
    // จำนวนคอลัมน์ที่แสดงจริง (ใช้เป็น colspan ของ empty/error state)
    visibleColCount: function() {
      return this.columns.filter(c => c.type !== 'hidden').length + (this.isReadonly ? 0 : 1);
    },
    renderTable: function(data, startOffset) {
      startOffset = startOffset || 0;
      const tbody = document.getElementById('dataGridBody'); if(!tbody) return;
      if (data.length === 0) {
        const searchEl = document.getElementById('gridSearch');
        const hasSearch = !!(searchEl && searchEl.value.trim() !== '');
        tbody.innerHTML = '<tr><td colspan="' + this.visibleColCount() + '">' + window.app.emptyState({
          icon: hasSearch ? 'fa-search' : 'fa-inbox',
          title: hasSearch ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีข้อมูลในตารางนี้',
          subtitle: hasSearch ? 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อแสดงข้อมูลทั้งหมด' : 'เมื่อมีการบันทึกข้อมูลใหม่ รายการจะแสดงที่นี่',
          actionLabel: hasSearch ? 'ล้างตัวกรอง' : '',
          onclick: hasSearch ? "document.getElementById('gridSearch').value='';window.app.grid.filter()" : ''
        }) + '</td></tr>';
        return;
      }
      let tbodyHtml = '';
      data.forEach((row, index) => {
        // ตำแหน่งจริงใน filteredDataList — index ภายในหน้าเคยทำให้เปิดแก้ผิดเรคอร์ดเมื่ออยู่หน้า 2+ หรือหลังค้นหา/เรียงลำดับ
        const absIndex = startOffset + index;
        let tr = '<tr class="hover:bg-slate-50 transition-colors">';
        this.columns.forEach(c => {
          if(c.type==='hidden') return; let val = window.app.esc(row[c.key] || '');
          if(c.key==='Password') val = '********';
          else if(c.key==='Contact Number' || c.key==='เบอร์โทรศัพท์' || c.key==='Phone') {
              if (String(val).length === 10) val = String(val).substring(0,3) + '-' + String(val).substring(3,6) + '-' + String(val).substring(6,10);
          }
          else if(c.key==='ID Card_Passport' || c.key==='ID Card / Passport') {
              if (String(val).length === 13) val = String(val).substring(0,1) + '-' + String(val).substring(1,5) + '-' + String(val).substring(5,10) + '-' + String(val).substring(10,12) + '-' + String(val).substring(12,13);
          }
          else if(c.key==='Order Status' || c.key==='Status') { 
              let clr = val==='เปิด'||val==='Completed'?'emerald':(val==='Pending'?'amber':'slate'); 
              val=`<span class="px-2.5 py-1 rounded-md text-[10px] font-bold bg-${clr}-100 text-${clr}-700 border border-${clr}-200">${val}</span>`; 
          }
          if(c.key==='Image URL' && val.length>30) val = val.substring(0,30)+'...';
          // Orders: ติด icon หน้าชื่อสินค้าให้แถวส่วนลด/ของแถม อ่านบิลหลายแถวต่อ OrderID ง่ายขึ้น
          // ของแถมดูจาก Unit Price=0 + Row Total=0 (processGift เขียนแบบนี้เสมอ) — ตัวเลขจากชีตอาจมี comma
          if(this.tableName === 'Orders' && c.key === 'Product Name') {
            const num = (k) => parseFloat(String(row[k] === undefined || row[k] === null ? '' : row[k]).replace(/,/g, '')) || 0;
            if(row.SKU === 'DISCOUNT') val = '<i class="fas fa-tag text-rose-500 mr-1.5" title="ส่วนลด" aria-label="ส่วนลด"></i>' + val;
            else if(num('Unit Price') === 0 && num('Row Total') === 0) val = '<i class="fas fa-gift text-emerald-500 mr-1.5" title="ของแถม" aria-label="ของแถม"></i>' + val;
          }
          tr += `<td class="py-2.5 px-4 border-b border-slate-100 text-[11px] text-slate-700 whitespace-nowrap">${val}</td>`;
        });
        if(!this.isReadonly) {
            let act = `<button class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors shadow-sm" onclick="window.app.grid.editForm(${absIndex})" title="แก้ไข" aria-label="แก้ไขรายการ"><i class="fas fa-edit"></i></button>`;
            if (!(window.app.user.Role === 'Manager' && this.tableName === 'Orders')) {
                const safeId = window.app.esc(String(row[this.idField] || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
                act+=`<button class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-colors shadow-sm ml-2" onclick="window.app.grid.deleteRecord('${safeId}')" title="ลบ" aria-label="ลบรายการ"><i class="fas fa-trash"></i></button>`;
            }
            tr += `<td class="py-2.5 px-4 border-b border-slate-100 text-right whitespace-nowrap">${act}</td>`;
        }
        tr += '</tr>'; 
        tbodyHtml += tr;
      });
      tbody.innerHTML = tbodyHtml;
    },
    filter: function() { 
      const input = document.getElementById('gridSearch'); if(!input) return;
      const term = input.value.toLowerCase(); 
      this.filteredDataList = this.dataList.filter(row => JSON.stringify(Object.values(row)).toLowerCase().includes(term));
      this.renderPage(1); 
    },
    sortColumn: function(colKey) {
      if(this.sortCol === colKey) this.sortAsc = !this.sortAsc;
      else { this.sortCol = colKey; this.sortAsc = true; }
      this.filteredDataList.sort((a,b) => {
        let valA = a[colKey] !== undefined && a[colKey] !== null ? a[colKey] : '';
        let valB = b[colKey] !== undefined && b[colKey] !== null ? b[colKey] : '';
        if(typeof valA === 'string') valA = valA.toLowerCase();
        if(typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return this.sortAsc ? -1 : 1;
        if (valA > valB) return this.sortAsc ? 1 : -1;
        return 0;
      });
      this.renderPage(1);
    },
    // 5A.3 — Order status timeline (read-only visual) แสดงหัว modal แก้ไข/ดูออเดอร์
    // flow อ่านจากชีต OrderStatus (เรียงตามแถว, ตัด Cancelled ออก) ถ้าชีตว่างใช้ flow มาตรฐาน
    orderTimelineHtml: function(data) {
      const stList = (window.app.globalData.orderStatuses || []).filter(s => s && (s['Status Name'] || '').toString().trim() !== '');
      const fallbackColors = { 'Pending': '#f59e0b', 'Confirmed': '#6366f1', 'Paid': '#10b981', 'Delivered': '#1e293b', 'Completed': '#10b981', 'Cancelled': '#f43f5e' };
      const colorOf = (name) => {
        const row = stList.find(s => (s['Status Name'] || '').toString().trim() === name);
        const c = row && row['Color Code'] ? row['Color Code'].toString().trim() : '';
        return c || fallbackColors[name] || '#6366f1';
      };
      const current = (data['Order Status'] || 'Pending').toString().trim();

      // Cancelled = สถานะแดงแยก ไม่อยู่ใน flow
      if (current === 'Cancelled') {
        return '<div class="sm:col-span-2 md:col-span-3"><div class="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">'
          + '<div class="w-8 h-8 shrink-0 rounded-full text-white flex items-center justify-center" style="background:' + window.app.esc(colorOf('Cancelled')) + '"><i class="fas fa-ban"></i></div>'
          + '<div><p class="text-sm font-bold text-rose-600">Cancelled — ออเดอร์นี้ถูกยกเลิก</p>'
          + '<p class="text-[11px] text-rose-400">รายการนี้ไม่อยู่ในขั้นตอนการดำเนินการ</p></div>'
          + '</div></div>';
      }

      let flow = stList.length >= 2
        ? stList.map(s => s['Status Name'].toString().trim()).filter(n => n.toLowerCase() !== 'cancelled')
        : ['Pending', 'Confirmed', 'Paid', 'Delivered'];
      // สถานะปัจจุบันไม่อยู่ใน flow (เช่นระบบเก่าใช้ Completed) — ต่อท้ายเป็น step สุดท้ายให้ timeline ยังสะท้อนความจริง
      let curIdx = flow.indexOf(current);
      if (curIdx === -1) { flow = flow.concat([current]); curIdx = flow.length - 1; }

      let html = '<div class="sm:col-span-2 md:col-span-3"><div class="bg-slate-50 border border-slate-100 rounded-xl px-4 py-4 overflow-x-auto">'
        + '<div class="flex items-start min-w-max w-full">';
      flow.forEach((name, i) => {
        const color = window.app.esc(colorOf(name));
        const label = window.app.esc(name);
        if (i > 0) {
          const lineColor = i <= curIdx ? color : '#e2e8f0';
          html += '<div class="h-0.5 flex-1 min-w-[28px] mx-1.5 rounded self-start mt-3.5" style="background:' + lineColor + '"></div>';
        }
        let circle = '';
        if (i < curIdx) {
          circle = '<div class="w-7 h-7 rounded-full text-white flex items-center justify-center text-[10px]" style="background:' + color + '"><i class="fas fa-check"></i></div>';
        } else if (i === curIdx) {
          circle = '<div class="w-7 h-7 rounded-full text-white flex items-center justify-center text-[10px] font-bold" style="background:' + color + ';box-shadow:0 0 0 4px ' + color + '33"><i class="fas fa-circle text-[6px]"></i></div>';
        } else {
          circle = '<div class="w-7 h-7 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center"><i class="fas fa-circle text-[6px] text-slate-200"></i></div>';
        }
        const labelClass = i === curIdx ? 'text-slate-800' : (i < curIdx ? 'text-slate-600' : 'text-slate-400');
        html += '<div class="flex flex-col items-center shrink-0 gap-1.5">' + circle + '<span class="text-[10px] font-bold ' + labelClass + '">' + label + '</span></div>';
      });
      html += '</div></div></div>';
      return html;
    },
    openForm: function(data = null) {
      const f = document.getElementById('dynamicForm'); if(!f) return;
      let fHtml = '';

      if (this.tableName === 'Orders' && data) fHtml += this.orderTimelineHtml(data);
      if (this.tableName === 'Orders') fHtml += '<datalist id="customerList">' + [...new Set(this.dataList.map(o=>o['Customer Name']))].filter(Boolean).map(c=>'<option value="' + window.app.esc(c) + '">').join('') + '</datalist>';
      
      let grouped = {};
      let noGroup = [];
      
      window.app.globalData.products.forEach(p => {
          if(p.Category==='โมบาย') {
              const group = p['Product Group'] ? p['Product Group'].trim() : '';
              const opt = `<option value="${window.app.esc(p.SKU + ' / ' + p['Product Name'])}">`;
              if (group) {
                  if (!grouped[group]) grouped[group] = [];
                  grouped[group].push(opt);
              } else {
                  noGroup.push(opt);
              }
          }
      });
      
      let datalistOpts = [];
      for (const group in grouped) {
          datalistOpts.push(`<option value="${window.app.esc(group)}">`);
          datalistOpts.push(...new Set(grouped[group]));
      }
      datalistOpts.push(...new Set(noGroup));
      
      fHtml += `<datalist id="targetList">${datalistOpts.join('')}</datalist>`;

      this.columns.forEach(c => {
        let val = data ? (data[c.key] || '') : ''; let inp = '';
        const escVal = window.app.esc(val); // ใช้ escVal ทุกจุดที่แทรก val ลงใน HTML attribute
        let dis = (c.key==='Order Status' && window.app.user.Role==='Sales') ? 'disabled' : '';
        if (this.tableName === 'Orders' && window.app.user.Role === 'Manager' && c.key !== 'Order Status') dis = 'disabled';
        let inputClass = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white shadow-sm transition-all';
        if(dis) inputClass += ' opacity-70 cursor-not-allowed';

        if(c.type==='hidden') { 
            fHtml += '<input type="hidden" id="field_' + c.key + '" value="' + escVal + '">'; return;
        }
        else if(c.type.startsWith('multi_select_')) {
            let currentVals = val ? val.split(',').map(s=>s.trim()) : [];
            let safeKey = c.key.replace(/\s+/g, '');
            let allVal = c.type === 'multi_select_channel' ? 'ALL' : '*';
            let allLabel = c.type === 'multi_select_channel' ? 'เลือกทุกช่องทาง (ALL)' : 'ให้สิทธิ์เข้าถึงทั้งหมด (*)';
            if(c.type === 'multi_select_brand_gifts' || c.type === 'multi_select_channel_gifts') allLabel = 'แจกทุกชิ้นในหมวดนี้ (*)';
            
            let isAll = currentVals.includes(allVal) || val === 'ALL' || val === '*';
            
            let opts = [];
            if(c.type === 'multi_select_channel') {
                opts = [...new Set(window.app.globalData.channels.map(x=>x['Channel Name']))].filter(Boolean).map(n => ({id: n, label: n}));
            } else if (c.type === 'multi_select_menu') {
                // ข้ามแถวหัวข้อ (isCategory) ที่ไม่มี id — ถ้าหลุดเข้า opts จะทำ opt.id.toLowerCase() พังทั้งฟอร์ม (ปุ่มแก้ไข Members เงียบ)
                window.app.menuConfig.forEach(m => {
                    if(m.isParent) {
                        if (m.id) opts.push({id: m.id, label: `[กลุ่ม] ${m.label}`});
                        m.children.forEach(child => { if (!child.isCategory && child.id) opts.push({id: child.id, label: `--- ${child.label}`}); });
                    } else if (!m.isCategory && m.id) {
                        opts.push({id: m.id, label: m.label});
                    }
                });
            } else {
                let targetCat = c.type === 'multi_select_brand_gifts' ? 'ของแถมแบรนด์' : 'ของแถมช่องทาง';
                opts = window.app.globalData.products.filter(p => p.Category === targetCat && p.Status === 'เปิด').map(p => ({id: p['Product Name'], label: p['Product Name']}));
            }
            
            inp = `<div class="max-h-48 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 mt-1 shadow-inner">`;
            
            inp += `<label class="flex items-center space-x-3 cursor-pointer p-2 bg-white rounded-lg border border-slate-100 hover:bg-indigo-50 transition-colors shadow-sm">
                       <input type="checkbox" class="chk-group-${safeKey} w-5 h-5 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500" value="${allVal}" onchange="if(this.checked) document.querySelectorAll('.chk-group-${safeKey}').forEach(cb=>{if(cb!==this)cb.checked=false})" ${isAll?'checked':''}> 
                       <span class="text-[11px] font-bold text-indigo-600">${allLabel}</span>
                    </label>`;
                    
            opts.forEach(opt => {
                // สิทธิ์เมนู/ช่องทางต้องเทียบตรงตัวทั้งคำ — substring เคยทำให้ค่า 'promotions' ติ๊ก 'autopromotions' ให้เกินสิทธิ์
                // ของแถม (brand/channel gifts) คงเทียบแบบ keyword ตาม semantics ของ GiftMappings
                let matchExact = (c.type === 'multi_select_menu' || c.type === 'multi_select_channel');
                let isChecked = !isAll && currentVals.some(cv => matchExact
                    ? String(opt.id || '').toLowerCase() === cv.toLowerCase()
                    : String(opt.id || '').toLowerCase().includes(cv.toLowerCase()));
                inp += `<label class="flex items-center space-x-3 cursor-pointer p-2 hover:bg-slate-100 rounded-lg transition-colors">
                           <input type="checkbox" class="chk-group-${safeKey} w-5 h-5 text-indigo-600 bg-white border-slate-300 rounded focus:ring-indigo-500" value="${window.app.esc(opt.id)}" onchange="if(this.checked) { let allCb = document.querySelector('.chk-group-${safeKey}[value=\\'${allVal}\\']'); if(allCb) allCb.checked=false; }" ${isChecked?'checked':''}>
                           <span class="text-[11px] font-normal text-slate-700">${window.app.esc(opt.label)}</span>
                        </label>`;
            });
            inp += `</div>`;
        }
        else if(c.type==='select') { inp='<select class="'+inputClass+'" id="field_' + c.key + '" ' + dis + '>' + c.options.map(opt=>'<option value="' + opt + '" ' + (val===opt?'selected':'') + '>' + opt + '</option>').join('') + '</select>'; }
        else if(c.type==='product_select') {
          if (data && data.SKU === 'DISCOUNT') {
            inp = '<input type="text" class="' + inputClass + ' bg-slate-100" id="field_' + c.key + '" value="' + escVal + '" readonly>';
          } else {
            inp='<select class="'+inputClass+'" id="field_' + c.key + '" onchange="window.app.grid.onProductChange(this)">'; 
            window.app.globalData.products.forEach(p=>{ 
              if(p.Status==='เปิด'||val===p['Product Name']) inp+='<option value="' + window.app.esc(p['Product Name']) + '" data-sku="' + window.app.esc(p.SKU) + '" data-price="' + parseFloat((p.Price||0).toString().replace(/,/g,'')) + '" ' + (val===p['Product Name']?'selected':'') + '>' + window.app.esc(p['Product Name']) + ' (SKU: ' + window.app.esc(p.SKU) + ')</option>';
            }); 
            inp+='</select>';
          }
        }
        else if(c.type==='datalist') inp='<input type="text" class="'+inputClass+'" id="field_' + c.key + '" value="' + escVal + '" list="' + c.listId + '" ' + dis + '>';
        else if(c.type==='readonly') inp='<input type="text" class="'+inputClass+' bg-slate-100" id="field_' + c.key + '" value="' + escVal + '" readonly ' + dis + '>';
        else if(c.type==='password') inp='<input type="password" class="'+inputClass+'" id="field_' + c.key + '" placeholder="' + (data?'เว้นว่างถ้าไม่ต้องการเปลี่ยน':'รหัสผ่านใหม่') + '" ' + dis + '>';
        else if(c.type==='number') {
          let numDis = '';
          if (data && data.SKU === 'DISCOUNT' && c.key === 'Qty') {
            numDis = 'readonly bg-slate-100';
          }
          // ค่าจากชีตเป็น display string อาจมี comma (เช่น "46,900") — input type=number ปฏิเสธค่าที่มี comma ทำให้ช่องโชว์ว่าง ต้องล้างก่อน
          let numVal = String(val === null || val === undefined ? '' : val).replace(/[^\d.\-]/g, '');
          inp='<input type="number" class="'+inputClass + ' ' + numDis +'" id="field_' + c.key + '" value="' + window.app.esc(numVal) + '" onkeyup="' + (c.onchange||'') + '" onchange="' + (c.onchange||'') + '" ' + (numDis?'readonly':'') + ' ' + dis + '>';
        }
        else if(this.tableName === 'GiftMappings' && c.key === 'Target Mobile (SKU or Group)') inp=`<div class="relative"><input type="text" class="${inputClass} pr-8" id="field_${c.key}" value="${escVal}" list="targetList" placeholder="เช่น SKU-123, S24-Series หรือ *" ${dis}><button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none" onclick="document.getElementById('field_${c.key}').value=''"><i class="fas fa-times"></i></button></div>`;
        else if(c.key === 'Image URL' && window.app.user.Role === 'Admin' && !dis) {
            // รอบ 10 — ปุ่มอัปโหลดรูปข้างช่อง URL (ช่องเดิมยังพิมพ์/วางลิงก์เองได้); UPLOAD_IMAGE เป็น Admin only จึงโชว์ปุ่มเฉพาะ Admin
            const hasVal = String(val).trim() && String(val).trim() !== '-';
            const previewSrc = hasVal ? window.app.esc(window.app.formatImageUrl(val)) : '';
            inp = `<div class="space-y-2">
                     <div class="flex gap-2">
                       <input type="text" class="${inputClass}" id="field_${c.key}" value="${escVal}" placeholder="วางลิงก์รูป หรือกดอัปโหลด" oninput="const pv=document.getElementById('gridImgPreview'); if(pv){ if(this.value.trim()){ pv.src=window.app.formatImageUrl(this.value); pv.classList.remove('hidden'); } else { pv.classList.add('hidden'); } }">
                       <button type="button" id="gridImgUpBtn" class="shrink-0 px-3 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm" onclick="document.getElementById('gridImgFile').click()"><i class="fas fa-upload mr-1"></i> อัปโหลดรูป</button>
                       <input type="file" id="gridImgFile" accept="image/*" class="hidden" onchange="window.app.handleImageUpload(this, 'field_${c.key}', 'gridImgPreview', 'gridImgUpBtn')">
                     </div>
                     <img id="gridImgPreview" src="${previewSrc}" alt="ตัวอย่างรูปสินค้า" class="h-16 w-16 object-cover rounded-lg border border-slate-200 shadow-sm ${hasVal ? '' : 'hidden'}" onerror="this.classList.add('hidden')">
                   </div>`;
        }
        else inp='<input type="' + c.type + '" class="'+inputClass+'" id="field_' + c.key + '" value="' + escVal + '" ' + dis + '>';
        
        fHtml += '<div><label class="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">' + c.label + '</label>' + inp + '</div>';
      });
      f.innerHTML = fHtml;
      if(document.getElementById('formModalTitle')) document.getElementById('formModalTitle').innerText = data ? 'จัดการแก้ไขข้อมูลเอกสาร' : 'ลงทะเบียนบันทึกข้อมูลใหม่'; 
      window.app.showModal('formModal');
    },
    onProductChange: function(sel) {
      const o = sel.options[sel.selectedIndex]; if(!o) return;
      const sku = document.getElementById('field_SKU'); const pr = document.getElementById('field_Unit Price');
      if(sku) sku.value=o.getAttribute('data-sku'); if(pr) pr.value=o.getAttribute('data-price'); this.calcOrderTotal();
    },
    calcOrderTotal: function() {
      const elQty = document.getElementById('field_Qty');
      const elPrice = document.getElementById('field_Unit Price');
      const t = document.getElementById('field_Row Total'); 
      if(!elQty || !elPrice || !t) return;
      const q = parseFloat(elQty.value||0); const p = parseFloat(elPrice.value||0);
      t.value=q*p;
    },
    editForm: function(index) { this.openForm(this.filteredDataList[index]); },
    saveForm: async function() {
      // 5B.5 — disabled + spinner ระหว่างรอ API (กัน double-click ก่อน modal ปิด)
      const btnSave = document.querySelector('#formModal [onclick="window.app.grid.saveForm()"]');
      if (btnSave && btnSave.disabled) return;
      const restoreBtn = window.app.buttonBusy(btnSave) || function(){};

      const pay = {};

      this.columns.forEach(c => { 
        if (c.type.startsWith('multi_select_')) {
           let safeKey = c.key.replace(/\s+/g, '');
           let checked = Array.from(document.querySelectorAll(`.chk-group-${safeKey}:checked`)).map(el => el.value);
           if(c.type === 'multi_select_channel' && checked.includes('ALL')) pay[c.key] = 'ALL';
           else if(checked.includes('*')) pay[c.key] = '*';
           else pay[c.key] = checked.join(', ');
        } else {
           const el=document.getElementById('field_' + c.key); 
           if(el) pay[c.key]=el.value; 
        }
      });

      window.app.hideModal('formModal'); 
      setTimeout(async () => {
         window.app.showLoading('กำลังบันทึกข้อมูล...');
         try {
           let res;
           if(this.tableName==='Orders') res = await window.app.api('UPDATE_FULL_ORDER', { data: pay });
           else res = await window.app.api('SAVE_RECORD', { tableName: this.tableName, idField: this.idField, data: pay });
           if(res && res.status==='success'){ await window.app.refreshGlobalData(); Swal.fire({ icon: 'success', title: 'อัปเดตข้อมูลเสร็จสิ้น', showConfirmButton: false, timer: 1500 }); this.loadData(); } else Swal.fire('ผิดพลาด',res ? res.message : 'Error', 'error');
         } catch(e) { Swal.fire('ผิดพลาด', e.message || 'Error', 'error'); }
         finally { restoreBtn(); }
      }, 350);
    },
    deleteRecord: async function(id) {
      if((await Swal.fire({ title: 'คุณต้องการลบข้อมูลนี้?', text: "การดำเนินการนี้ไม่สามารถย้อนกลับได้ประจำระบบล็อกไฟล์", icon: 'warning', showCancelButton: true, confirmButtonColor: '#e11d48', confirmButtonText: 'ลบถาวร', cancelButtonText: 'ยกเลิก' })).isConfirmed){
        window.app.showLoading('กำลังลบข้อมูล...');
        try {
          const res = await window.app.api('DELETE_RECORD', { tableName:this.tableName, idField:this.idField, idValue:id });
          if(res && res.status==='success') { await window.app.refreshGlobalData(); Swal.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จแล้ว', showConfirmButton: false, timer: 1200 }); this.loadData(); } else Swal.fire('Error',res ? res.message : 'Error','error');
        } catch(e) { Swal.fire('Error', e.message || 'Error', 'error'); }
      }
    },
    // 5B.3 — export ตามที่กรอง/ค้น/เรียงอยู่ (filteredDataList ไม่ใช่ dataList) เป็น CSV ที่ Excel เปิดภาษาไทยถูก (BOM)
    exportCSV: function() {
      if (this.filteredDataList.length === 0) return Swal.fire('ไม่มีข้อมูล', 'ไม่มีรายการให้ export ตามตัวกรองปัจจุบัน', 'warning');
      const cols = this.columns.filter(c => c.type !== 'hidden').map(c => c.key);
      const escCell = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
      let csv = "\uFEFF" + cols.map(escCell).join(',') + '\r\n'; // BOM นำหน้าให้ Excel เปิดภาษาไทยถูก (escape ไว้ ไม่ฝังตัวอักษรล่องหนในซอร์ส)
      this.filteredDataList.forEach(row => { csv += cols.map(k => escCell(row[k])).join(',') + '\r\n'; });
      // ชื่อไฟล์ใช้วันที่ local — ห้าม toISOString (UTC ทำให้วันเลื่อนถอยหลังในโซน +7)
      const d = new Date();
      const fname = this.tableName.toLowerCase() + '_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.csv';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }
  },

  // รอบ 9 — หน้า "ตั้งค่าระบบ" รวม 6 หน้า settings เดิมเป็น tab ภายในหน้าเดียว (UI reorganization เท่านั้น —
  // เนื้อหาแต่ละ tab คือ settingsManager.init(type) เดิม render ลง container ของ tab; backend ไม่เปลี่ยน)
  systemSettings: {
    pendingTab: '',   // ตั้งโดย route() ตอน redirect จาก hash เก่า เพื่อเปิด tab ที่ตรงกัน
    activeTab: '',
    // id = hash/type เดิมทั้ง 6 — ใช้เป็นทั้ง redirect map ใน route() และ alias สิทธิ์ใน checkMenuAccess
    tabs: [
      { id: 'bookingsettings', icon: 'fa-clock',           label: 'เวลารับจอง' },
      { id: 'herobanners',     icon: 'fa-images',          label: 'Hero Banners' },
      { id: 'promogrids',      icon: 'fa-th-large',        label: 'Promo Grid' },
      { id: 'popupbanners',    icon: 'fa-window-maximize', label: 'Popup' },
      { id: 'loginbg',         icon: 'fa-image',           label: 'พื้นหลัง Login' },
      { id: 'autosetup',       icon: 'fa-database',        label: 'ฐานข้อมูล' }
    ],

    init: function() {
      const content = document.getElementById('page-content');
      if (!content) return;
      const startTab = this.tabs.some(t => t.id === this.pendingTab) ? this.pendingTab : 'bookingsettings';
      this.pendingTab = '';
      // tab bar สไตล์ sub-chips ของ POS (เส้นใต้ตัว active) — icon/label เป็น literal จาก tabs ข้างบน ไม่ใช่ข้อมูลผู้ใช้
      const barHtml = this.tabs.map(t =>
        `<button type="button" role="tab" id="ssTab-${t.id}" class="px-1 pb-2 text-sm whitespace-nowrap border-b-2 transition-colors border-transparent text-slate-500 hover:text-indigo-600" onclick="window.app.systemSettings.openTab('${t.id}')"><i class="fas ${t.icon} mr-1.5 text-[11px] opacity-70"></i>${t.label}</button>`
      ).join('');
      content.innerHTML = `
        <div class="space-y-6 animate-fade-in-up">
          <div class="bg-white border border-slate-200 shadow-sm rounded-3xl px-6 pt-5">
            <h3 class="text-lg font-extrabold text-slate-800 mb-4"><i class="fas fa-sliders-h text-indigo-500 mr-2"></i> ตั้งค่าระบบ</h3>
            <div class="flex gap-5 overflow-x-auto custom-scrollbar" role="tablist">${barHtml}</div>
          </div>
          <div id="ssTabContent"></div>
        </div>`;
      this.openTab(startTab);
    },

    openTab: function(tabId) {
      this.activeTab = tabId;
      this.tabs.forEach(t => {
        const btn = document.getElementById('ssTab-' + t.id);
        if (!btn) return;
        const active = t.id === tabId;
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.classList.toggle('border-indigo-600', active);
        btn.classList.toggle('text-indigo-600', active);
        btn.classList.toggle('font-bold', active);
        btn.classList.toggle('border-transparent', !active);
        btn.classList.toggle('text-slate-500', !active);
      });
      // render เฉพาะ tab ที่เปิด — เรียก logic เดิมของหน้าเดิมลง container ของ tab
      window.app.settingsManager.init(tabId, 'ssTabContent');
    }
  },

  settingsManager: {
    currentType: '',
    data: null,
    containerId: 'page-content',

    // containerId (optional) — รอบ 9: หน้า systemsettings ส่ง container ของ tab มา; จำค่าไว้เพราะ
    // save/delete เรียกซ้ำด้วย this.init(this.currentType) โดยไม่ส่ง container
    init: async function(type, containerId) {
      this.currentType = type;
      if (containerId) this.containerId = containerId;
      const content = document.getElementById(this.containerId);
      if(!content) return;
      
      if (type === 'autosetup') {
        // รอบ 11 — tab ฐานข้อมูลโชว์ค่า DriveFolderId ปัจจุบันด้วย แต่ถ้าโหลดไม่ได้ (เช่นยังไม่เคย Auto Setup
        // จึงไม่มีชีต UI_Banners) ต้อง render ต่อด้วยค่าว่าง — ปุ่ม Auto Setup ต้องกดได้เสมอ ห้าม block ด้วย error
        this.data = {};
        try {
          const res = await window.app.api('GET_SETTINGS_LIST');
          if (res && res.status === 'success') this.data = res.data;
          else console.warn('GET_SETTINGS_LIST:', res && res.message);
        } catch(e) { console.warn('GET_SETTINGS_LIST:', e.message); }
        this.render();
        return;
      }
      
      window.app.showLoading('กำลังโหลดข้อมูล...');
      try {
        const res = await window.app.api('GET_SETTINGS_LIST');
        Swal.close();
        if (res && res.status === 'success') {
          this.data = res.data;
          this.render();
        } else {
          Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถโหลดข้อมูลได้', 'error');
        }
      } catch(e) {
        Swal.close();
        Swal.fire('ข้อผิดพลาด', e.message || 'ไม่สามารถโหลดข้อมูลได้', 'error');
      }
    },
    
    render: function() {
      const content = document.getElementById(this.containerId);
      if(!content || !this.data) return;
      
      let html = '';
      
      if (this.currentType === 'autosetup') {
        const driveFolderId = window.app.esc((this.data.keyValueSettings && this.data.keyValueSettings.DriveFolderId) || '');
        html = `
          <div class="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
          <div class="bg-white border border-slate-200 shadow-xl rounded-3xl overflow-hidden">
            <div class="p-6 bg-slate-50 border-b border-slate-100">
              <h3 class="text-lg font-extrabold text-slate-800"><i class="fas fa-database text-indigo-500 mr-2"></i> สร้างฐานข้อมูลครั้งแรก (Auto Setup)</h3>
              <p class="text-xs text-slate-500 mt-1">ใช้สำหรับการตั้งค่า Google Sheets และข้อมูลเริ่มต้นระบบทั้งหมด (ตาราง, สินค้าตัวอย่าง, บัญชีแอดมิน)</p>
            </div>
            <div class="p-8 space-y-6 text-center">
              <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-50 mb-2">
                 <i class="fas fa-database text-4xl text-indigo-600"></i>
              </div>
              <div class="text-slate-600 text-sm max-w-md mx-auto space-y-3">
                 <p class="font-bold text-slate-800">คำเตือนสำหรับระบบ!</p>
                 <p>หากคุณกดดำเนินการ ระบบจะสร้างแผ่นงานที่จำเป็นสำหรับระบบขายของแบรนด์นี้ หากมีตารางเดิมอยู่แล้ว จะทำการตรวจสอบความสมบูรณ์และเสริมตารางที่หายไป</p>
                 <p class="text-slate-500">ใช้เมื่อ<strong>ติดตั้งระบบครั้งแรก</strong> หรือเมื่อระบบเวอร์ชันใหม่<strong>มีตาราง/คอลัมน์เพิ่ม</strong>แล้วต้องการเติมส่วนที่หายไป — ข้อมูลเดิมไม่ถูกลบ</p>
              </div>
              
              <div class="pt-6 border-t border-slate-100 flex justify-center">
                <button type="button" class="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all" onclick="window.app.initDB()">
                    <i class="fas fa-cogs mr-2"></i> เริ่มการดำเนินการ Auto Setup
                </button>
              </div>
            </div>
          </div>

          <div class="bg-white border border-slate-200 shadow-xl rounded-3xl overflow-hidden">
            <div class="p-6 bg-slate-50 border-b border-slate-100">
              <h3 class="text-lg font-extrabold text-slate-800"><i class="fab fa-google-drive text-indigo-500 mr-2"></i> โฟลเดอร์เก็บรูปอัปโหลด</h3>
              <p class="text-xs text-slate-500 mt-1">กำหนดโฟลเดอร์ Google Drive ปลายทางของรูปที่อัปโหลดผ่านปุ่ม "อัปโหลดรูป" ทั่วระบบ</p>
            </div>
            <div class="p-8 space-y-4">
              <div class="space-y-2">
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider" for="driveFolderIdInput">Drive Folder ID หรือลิงก์โฟลเดอร์</label>
                <input type="text" id="driveFolderIdInput" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm" value="${driveFolderId}" placeholder="เช่น https://drive.google.com/drive/folders/1AbC... หรือวางเฉพาะ ID">
                <p class="text-[11px] text-slate-400 leading-relaxed">เปิดโฟลเดอร์ใน Google Drive แล้วคัดลอกลิงก์มาวางได้เลย ระบบจะดึง ID ให้อัตโนมัติ — เว้นว่างเพื่อใช้โฟลเดอร์อัตโนมัติ (MPOS Product Images)</p>
              </div>
              <div class="flex justify-end pt-4 border-t border-slate-100">
                <button onclick="window.app.settingsManager.saveDriveFolderId()" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center"><i class="fas fa-save mr-2"></i> บันทึกข้อมูล</button>
              </div>
            </div>
          </div>
          </div>
        `;
      } else if (this.currentType === 'bookingsettings') {
        const start = (this.data.keyValueSettings && this.data.keyValueSettings.ReserveStart) || '';
        const end = (this.data.keyValueSettings && this.data.keyValueSettings.ReserveEnd) || '';
        
        html = `
          <div class="max-w-2xl mx-auto bg-white border border-slate-200 shadow-xl rounded-3xl overflow-hidden animate-fade-in-up">
            <div class="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 class="text-lg font-extrabold text-slate-800"><i class="fas fa-clock text-indigo-500 mr-2"></i> ตั้งเวลารับจองสินค้า (Booking Period)</h3>
                <p class="text-xs text-slate-500 mt-1">กำหนดวันเวลาเริ่มต้นและสิ้นสุดการจองสินค้า สำหรับควบคุมการสั่งซื้อหน้า POS</p>
              </div>
              <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                <i class="fas fa-history mr-1 animate-pulse"></i> กำหนดเวลาจอง
              </span>
            </div>
            
            <div class="p-8 space-y-6">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-2">
                  <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                    <i class="fas fa-play text-emerald-500 mr-1.5 text-[10px]"></i> วันเวลาเริ่มการจอง (Start Booking)
                  </label>
                  <input type="datetime-local" id="reserveStartInput" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm" value="${start}">
                </div>
                
                <div class="space-y-2">
                  <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                    <i class="fas fa-stop text-rose-500 mr-1.5 text-[10px]"></i> วันเวลาสิ้นสุดการจอง (End Booking)
                  </label>
                  <input type="datetime-local" id="reserveEndInput" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm" value="${end}">
                </div>
              </div>
              
              <div class="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-5 space-y-3">
                <h4 class="text-xs font-bold text-indigo-800 uppercase tracking-wider flex items-center"><i class="fas fa-info-circle mr-1.5"></i> คำแนะนำการทำงานของระบบ</h4>
                <ul class="text-xs text-slate-600 space-y-2 pl-5 list-disc leading-relaxed">
                  <li>ระบบจะเริ่มเปิดให้จองสินค้าหน้า POS เมื่อเวลาปัจจุบันถึงวันเริ่มจอง</li>
                  <li>หากเวลาปัจจุบันเลยวันสิ้นสุดการจองที่ตั้งค่าไว้ หน้าจอ POS จะ <strong class="text-rose-600 font-bold">ปิดการทำงานทั้งหมด</strong> โดยจะไม่สามารถค้นหา/คลิกเลือกสินค้าเพื่อใส่ตะกร้า และปุ่มดำเนินการข้อมูลลูกค้าจะถูกล็อกทันที</li>
                  <li>จะมีแถบเวลานับถอยหลัง (Countdown Timer) แสดงให้เห็นเวลาเหลือจอง ณ ขณะนั้นเพื่อกระตุ้นยอดขาย</li>
                </ul>
              </div>
              
              <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button onclick="window.app.settingsManager.saveBookingSettings()" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center"><i class="fas fa-save mr-2"></i> บันทึกข้อมูลตั้งค่า</button>
              </div>
            </div>
          </div>
        `;
      } else if (this.currentType === 'loginbg') {
        const bgUrl = window.app.esc(this.data.loginBg || '');
        const previewUrl = window.app.esc(window.app.formatImageUrl(this.data.loginBg || ''));
        
        html = `
          <div class="max-w-2xl mx-auto bg-white border border-slate-200 shadow-xl rounded-3xl overflow-hidden animate-fade-in-up">
            <div class="p-6 bg-slate-50 border-b border-slate-100">
              <h3 class="text-lg font-extrabold text-slate-800"><i class="fas fa-image text-indigo-500 mr-2"></i> ตั้งค่ารูปพื้นหลังหน้าล็อกอิน (Login BG)</h3>
              <p class="text-xs text-slate-500 mt-1">กำหนดลิ้งก์รูปภาพที่จะแสดงในพื้นหลังของหน้าจอเข้าสู่ระบบ</p>
            </div>
            <div class="p-8 space-y-6">
              <div class="h-[240px] w-full rounded-2xl border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden relative group">
                <img id="loginBgPreview" src="${previewUrl}" class="max-h-full max-w-full object-cover w-full h-full transition-transform duration-300 group-hover:scale-105" onerror="this.src='https://via.placeholder.com/600x300?text=No+Preview+Available'">
                <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span class="text-white text-xs font-bold bg-slate-900/80 px-3 py-1.5 rounded-full"><i class="fas fa-search-plus mr-1"></i> ภาพตัวอย่าง</span>
                </div>
              </div>
              
              <div class="space-y-2">
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider">ลิงก์รูปภาพ (Image URL)</label>
                <div class="flex gap-2">
                  <input type="text" id="loginBgUrlInput" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm" value="${bgUrl}" placeholder="วาง URL ของรูปภาพ เช่น https://images.unsplash.com/... หรือ Google Drive link" oninput="document.getElementById('loginBgPreview').src = window.app.formatImageUrl(this.value)">
                  <button type="button" id="loginBgUpBtn" class="shrink-0 px-4 py-3 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm" onclick="document.getElementById('loginBgFile').click()"><i class="fas fa-upload mr-1"></i> อัปโหลดรูป</button>
                  <input type="file" id="loginBgFile" accept="image/*" class="hidden" onchange="window.app.handleImageUpload(this, 'loginBgUrlInput', null, 'loginBgUpBtn')">
                </div>
              </div>
              
              <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button onclick="window.app.settingsManager.testImage('loginBgUrlInput')" class="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm"><i class="fas fa-eye mr-2"></i> พรีวิวภาพ</button>
                <button onclick="window.app.settingsManager.saveLoginBg()" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center"><i class="fas fa-save mr-2"></i> บันทึกข้อมูล</button>
              </div>
            </div>
          </div>
        `;
      } else {
        let title = '';
        let desc = '';
        let list = [];
        let typeKey = '';
        
        if (this.currentType === 'herobanners') {
          title = 'ตั้งค่ารูปภาพภาพสไลด์หน้าแรก (Hero Banners)';
          desc = 'จัดการรูปภาพโปรโมชั่นแบบสไลด์ (Slide Carousel) ที่อยู่ส่วนบนสุดของหน้าขายสินค้า';
          list = this.data.heroBanners || [];
          typeKey = 'herobanner';
        } else if (this.currentType === 'promogrids') {
          title = 'ตั้งค่าตารางโปรโมชั่น (Promo Grid)';
          desc = 'จัดการรูปภาพตารางแบนเนอร์โปรโมชั่นที่แสดงด้านล่างของหน้าจอขายสินค้า';
          list = this.data.promoGrids || [];
          typeKey = 'promogrid';
        } else if (this.currentType === 'popupbanners') {
          title = 'ตั้งค่าป๊อปอัปแจ้งเตือน (Popup Banner)';
          desc = 'จัดการรูปภาพโฆษณา / ป้ายประกาศป๊อปอัปที่จะแสดงเมื่อเข้าสู่หน้าขายสินค้า';
          list = this.data.popupBanners || [];
          typeKey = 'popupbanner';
        }
        
        let cardsHtml = '';
        if (list.length === 0) {
          cardsHtml = `
            <div class="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50">
              <i class="fas fa-images text-slate-300 text-5xl mb-4"></i>
              <p class="text-sm font-bold text-slate-400">ยังไม่มีข้อมูลรูปภาพในระบบ</p>
            </div>
          `;
        } else {
          // แกลเลอรีสะอาด: การ์ดโชว์แค่รูป + แถบปุ่ม — ฟอร์มแก้ไขซ่อนไว้ กางเฉพาะใบที่กด "แก้ไข" (id เดิมทุกตัว ห้ามเปลี่ยน — saveItem อ้างอิงอยู่)
          list.forEach(item => {
            const previewUrl = window.app.esc(window.app.formatImageUrl(item.url));
            const hasLink = !!(item.targetLink && item.targetLink.trim());
            cardsHtml += `
              <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-300">
                <div class="h-[160px] bg-slate-100 overflow-hidden relative group">
                  <img src="${previewUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src='https://via.placeholder.com/300x150?text=Invalid+Image+URL'">
                  <div class="absolute top-2 left-2 px-2 py-0.5 bg-slate-900/70 text-white text-[10px] font-bold rounded-lg pointer-events-none">#${item.rowIndex}</div>
                  ${hasLink ? '<div class="absolute top-2 right-2 w-6 h-6 bg-white/90 text-indigo-600 rounded-lg flex items-center justify-center shadow-sm pointer-events-none" title="มีลิงก์ปลายทาง"><i class="fas fa-link text-[10px]"></i></div>' : ''}
                </div>
                <div class="flex items-center justify-between px-3 py-2 border-t border-slate-100">
                  <button onclick="const f=document.getElementById('bannerEdit-${item.rowIndex}'); if(f) f.classList.toggle('hidden'); this.querySelector('i').classList.toggle('fa-chevron-up'); this.querySelector('i').classList.toggle('fa-pen');" class="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1.5" aria-label="แก้ไขแบนเนอร์นี้"><i class="fas fa-pen text-[10px]"></i> แก้ไข</button>
                  <button onclick="window.app.settingsManager.deleteItem('${typeKey}', ${item.rowIndex}, '${window.app.escAttrJs(item.id || '')}')" class="w-8 h-8 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center" title="ลบภาพ" aria-label="ลบรูปภาพ"><i class="fas fa-trash text-xs"></i></button>
                </div>
                <div id="bannerEdit-${item.rowIndex}" class="hidden p-4 pt-3 border-t border-slate-100 bg-slate-50/60 space-y-2">
                  <label class="block text-[10px] font-bold text-slate-400 uppercase">ลิงก์ภาพ (Image URL)</label>
                  <div class="flex gap-2">
                    <input type="text" id="bannerUrl-${item.rowIndex}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value="${window.app.esc(item.url)}" placeholder="URL">
                    <button type="button" id="bannerUpBtn-${item.rowIndex}" class="shrink-0 px-2.5 py-2 bg-white border border-slate-200 text-slate-500 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm" onclick="document.getElementById('bannerFile-${item.rowIndex}').click()" title="อัปโหลดรูป" aria-label="อัปโหลดรูปแบนเนอร์"><i class="fas fa-upload"></i></button>
                    <input type="file" id="bannerFile-${item.rowIndex}" accept="image/*" class="hidden" onchange="window.app.handleImageUpload(this, 'bannerUrl-${item.rowIndex}', null, 'bannerUpBtn-${item.rowIndex}')">
                  </div>
                  <label class="block text-[10px] font-bold text-slate-400 uppercase mt-2">ลิงก์ปลายทาง (Target Link)</label>
                  <input type="text" id="targetLink-${item.rowIndex}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" value="${window.app.esc(item.targetLink || '')}" placeholder="URL ให้คลิก (ปล่อยว่างได้)">
                  ${typeKey === 'promogrid' ? `
                  <label class="block text-[10px] font-bold text-slate-400 uppercase mt-2">รายละเอียด (Details)</label>
                  <textarea id="bannerDetails-${item.rowIndex}" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none" rows="2" placeholder="รายละเอียดแคมเปญ">${window.app.esc(item.details || '')}</textarea>
                  ` : ''}
                  <div class="flex justify-end pt-2">
                    <button onclick="window.app.settingsManager.saveItem('${typeKey}', ${item.rowIndex}, 'bannerUrl-${item.rowIndex}', 'targetLink-${item.rowIndex}'${typeKey === 'promogrid' ? `, 'bannerDetails-${item.rowIndex}'` : ''})" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-md transition-colors flex items-center" title="บันทึกแก้ไข"><i class="fas fa-save mr-1"></i> บันทึก</button>
                  </div>
                </div>
              </div>
            `;
          });
        }
        
        html = `
          <div class="space-y-6 animate-fade-in-up">
            <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 class="text-lg font-extrabold text-slate-800"><i class="fas fa-images text-indigo-500 mr-2"></i> ${title}</h3>
                <p class="text-xs text-slate-500 mt-1">${desc}</p>
              </div>
              <button onclick="window.app.settingsManager.openAddModal('${typeKey}')" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center w-full sm:w-auto justify-center">
                <i class="fas fa-plus mr-2"></i> เพิ่มแบนเนอร์ใหม่
              </button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              ${cardsHtml}
            </div>
          </div>
        `;
      }
      
      content.innerHTML = html;
    },
    
    testImage: function(inputId) {
      const url = document.getElementById(inputId).value;
      if (!url || url.trim() === '') return Swal.fire('คำแนะนำ', 'กรุณากรอกลิงก์รูปภาพก่อนดูตัวอย่าง', 'info');
      Swal.fire({
        title: 'รูปภาพพรีวิว',
        imageUrl: window.app.formatImageUrl(url),
        imageAlt: 'Preview',
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'ปิด'
      });
    },
    
    saveLoginBg: async function() {
      const url = document.getElementById('loginBgUrlInput').value.trim();
      // 5B.5 — ปุ่มที่เพิ่งถูกกดคือ activeElement; disabled + spinner ระหว่างรอ API
      const restoreBtn = window.app.buttonBusy(document.activeElement) || function(){};
      window.app.showLoading('กำลังบันทึกข้อมูล...');
      try {
        const res = await window.app.api('SAVE_SETTINGS_ITEM', { type: 'loginbg', url: url });
        if(res && res.status==='success') {
          await window.app.refreshGlobalData();
          Swal.fire({ icon: 'success', title: 'บันทึกภาพพื้นหลังสำเร็จ', showConfirmButton: false, timer: 1500 });
          this.init(this.currentType);
        } else {
          Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
        }
      } catch(e) {
        Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
      } finally {
        restoreBtn();
      }
    },
    
    // รอบ 11 — บันทึก Drive Folder ID ปลายทางรูปอัปโหลด (tab ฐานข้อมูล)
    // รับทั้งลิงก์เต็ม (.../folders/<id>) และ ID ตรง ๆ; ค่าว่าง = ล้างกลับไปใช้โฟลเดอร์อัตโนมัติ
    saveDriveFolderId: async function() {
      const inputEl = document.getElementById('driveFolderIdInput');
      if (!inputEl) return;
      let val = inputEl.value.trim();
      const m = val.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (m) val = m[1];
      const restoreBtn = window.app.buttonBusy(document.activeElement) || function(){};
      window.app.showLoading('กำลังบันทึกข้อมูล...');
      try {
        const res = await window.app.api('SAVE_SETTINGS_ITEM', { type: 'bookingsettings', settings: { DriveFolderId: val } });
        if (res && res.status === 'success') {
          inputEl.value = val; // โชว์ ID ที่ดึงจากลิงก์แล้ว ให้ Admin เห็นค่าที่ถูกเก็บจริง
          Swal.fire({ icon: 'success', title: val ? 'บันทึกโฟลเดอร์เก็บรูปสำเร็จ' : 'ล้างค่าแล้ว — กลับไปใช้โฟลเดอร์อัตโนมัติ', showConfirmButton: false, timer: 1600 });
        } else {
          Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
        }
      } catch(e) {
        Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
      } finally {
        restoreBtn();
      }
    },

    saveItem: async function(type, rowIndex, inputId, targetLinkId) {
      const url = document.getElementById(inputId).value.trim();
      const targetLink = targetLinkId ? document.getElementById(targetLinkId).value.trim() : '';
      if (!url) return Swal.fire('แจ้งเตือน', 'กรุณากรอกลิงก์รูปภาพ', 'warning');

      // 5B.5 — disabled + spinner ระหว่างรอ API
      const restoreBtn = window.app.buttonBusy(document.activeElement) || function(){};
      window.app.showLoading('กำลังบันทึกข้อมูล...');
      try {
        const res = await window.app.api('SAVE_SETTINGS_ITEM', { type: type, rowIndex: rowIndex, url: url, targetLink: targetLink });
        if(res && res.status==='success') {
          await window.app.refreshGlobalData();
          Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลสำเร็จ', showConfirmButton: false, timer: 1200 });
          this.init(this.currentType);
        } else {
          Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
        }
      } catch(e) {
        Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
      } finally {
        restoreBtn();
      }
    },
    
    openAddModal: function(type) {
      const isGrid = type === 'promogrid';
      Swal.fire({
        title: 'เพิ่มลิงก์แบนเนอร์ใหม่',
        html: `
          <div class="space-y-4 text-left px-2">
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-1">ลิงก์ภาพ (Image URL) *</label>
              <div class="flex gap-2">
                <input type="text" id="swal-url" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="https://...">
                <button type="button" id="swal-upbtn" class="shrink-0 px-3 py-2 bg-white border border-slate-200 text-slate-500 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm" onclick="document.getElementById('swal-file').click()" title="อัปโหลดรูป" aria-label="อัปโหลดรูปแบนเนอร์"><i class="fas fa-upload"></i></button>
                <input type="file" id="swal-file" accept="image/*" class="hidden" onchange="window.app.handleImageUpload(this, 'swal-url', null, 'swal-upbtn')">
              </div>
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-1">ลิงก์ปลายทาง (Target Link)</label>
              <input type="text" id="swal-link" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="ลิงก์สำหรับคลิก (ปล่อยว่างได้)">
            </div>
            ${isGrid ? `
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-1">รายละเอียด (Details)</label>
              <textarea id="swal-details" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all" rows="2" placeholder="รายละเอียดแคมเปญ"></textarea>
            </div>
            ` : ''}
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#4f46e5',
        preConfirm: () => {
          const url = document.getElementById('swal-url').value.trim();
          const link = document.getElementById('swal-link').value.trim();
          const detailsEl = document.getElementById('swal-details');
          const details = detailsEl ? detailsEl.value.trim() : '';
          if (!url) {
            Swal.showValidationMessage('กรุณากรอกลิงก์รูปภาพ!');
            return false;
          }
          return { url: url, targetLink: link, details: details };
        }
      }).then(async (result) => {
        if (result.isConfirmed) {
          window.app.showLoading('กำลังบันทึกข้อมูล...');
          try {
            const res = await window.app.api('SAVE_SETTINGS_ITEM', { type: type, url: result.value.url, targetLink: result.value.targetLink, details: result.value.details });
            if(res && res.status==='success') {
              await window.app.refreshGlobalData();
              Swal.fire({ icon: 'success', title: 'เพิ่มรูปภาพสำเร็จ', showConfirmButton: false, timer: 1200 });
              this.init(this.currentType);
            } else {
              Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
            }
          } catch(e) {
            Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
          }
        }
      });
    },
    
    deleteItem: async function(type, rowIndex, bannerId) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการลบรูปภาพ?',
        text: 'ต้องการลบรูปภาพแบนเนอร์แถวที่ ' + rowIndex + ' ใช่หรือไม่?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'ลบรูปภาพ',
        cancelButtonText: 'ยกเลิก'
      });
      
      if (confirm.isConfirmed) {
        window.app.showLoading('กำลังลบข้อมูล...');
        try {
          const res = await window.app.api('DELETE_SETTINGS_ITEM', { type: type, rowIndex: rowIndex, bannerId: bannerId || '' });
          if(res && res.status==='success') {
            await window.app.refreshGlobalData();
            Swal.fire({ icon: 'success', title: 'ลบรูปภาพสำเร็จ', showConfirmButton: false, timer: 1200 });
            this.init(this.currentType);
          } else {
            Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
          }
        } catch(e) {
          Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
        }
      }
    },
    
    saveBookingSettings: async function() {
      const start = document.getElementById('reserveStartInput').value;
      const end = document.getElementById('reserveEndInput').value;
      
      if (!start || !end) {
        return Swal.fire('แจ้งเตือน', 'กรุณาระบุวันเวลาให้ครบถ้วน', 'warning');
      }
      
      if (new Date(start) >= new Date(end)) {
        return Swal.fire('แจ้งเตือน', 'วันเวลาเริ่มจองต้องมาก่อนวันเวลาสิ้นสุดการจอง', 'warning');
      }

      // 5B.5 — disabled + spinner ระหว่างรอ API
      const restoreBtn = window.app.buttonBusy(document.activeElement) || function(){};
      window.app.showLoading('กำลังบันทึกข้อมูล...');
      try {
        const res = await window.app.api('SAVE_SETTINGS_ITEM', {
          type: 'bookingsettings',
          settings: {
            ReserveStart: start,
            ReserveEnd: end
          }
        });
        if(res && res.status==='success') {
          await window.app.refreshGlobalData();
          Swal.fire({ icon: 'success', title: 'บันทึกเวลาการจองสำเร็จ', showConfirmButton: false, timer: 1500 });
          this.init(this.currentType);
        } else {
          Swal.fire('ผิดพลาด', res ? res.message : 'Error', 'error');
        }
      } catch(e) {
        Swal.fire('ผิดพลาด', e.message || 'Error', 'error');
      } finally {
        restoreBtn();
      }
    }
  }
};
// 5B.4 — กด Esc ปิด modal ที่เปิดอยู่บนสุดก่อน (ทีละชั้น) แล้วค่อยปิด cart drawer
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  // 6B — filter popover เป็นชั้นบนสุดของหน้า POS: ปิดก่อนทุก modal
  if (window.app.pos && window.app.pos.openPopover) { window.app.pos.closeFilterPopovers(); return; }
  const popup = document.getElementById('popupBannerModal');
  if (popup && !popup.classList.contains('hidden')) { window.app.closePopupBanner(); return; }
  const modalOrder = ['formModal', 'checkoutModal', 'addToCartModal'];
  for (let i = 0; i < modalOrder.length; i++) {
    const el = document.getElementById(modalOrder[i]);
    if (el && !el.classList.contains('hidden')) { window.app.hideModal(modalOrder[i]); return; }
  }
  const drawer = document.getElementById('cartDrawer');
  if (drawer && !drawer.classList.contains('translate-x-full')) window.app.pos.toggleCart();
});

// 6B — คลิกนอก chip/popover (นอก .store-pop-wrap) = ปิด filter popover ที่เปิดอยู่
document.addEventListener('click', function(e) {
  if (!window.app.pos || !window.app.pos.openPopover) return;
  if (e.target && e.target.closest && e.target.closest('.store-pop-wrap')) return;
  window.app.pos.closeFilterPopovers();
});

window.onload = () => window.app.init();
