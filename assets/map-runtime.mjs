let pending;
export function ensureMapLibrary() {
  if (window.L) return Promise.resolve(window.L);
  if (pending) return pending;
  pending=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const finish=error=>{clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();pending=null;reject(error);}else resolve(window.L);};
    const timer=setTimeout(()=>finish(new Error('O mapa demorou para carregar. Tente novamente.')),10000);
    script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.crossOrigin='';
    script.onload=()=>finish(window.L?null:new Error('Biblioteca do mapa indisponível.'));
    script.onerror=()=>finish(new Error('Não foi possível carregar a biblioteca do mapa.'));
    document.head.appendChild(script);
  });
  return pending;
}
