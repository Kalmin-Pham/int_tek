https://wfo.a72.verintcloudservices.com/wfo/control/signin

const now = new Date();
const target = new Date();
 
target.setHours(17, 0, 0, 0);
 
if (now <= target) {
  setTimeout(() => {
    document.getElementById("endShiftButton")?.click();
  }, target - now);
}
