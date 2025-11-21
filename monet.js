(function () {
  'use strict';
 
  // @noframes
  if (window.top !== window.self) return;
 
  // Helper: run when DOM ready
  function onReady(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, {once:true});
    } else {
      fn();
    }
  }
 
  onReady(() => {
    if (window.autoStatusScriptRunning || document.getElementById('autoStatusBadge')) {
      console.log('⚠️ Auto-status already initialized.');
      return;
    }
    window.autoStatusScriptRunning = true;
 
    let intervalId = null;
    const MAX_RETRY = 3;
    let lastFiredSlot = null;
    let lastFiredAtMs = 0;
    
    const schedule = {
      "08:00": "01. Available/Case Work",
      "08:05": "02. Break",
      "08:35": "01. Available/Case Work",
      "09:00": "03. Lunch",
      "10:00": "01. Available/Case Work",
      "14:59": "02. Break",
      "15:14": "01. Available/Case Work",
      "16:00": "10. End of shift"
    };
 
    const norm = s => String(s || '').replace(/\s+/g,' ').trim().toLowerCase();
    const isWeekday = () => { const d = new Date().getDay(); return d >= 1 && d <= 5; };
    const hhmm = () => new Date().toTimeString().slice(0,5);
 
    function findControls(){
      function scan(doc){
        const select = doc.getElementById('statusListCombo') ||
                       doc.querySelector('select#statusListCombo, select[name*="status" i], select[id*="status" i]');
        const submit = doc.getElementById('submitmanualStatusChange') ||
                       doc.querySelector('#submitmanualStatusChange, button[id*="submit" i][id*="status" i], input[type="submit"][name*="status" i]');
        const logout = doc.getElementById('btnLogout') ||
                       doc.querySelector('#btnLogout, [id*="logout" i], [name*="logout" i]');
        return {doc, select, submit, logout};
      }
      let r = scan(document);
      if (r.select || r.submit || r.logout) return r;
 
      for (const fr of document.querySelectorAll('iframe')){
        try{
          const d = fr.contentDocument || fr.contentWindow?.document;
          if (!d) continue;
          r = scan(d);
          if (r.select || r.submit || r.logout) return r;
        }catch(e){/* cross-origin hoặc chưa sẵn sàng */}
      }
      return {doc:document, select:null, submit:null, logout:null};
    }
 
    function waitForControls(timeout = 20000){
      return new Promise(resolve => {
        const start = Date.now();
        (function poll(){
          const r = findControls();
          if (r.select || r.submit || r.logout) return resolve(r);
          if (Date.now() - start > timeout) return resolve(r);
          setTimeout(poll, 500);
        })();
      });
    }
 
    function pickOption(selectEl, target){
      const t = norm(target);
      const opts = Array.from(selectEl.options || []);
      for (let i=0; i<opts.length; i++){
        const o = opts[i];
        if (norm(o.value) === t || norm(o.textContent) === t){
          selectEl.selectedIndex = i;
          try {
            selectEl.dispatchEvent(new Event('input',  {bubbles:true}));
            selectEl.dispatchEvent(new Event('change', {bubbles:true}));
          } catch {}
          return true;
        }
      }
      return false;
    }
 
    async function changeStatus(target, attempt = 1){
      const controls = await waitForControls(20000);
      const sel = controls.select;
      if (!sel){
        console.log('⚠️ statusListCombo not found (kể cả trong iframe).');
        return;
      }
 
      const ok = pickOption(sel, target);
      if (!ok){
        console.log(`❌ Status "${target}" not found in dropdown.`);
        if (attempt === 1){
          console.log('📋 Options:', Array.from(sel.options || []).map(o => ({value:o.value, text:o.textContent.trim()})));
        }
        return;
      }
 
      const btn = controls.submit;
      if (btn){
        setTimeout(() => {
          btn.click();
          console.log(`✅ Status changed to "${target}" at ${hhmm()}`);
          setTimeout(() => verifyStatus(target, attempt), 3000);
        }, Math.random() * 3000);
      } else {
        console.log('ℹ️ No submit button found (maybe auto-save).');
        setTimeout(() => verifyStatus(target, attempt), 2000);
      }
    }
 
    function verifyStatus(expected, attempt = 1){
      const {select: sel} = findControls();
      if (!sel){
        console.log('⚠️ Cannot verify status: statusListCombo not found.');
        return;
      }
      const curVal  = (sel.options[sel.selectedIndex]?.value || '').trim();
      const curText = (sel.options[sel.selectedIndex]?.textContent || '').trim();
      const ok = norm(curVal) === norm(expected) || norm(curText) === norm(expected);
 
      if (ok){
        console.log(`✅ Status verified as "${expected}".`);
      } else if (attempt < MAX_RETRY){
        console.log(`🔁 Status mismatch (value="${curVal}", text="${curText}"). Retrying ${attempt+1}/${MAX_RETRY}...`);
        changeStatus(expected, attempt + 1);
      } else {
        console.log(`❌ Failed to set "${expected}" after ${MAX_RETRY} attempts.`);
      }
    }
 
    function shouldFireSlot(slotTime){
      const now = Date.now();
      if (lastFiredSlot === slotTime && (now - lastFiredAtMs) < 3 * 60 * 1000) return false;
      lastFiredSlot = slotTime;
      lastFiredAtMs = now;
      return true;
    }
 
    function tick(){
      if (!isWeekday()) return;
      const now = new Date();
      const nowHHMM = hhmm();
      console.log(`⏰ Checking schedule at ${nowHHMM}...`);
 
      for (const time in schedule){
        const [h, m] = time.split(':').map(Number);
        const t = new Date(); t.setHours(h, m, 0, 0);
        const diff = Math.abs(now - t) / 60000;
        if (diff <= 2){
          if (!shouldFireSlot(time)) {
            console.log(`⏭️ Already handled slot ${time} recently, skipping.`);
            break;
          }
          const target = schedule[time];
          changeStatus(target);
          break;
        }
      }
    }
 
    const badge = document.createElement('div');
    badge.id = 'autoStatusBadge';
    badge.textContent = '⏳ Auto Status: Waiting...';
    Object.assign(badge.style, {
      position: 'fixed',
      bottom: '10px',
      left: '10px',
      background: '#222',
      color: '#ff0',
      padding: '6px 10px',
      fontSize: '12px',
      fontFamily: 'Arial,sans-serif',
      borderRadius: '5px',
      zIndex: 2147483647,
      cursor: 'pointer',
      boxShadow: '0 0 5px rgba(0,0,0,0.3)'
    });
    badge.onclick = () => {
      if (intervalId){
        clearInterval(intervalId); intervalId = null;
        badge.textContent = '🔴 Auto Status: OFF';
        badge.style.color = '#f00';
        console.log('⛔ Auto-status script stopped.');
      } else {
        tick();
        intervalId = setInterval(tick, 60000);
        badge.textContent = '🟢 Auto Status: ON';
        badge.style.color = '#0f0';
        console.log('✅ Auto-status script resumed.');
      }
    };
    document.body.appendChild(badge);
 
    const delay = (60 - new Date().getSeconds()) * 1000;
    console.log(`⏳ Waiting ${Math.round(delay/1000)}s to align with the next full minute...`);
    setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60000);
      badge.textContent = '🟢 Auto Status: ON';
      badge.style.color = '#0f0';
      console.log('✅ Auto-status script started and synchronized.');
    }, delay);
  });
})();
