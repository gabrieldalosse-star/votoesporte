/* Censo V3: relatório semanal e mensal. Sem gravar dados pessoais localmente. */
(() => {
  function init() {
    const mode = document.getElementById('report-period-type');
    const week = document.getElementById('report-week');
    const monthWrap = document.getElementById('report-month-wrap');
    const weekWrap = document.getElementById('report-week-wrap');
    if (!mode || !week || !monthWrap || !weekWrap) return;
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
    const day = d.getUTCDay() || 7;d.setUTCDate(d.getUTCDate()+4-day);
    const y=d.getUTCFullYear();const jan1=new Date(Date.UTC(y,0,1));
    const w=Math.ceil((((d-jan1)/86400000)+1)/7);
    week.value=`${y}-W${String(w).padStart(2,'0')}`;
    function sync(){const weekly=mode.value==='week';weekWrap.hidden=!weekly;monthWrap.hidden=weekly;}
    mode.addEventListener('change',sync);sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
