(function(global){
 'use strict';
 function normalizeGuid(value){
  let text=String(value??'').trim();
  if(text.startsWith('{')&&text.endsWith('}'))text=text.slice(1,-1);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)?text.toLowerCase():null;
 }
 function configuredGuid(encoded){
  if(typeof encoded!=='string'||!encoded)return null;
  try{return normalizeGuid(atob(encoded));}catch{return null;}
 }
 function matchesGuid(value,encoded){
  const actual=normalizeGuid(value),expected=configuredGuid(encoded);
  return !!actual&&!!expected&&actual===expected;
 }
 global.CMHS_INVITATION={normalizeGuid,configuredGuid,matchesGuid};
 if(typeof document==='undefined')return;
 const config=global.CMHS_SITE_CONFIG?.beta||{},key=(global.CMHS_CATALOG?.storageKey||'cmhs-studio-v2:public-lpg-v1:')+'consultant-name';
 const screen=document.getElementById('beta-screen'),form=document.getElementById('beta-form'),name=document.getElementById('beta-name'),code=document.getElementById('beta-code'),error=document.getElementById('beta-error');
 const workspace=[document.querySelector('.app-header'),document.querySelector('.workspace')];
 global.CMHS_BETA_LOCKED=!!config.enabled;
 function showWorkspace(){screen.hidden=true;workspace.forEach(e=>e.inert=false);global.CMHS_BETA_LOCKED=false;document.getElementById('canvas').focus();}
 if(!config.enabled){showWorkspace();return;}
 screen.hidden=false;workspace.forEach(e=>e.inert=true);
 try{name.value=localStorage.getItem(key)||'';}catch{/* The gate works without storage. */}
 form.addEventListener('submit',event=>{
  event.preventDefault();error.textContent='';
  if(!name.value.trim()){error.textContent='Enter your name.';name.focus();return;}
  if(!configuredGuid(config.version)){error.textContent='The invitation has not been configured. Please contact the portal owner.';return;}
  if(!matchesGuid(code.value,config.version)){error.textContent='The invitation GUID is not valid.';code.focus();return;}
  try{localStorage.setItem(key,name.value.trim());}catch{/* Optional name preference only. */}
  code.value='';showWorkspace();CMHS_STUDIO.toast('Welcome, '+name.value.trim()+'.');
 });
 name.focus();
})(window);
