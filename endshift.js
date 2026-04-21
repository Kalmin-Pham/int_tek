https://wfo.a72.verintcloudservices.com/wfo/control/signin


(function () {
  const now = new Date();
  const target = new Date();

  // Set target to 5:00 PM today
  target.setHours(17, 0, 0, 0);

  // If it's already past 5 PM, do nothing
  if (now >= target) {
    console.log("It's already past 5 PM. Script will not run.");
    return;
  }

  const delay = target - now;

  console.log(`Will click #submit in ${Math.round(delay / 1000)} seconds`);

  setTimeout(() => {
    const btn = document.getElementById("endShiftButton");
    if (btn) {
      btn.click();
      console.log("Button clicked at 5 PM!");
    } else {
      console.log("Button with ID 'submit' not found.");
    }
  }, delay);
})();
