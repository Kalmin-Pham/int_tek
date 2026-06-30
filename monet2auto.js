(function bootstrap() {
  'use strict';

  function runInTopWindow() {
    const source = `(${main.toString()})();`;

    try {
      if (window.top && window.top !== window) {
        window.top.eval(source);
        return;
      }
    } catch (e) {}

    main();
  }

  function main() {
    'use strict';

    const activityMap = {
      "TK_Available-Cases": "TK_Cases",
      "TK_Break scheduled": "TK_Break",
      "TK_Lunch scheduled": "TK_Lunch",
    };

    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

    const to24HourTime = (value) => {
      const match = clean(value).match(/(?:\d{1,2}\/\d{1,2}\/\d{4}\s+)?(\d{1,2}):(\d{2})\s*([AP]M)/i);
      if (!match) return '';

      let hour = Number(match[1]);
      const minute = match[2];
      const ampm = match[3].toUpperCase();

      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;

      return `${String(hour).padStart(2, '0')}:${minute}`;
    };

    function onReady(fn){
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn, {once:true});
      } else {
        fn();
      }
    }

    function getDocuments(doc = document) {
      const docs = [doc];

      for (const frame of doc.querySelectorAll('iframe')) {
        try {
          if (frame.contentDocument) docs.push(...getDocuments(frame.contentDocument));
        } catch (e) {}
      }

      return docs;
    }

    function captureSchedule() {
      const scheduleGrid = getDocuments()
        .flatMap((doc) => [...doc.querySelectorAll('[role="grid"]')])
        .find((grid) => {
          const headers = [...grid.querySelectorAll('[role="columnheader"]')]
            .map((cell) => clean(cell.textContent));

          return headers.includes('Time') &&
            headers.includes('Activity') &&
            headers.includes('Duration');
        });

      if (!scheduleGrid) return null;

      const headers = [...scheduleGrid.querySelectorAll('[role="columnheader"]')]
        .map((cell) => clean(cell.textContent));

      const timeIndex = headers.indexOf('Time');
      const activityIndex = headers.indexOf('Activity');
      const schedule = {};

      [...scheduleGrid.querySelectorAll('[role="row"]')]
        .filter((row) => row.querySelector('[role="gridcell"]'))
        .forEach((row) => {
          const cells = [...row.querySelectorAll('[role="gridcell"]')]
            .map((cell) => clean(cell.textContent));

          const time = to24HourTime(cells[timeIndex] || '');
          const activity = activityMap[cells[activityIndex]];

          if (time && activity) schedule[time] = activity;
        });

      return schedule;
    }

    function openTimeRecordTab() {
      const target = [...document.querySelectorAll('a, button, [role="link"], [role="tab"]')]
        .find((el) =>
          clean(el.textContent) === 'Time Record' ||
          clean(el.getAttribute('aria-label')) === 'Time Record' ||
          clean(el.getAttribute('title')) === 'Time Record'
        );

      if (!target) return false;
      target.click();
      return true;
    }

    function waitForTimeRecordControls(timeout = 30000) {
      return new Promise((resolve) => {
        const start = Date.now();

        (function poll() {
          const found = getDocuments().some((doc) =>
            doc.getElementById('activity') ||
            doc.getElementById('startActivityButton') ||
            doc.getElementById('endShiftButton')
          );

          if (found) return resolve(true);
          if (Date.now() - start > timeout) return resolve(false);
          setTimeout(poll, 500);
        })();
      });
    }

    function formatSchedule(schedule) {
      return Object.entries(schedule)
        .map(([time, activity]) => `"${time}" : "${activity}"`)
        .join(',\n');
    }

    function startAutoStatus(capturedSchedule) {
      onReady(() => {
        if (window.autoStatusScriptRunning || document.getElementById('autoStatusBadge')) {
          console.log('Auto-status already initialized.');
          return;
        }
        window.autoStatusScriptRunning = true;

        let intervalId = null;
        const MAX_RETRY = 3;
        const END_SHIFT_TIME = '17:00';
        const END_SHIFT_RETRY_MS = 30 * 1000;
        let lastFiredSlot = null;
        let lastFiredAtMs = 0;
        let endShiftDoneDate = null;
        let endShiftRetryTimer = null;
        let endShiftInProgress = false;

        const schedule = capturedSchedule;

        const norm = s => String(s || '').replace(/\s+/g,' ').trim().toLowerCase();
        const hhmm = () => new Date().toTimeString().slice(0,5);
        const ymd = () => {
          const d = new Date();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${d.getFullYear()}-${mm}-${dd}`;
        };

        function scanDocuments(visitor){
          const result = visitor(document, window);
          if (result) return result;

          for (const fr of document.querySelectorAll('iframe')){
            try{
              const w = fr.contentWindow;
              const d = fr.contentDocument || w?.document;
              if (!d) continue;
              const framedResult = visitor(d, w || d.defaultView || window);
              if (framedResult) return framedResult;
            }catch(e){}
          }
          return null;
        }

        function findControls(){
          const found = scanDocuments((doc) => {
            const select = doc.getElementById('activity');
            const submit = doc.getElementById('startActivityButton');
            if (select || submit) return {doc, select, submit};
            return null;
          });
          return found || {doc:document, select:null, submit:null};
        }

        function findEndShiftButton(){
          return scanDocuments((doc, win) => {
            const button = doc.getElementById('endShiftButton');
            if (button) return {doc, win, button};
            return null;
          });
        }

        function waitForControls(timeout = 20000){
          return new Promise(resolve => {
            const start = Date.now();
            (function poll(){
              const r = findControls();
              if (r.select || r.submit) return resolve(r);
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
            if(nowHHMM === time){
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
    }

    onReady(async () => {
      const capturedSchedule = captureSchedule();

      if (!capturedSchedule || Object.keys(capturedSchedule).length === 0) {
        console.warn('Schedule grid not found. Run this from the Schedule tab, or switch DevTools to a context that can access the schedule iframe.');
        return;
      }

      console.log('Captured schedule:');
      console.log(formatSchedule(capturedSchedule));

      if (!openTimeRecordTab()) {
        console.warn('Time Record tab not found.');
        return;
      }

      const ready = await waitForTimeRecordControls();
      if (!ready) {
        console.warn('Time Record controls not found after opening the tab.');
        return;
      }

      startAutoStatus(capturedSchedule);
    });
  }

  runInTopWindow();
})();
