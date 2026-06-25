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
        console.log('statusListCombo not found');
        return;
      }

      const ok = pickOption(sel, target);
      if (!ok){
        console.log(`${hhmm()}: Status "${target}" not found in dropdown.`);
        if (attempt === 1){
          console.log('Options:', Array.from(sel.options || []).map(o => ({value:o.value, text:o.textContent.trim()})));
        }
        return;
      }

      const btn = controls.submit;
      if (btn){
        setTimeout(() => {
          btn.click();
          console.log(`${hhmm()}: Status changed to "${target}"`);
          setTimeout(() => verifyStatus(target, attempt), 3000);
        }, Math.random() * 100);
      } else {
        console.log('No submit button found');
        setTimeout(() => verifyStatus(target, attempt), 2000);
      }
    }

    function verifyStatus(expected, attempt = 1){
      const {select: sel} = findControls();
      if (!sel){
        console.log(`${hhmm()}: Cannot verify status: statusListCombo not found.`);
        return;
      }
      const curVal  = (sel.options[sel.selectedIndex]?.value || '').trim();
      const curText = (sel.options[sel.selectedIndex]?.textContent || '').trim();
      const ok = norm(curVal) === norm(expected) || norm(curText) === norm(expected);

      if (ok){
        console.log(`${hhmm()}: Status verified as "${expected}".`);
      } else if (attempt < MAX_RETRY){
        console.log(`${hhmm()}: Status mismatch (value="${curVal}", text="${curText}"). Retrying ${attempt+1}/${MAX_RETRY}...`);
        changeStatus(expected, attempt + 1);
      } else {
        console.log(`${hhmm()}: Failed to set "${expected}" after ${MAX_RETRY} attempts.`);
      }
    }

    function shouldFireSlot(slotTime){
      const now = Date.now();
      if (lastFiredSlot === slotTime && (now - lastFiredAtMs) < 3 * 60 * 1000) return false;
      lastFiredSlot = slotTime;
      lastFiredAtMs = now;
      return true;
    }

    function clickEndShift(attempt = 1){
      if (endShiftInProgress || endShiftDoneDate === ymd()) return;
      endShiftInProgress = true;

      const controls = findEndShiftButton();
      if (!controls || !controls.button){
        endShiftInProgress = false;
        retryEndShift(`endshiftbutton not found`, attempt);
        return;
      }

      const {win, button} = controls;
      if (button.disabled || button.getAttribute('aria-disabled') === 'true'){
        endShiftInProgress = false;
        retryEndShift('endshiftbutton is disabled', attempt);
        return;
      }

      const originalConfirm = win.confirm;
      try {
        win.confirm = function(message){
          console.log(`${hhmm()}: Auto-confirmed end shift popup.`, message || '');
          return true;
        };
        button.click();
        endShiftDoneDate = ymd();
        clearEndShiftRetry();
        console.log(`${hhmm()}: End shift button clicked.`);
      } catch (e) {
        retryEndShift(`endshiftbutton click failed: ${e?.message || e}`, attempt);
      } finally {
        win.confirm = originalConfirm;
        endShiftInProgress = false;
      }
    }

    function retryEndShift(reason, attempt){
      console.log(`${hhmm()}: ${reason}. Retrying end shift in ${END_SHIFT_RETRY_MS / 1000}s (attempt ${attempt + 1}).`);
      clearEndShiftRetry();
      endShiftRetryTimer = setTimeout(() => clickEndShift(attempt + 1), END_SHIFT_RETRY_MS);
    }

    function clearEndShiftRetry(){
      if (endShiftRetryTimer){
        clearTimeout(endShiftRetryTimer);
        endShiftRetryTimer = null;
      }
    }

    function shouldTryEndShift(now){
      if (endShiftDoneDate === ymd()) return false;
      const [h, m] = END_SHIFT_TIME.split(':').map(Number);
      const t = new Date(); t.setHours(h, m, 0, 0);
      return now >= t;
    }

    function tick(){
      const now = new Date();
      const nowHHMM = hhmm();

      if (shouldTryEndShift(now)){
        clickEndShift();
      }

      for (const time in schedule){
        if (nowHHMM === time){
          if (!shouldFireSlot(time)) {
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
    badge.textContent = 'Auto Status: Waiting...';
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
        clearEndShiftRetry();
        badge.textContent = 'Auto Status: OFF';
        badge.style.color = '#f00';
        console.log('Auto-status script stopped.');
      } else {
        tick();
        intervalId = setInterval(tick, 60000);
        badge.textContent = 'Auto Status: ON';
        badge.style.color = '#0f0';
        console.log('Auto-status script resumed.');
      }
    };
    document.body.appendChild(badge);

    const delay = (60 - new Date().getSeconds()) * 1000;
    console.log(`Waiting ${Math.round(delay/1000)}s to align with the next full minute`);
    setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60000);
      badge.textContent = 'Auto Status: ON';
      badge.style.color = '#0f0';
      console.log('Auto-status script started and synchronized.');
    }, delay);
  });
})();
