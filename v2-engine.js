(function(global){

 'use strict';

 const {NetworkDocument,parseXML,serialize,serializeDocument,child,children}=CMHS;

 const XSL='http://www.w3.org/1999/XSL/Transform';

 function assert(ok,message){if(!ok)throw new Error(message);}

 function safeName(value){const name=String(value).trim().replace(/[<>:"\/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'');assert(name&&name!=='.'&&name!=='..','A usable network/file name is required.');return name;}

 function csv(text){

  text=String(text).replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,closed=false;

  for(let i=0;i<text.length;i++){

   const c=text[i];

   if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}

   if(c==='"'){assert(!field&&!closed,'CSV quote must begin a field.');quoted=true;}

   else if(c===','){row.push(field);field='';closed=false;}

   else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';closed=false;}

   else{assert(!closed||/\s/.test(c),'Unexpected text after a closing CSV quote.');if(!closed)field+=c;}

  }

  assert(!quoted,'CSV has an unclosed quoted field.');row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;

 }

 function queryRows(text){

  const rows=csv(text);assert(rows.length,'Enter at least one query name.');

  const aliases={name:'queryname',query:'queryname',queryname:'queryname',parameters:'parameters',params:'parameters',sql:'sql',text:'sql',comment:'comment',network:'network',decorator:'decorator',element:'decorator'};

  let headers=rows[0].map(h=>aliases[h.trim().toLowerCase()]);

  if(headers.includes('queryname')){assert(headers.every(Boolean),'CSV headers: network, decorator, queryname, parameters, sql, comment.');assert(new Set(headers).size===headers.length,'Duplicate CSV header.');rows.shift();}

  else{headers=['queryname'];assert(rows.every(r=>r.length===1),'For multiple columns, include a queryname,parameters,sql,comment header.');}

  assert(rows.length,'The CSV has a header but no queries.');const seen=new Set();

  return rows.map((values,index)=>{

   assert(values.length===headers.length,`CSV row ${index+2}: expected ${headers.length} columns, got ${values.length}.`);

   const row=Object.fromEntries(headers.map((h,i)=>[h,values[i]]));row.queryname=row.queryname.trim();row.network=row.network?.trim()||'';row.decorator=row.decorator?.trim()||'';

   assert(row.queryname&&!/[\\\x00-\x1f]/.test(row.queryname)&&!row.queryname.split('/').some(s=>!s||s==='.'||s==='..'),`Invalid query name at CSV row ${index+2}.`);

   assert(!row.queryname.startsWith('Custom/CMHS/'),'Use the query name only; V2 supplies Custom/CMHS/<network>/.');

   const key=row.network+'\0'+row.decorator+'\0'+row.queryname;assert(!seen.has(key),`Duplicate query: ${row.queryname}.`);seen.add(key);return row;

  });

 }

 function validateQueryMappings(targets,rows){

  const key=t=>JSON.stringify([t.network,t.decorator]),known=new Set(targets.map(key)),covered=new Set(),paths=new Set();

  assert(known.size===targets.length,'Exported networks must have unique network names for CQMS mappings.');

  rows.forEach(row=>{assert(row.network&&row.decorator,'Every query needs an explicit network and XMLDecorator.');assert(known.has(key(row)),`Unknown CQMS target: ${row.network} / ${row.decorator}.`);covered.add(key(row));const path=JSON.stringify([row.network,row.queryname]);assert(!paths.has(path),`Query ${row.queryname} is repeated in network ${row.network}. Use a distinct query name for each decorator.`);paths.add(path);});

  targets.forEach(t=>assert(covered.has(key(t)),`Define at least one query for ${t.network} / ${t.decorator}.`));

  return rows;

 }

 function downstreamDecorators(model,name){

  const found=new Set(),seen=new Set([name]),queue=[name];

  for(let i=0;i<queue.length;i++)model.edges.filter(e=>e.getAttribute('producer')===queue[i]).forEach(e=>{const next=e.getAttribute('consumer');if(seen.has(next))return;seen.add(next);const node=model.node(next);if(!node)return;const type=node.getAttribute('typename');if(/XMLDecorator/i.test(type))found.add(next);else if(type!=='XSLProcessor')queue.push(next);});

  return [...found];

 }

 function parameterSpecs(text,template){

  if(text===undefined)return children(template,'parameter').map(p=>({name:p.getAttribute('name'),type:p.getAttribute('type')||'string',defaultvalue:p.getAttribute('defaultvalue')||''}));

  if(!text.trim())return [];

  const seen=new Set();return text.split(';').map(item=>{

   const match=item.trim().match(/^([A-Za-z_][\w]*)(?::([A-Za-z_][\w.]*))?(?:=([\s\S]*))?$/);

   assert(match,`Invalid parameter “${item}”. Use name:type=default; separate parameters with semicolons.`);

   assert(!seen.has(match[1]),`Duplicate parameter: ${match[1]}.`);seen.add(match[1]);return{name:match[1],type:match[2]||'string',defaultvalue:match[3]||''};

  });

 }

 function fragment(model,names){

  const wanted=new Set(names),nodes=model.nodes.filter(n=>wanted.has(n.getAttribute('name')));assert(nodes.length,'Select one or more elements to copy.');

  const edges=model.edges.filter(e=>wanted.has(e.getAttribute('producer'))&&wanted.has(e.getAttribute('consumer')));

  const xml=nodes.map(serialize).join(' ');const refs=new Set([...xml.matchAll(/%([A-Za-z_][\w]*)%/g)].map(m=>m[1]));

  let changed=true;while(changed){changed=false;model.variables.filter(v=>refs.has(v.getAttribute('name'))).forEach(v=>{for(const m of serialize(v).matchAll(/%([A-Za-z_][\w]*)%/g)){if(!refs.has(m[1])){refs.add(m[1]);changed=true;}}});}

  return{format:'cmhs-fragment-v2',network:model.name,nodes:nodes.map(serialize),edges:edges.map(serialize),variables:model.variables.filter(v=>v.getAttribute('name')!=='NETWORKNAME'&&refs.has(v.getAttribute('name'))).map(serialize),externalLinks:model.edges.filter(e=>wanted.has(e.getAttribute('producer'))!==wanted.has(e.getAttribute('consumer'))).length};

 }

 function paste(model,piece,x,y,{replaceProducer=false}={}){

  assert(piece?.format==='cmhs-fragment-v2'&&Array.isArray(piece.nodes)&&piece.nodes.length,'The clipboard does not contain a network fragment.');

  const source=piece.nodes.map(xml=>parseXML(xml).documentElement);

  assert(source.every(n=>['producer','processor','consumer'].includes(n.tagName)),'Invalid fragment element role.');

  assert(source.filter(n=>n.tagName==='producer').length<=1,'A fragment may contain only one producer.');

  const originalNames=source.map(n=>n.getAttribute('name'));assert(originalNames.every(Boolean)&&new Set(originalNames).size===originalNames.length,'Fragment names must be unique.');

  assert(replaceProducer||!source.some(n=>n.tagName==='producer')||!model.nodes.some(n=>n.tagName==='producer'),'This network already has a source. Enable “Replace existing source” to paste the copied producer.');

  const minX=Math.min(...source.map(n=>Number(n.getAttribute('x'))||0)),minY=Math.min(...source.map(n=>Number(n.getAttribute('y'))||0));

  const mapping=new Map();source.forEach(n=>mapping.set(n.getAttribute('name'),model.add(serialize(n),x+(Number(n.getAttribute('x'))||0)-minX,y+(Number(n.getAttribute('y'))||0)-minY,piece.network)));

  let links=0;(piece.edges||[]).forEach(xml=>{const edge=parseXML(xml).documentElement,from=mapping.get(edge.getAttribute('producer')),to=mapping.get(edge.getAttribute('consumer'));assert(from&&to,'Fragment link references an element outside the fragment.');if(model.edges.some(e=>e.getAttribute('producer')===from&&e.getAttribute('consumer')===to))return;const index=model.connect(from,to);[...edge.attributes].filter(a=>!['producer','consumer'].includes(a.name)).forEach(a=>model.edges[index].setAttribute(a.name,a.value));links++;});

  const conflicts=[];(piece.variables||[]).forEach(xml=>{const v=parseXML(xml).documentElement;assert(v.tagName==='variable','Invalid fragment variable.');const name=v.getAttribute('name');if(name==='NETWORKNAME')return;const old=model.variables.find(e=>e.getAttribute('name')===name);if(old){if(serialize(old)!==serialize(v))conflicts.push(name);}else model.ensure(model.setup,'variables').append(model.doc.importNode(v,true));});

  return{names:[...mapping.values()],links,conflicts};

 }

 function layout(model,names){

  const nodes=names?.length?model.nodes.filter(n=>names.includes(n.getAttribute('name'))):model.nodes;if(!nodes.length)return;

  const selected=new Set(nodes.map(n=>n.getAttribute('name'))),adj=new Map([...selected].map(n=>[n,[]]));model.edges.forEach(e=>{const a=e.getAttribute('producer'),b=e.getAttribute('consumer');if(selected.has(a)&&selected.has(b))adj.get(a).push(b);});

  // Condense cycles before computing layers, so feedback paths cannot stall arrangement.

  let cursor=0;const indices=new Map(),low=new Map(),stack=[],onStack=new Set(),groups=[];

  function visit(n){indices.set(n,cursor);low.set(n,cursor++);stack.push(n);onStack.add(n);for(const b of adj.get(n)){if(!indices.has(b)){visit(b);low.set(n,Math.min(low.get(n),low.get(b)));}else if(onStack.has(b))low.set(n,Math.min(low.get(n),indices.get(b)));}if(low.get(n)===indices.get(n)){const group=[];let b;do{b=stack.pop();onStack.delete(b);group.push(b);}while(b!==n);groups.push(group);}}

  [...selected].forEach(n=>{if(!indices.has(n))visit(n);});const owner=new Map();groups.forEach((g,i)=>g.forEach(n=>owner.set(n,i)));

  const incoming=groups.map(()=>0),outgoing=groups.map(()=>new Set()),layers=groups.map(()=>0);

  adj.forEach((targets,a)=>targets.forEach(b=>{const x=owner.get(a),y=owner.get(b);if(x!==y&&!outgoing[x].has(y)){outgoing[x].add(y);incoming[y]++;}}));

  const queue=incoming.map((n,i)=>n===0?i:-1).filter(i=>i>=0);for(let i=0;i<queue.length;i++){const a=queue[i];for(const b of outgoing[a]){layers[b]=Math.max(layers[b],layers[a]+1);if(--incoming[b]===0)queue.push(b);}}

  const x0=Math.min(...nodes.map(n=>model.position(n).x)),y0=Math.min(...nodes.map(n=>model.position(n).y));

  const ordered=groups.map((g,i)=>({g,layer:layers[i]})).sort((a,b)=>a.layer-b.layer).flatMap(({g,layer})=>g.sort((a,b)=>model.position(model.node(a)).y-model.position(model.node(b)).y).map(name=>({name,layer,node:model.node(name)})));

  const topRows=new Map();let topBottom=y0-82;

  ordered.filter(v=>v.node.tagName!=='consumer').forEach(({name,layer})=>{const row=topRows.get(layer)||0,y=y0+row*82;model.move(name,x0+layer*150,y);topRows.set(layer,row+1);topBottom=Math.max(topBottom,y);});

  // Consumers occupy a separate lower band, including outputs from early processors.

  const outputStart=topBottom+110,outputRows=new Map();

  ordered.filter(v=>v.node.tagName==='consumer').forEach(({name,layer})=>{const row=outputRows.get(layer)||0;model.move(name,x0+layer*150,outputStart+row*82);outputRows.set(layer,row+1);});

 }

 function align(model,names,mode){

  const nodes=names.map(n=>model.node(n)).filter(Boolean);assert(nodes.length>1,'Select at least two elements (Shift-click).');

  const axis=['left','right','center-x','space-x'].includes(mode)?'x':'y',values=nodes.map(n=>model.position(n)[axis]),min=Math.min(...values),max=Math.max(...values);

  if(mode.startsWith('space')){assert(nodes.length>=3,'Select at least three elements to distribute.');nodes.sort((a,b)=>model.position(a)[axis]-model.position(b)[axis]).forEach((n,i)=>{const p=model.position(n);p[axis]=min+(max-min)*i/(nodes.length-1);model.move(n.getAttribute('name'),p.x,p.y);});return;}

  const value=mode.startsWith('center')?(min+max)/2:['right','bottom'].includes(mode)?max:min;

  nodes.forEach(n=>{const p=model.position(n);p[axis]=value;model.move(n.getAttribute('name'),p.x,p.y);});

 }

 function addLogs(model,templateXML){

  const sources=model.nodes.filter(n=>n.tagName!=='consumer');let added=0,skipped=0;

  sources.forEach((n,index)=>{const name=n.getAttribute('name');if(model.edges.some(e=>e.getAttribute('producer')===name&&['FileWriter','XMLFileWriter'].includes(model.node(e.getAttribute('consumer'))?.getAttribute('typename')))){skipped++;return;}

   const template=parseXML(templateXML).documentElement;assert(template.tagName==='consumer'&&['FileWriter','XMLFileWriter'].includes(template.getAttribute('typename')),'Choose a FileWriter consumer template.');template.setAttribute('name','XMLFileWriter1');const p=model.position(n),created=model.add(serialize(template),p.x+110,p.y+52);

   for(const [key,value] of [['prefix',`%INTERFACEDIR%\\%NETWORKNAME%\\Log\\${String(index).padStart(2,'0')}_${safeName(name)}_`],['postfix','.xml'],['Encoding','UTF-8']]){const params=model.parameters(created),i=params.findIndex(x=>x.getAttribute('name')===key);model.setParameter(created,i<0?params.length:i,key,value);}

   model.setComment(created,'Log output of '+name);model.connect(name,created);added++;

  });return{added,skipped};

 }

 function addDBLogs(model,templateXML,variables=[]){

  const template=parseXML(templateXML).documentElement;assert(template.tagName==='consumer'&&template.getAttribute('typename')==='CMHSDBLogWriterConsumer','Choose a CMHSDBLogWriterConsumer template.');

  const sources=model.nodes.filter(n=>n.tagName!=='consumer');let added=0,skipped=0;

  sources.forEach((n,index)=>{const name=n.getAttribute('name');if(model.edges.some(e=>e.getAttribute('producer')===name&&model.node(e.getAttribute('consumer'))?.getAttribute('typename')==='CMHSDBLogWriterConsumer')){skipped++;return;}

   const copy=template.cloneNode(true);copy.setAttribute('name','DBLog_'+name);const p=model.position(n),created=model.add(serialize(copy),p.x+110,p.y+105),params=model.parameters(created),i=params.findIndex(v=>v.getAttribute('name')==='Identifier');

   model.setParameter(created,i<0?params.length:i,'Identifier',`${String(index).padStart(2,'0')}_${name}`);model.setComment(created,'Database log output of '+name);model.connect(name,created);added++;

  });const conflicts=[];

  if(added)variables.forEach(xml=>{const v=parseXML(xml).documentElement;assert(v.tagName==='variable','Invalid DB logwriter variable.');const name=v.getAttribute('name');if(name==='NETWORKNAME')return;const old=model.variables.find(e=>e.getAttribute('name')===name);if(old){if(serialize(old)!==serialize(v))conflicts.push(name);}else model.ensure(model.setup,'variables').append(model.doc.importNode(v,true));});

  return {added,skipped,conflicts};

 }

 function replace(model,match,templateXML,keepValues=true){

  const template=parseXML(templateXML).documentElement;assert(template.tagName===match.role,'Replacement must have the same role to preserve connection direction.');

  const targets=model.nodes.filter(n=>n.tagName===match.role&&n.getAttribute('typename')===match.typename&&n.getAttribute('module')===match.module);

  targets.forEach(old=>{const node=template.cloneNode(true),name=old.getAttribute('name');['name','x','y'].forEach(k=>node.setAttribute(k,old.getAttribute(k)||'0'));

   if(keepValues){const oldParams=children(child(child(old,'settings'),'parameters'),'parameter'),newParams=children(child(child(node,'settings'),'parameters'),'parameter');newParams.forEach(p=>{const previous=oldParams.find(v=>v.getAttribute('name')===p.getAttribute('name'));if(previous)p.replaceWith(previous.cloneNode(true));});[...node.attributes].filter(a=>!['typename','module','name','x','y'].includes(a.name)&&old.hasAttribute(a.name)).forEach(a=>node.setAttribute(a.name,old.getAttribute(a.name)));}

   const comment=child(old,'comment');if(comment){const dest=child(node,'comment');if(dest)dest.replaceWith(comment.cloneNode(true));else node.prepend(comment.cloneNode(true));}model.replaceNodeXML(name,serialize(node));

  });return targets.length;

 }

 function expand(text,network,query){return String(text).replace(/%networkname%/gi,()=>network).replace(/%queryname%/gi,()=>query);}

 function generateCQMS(network,rows,templateXML){

  const doc=parseXML(templateXML);assert(doc.documentElement.tagName==='ComtecQueries','CQMS template must have a ComtecQueries root.');const template=child(doc.documentElement,'query');assert(template,'CQMS template has no query.');const basePath=template.getAttribute('name'),queries=[];

  children(doc.documentElement,'query').forEach(q=>q.remove());const selected=rows.filter(r=>r.network===network);assert(selected.length,`No CSV queries match network ${network}.`);const names=new Set();

  selected.forEach(row=>{const q=template.cloneNode(true),path=`Custom/CMHS/${network}/${row.queryname}`;assert(!names.has(path),`Duplicate resolved query path: ${path}.`);names.add(path);q.setAttribute('name',path);

   const text=child(q,'text')||q.appendChild(doc.createElement('text'));text.textContent=expand(row.sql!==undefined?row.sql:(text.textContent||'').split(basePath).join(path),network,row.queryname);

   const specs=parameterSpecs(row.parameters,template);children(q,'parameter').forEach(p=>p.remove());const comment=child(q,'comment');specs.forEach(spec=>{const p=doc.createElement('parameter');p.setAttribute('defaultvalue',expand(spec.defaultvalue,network,row.queryname));p.setAttribute('name',spec.name);p.setAttribute('type',spec.type);q.insertBefore(p,comment||null);});

   if(row.comment!==undefined){const c=comment||q.appendChild(doc.createElement('comment'));c.textContent=expand(row.comment,network,row.queryname);}doc.documentElement.append(q);queries.push({name:path,parameters:specs,decorator:row.decorator});

  });return{xml:serializeDocument(doc),queries};

 }

 function generateXSL(network,templateXML,queries){

  const doc=parseXML(templateXML);assert(doc.documentElement.namespaceURI===XSL,'XSL template must be an XSLT stylesheet.');const queryElements=[...doc.getElementsByTagName('query')];

  if(Array.isArray(queries)){assert(!queries.length||queryElements.length,'The XSL template has no query placeholder to initialize.');queryElements.forEach(template=>{const parent=template.parentNode,bindings=children(child(template,'parameters'),'parameter');queries.forEach(info=>{const q=template.cloneNode(true);q.setAttribute('name',info.name);let params=child(q,'parameters');if(!params){params=doc.createElement('parameters');q.append(params);}params.replaceChildren();info.parameters.forEach(spec=>{const original=bindings.find(p=>p.getAttribute('name')===spec.name),p=original?original.cloneNode(true):doc.createElement('parameter');p.setAttribute('name',spec.name);if(!original){const value=doc.createElementNS(XSL,'xsl:value-of');value.setAttribute('select','.//'+spec.name);p.append(value);}params.append(p);});parent.insertBefore(q,template);});template.remove();});}

  else queryElements.forEach(q=>{const name=q.getAttribute('name')||'';q.setAttribute('name',name.replace(/^Custom\/CMHS\/[^/]+\//,()=>`Custom/CMHS/${network}/`));});

  return serializeDocument(doc);

 }

 function generateCPMS(networks,templateXML){

  const doc=parseXML(templateXML);assert(doc.documentElement.tagName==='configuration','CPMS template must have a configuration root.');const configs=child(doc.documentElement,'processConfigs');assert(configs,'CPMS template has no processConfigs section.');const template=child(configs,'processConfig');assert(template,'CPMS template has no processConfig entry.');const names=new Set();

  configs.replaceChildren();networks.forEach(network=>{assert(!names.has(network),`Duplicate network name in CPMS export: ${network}.`);names.add(network);const process=template.cloneNode(true),parameters=child(process,'parameters'),configuration=parameters&&child(parameters,'cmhs-configuration'),included=configuration&&child(configuration,'include-network');assert(included,`CPMS template processConfig must contain parameters/cmhs-configuration/include-network.`);process.setAttribute('code',`cmhs_${network}`);process.setAttribute('name',`CMHS - ${network}`);included.textContent=network;configs.append(process);});

  return serializeDocument(doc);

 }

 function bundle(documents,{xslNodes={},xslDecorators={},cqms=false,cpms=false,csvText='',queryMappings=null,templates}={}){

  const rows=cqms?(queryMappings||queryRows(csvText)):[],files=[],updates=[],seen=new Set();

  const parsed=documents.map(item=>({item,model:new NetworkDocument(item.xml,item.filename||item.id)}));

  if(cqms)validateQueryMappings(parsed.flatMap(({model:m})=>m.nodes.filter(n=>/XMLDecorator/i.test(n.getAttribute('typename'))).map(n=>({network:m.name,decorator:n.getAttribute('name')}))),rows);

  const add=(name,text)=>{assert(!seen.has(name),`Export filename collision: ${name}. Give each network/element a distinct filename.`);seen.add(name);files.push({name,text});};

  for(const {item,model:m} of parsed){

   const network=m.name;assert(safeName(network)===network,'Use a network name without filename-reserved characters or trailing dots/spaces.');const errors=m.issues().filter(i=>i.level==='error');assert(!errors.length,`${network}: ${errors.map(e=>e.message).join(' ')}`);

   const filename=safeName(String(item.filename||`${network}.mhn`).replace(/\.mhn$/i,'')),decorators=m.nodes.filter(n=>/XMLDecorator/i.test(n.getAttribute('typename')));let queries=null;

   if(cqms&&decorators.length){const output=generateCQMS(network,rows,templates.cqms);queries=output.queries;add(`CQMS/${filename}.xml`,output.xml);}

   const chosen=new Set(xslNodes[item.id]||[]);for(const n of m.nodes){if(n.getAttribute('typename')!=='XSLProcessor'||!chosen.has(n.getAttribute('name')))continue;

    const suffix=safeName(n.getAttribute('name')),xslname=`${filename}_${suffix}.xsl`;let selectedQueries=null;

    if(cqms){const target=xslDecorators[item.id]?.[n.getAttribute('name')];assert(typeof target==='string',`Choose the query source for XSL ${network} / ${n.getAttribute('name')}.`);assert(!target||decorators.some(d=>d.getAttribute('name')===target),`Unknown XSL query source: ${network} / ${target}.`);selectedQueries=target?(queries||[]).filter(q=>q.decorator===target):[];}

    add(`Stylesheets/${filename}/${xslname}`,generateXSL(network,templates.xsl,selectedQueries));const params=m.parameters(n.getAttribute('name')),i=params.findIndex(p=>p.getAttribute('name')==='filename');m.setParameter(n.getAttribute('name'),i<0?params.length:i,'filename',`%XSLDIR%\\%NETWORKNAME%\\%NETWORKNAME%_${suffix}.xsl`);

   }add(`networks/${filename}.mhn`,m.toXML());updates.push({id:item.id,xml:m.toXML()});

  }if(cpms){assert(templates?.cpms,'CPMS template is unavailable.');add('CPMS/cmhs-process-config.xml',generateCPMS(parsed.map(({model:m})=>m.name),templates.cpms));}return{files,updates};

 }

 function zip(files){

  const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;const names=new Set();

  const crc=data=>{let n=0xffffffff;for(const b of data){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};

  const u16=(a,o,v)=>new DataView(a.buffer).setUint16(o,v,true),u32=(a,o,v)=>new DataView(a.buffer).setUint32(o,v,true);

  for(const file of files){assert(!names.has(file.name),'Duplicate ZIP entry.');names.add(file.name);assert(!file.name.startsWith('/')&&!file.name.split('/').includes('..'),'Invalid ZIP path.');const name=encoder.encode(file.name),body=encoder.encode(file.text),sum=crc(body);assert(name.length<65536&&body.length<0xffffffff,'File exceeds ZIP limits.');

   const local=new Uint8Array(30+name.length);u32(local,0,0x04034b50);u16(local,4,20);u16(local,6,0x800);u16(local,12,33);u32(local,14,sum);u32(local,18,body.length);u32(local,22,body.length);u16(local,26,name.length);local.set(name,30);parts.push(local,body);

   const central=new Uint8Array(46+name.length);u32(central,0,0x02014b50);u16(central,4,20);u16(central,6,20);u16(central,8,0x800);u16(central,14,33);u32(central,16,sum);u32(central,20,body.length);u32(central,24,body.length);u16(central,28,name.length);u32(central,42,offset);central.set(name,46);directory.push(central);offset+=local.length+body.length;

  }assert(files.length<65536&&offset<0xffffffff,'Export exceeds standard ZIP limits.');const size=directory.reduce((n,a)=>n+a.length,0),end=new Uint8Array(22);u32(end,0,0x06054b50);u16(end,8,files.length);u16(end,10,files.length);u32(end,12,size);u32(end,16,offset);

  const all=[...parts,...directory,end],result=new Uint8Array(all.reduce((n,a)=>n+a.length,0));let p=0;all.forEach(a=>{result.set(a,p);p+=a.length;});return result;

 }

 global.CMHS_V2_ENGINE={csv,queryRows,validateQueryMappings,downstreamDecorators,parameterSpecs,fragment,paste,layout,align,addLogs,addDBLogs,replace,generateCQMS,generateXSL,generateCPMS,bundle,zip,safeName};

})(window);
