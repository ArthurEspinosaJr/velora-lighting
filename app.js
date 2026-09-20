const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const models = {mora: {name:'Mora', index:'01', description:'A soft dome, tapered stem, and circular plinth.'}, arc: {name:'Arc', index:'02', description:'A broad, shallow disc balanced on a curved stem.'}, column: {name:'Column', index:'03', description:'A ribbed cylindrical shade with a compact base.'}};
const finishes = {chalk:'Chalk',ember:'Ember',ink:'Ink'};
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const state = {model:'mora',finish:'chalk',brightness:70,paused:motionQuery.matches};
let viewer = null;

function sync() {
  $('#current-model').innerHTML = `${models[state.model].name} <span>Table light</span>`;
  $('#model-number').textContent = models[state.model].index;
  $('.stage-index').textContent = `${models[state.model].index} / 03`;
  $('#finish-name').textContent = finishes[state.finish];
  $('#brightness-value').textContent = `${state.brightness}%`;
  $('#lamp-canvas').setAttribute('aria-label',`Interactive 3D ${models[state.model].name} table lamp in ${finishes[state.finish]}. Drag horizontally to rotate, or use the rotate buttons below.`);
  $$('[data-model]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.model===state.model)));
  $$('[data-finish]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.finish===state.finish)));
  $('#pause-motion').setAttribute('aria-pressed',String(state.paused));
  $('#pause-motion').setAttribute('aria-label',state.paused?'Play automatic rotation':'Pause automatic rotation');
  $('#pause-icon').textContent = state.paused?'▷':'Ⅱ';
  if(motionQuery.matches){$('#pause-motion').disabled=true;$('#pause-motion').setAttribute('aria-label','Automatic rotation disabled by reduced motion preference');}
  else if($('#stage').dataset.ready==='true'){$('#pause-motion').disabled=false;}
  $('#brief-model').textContent = models[state.model].name;
  $('#brief-finish').textContent = `${finishes[state.finish]} · ${state.brightness}% glow`;
}
function chooseModel(key) {state.model=key;viewer?.setModel(key);sync();$('#viewer-status').textContent=`${models[key].name} selected. ${models[key].description}`;}
$$('[data-model]').forEach(button=>button.addEventListener('click',()=>chooseModel(button.dataset.model)));
$$('[data-select]').forEach(button=>button.addEventListener('click',()=>{chooseModel(button.dataset.select);$('#showroom').scrollIntoView({behavior:motionQuery.matches?'instant':'smooth'});$(`[data-model="${state.model}"]`).focus({preventScroll:true});}));
$$('[data-finish]').forEach(button=>button.addEventListener('click',()=>{state.finish=button.dataset.finish;viewer?.setFinish(state.finish);sync();$('#viewer-status').textContent=`${finishes[state.finish]} finish selected.`;}));
$('#brightness').addEventListener('input',e=>{state.brightness=Number(e.target.value);viewer?.setBrightness(state.brightness);sync();});
$('#rotate-left').addEventListener('click',()=>viewer?.rotateBy(-.45));
$('#rotate-right').addEventListener('click',()=>viewer?.rotateBy(.45));
$('#reset-view').addEventListener('click',()=>viewer?.reset());
$('#pause-motion').addEventListener('click',()=>{state.paused=!state.paused;viewer?.setPaused(state.paused);sync();});
motionQuery.addEventListener('change',e=>{state.paused=e.matches;viewer?.setPaused(state.paused);sync();});

const dialog=$('#brief-dialog');
$$('[data-open-brief]').forEach(button=>button.addEventListener('click',()=>{sync();$('#download-status').textContent='';dialog.showModal();}));
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
$('#download-brief').addEventListener('click',()=>{
  const content = ['VELORA — Your lighting concept','Light, thoughtfully shaped.','',`Design: ${models[state.model].name}`,`Form: ${models[state.model].description}`,`Finish: ${finishes[state.finish]}`,`Glow: ${state.brightness}%`,`Space: ${$('#room').value}`,'','Explore the 3D studio: https://arthurespinosajr.github.io/velora-lighting/','','VELORA is a fictional design concept. This is an inspiration brief, not an order or product specification. No personal details have been collected.','Website concept by QuoteForge.'].join('\r\n');
  const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`velora-${state.model}-concept.txt`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('#download-status').textContent='Your concept is ready. Check your downloads.';
});

if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.08});
  $$('.reveal').forEach(el=>observer.observe(el));
  document.documentElement.classList.add('enhanced');
}
function fallback(){
  viewer?.dispose();viewer=null;
  $('#stage').dataset.ready='false';
  $('#loader').hidden=true;$('#lamp-canvas').hidden=true;$('.stage-fallback').hidden=false;
  $('.drag-hint').textContent='3D preview unavailable on this device';$('.stage-caption').textContent='THE VELORA COLLECTION';
  $$('.viewer-toolbar button').forEach(button=>button.disabled=true);
  $('#viewer-status').textContent='The 3D preview is unavailable. You can still choose a design and create a lighting brief.';
}
sync();
try {
  const {createLampViewer}=await import('./lamp-viewer.mjs');
  viewer=createLampViewer($('#lamp-canvas'),{onReady:()=>{$('#loader').hidden=true;$('#lamp-canvas').hidden=false;$('.stage-fallback').hidden=true;$('#stage').dataset.ready='true';$('.drag-hint').textContent='↔  Drag to explore';$('.stage-caption').textContent='LIVE 3D STUDIO';$$('.viewer-toolbar button').forEach(button=>button.disabled=false);sync();},onError:fallback});
  if(viewer){viewer.setModel(state.model);viewer.setFinish(state.finish);viewer.setBrightness(state.brightness);viewer.setPaused(state.paused);}else fallback();
}catch(error){console.error('3D preview unavailable',error);fallback();}
