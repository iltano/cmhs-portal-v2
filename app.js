(function () {
  'use strict';
  const {NetworkDocument,History,parseXML,serialize,child,children}=CMHS;
  const data=window.CMHS_CATALOG;
  const $=id=>document.getElementById(id);
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
  const svg=(tag,attrs={})=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e;};
  const button=(text,fn,cls='')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
  const color={producer:'#158a70',processor:'#5174ca',consumer:'#b58332'};
  const symbols={producer:'↗',processor:'◇',consumer:'↘'};
  const W=196,H=94,SX=2,SY=1.8;
  let networks=data.networks.map(n=>({...n,originalXML:n.xml}));
  let activeId=null,model=null,history=new History(),selection=null,tab='networks',role='all',tool='select',pending=null;
  let pointerPosition=null;
  let view={x:30,y:40,z:.75},drag=null,toastTimer,saveTimer,hubXML=data.hub.xml,hubFilename=data.hub.filename||'main.mhc',hubActive=false,removedHubKeys=new Set(),customTemplates=[],workspaceTemplates=[],persistOK=true;
  const drafts=new Map();
  const store={
    prefix:data.storageKey||'cmhs-studio-v2:public-lpg-v1:',
    get(key,fallback){try{const v=localStorage.getItem(this.prefix+key);return v?JSON.parse(v):fallback;}catch{return fallback;}},
    put(key,value){try{localStorage.setItem(this.prefix+key,JSON.stringify(value));return true;}catch{return false;}}
  };
  function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?6500:3600);}
  function perform(fn,{panel=true}={}){
    if(!model)return;
    const before=model.toXML();
    try{
      const result=fn();
      const after=model.toXML();
      if(before!==after){history.record(before);saveDraft();}
      renderGraph();renderHeader();if(panel)renderInspector();renderCatalog();return {ok:true,result};
    }catch(error){model=new NetworkDocument(before,model.filename);toast(error.message,true);renderGraph();renderInspector();return {ok:false,error};}
  }
  function saveDraft(){
    const n=networks.find(n=>n.id===activeId);if(!n)return;
    n.xml=model.toXML();n.name=model.name;n.filename=model.filename;n.description=model.description;n.nodeCount=model.nodes.length;n.connectionCount=model.edges.length;
    drafts.set(activeId,{id:activeId,name:n.name,filename:model.filename,xml:n.xml,imported:!!n.imported,hubManaged:!!n.hubManaged,hubKey:n.hubKey||null});
    if(n.hubManaged)persistConfigurationNetworks();
    $('save-status').textContent='Saving draft…';clearTimeout(saveTimer);
    saveTimer=setTimeout(flushDrafts,250);
  }
  function flushDrafts(){
    clearTimeout(saveTimer);persistOK=store.put('drafts',[...drafts.values()]);
    $('save-status').textContent=persistOK?'● Draft saved in this browser':'Draft not saved — export to keep changes';
  }
  const registrationKey=(filename,name)=>`${String(filename||'').toLowerCase()}\u0000${String(name||'')}`;
  function persistHubState(){return store.put('hub-state',{xml:hubXML,filename:hubFilename,active:hubActive,removed:[...removedHubKeys]});}
  function managedNetworks(){return networks.filter(network=>network.hubManaged);}
  function persistConfigurationNetworks(){return store.put('configuration-networks',managedNetworks().map(network=>({id:network.id,filename:network.filename,name:network.name,xml:network.xml,description:network.description,nodeCount:network.nodeCount,connectionCount:network.connectionCount,imported:!!network.imported,hubManaged:true,hubKey:network.hubKey||null})));}
  function synchronizeHub(){
    const doc=parseXML(hubXML);if(doc.documentElement.tagName!=='messagehub')throw new Error('The hub configuration root must be messagehub.');
    let list=child(doc.documentElement,'networks');
    if(!list){list=doc.createElement('networks');doc.documentElement.append(list);}
    [...list.childNodes].filter(node=>node.nodeType===3&&!node.textContent.trim()).forEach(node=>node.remove());
    const managed=managedNetworks(),keys=new Set([...removedHubKeys,...managed.map(network=>network.hubKey).filter(Boolean)]);
    children(list,'network').filter(entry=>keys.has(registrationKey(entry.getAttribute('filename'),entry.getAttribute('name')))).forEach(entry=>entry.remove());
    managed.forEach(network=>{const entry=doc.createElement('network');entry.setAttribute('filename',network.filename);entry.setAttribute('name',network.name);list.append(entry);network.hubKey=registrationKey(network.filename,network.name);const draft=drafts.get(network.id);if(draft)draft.hubKey=network.hubKey;});
    removedHubKeys.clear();hubXML=CMHS.serializeDocument(doc);persistHubState();persistConfigurationNetworks();return hubXML;
  }
  function configurationDocuments(){return hubActive&&networks.find(network=>network.id===activeId)?.hubManaged?managedNetworks().map(network=>({id:network.id,filename:network.filename,xml:network.id===activeId?model.toXML():network.xml})):null;}
  function configurationExport(){if(!configurationDocuments())return null;return {filename:hubFilename,xml:synchronizeHub()};}
  function uniqueNetworkName(value,exceptId=null){
    const base=String(value||'NewNetwork').trim()||'NewNetwork';let name=base,index=2;
    while(networks.some(network=>network.id!==exceptId&&network.name===name))name=`${base}_${index++}`;
    return name;
  }
  function addNetwork(xml,filename,options={}){
    const document=new NetworkDocument(xml,filename),requested=options.name||document.name;
    if(options.hubManaged&&managedNetworks().some(network=>network.name===requested))throw new Error(`The configuration already contains a network named “${requested}”.`);
    const name=options.hubManaged?requested:uniqueNetworkName(requested),renamed=name!==document.name;if(renamed)document.renameNetwork(name);
    document.filename=renamed?`${name}.mhn`:filename;
    const id=options.id||`import:${Date.now()}:${filename}:${networks.length}`,network={id,filename:document.filename,name:document.name,xml:document.toXML(),description:document.description,nodeCount:document.nodes.length,connectionCount:document.edges.length,imported:true,hubManaged:!!options.hubManaged,hubKey:options.hubKey||null};
    networks.push(network);if(!network.hubManaged)drafts.set(id,{...network});return network;
  }
  function openNetwork(id){
    const network=networks.find(n=>n.id===id);if(!network)return;
    if(saveTimer)flushDrafts();
    try{const next=new NetworkDocument(network.xml,network.filename||network.id);activeId=id;model=next;history=new History();selection=null;pending=null;setTool('select');store.put('active',id);renderAll();requestAnimationFrame(()=>fit());}
    catch(error){toast(error.message,true);}
  }
  function renderHeader(){
    if(!model)return;
    $('network-title').textContent=model.name;
    $('network-family').textContent=(model.name.match(/^\d+/)?.[0]||'CUSTOM')+' / MESSAGE HUB NETWORK';
    $('network-description').textContent=model.description||'Select an element to inspect its settings, or add one from the library.';
    $('graph-stats').textContent=`${model.nodes.length} elements · ${model.edges.length} connections`;
    $('undo-btn').disabled=!history.past.length;$('redo-btn').disabled=!history.future.length;
    const errors=model.issues().filter(i=>i.level==='error');
    $('issues-btn').classList.toggle('has-errors',errors.length>0);$('issues-btn').textContent=errors.length?`! ${errors.length} issue${errors.length===1?'':'s'}`:'✓ Check network';
    $('export-configuration-btn').disabled=!configurationDocuments();
    $('unload-configuration-btn').hidden=!hubActive;
    window.CMHS_V2?.updateToolbar();
    if(!drafts.has(activeId))$('save-status').textContent='Original file · edits create a local draft';
    else $('save-status').textContent=persistOK?'● Draft saved in this browser':'Export to keep changes';
  }
  function setTab(next){tab=next;$('networks-tab').classList.toggle('active',tab==='networks');$('library-tab').classList.toggle('active',tab==='library');$('networks-tab').setAttribute('aria-selected',tab==='networks');$('library-tab').setAttribute('aria-selected',tab==='library');$('catalog-search').value='';$('catalog-search').placeholder=tab==='networks'?'Search networks…':'Find a type or setting…';$('library-filter').hidden=tab!=='library';renderCatalog();}
  function renderCatalog(){
    $('network-total').textContent=networks.length;$('type-total').textContent=data.definitions.length;
    const list=$('catalog-list');list.replaceChildren();const q=$('catalog-search').value.toLowerCase().trim();
    if(tab==='networks'){
      const filtered=networks.filter(n=>(n.name+' '+n.description).toLowerCase().includes(q));
      const addItem=(n,configuration=false)=>{const b=button('',()=>openNetwork(n.id),'network-item'+(n.id===activeId?' active':'')+(configuration?' configuration-network':''));b.title=n.name+'\n'+n.description;b.oncontextmenu=event=>{event.preventDefault();networkContextMenu(event,n.id);};const row=el('div','item-row');row.append(el('span','network-icon','⌘'),el('strong','',n.name));if(configuration)row.append(el('span','configuration-badge','CONFIG'));if(drafts.has(n.id))row.append(el('span','draft-dot'));b.append(row,el('small','',configuration?`${hubFilename} · ${n.nodeCount} elements`:`${n.name.match(/^\d+/)?.[0]||'CMHS'} · ${n.nodeCount} elements`));list.append(b);};
      const configurationNetworks=filtered.filter(n=>n.hubManaged);
      if(configurationNetworks.length){list.append(el('div','catalog-group',`Open configuration · ${hubFilename}`));configurationNetworks.forEach(n=>addItem(n,true));}
      const groups=[['Imports',n=>/^91/.test(n.name)],['Exports',n=>/^92/.test(n.name)],['Actions & services',n=>!/^9[12]/.test(n.name)]];
      groups.forEach(([title,test])=>{
        const items=filtered.filter(n=>!n.hubManaged&&test(n));if(!items.length)return;list.append(el('div','catalog-group',title));
        items.forEach(n=>addItem(n));
      });
      if(!filtered.length)list.append(el('p','empty-result','No matching networks. Import .mhn files, import a configuration, or create a new network.'));
    }else{
      const defs=data.definitions.filter(d=>(role==='all'||d.role===role)&&(d.typename+' '+d.module+' '+Object.keys(d.parameters).join(' ')).toLowerCase().includes(q));
      list.append(el('div','catalog-group','From your CMHS files'));
      defs.forEach(d=>{const b=button('',()=>showDefinition(d),'library-card');b.draggable=true;b.title='Drag to canvas to use the first example, or click to choose an example.';b.ondragstart=e=>{e.dataTransfer.setData('application/x-cmhs-template',JSON.stringify(data.instances.find(i=>i.id===d.instanceIds[0])));e.dataTransfer.effectAllowed='copy';};b.append(el('span','role-pill '+d.role,d.role),el('strong','',d.typename),el('small','',`${d.instanceIds.length} examples · ${Object.keys(d.parameters).length} settings`));list.append(b);});
      const saved=customTemplates.filter(t=>(role==='all'||t.role===role)&&(t.name+' '+t.typename).toLowerCase().includes(q));
      const workspace=workspaceTemplates.filter(t=>(role==='all'||t.role===role)&&(t.name+' '+t.typename+' '+t.network).toLowerCase().includes(q));
      if(workspace.length)list.append(el('div','catalog-group','Workspace network library'));
      workspace.forEach(t=>{const b=button('',()=>addTemplate(t),'library-card');b.draggable=true;b.ondragstart=e=>{e.dataTransfer.setData('application/x-cmhs-template',JSON.stringify(t));e.dataTransfer.effectAllowed='copy';};b.append(el('span','role-pill '+t.role,t.role),el('strong','',t.name),el('small','',`${t.network} · ${t.typename}`));list.append(b);});
      if(saved.length)list.append(el('div','catalog-group','My templates'));
      saved.forEach(t=>{const b=button('',()=>addTemplate(t),'library-card');b.draggable=true;b.ondragstart=e=>{e.dataTransfer.setData('application/x-cmhs-template',JSON.stringify(t));e.dataTransfer.effectAllowed='copy';};b.append(el('span','role-pill '+t.role,t.role),el('strong','',t.name),el('small','','Saved template · '+t.typename));list.append(b);});
      if(!defs.length&&!saved.length&&!workspace.length)list.append(el('p','empty-result','No matching element types.'));
    }
  }
  function worldPos(n){const p=model.position(n);return{x:p.x*SX+40,y:p.y*SY+40};}
  function setView(){ $('viewport').setAttribute('transform',`translate(${view.x} ${view.y}) scale(${view.z})`);$('zoom-value').textContent=Math.round(view.z*100)+'%';$('dots').setAttribute('patternTransform',`translate(${view.x%24} ${view.y%24})`);renderPendingConnection();}
  function edgePath(from,to){
    const a=worldPos(from),b=worldPos(to);const x1=a.x+W,y1=a.y+H/2,x2=b.x,y2=b.y+H/2;
    if(from===to)return `M ${x1} ${y1} C ${x1+75} ${y1-140}, ${x2-75} ${y2-140}, ${x2} ${y2}`;
    const offset=Math.max(45,Math.abs(x2-x1)*.48);return `M ${x1} ${y1} C ${x1+offset} ${y1}, ${x2-offset} ${y2}, ${x2} ${y2}`;
  }
  function renderGraph(){
    if(!model)return;
    $('edges').replaceChildren();$('nodes').replaceChildren();
    model.edges.forEach((edge,index)=>{
      const a=model.node(edge.getAttribute('producer')),b=model.node(edge.getAttribute('consumer'));if(!a||!b)return;
      const selected=selection?.kind==='edge'&&selection.index===index;
      const g=svg('g',{class:'edge'+(selected?' selected':''),'data-edge':index});const d=edgePath(a,b);
      g.append(svg('path',{d,class:'edge-hit'}),svg('path',{d,class:'edge-line','marker-end':`url(#${selected?'arrow-selected':'arrow'})`}));
      g.addEventListener('pointerdown',e=>{e.stopPropagation();selection={kind:'edge',index};pending=null;renderGraph();renderInspector();});
      $('edges').append(g);
    });
    model.nodes.forEach(n=>{
      const name=n.getAttribute('name'),p=worldPos(n),r=n.tagName,typename=n.getAttribute('typename'),selected=(selection?.kind==='node'&&selection.name===name)||(selection?.kind==='nodes'&&selection.names.includes(name));
      const g=svg('g',{class:'node'+(selected?' selected':''),'data-node':name,transform:`translate(${p.x} ${p.y})`,tabindex:'0',role:'button','aria-label':`${name}, ${r}, ${typename}`});
      const title=svg('title');title.textContent=name+'\n'+typename+'\n'+(child(n,'comment')?.textContent||'');g.append(title);
      g.append(svg('rect',{width:W,height:H,rx:9,class:'node-bg'}),svg('rect',{x:12,y:12,width:25,height:25,rx:7,fill:color[r]+'14'}));
      const icon=svg('text',{x:24.5,y:29,'text-anchor':'middle',fill:color[r],'font-size':17});icon.textContent=symbols[r];g.append(icon);
      const roleText=svg('text',{x:46,y:22,fill:color[r],class:'node-role'});roleText.textContent=r.toUpperCase();g.append(roleText);
      const titleText=svg('text',{x:46,y:36,class:'node-title'});titleText.textContent=truncate(name,20);g.append(titleText);
      const typeText=svg('text',{x:13,y:57,class:'node-type'});typeText.textContent=truncate(typename,30);g.append(typeText);
      const comment=svg('text',{x:13,y:77,class:'node-comment'});comment.textContent=truncate((child(n,'comment')?.textContent||'').replace(/-\s*\n\s*/g,'').replace(/\s+/g,' ').trim(),30)||`${model.parameters(name).length} parameters`;g.append(comment);
      if(r!=='producer')g.append(port(name,'in',0,H/2));if(r!=='consumer')g.append(port(name,'out',W,H/2));
      g.addEventListener('pointerdown',e=>nodePointerDown(e,name));
      g.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();window.CMHS_V2?.contextMenu(e,name);});
      g.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const r=g.getBoundingClientRect();window.CMHS_V2?.contextMenu({clientX:r.left+20,clientY:r.top+20},name);}});
      g.addEventListener('keydown',e=>{if(e.key==='Enter'){selection={kind:'node',name};renderGraph();renderInspector();}});
      $('nodes').append(g);
    });
    $('empty-canvas').hidden=model.nodes.length>0;setView();window.CMHS_V2?.updateToolbar();
    renderPendingConnection();
  }
  function truncate(v,n){return String(v||'').length>n?String(v).slice(0,n-1)+'…':String(v||'');}
  function renderPendingConnection(){
    const edge=$('pending-edge'),source=pending&&model?.node(pending);
    edge.toggleAttribute('hidden',!source);edge.style.display=source?'':'none';
    if(!source)return;
    const p=worldPos(source),r=$('canvas').getBoundingClientRect(),point=pointerPosition||{x:r.left+view.x+(p.x+W+35)*view.z,y:r.top+view.y+(p.y+H/2)*view.z};
    const x=(point.x-r.left-view.x)/view.z,y=(point.y-r.top-view.y)/view.z,offset=Math.max(45,Math.abs(x-p.x-W)*.48);
    edge.setAttribute('d',`M${p.x+W} ${p.y+H/2} C${p.x+W+offset} ${p.y+H/2},${x-offset} ${y},${x} ${y}`);
  }
  function port(name,side,x,y){const p=svg('circle',{cx:x,cy:y,r:5,class:'port','data-port':side,'aria-label':`${name} ${side==='out'?'output':'input'} port`});p.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();if(side==='out'){pending=name;pointerPosition={x:e.clientX,y:e.clientY};$('canvas-hint').textContent='Now click a destination input port · Esc to cancel';renderGraph();}else if(pending)completeConnection(name);else toast('Choose a source output port first.');});return p;}
  function completeConnection(to){const from=pending;if(!from)return;perform(()=>{const index=model.connect(from,to);selection={kind:'edge',index};pending=null;});setHint();}
  function setHint(){$('canvas-hint').textContent=pending?'Choose a destination input port · Esc to cancel':tool==='connect'?'Click a source, then a destination · Esc to cancel':'Drag elements · Drag background to pan · Scroll to zoom';}
  function setTool(next){tool=next;pending=null;$('select-tool').classList.toggle('active',next==='select');$('connect-tool').classList.toggle('active',next==='connect');$('canvas').classList.toggle('connecting',next==='connect');setHint();if(model)renderGraph();}
  function nodePointerDown(e,name){
    if(e.button!==0)return;e.stopPropagation();
    if(tool==='connect'){if(pending)completeConnection(name);else if(model.node(name).tagName!=='consumer'){pending=name;pointerPosition={x:e.clientX,y:e.clientY};setHint();renderGraph();}else toast('Start from a producer or processor.');return;}
    if(e.shiftKey||e.ctrlKey||e.metaKey){const names=new Set(selectedNames());names.has(name)?names.delete(name):names.add(name);setSelectedNames([...names]);return;}
    if(!selectedNames().includes(name))selection={kind:'node',name};
    const members=selectedNames().map(n=>({name:n,...model.position(model.node(n))})),p=model.position(model.node(name));
    drag={kind:'node',name,members,startX:e.clientX,startY:e.clientY,x:p.x,y:p.y,before:model.toXML(),moved:false};

    $('canvas').setPointerCapture(e.pointerId);renderGraph();renderInspector();
  }
  function fit(){
    if(!model||!model.nodes.length){view={x:35,y:35,z:1};setView();return;}
    const ps=model.nodes.map(worldPos),minX=Math.min(...ps.map(p=>p.x))-35,minY=Math.min(...ps.map(p=>p.y))-35,maxX=Math.max(...ps.map(p=>p.x))+W+35,maxY=Math.max(...ps.map(p=>p.y))+H+65;
    const w=$('canvas').clientWidth,h=$('canvas').clientHeight;const z=Math.max(.12,Math.min(1.15,w/(maxX-minX),h/(maxY-minY)));
    view={z,x:(w-(maxX-minX)*z)/2-minX*z,y:(h-(maxY-minY)*z)/2-minY*z};setView();
  }
  function zoom(factor,point){const r=$('canvas').getBoundingClientRect(),p=point||{x:r.width/2,y:r.height/2},wx=(p.x-view.x)/view.z,wy=(p.y-view.y)/view.z;view.z=Math.max(.12,Math.min(2.5,view.z*factor));view.x=p.x-wx*view.z;view.y=p.y-wy*view.z;setView();}
  function field(label,value,onchange,options={}){
    const labelEl=el('label','field');labelEl.append(el('span','',label));let input;
    if(options.choices){input=el('select');options.choices.forEach(choice=>{const o=el('option','',choice.label??choice);o.value=choice.value??choice;input.append(o);});}
    else input=el(options.multiline?'textarea':'input',options.mono?'mono':'');
    if(options.type)input.type=options.type;input.value=value??'';if(options.readonly)input.readOnly=true;
    if(options.placeholder)input.placeholder=options.placeholder;
    input.onchange=()=>onchange(input.value,input);labelEl.append(input);if(options.help)labelEl.append(el('small','',options.help));return labelEl;
  }
  function section(title){const s=el('section','panel-section');s.append(el('h3','',title));return s;}
  function panelHeader(title,subtitle,eyebrow='PROPERTIES'){
    const h=el('div','inspector-header');const top=el('div','eyebrow',eyebrow);const close=button('×',()=>{selection=null;renderGraph();renderInspector();},'quiet mini-button');close.style.float='right';close.setAttribute('aria-label','Clear selection');top.append(close);h.append(top,el('h2','',title));if(subtitle)h.append(el('p','',subtitle));return h;
  }
  function renderInspector(){
    const panel=$('inspector');panel.replaceChildren();
    if(selection?.kind==='nodes'){selection.names=selection.names.filter(n=>model.node(n));if(!selection.names.length)selection=null;}
    if(selection?.kind==='nodes'){window.CMHS_V2?.renderMultiInspector(panel,selection.names);return;}
    if(selection?.kind==='node'&&!model.node(selection.name))selection=null;
    if(selection?.kind==='edge'&&!model.edges[selection.index])selection=null;
    if(!selection){
      const empty=el('div','empty-inspector');empty.append(el('div','eyebrow','YOUR WORKSPACE'),el('div','large-symbol','⌘'),el('h2','','A clearer view of every connection.'),el('p','','Select an element to edit its parameters, or select a connection to change its endpoints.'));
      const legend=el('div','legend');[['producer','Sources','Receive messages'],['processor','Processors','Transform, enrich & route'],['consumer','Outputs','Write, send & log']].forEach(([r,t,desc])=>{const row=el('div');row.append(el('i',r),el('span','',t+' · '+desc));legend.append(row);});empty.append(legend);
      const stats=el('div','summary-card');stats.append(el('strong','',`${data.instances.length} configured examples`),el('div','',`Across ${data.networks.length} networks and ${data.definitions.length} element types.`));empty.append(stats,button('Explore the library →',()=>setTab('library'),'quiet'));panel.append(empty);return;
    }
    if(selection.kind==='definition'){renderDefinition(selection.definition);return;}
    if(selection.kind==='edge'){renderEdgeInspector();return;}
    const name=selection.name,n=model.node(name),body=el('div','panel-content');panel.append(panelHeader(name,n.getAttribute('typename')+' · '+n.tagName),body);
    const general=section('Element');general.append(field('Name',name,value=>perform(()=>{model.rename(name,value);selection.name=value;})),field('Comment',child(n,'comment')?.textContent||'',v=>perform(()=>model.setComment(name,v)),{multiline:true}));
    const pair=el('div','field-pair'),p=model.position(n);pair.append(field('Position X',p.x,v=>perform(()=>model.move(name,Number(v),model.position(n).y)),{type:'number'}),field('Position Y',p.y,v=>perform(()=>model.move(name,model.position(n).x,Number(v))),{type:'number'}));general.append(pair);body.append(general);
    const settings=section('Parameters');
    model.parameters(name).forEach((param,index)=>{
      const key=param.getAttribute('name'),value=param.hasAttribute('value')?param.getAttribute('value'):param.textContent;
      const row=el('div','param-row');
      if(!param.hasAttribute('value'))row.append(field(key,value,()=>{}, {multiline:true,readonly:true,help:'Nested/text parameter: edit in element XML to preserve its structure.'}));
      else row.append(field(key,value,v=>perform(()=>model.setParameter(name,index,key,v)),{multiline:value.length>65||value.includes('\n'),mono:true}));
      const remove=button('×',()=>perform(()=>param.remove()),'remove-param');remove.title='Remove parameter '+key;remove.setAttribute('aria-label',remove.title);row.append(remove);settings.append(row);
    });
    settings.append(button('＋ Add parameter',()=>addParameter(name),'quiet mini-button'));body.append(settings);
    const attrs=section('Attributes');const details=el('details');details.append(el('summary','details-toggle','Module, type and additional attributes'));
    [...n.attributes].filter(a=>!['name','x','y'].includes(a.name)).forEach(a=>details.append(field(a.name,a.value,v=>perform(()=>n.setAttribute(a.name,v)),{mono:true})));attrs.append(details);body.append(attrs);
    const connections=section('Connections');model.edges.forEach((e,index)=>{if(e.getAttribute('producer')!==name&&e.getAttribute('consumer')!==name)return;connections.append(button(`${e.getAttribute('producer')} → ${e.getAttribute('consumer')}`,()=>{selection={kind:'edge',index};renderGraph();renderInspector();},'connection-item'));});connections.append(button('＋ New connection',()=>connectionDialog(name),'quiet mini-button'));body.append(connections);
    const actions=el('div','panel-actions');const dup=button('Duplicate',()=>perform(()=>{selection.name=model.duplicate(name);}));dup.disabled=n.tagName==='producer';actions.append(button('Copy',()=>window.CMHS_V2?.copy()),dup,button('Edit XML',()=>nodeXMLDialog(name)),button('Save template',()=>saveTemplate(name)),button('Delete',()=>deleteSelection(),'danger'));body.append(actions);
  }
  function renderEdgeInspector(){
    const e=model.edges[selection.index],index=selection.index,body=el('div','panel-content');$('inspector').append(panelHeader('Connection','Direction follows the arrow.','CONNECTION'),body);
    body.append(field('From',e.getAttribute('producer'),v=>perform(()=>model.connect(v,e.getAttribute('consumer'),e)),{choices:model.nodes.filter(n=>n.tagName!=='consumer').map(n=>n.getAttribute('name'))}),field('To',e.getAttribute('consumer'),v=>perform(()=>model.connect(e.getAttribute('producer'),v,e)),{choices:model.nodes.filter(n=>n.tagName!=='producer').map(n=>n.getAttribute('name'))}));
    [...e.attributes].filter(a=>!['producer','consumer'].includes(a.name)).forEach(a=>body.append(field(a.name,a.value,v=>perform(()=>e.setAttribute(a.name,v)))));
    body.append(el('p','type-summary','Changing an endpoint preserves any extra connection attributes.'),button('Delete connection',()=>perform(()=>{model.edges[index].remove();selection=null;}),'danger'));
  }
  function showDefinition(definition){selection={kind:'definition',definition};renderGraph();renderInspector();}
  function renderDefinition(d){
    const panel=$('inspector'),body=el('div','panel-content');panel.append(panelHeader(d.typename,d.module,'ELEMENT LIBRARY'),body);
    body.append(el('span','role-pill '+d.role,d.role),el('p','type-summary',`${d.instanceIds.length} configured examples from your networks. Choose one to reuse its exact settings.`));
    const examples=d.instanceIds.map(id=>data.instances.find(i=>i.id===id));let selected=examples[0];
    const preview=el('pre','template-preview');const update=()=>{preview.textContent=(selected.comment?selected.comment+'\n\n':'')+selected.parameters.map(p=>p.name+' = '+(p.value??'(nested XML)')).join('\n');};
    body.append(field('Configuration example',selected.id,v=>{selected=examples.find(i=>i.id===v);update();},{choices:examples.map(i=>({value:i.id,label:i.networkId.replace('.mhn','')+' / '+i.name}))}),preview);
    const add=button(d.role==='producer'&&model.nodes.some(n=>n.tagName==='producer')?'Replace network source':'＋ Add to canvas',()=>addTemplate(selected),'primary');add.draggable=true;add.ondragstart=e=>{e.dataTransfer.setData('application/x-cmhs-template',JSON.stringify(selected));e.dataTransfer.effectAllowed='copy';};add.title='Click to add at center, or drag to choose a position';add.style.marginTop='15px';body.append(add);
    if(d.role==='producer')body.append(el('p','type-summary','A network has one source. Replacement retains its name, position and existing connections. Undo restores the previous source.'));
    const schema=section('Observed parameter library');schema.style.marginTop='25px';
    Object.values(d.parameters).forEach(p=>{const wrap=el('div','field');wrap.append(el('span','',p.name),el('small','',`${p.occurrences} examples · ${p.observedValues.length} distinct values`));schema.append(wrap);});body.append(schema,el('p','type-summary','These definitions describe observed files; they are not a vendor schema of required parameters.'));update();
  }
  function templateNetwork(template){const origin=data.networks.find(n=>n.id===template.networkId);return template.network||(origin?new NetworkDocument(origin.xml,origin.id).name:'');}
  function addTemplate(template){
    const x=($('canvas').clientWidth/2-view.x)/view.z-W/2,y=($('canvas').clientHeight/2-view.y)/view.z-H/2;
    perform(()=>{const name=model.add(template.xml,(x-40)/SX,(y-40)/SY,templateNetwork(template));selection={kind:'node',name};});toast('Element configuration added. Review its parameters before exporting.');
  }
  function saveTemplate(name){const n=model.node(name);const t={id:'custom-'+Date.now(),network:model.name,name,role:n.tagName,typename:n.getAttribute('typename'),xml:serialize(n)};customTemplates.push(t);const saved=store.put('templates',customTemplates);renderCatalog();toast(saved?'Saved to My templates in the library.':'Template is available this session; browser storage is unavailable.',!saved);}
  function refreshWorkspaceLibrary(){
    workspaceTemplates=[];const seen=new Set();networks.forEach(network=>{try{const doc=new NetworkDocument(network.id===activeId?model.toXML():network.xml,network.filename);doc.nodes.forEach(node=>{const xml=serialize(node),key=`${node.tagName}\u0000${node.getAttribute('typename')}\u0000${xml}`;if(seen.has(key))return;seen.add(key);workspaceTemplates.push({id:`workspace:${workspaceTemplates.length}`,network:doc.name,name:node.getAttribute('name'),role:node.tagName,typename:node.getAttribute('typename'),xml});});}catch{/* Invalid imports are never added to the reusable library. */}});store.put('workspace-templates',workspaceTemplates);renderCatalog();toast(`Updated workspace library with ${workspaceTemplates.length} element configuration${workspaceTemplates.length===1?'':'s'}.`);
  }
  function modal(title,body,actions=[],eyebrow='WORKSPACE'){
    if($('modal').open)$('modal').close();$('modal-title').textContent=title;$('modal-eyebrow').textContent=eyebrow;$('modal-body').replaceChildren(body);$('modal-footer').replaceChildren(button('Cancel',()=>$('modal').close()));actions.forEach(a=>$('modal-footer').append(button(a.text,()=>{try{a.run();}catch(e){toast(e.message,true);}},a.primary?'primary':'')));$('modal').showModal();
  }
  function nodeXMLDialog(name){const body=el('div'),input=el('textarea','code-editor mono');input.value=serialize(model.node(name));body.append(el('p','dialog-intro','Edit all attributes and nested settings. The role must stay the same; renaming updates its connections.'),input);modal('Element XML',body,[{text:'Apply XML',primary:true,run:()=>{const parsed=parseXML(input.value).documentElement;if(parsed.tagName!==model.node(name).tagName)throw new Error('Keep the same element role.');const newName=parsed.getAttribute('name');if(!newName?.trim()||(newName!==name&&model.node(newName)))throw new Error('Choose a unique, nonempty element name.');perform(()=>{selection.name=model.replaceNodeXML(name,input.value);});$('modal').close();}}]);}
  function addParameter(name){let key='',value='';const body=el('div');body.append(field('Parameter name','',v=>key=v),field('Value','',v=>value=v,{multiline:true}));modal('Add parameter',body,[{text:'Add parameter',primary:true,run:()=>{if(!key.trim())throw new Error('Enter a parameter name.');if(model.parameters(name).some(p=>p.getAttribute('name')===key))throw new Error('That parameter already exists.');perform(()=>model.setParameter(name,model.parameters(name).length,key,value));$('modal').close();}}]);}
  function connectionDialog(name){
    const sources=model.nodes.filter(n=>n.tagName!=='consumer').map(n=>n.getAttribute('name')),targets=model.nodes.filter(n=>n.tagName!=='producer').map(n=>n.getAttribute('name'));
    if(!sources.length||!targets.length){toast('Add a source/processor and a destination first.',true);return;}
    let from=sources.includes(name)?name:sources[0],to=targets.includes(name)&&from!==name?name:targets.find(n=>n!==from)||targets[0];const body=el('div');body.append(field('From',from,v=>from=v,{choices:sources}),field('To',to,v=>to=v,{choices:targets}));
    modal('New connection',body,[{text:'Connect',primary:true,run:()=>{if(model.edges.some(e=>e.getAttribute('producer')===from&&e.getAttribute('consumer')===to))throw new Error('This connection already exists.');perform(()=>{selection={kind:'edge',index:model.connect(from,to)};});$('modal').close();}}]);
  }
  function settingsDialog(){
    const body=el('div');let name=model.name,desc=model.description;const vars=el('textarea','code-editor mono');vars.value=serialize(child(model.setup,'variables')||model.doc.createElement('variables'));body.append(field('Network name',name,v=>name=v,{help:'Renaming also renames every element and updates its connection references.'}),field('Description',desc,v=>desc=v,{multiline:true}),el('p','dialog-intro','NETWORKNAME controls the network title. Variables may have value attributes or nested conditionalValue elements; both are preserved.'),vars);
    modal('Network settings',body,[{text:'Delete network',run:()=>deleteNetwork()},{text:'Duplicate network',run:()=>duplicateNetwork()},{text:'Save settings',primary:true,run:()=>{const parsed=parseXML(vars.value);if(parsed.documentElement.tagName!=='variables')throw new Error('The XML root must be variables.');const next=uniqueNetworkName(name,activeId);if(next!==name)throw new Error(`A network named “${name}” already exists.`);perform(()=>{model.setVariablesXML(vars.value);model.setDescription(desc);if(next!==model.name){model.renameNetwork(next);model.filename=next+'.mhn';}});if(hubActive)synchronizeHub();$('modal').close();}}]);
  }
  function unloadConfiguration(){
    if(!hubActive){toast('No configuration is open.');return;}
    const managed=new Set(managedNetworks().map(network=>network.id));networks=networks.filter(network=>!managed.has(network.id));managed.forEach(id=>drafts.delete(id));store.put('drafts',[...drafts.values()]);hubActive=false;hubXML=data.hub.xml;hubFilename=data.hub.filename||'main.mhc';removedHubKeys.clear();persistHubState();persistConfigurationNetworks();$('modal').close();
    const next=networks.find(network=>network.id===activeId)||networks[0];if(next)openNetwork(next.id);else{activeId=null;model=null;renderCatalog();}toast('Configuration unloaded. Its linked networks were removed from this local workspace.');
  }
  function reorderConfigurationNetwork(index,direction){
    const ordered=managedNetworks(),target=index+direction;if(target<0||target>=ordered.length)return false;
    [ordered[index],ordered[target]]=[ordered[target],ordered[index]];let cursor=0;networks=networks.map(network=>network.hubManaged?ordered[cursor++]:network);synchronizeHub();renderCatalog();return true;
  }
  function hubDialog(){
    const body=el('div'),input=el('textarea','code-editor mono');input.value=hubXML;body.append(el('p','dialog-intro',hubActive?'This open configuration is kept synchronized with its loaded networks. Exporting the configuration includes the .mhc and every registered .mhn file. Unloading it removes only its linked networks from this local workspace.':'Global variables and network registrations from main.mhc. Import a configuration folder to load its linked networks together.'));
    if(hubActive){
      const order=el('div','v2-file-list'),refreshOrder=()=>{order.replaceChildren();const ordered=managedNetworks();ordered.forEach((network,index)=>{const row=el('div','item-row'),name=el('strong','',network.name),up=button('↑',()=>{if(reorderConfigurationNetwork(index,-1)){input.value=hubXML;refreshOrder();}},'mini-button'),down=button('↓',()=>{if(reorderConfigurationNetwork(index,1)){input.value=hubXML;refreshOrder();}},'mini-button');up.disabled=index===0;down.disabled=index===ordered.length-1;row.append(name,up,down);order.append(row);});};body.append(el('p','dialog-intro','Configuration network sequence'),order);refreshOrder();
    }
    body.append(input);const actions=[];if(hubActive)actions.push({text:'Unload configuration',run:()=>unloadConfiguration()});actions.push({text:'Save local draft',run:()=>{if(parseXML(input.value).documentElement.tagName!=='messagehub')throw new Error('The root must be messagehub.');hubXML=input.value;const ok=persistHubState();$('modal').close();toast(ok?'Hub draft saved locally.':'Hub draft kept for this session.',!ok);}},{text:'Export .mhc',primary:true,run:()=>{if(parseXML(input.value).documentElement.tagName!=='messagehub')throw new Error('The root must be messagehub.');hubXML=input.value;download(hubActive?synchronizeHub():hubXML,hubFilename,'application/xml');}});modal('Hub configuration',body,actions);
  }
  function newNetwork(){let name='NewNetwork';const body=el('div');body.append(field('Network name',name,v=>name=v),el('p','dialog-intro',hubActive?'The new network will be added to the open configuration.':'Start from an empty network, then choose a source from the library.'));modal('New network',body,[{text:'Create network',primary:true,run:()=>{if(!name.trim())throw new Error('Enter a network name.');const next=uniqueNetworkName(name);if(next!==name)throw new Error(`A network named “${name}” already exists.`);const doc=NetworkDocument.empty(name),id='custom:'+Date.now()+'.mhn',network={id,name,filename:name+'.mhn',xml:doc.toXML(),description:'',nodeCount:0,connectionCount:0,imported:true,hubManaged:hubActive,hubKey:null};networks.push(network);if(hubActive)synchronizeHub();$('modal').close();openNetwork(id);saveDraft();setTab('library');}}]);}
  function duplicateNetwork(){
    const original=networks.find(network=>network.id===activeId),base=`${model.name}_Copy`,name=uniqueNetworkName(base),copy=new NetworkDocument(model.toXML(),model.filename);
    copy.renameNetwork(name);copy.filename=name+'.mhn';const id=`copy:${Date.now()}.mhn`,network={id,name,filename:copy.filename,xml:copy.toXML(),description:copy.description,nodeCount:copy.nodes.length,connectionCount:copy.edges.length,imported:true,hubManaged:!!original?.hubManaged,hubKey:null};
    networks.push(network);drafts.set(id,{...network});if(network.hubManaged)synchronizeHub();$('modal').close();openNetwork(id);flushDrafts();toast(`Duplicated ${original?.name||'network'} as ${name}.`);
  }
  function deleteNetwork(){
    const index=networks.findIndex(network=>network.id===activeId);if(index<0)return;const network=networks[index];
    if(network.hubManaged&&network.hubKey)removedHubKeys.add(network.hubKey);networks.splice(index,1);drafts.delete(network.id);store.put('drafts',[...drafts.values()]);if(hubActive)synchronizeHub();$('modal').close();const next=networks[index]||networks[index-1];if(next)openNetwork(next.id);else{activeId=null;model=null;renderCatalog();}toast(`Deleted ${network.name} from this local workspace.`);
  }
  let networkMenu=null,networkMenuTarget=null;
  function hideNetworkMenu(){if(networkMenu){networkMenu.remove();networkMenu=null;}networkMenuTarget=null;}
  function renameNetworkDialog(id){
    openNetwork(id);let name=model.name;const body=el('div');body.append(field('Network name',name,value=>name=value,{help:'Renaming also renames every element and updates its connection references.'}));
    modal('Rename network',body,[{text:'Rename network',primary:true,run:()=>{const next=uniqueNetworkName(name,activeId);if(next!==name)throw new Error(`A network named “${name}” already exists.`);if(next!==model.name){perform(()=>{model.renameNetwork(next);model.filename=next+'.mhn';});if(hubActive)synchronizeHub();}$('modal').close();}}]);
  }
  function networkContextMenu(event,id){
    hideNetworkMenu();networkMenuTarget=id;const network=networks.find(item=>item.id===id);if(!network)return;
    networkMenu=el('div','node-context-menu network-context-menu');networkMenu.setAttribute('role','menu');networkMenu.setAttribute('aria-label',`Network actions for ${network.name}`);
    [['Open',()=>openNetwork(id)],['Rename',()=>renameNetworkDialog(id)],['Duplicate',()=>{openNetwork(id);duplicateNetwork();}],['Delete',()=>{openNetwork(id);deleteNetwork();}]].forEach(([label,action])=>{const item=button(label,()=>{hideNetworkMenu();action();});item.setAttribute('role','menuitem');networkMenu.append(item);});
    document.body.append(networkMenu);const rect=networkMenu.getBoundingClientRect();networkMenu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-rect.width-8))+'px';networkMenu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-rect.height-8))+'px';networkMenu.querySelector('button').focus();
  }
  document.addEventListener('pointerdown',event=>{if(networkMenu&&!networkMenu.contains(event.target))hideNetworkMenu();},true);window.addEventListener('resize',hideNetworkMenu);window.addEventListener('blur',hideNetworkMenu);
  function issuesDialog(){const issues=model.issues(),body=el('div');body.append(el('p','dialog-intro','Checks XML structure, unique element names, connection endpoints and direction. CMHS modules, paths, queries and business behavior must be tested in your target environment.'));if(!issues.length)body.append(el('div','issue ok','✓ Network structure is valid. All connections have valid endpoints.'));issues.forEach(i=>body.append(el('div','issue '+i.level,i.message)));modal('Network checks',body,[{text:'Done',primary:true,run:()=>$('modal').close()}]);}
  function exportCurrentNetwork(){
    if(window.CMHS_V2){window.CMHS_V2.saveDialog('current');return;}
    const errors=model.issues().filter(i=>i.level==='error');if(errors.length){issuesDialog();toast('Resolve the structural errors before exporting.',true);return;}
    const name=model.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'network';download(model.toXML(),name+'.mhn','application/xml');flushDrafts();toast('Downloaded the current network. The original file is unchanged.');
  }
  function exportUpdatedNetworks(){
    if(window.CMHS_V2){window.CMHS_V2.saveDialog('updated');return;}
    exportCurrentNetwork();
  }
  function exportConfiguration(){
    if(!configurationDocuments()){toast('Open a network from an imported configuration to export that configuration.',true);return;}
    window.CMHS_V2?.saveDialog('configuration');
  }
  function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function deleteSelection(){if(selection?.kind==='nodes')perform(()=>{selection.names.forEach(n=>model.remove(n));selection=null;});else if(selection?.kind==='node')perform(()=>{model.remove(selection.name);selection=null;});else if(selection?.kind==='edge')perform(()=>{model.edges[selection.index].remove();selection=null;});}
  function undo(redo=false){if(!model)return;const xml=redo?history.redo(model.toXML()):history.undo(model.toXML());if(!xml)return;model=new NetworkDocument(xml,model.filename);selection=null;pending=null;saveDraft();renderAll();}
  async function importFiles(files){
    const parsed=[];for(const file of files){if(!/\.(mhn|mhc|xml)$/i.test(file.name))continue;try{const xml=await file.text(),doc=parseXML(xml);parsed.push({file,xml,doc});}catch(e){toast(`${file.name}: ${e.message}`,true);}}
    const hub=parsed.find(entry=>entry.doc.documentElement.tagName==='messagehub');let count=0,last=null,linked=new Set();
    if(hub){
      if(hubActive)unloadConfiguration();
      hubXML=hub.xml;hubFilename=hub.file.name;hubActive=true;removedHubKeys.clear();const registrations=children(child(hub.doc.documentElement,'networks'),'network');
      registrations.forEach(registration=>{const filename=registration.getAttribute('filename')||'',match=parsed.find(entry=>entry!==hub&&entry.doc.documentElement.tagName==='messagehubnetwork'&&entry.file.name.toLowerCase()===filename.toLowerCase());if(!match)return;linked.add(match);try{const network=addNetwork(match.xml,match.file.name,{hubManaged:true,hubKey:registrationKey(filename,registration.getAttribute('name'))});count++;last=network.id;}catch(error){toast(`${match.file.name}: ${error.message}`,true);}});
      synchronizeHub();const missing=registrations.length-count;if(missing)toast(`${missing} linked network${missing===1?' was':'s were'} not selected. Choose the configuration folder or select the .mhc and all registered .mhn files together.`,true);
    }
    if(!hub)parsed.filter(entry=>entry.doc.documentElement.tagName==='messagehubnetwork').forEach(entry=>{try{const network=addNetwork(entry.xml,entry.file.name);count++;last=network.id;}catch(error){toast(`${entry.file.name}: ${error.message}`,true);}});
    if(last){openNetwork(last);flushDrafts();setTab('networks');toast(hub?`Opened configuration with ${count} linked network${count===1?'':'s'}.`:`Imported ${count} network${count===1?'':'s'} as local drafts.`);}
    else if(hub){persistHubState();toast('Configuration imported. Select its folder or its registered .mhn files to load the linked networks.',true);}
  }
  function help(){const body=el('div','guide-grid');[
    ['1 · Choose a network','Open any of the bundled networks or import .mhn files. Your original XML stays untouched. Local drafts survive reloads when browser storage is available.'],
    ['2 · Shape the flow','Drag nodes to move them; drag the background to pan and scroll to zoom. Use Fit (F) to see the entire network. Positions are exported in native CMHS coordinates.'],
    ['3 · Connect elements','Click an output port followed by an input port, or use Connect (C) and click two nodes. Select a line to change endpoints or delete it.'],
    ['4 · Reuse example settings',`The Library contains ${data.definitions.length} element types and ${data.instances.length} anonymous examples and generic templates. Pick an example, add it, then review its parameters. A producer replaces the network’s single source.`],
    ['5 · Edit with confidence','Rename, duplicate or delete elements; edit parameters, comments, attributes and complete element XML. Undo/redo supports all network edits. Renaming updates connection references.'],
    ['6 · Export a modified copy','Check network, then Export .mhn. The XML retains unknown settings and metadata. Export main.mhc separately if you change network registrations. This editor does not execute networks.'],
    ['Keyboard','V: select · C: connect · F: fit · Delete: delete selection · Escape: cancel connection · Ctrl/Cmd+Z: undo · Ctrl/Cmd+Shift+Z: redo.'],
    ['Offline & portable','No accounts, cloud or external scripts. The element catalog is available as JSON and SQLite in the data folder. Keep this portal folder together; open index.html in a desktop browser.']
    ].forEach(([title,text])=>{const item=el('div');item.append(el('h3','',title),el('p','',text));body.append(item);});modal('Your network, ready to edit',body,[{text:'Start editing',primary:true,run:()=>$('modal').close()}],'QUICK GUIDE');}
  function renderAll(){renderHeader();renderCatalog();renderGraph();renderInspector();}
  $('networks-tab').onclick=()=>setTab('networks');$('library-tab').onclick=()=>setTab('library');$('catalog-search').oninput=renderCatalog;
  document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{role=b.dataset.role;document.querySelectorAll('[data-role]').forEach(x=>x.classList.toggle('active',x===b));renderCatalog();});
  $('select-tool').onclick=()=>setTool('select');$('connect-tool').onclick=()=>setTool('connect');$('fit-btn').onclick=fit;$('undo-btn').onclick=()=>undo();$('redo-btn').onclick=()=>undo(true);
  ['zoom-in','zoom-out','zoom-value'].forEach(id=>$(id).addEventListener('pointerdown',event=>event.stopPropagation()));
  $('zoom-in').onclick=event=>{event.preventDefault();zoom(1.2);};$('zoom-out').onclick=event=>{event.preventDefault();zoom(1/1.2);};$('zoom-value').onclick=event=>{event.preventDefault();zoom(1/view.z);};
  $('new-btn').onclick=newNetwork;$('refresh-library-btn').onclick=refreshWorkspaceLibrary;$('network-settings-btn').onclick=settingsDialog;$('hub-btn').onclick=hubDialog;$('unload-configuration-btn').onclick=unloadConfiguration;$('help-btn').onclick=help;$('export-current-network-btn').onclick=exportCurrentNetwork;$('export-networks-btn').onclick=exportUpdatedNetworks;$('export-configuration-btn').onclick=exportConfiguration;$('issues-btn').onclick=issuesDialog;$('empty-library-btn').onclick=()=>setTab('library');
  $('import-btn').onclick=()=>$('file-input').click();$('configuration-import-btn').onclick=()=>$('configuration-input').click();$('file-input').onchange=async e=>{await importFiles([...e.target.files]);e.target.value='';};$('configuration-input').onchange=async e=>{await importFiles([...e.target.files]);e.target.value='';};
  $('canvas').addEventListener('wheel',e=>{e.preventDefault();const r=$('canvas').getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
  $('canvas').addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==1)return;selection=null;drag={kind:'pan',startX:e.clientX,startY:e.clientY,x:view.x,y:view.y};$('canvas').setPointerCapture(e.pointerId);renderGraph();renderInspector();});
  $('canvas').addEventListener('pointermove',e=>{
    if(drag){
      if(drag.kind==='pan'){view.x=drag.x+e.clientX-drag.startX;view.y=drag.y+e.clientY-drag.startY;setView();}
      else{const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;if(drag.moved){const ox=dx/view.z/SX,oy=dy/view.z/SY;drag.members.forEach(p=>{let x=p.x+ox,y=p.y+oy;if(!e.altKey){x=Math.round(x/5)*5;y=Math.round(y/5)*5;}model.move(p.name,x,y);});renderGraph();}}
    }
    pointerPosition={x:e.clientX,y:e.clientY};renderPendingConnection();
  });
  function endDrag(){if(drag?.kind==='node'&&drag.moved){history.record(drag.before);saveDraft();renderHeader();renderCatalog();renderInspector();}drag=null;}
  $('canvas').addEventListener('pointerup',endDrag);$('canvas').addEventListener('pointercancel',endDrag);
  window.addEventListener('keydown',e=>{
    if(window.CMHS_BETA_LOCKED||$('modal').open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable)return;
    if((e.metaKey||e.ctrlKey)&&['a','c','v'].includes(e.key.toLowerCase())){e.preventDefault();if(e.key.toLowerCase()==='a')setSelectedNames(model.nodes.map(n=>n.getAttribute('name')));else if(e.key.toLowerCase()==='c')window.CMHS_V2?.copy();else window.CMHS_V2?.pasteDialog();return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='y'){e.preventDefault();undo(true);return;}
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelection();}else if(e.key.toLowerCase()==='f')fit();else if(e.key.toLowerCase()==='c')setTool('connect');else if(e.key.toLowerCase()==='v')setTool('select');else if(e.key==='Escape'){pending=null;setTool('select');}else if(e.key==='?')help();
  });
  let dragDepth=0;window.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;document.body.classList.add('drop-overlay');}});window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});window.addEventListener('dragleave',()=>{if(--dragDepth<=0)document.body.classList.remove('drop-overlay');});window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;document.body.classList.remove('drop-overlay');importFiles([...e.dataTransfer.files]);});
  window.addEventListener('beforeunload',()=>{if(saveTimer)flushDrafts();});
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))$('modal').close();});
  customTemplates=store.get('templates',[]);workspaceTemplates=store.get('workspace-templates',[]);const hubState=store.get('hub-state',null);if(hubState?.xml){hubXML=hubState.xml;hubFilename=hubState.filename||'main.mhc';hubActive=!!hubState.active;removedHubKeys=new Set(hubState.removed||[]);}else hubXML=store.get('hub',data.hub.xml);
  const storedConfiguration=hubActive?store.get('configuration-networks',[]):[];let storedDrafts=store.get('drafts',[]),legacyConfiguration=hubActive&&!storedConfiguration.length?storedDrafts.filter(d=>d.hubManaged):[],configurationRecords=storedConfiguration.length?storedConfiguration:legacyConfiguration;
  configurationRecords.forEach(d=>{try{const doc=new NetworkDocument(d.xml,d.filename||d.id),record={...d,xml:doc.toXML(),name:doc.name,filename:doc.filename,description:doc.description,nodeCount:doc.nodes.length,connectionCount:doc.edges.length,hubManaged:true};const found=networks.find(n=>n.id===d.id);if(found)Object.assign(found,record);else networks.push(record);}catch{/* Leave an unusable stored configuration network out of the active workspace. */}});
  if(legacyConfiguration.length){const legacyIds=new Set(legacyConfiguration.map(d=>d.id));storedDrafts=storedDrafts.filter(d=>!legacyIds.has(d.id));store.put('drafts',storedDrafts);persistConfigurationNetworks();}
  storedDrafts.forEach(d=>{try{new NetworkDocument(d.xml,d.filename||d.id);const found=networks.find(n=>n.id===d.id);if(found){Object.assign(found,{xml:d.xml,name:d.name,filename:d.filename,hubManaged:!!d.hubManaged,hubKey:d.hubKey||null});const m=new NetworkDocument(d.xml,d.filename||d.id);found.description=m.description;found.nodeCount=m.nodes.length;found.connectionCount=m.edges.length;}else networks.push({...d,description:'Imported or new network',nodeCount:new NetworkDocument(d.xml,d.filename).nodes.length,connectionCount:new NetworkDocument(d.xml,d.filename).edges.length,hubManaged:!!d.hubManaged,hubKey:d.hubKey||null});drafts.set(d.id,d);}catch{/* Leave an unusable stored draft out of the active workspace. */}});
  const active=store.get('active',null);openNetwork(networks.some(n=>n.id===active)?active:(data.defaultNetwork||networks[0]?.id));
  function selectedNames(){return selection?.kind==='node'?[selection.name]:selection?.kind==='nodes'?selection.names:[];}
  function setSelectedNames(names){selection=names.length>1?{kind:'nodes',names}:names.length?{kind:'node',name:names[0]}:null;renderGraph();renderInspector();window.CMHS_V2?.updateToolbar();}
  function commitNetworks(updates){
    updates.forEach(item=>{if(!networks.some(n=>n.id===item.id))throw new Error('Network not found: '+item.id);});
    const parsed=updates.map(item=>({...item,parsed:new NetworkDocument(item.xml,networks.find(n=>n.id===item.id)?.filename||item.id)}));
    parsed.forEach(item=>{const n=networks.find(n=>n.id===item.id),doc=item.parsed;if(n.id===activeId){history.record(model.toXML());model=doc;selection=null;pending=null;}Object.assign(n,{xml:doc.toXML(),name:doc.name,filename:doc.filename,description:doc.description,nodeCount:doc.nodes.length,connectionCount:doc.edges.length});drafts.set(n.id,{id:n.id,name:n.name,filename:doc.filename,xml:n.xml,imported:!!n.imported,hubManaged:!!n.hubManaged,hubKey:n.hubKey||null});});
    persistConfigurationNetworks();
    flushDrafts();renderAll();
  }
  window.CMHS_STUDIO={get model(){return model;},get selection(){return selection;},get catalog(){return data;},openNetwork,importFiles,perform,renderAll,fit,toast,modal,field,section,panelHeader,button,el,store,saveDraft,flushDrafts,deleteSelection,selectedNames,setSelectedNames,commitNetworks,templateNetwork,refreshWorkspaceLibrary,get activeId(){return activeId;},get networks(){return networks;},get drafts(){return drafts;},configurationDocuments,configurationExport,canvasPosition(clientX,clientY){const r=$('canvas').getBoundingClientRect();return{x:Math.max(CMHS.MIN_X,((clientX-r.left-view.x)/view.z-40)/SX),y:Math.max(CMHS.MIN_Y,((clientY-r.top-view.y)/view.z-40)/SY)};},centerPosition(){const r=$('canvas').getBoundingClientRect();return this.canvasPosition(r.left+r.width/2,r.top+r.height/2);}};
})();
