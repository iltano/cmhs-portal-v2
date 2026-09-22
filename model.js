/* XML is the source of truth. Editing never reconstructs a network from a reduced graph. */
(function (global) {
  'use strict';
  const roles = ['producer', 'processor', 'consumer'];
  const MIN_X = 5, MIN_Y = 6;
  const children = (el, name) => [...(el?.children || [])].filter(e => e.tagName === name);
  const child = (el, name) => children(el, name)[0] || null;
  function parseXML(xml) {
    if (/<!DOCTYPE/i.test(xml)) throw new Error('DTD documents are not supported. Import a CMHS XML file without a DTD.');
    const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XML: ' + doc.getElementsByTagName('parsererror')[0].textContent.slice(0, 300));
    return doc;
  }
  const serialize = node => new XMLSerializer().serializeToString(node);
  function withXMLDeclaration(xml) {
    // Some XML serializers include the declaration; others return only the body.
    // Normalize just the leading prolog, preserving comments and other PIs.
    const body = String(xml).replace(/^\uFEFF/, '').replace(/^(?:\s*<\?xml\s[^?]*\?>)+\s*/, '');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + body;
  }
  const serializeDocument = doc => withXMLDeclaration(serialize(doc));
  function validName(name) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('An element name cannot be empty.');
  }
  function additionName(name, typename, network, sourceNetwork = '') {
    let base = String(name || typename || 'Element').trim();
    // Names contain literal network names; settings continue to use %NETWORKNAME%.
    if (sourceNetwork && sourceNetwork !== network) {
      const escaped = sourceNetwork.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      base = base.replace(new RegExp('(^|_)' + escaped + '(?=_|$)', 'g'), (_, prefix) => prefix + network);
    }
    if (['FileWriter','XMLFileWriter'].includes(typename)) {
      const networkSuffix = '_' + network;
      if (base.endsWith(networkSuffix)) return base + '_1';
      if (base.includes(networkSuffix + '_') && /^\d+$/.test(base.slice(base.lastIndexOf(networkSuffix + '_') + networkSuffix.length + 1))) return base;
      const counter = base.match(/_(\d+)$/);
      base = (counter ? base.slice(0, -counter[0].length) : base) + networkSuffix + '_' + (counter ? counter[1] : '1');
    }
    return base;
  }
  function coordinate(value, minimum) {
    if (!Number.isFinite(Number(value))) throw new Error('Coordinates must be finite numbers.');
    return Math.max(minimum, Math.round(Number(value)));
  }
  function rebasedName(name, typename, oldNetwork, newNetwork) {
    const oldValue = String(name || typename || 'Element').trim();
    const escaped = oldNetwork.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let next = oldValue.replace(new RegExp('(^|_)' + escaped + '(?=_|$)', 'g'), (_, prefix) => prefix + newNetwork);
    if (next !== oldValue) return next;
    const suffix = next.match(/_(\d+)$/);
    return suffix ? `${next.slice(0, -suffix[0].length)}_${newNetwork}${suffix[0]}` : `${next}_${newNetwork}`;
  }
  class NetworkDocument {
    constructor(xml, filename = 'network.mhn') {
      this.filename = filename;
      this.doc = parseXML(xml);
      if (this.doc.documentElement.tagName !== 'messagehubnetwork') throw new Error('This is not a .mhn network. Use Hub configuration for a .mhc file.');
      this.setup = child(this.doc.documentElement, 'setup');
      if (!this.setup) throw new Error('The network has no setup element.');
      this.normalizeCoordinates();
    }
    get nodes() {
      return [...children(this.setup, 'producer'), ...children(child(this.setup, 'processors'), 'processor'), ...children(child(this.setup, 'consumers'), 'consumer')];
    }
    get edges() { return children(child(this.setup, 'connections'), 'connection'); }
    get variables() { return children(child(this.setup, 'variables'), 'variable'); }
    get name() { return this.variables.find(v => v.getAttribute('name') === 'NETWORKNAME')?.getAttribute('value') || this.filename.replace(/\.mhn$/i, ''); }
    get description() { return child(this.setup, 'description')?.textContent || ''; }
    node(name) { return this.nodes.find(e => e.getAttribute('name') === name); }
    position(node) { return { x: Math.max(MIN_X, Number(node.getAttribute('x')) || MIN_X), y: Math.max(MIN_Y, Number(node.getAttribute('y')) || MIN_Y) }; }
    normalizeCoordinates() {
      const positioned = this.nodes.filter(node => Number.isFinite(Number(node.getAttribute('x'))) && Number.isFinite(Number(node.getAttribute('y'))));
      if (!positioned.length) return;
      const minX = Math.min(...positioned.map(node => Number(node.getAttribute('x'))));
      const minY = Math.min(...positioned.map(node => Number(node.getAttribute('y'))));
      const shiftX = Math.max(0, MIN_X - minX), shiftY = Math.max(0, MIN_Y - minY);
      positioned.forEach(node => {
        node.setAttribute('x', String(coordinate(Number(node.getAttribute('x')) + shiftX, MIN_X)));
        node.setAttribute('y', String(coordinate(Number(node.getAttribute('y')) + shiftY, MIN_Y)));
      });
    }
    ensure(parent, tag) {
      let el = child(parent, tag);
      if (!el) {
        el = this.doc.createElement(tag);
        if (parent === this.setup) {
          const order = ['variables', 'description', 'producer', 'processors', 'consumers', 'connections'];
          const next = [...parent.children].find(e => order.indexOf(e.tagName) > order.indexOf(tag));
          parent.insertBefore(el, next || null);
        } else parent.append(el);
      }
      return el;
    }
    uniqueName(base) {
      base = String(base || 'Element').trim();
      let name = base;
      const suffix = base.match(/_(\d+)$/), stem = suffix ? base.slice(0, -suffix[0].length) : base;
      let index = suffix ? BigInt(suffix[1]) + 1n : 1n;
      while (this.node(name)) { name = `${stem}_${String(index++).padStart(suffix ? suffix[1].length : 1, '0')}`; }
      return name;
    }
    rename(oldName, newName) {
      validName(newName);
      const node = this.node(oldName);
      if (!node) throw new Error('The selected element no longer exists.');
      if (oldName !== newName && this.node(newName)) throw new Error(`An element named “${newName}” already exists.`);
      node.setAttribute('name', newName);
      this.edges.forEach(e => ['producer', 'consumer'].forEach(a => { if (e.getAttribute(a) === oldName) e.setAttribute(a, newName); }));
      return node;
    }
    renameNetwork(newName) {
      validName(newName);
      const oldName = this.name;
      if (oldName === newName) return;
      const nodes = this.nodes, used = new Set(), changes = new Map();
      nodes.forEach(node => {
        const base = rebasedName(node.getAttribute('name'), node.getAttribute('typename'), oldName, newName);
        let candidate = base, index = 1;
        while (used.has(candidate)) candidate = `${base}_${index++}`;
        used.add(candidate); changes.set(node.getAttribute('name'), candidate);
      });
      nodes.forEach(node => node.setAttribute('name', changes.get(node.getAttribute('name'))));
      this.edges.forEach(edge => ['producer', 'consumer'].forEach(attribute => edge.setAttribute(attribute, changes.get(edge.getAttribute(attribute)) || edge.getAttribute(attribute))));
      let variable = this.variables.find(v => v.getAttribute('name') === 'NETWORKNAME');
      if (!variable) {
        variable = this.doc.createElement('variable');
        variable.setAttribute('name', 'NETWORKNAME');
        this.ensure(this.setup, 'variables').appendChild(variable);
      }
      variable.setAttribute('value', newName);
    }
    move(name, x, y) {
      const node = this.node(name);
      if (!node) throw new Error('Element not found.');
      node.setAttribute('x', String(coordinate(x, MIN_X))); node.setAttribute('y', String(coordinate(y, MIN_Y)));
    }
    add(xml, x, y, sourceNetwork = '') {
      const source = parseXML(xml).documentElement;
      if (!roles.includes(source.tagName)) throw new Error('An element template must be a producer, processor or consumer.');
      coordinate(x, MIN_X); coordinate(y, MIN_Y);
      const node = this.doc.importNode(source, true);
      const previous = source.tagName === 'producer' ? children(this.setup, 'producer')[0] : null;
      if (previous) {
        node.setAttribute('name', previous.getAttribute('name'));
        node.setAttribute('x', previous.getAttribute('x') || '0'); node.setAttribute('y', previous.getAttribute('y') || '0');
        previous.replaceWith(node);
      } else {
        node.setAttribute('name', this.uniqueName(additionName(node.getAttribute('name'), node.getAttribute('typename'), this.name, sourceNetwork)));
        node.setAttribute('x', String(coordinate(x, MIN_X))); node.setAttribute('y', String(coordinate(y, MIN_Y)));
        if (node.tagName === 'producer') {
          const next = child(this.setup, 'processors') || child(this.setup, 'consumers') || child(this.setup, 'connections');
          this.setup.insertBefore(node, next);
        } else this.ensure(this.setup, node.tagName === 'processor' ? 'processors' : 'consumers').append(node);
      }
      return node.getAttribute('name');
    }
    duplicate(name) {
      const node = this.node(name);
      if (!node) throw new Error('Element not found.');
      if (node.tagName === 'producer') throw new Error('A network has one producer. Replace it from the library instead.');
      const pos = this.position(node);
      return this.add(serialize(node), pos.x + 30, pos.y + 65);
    }
    remove(name) {
      const node = this.node(name);
      if (!node) return;
      this.edges.filter(e => e.getAttribute('producer') === name || e.getAttribute('consumer') === name).forEach(e => e.remove());
      node.remove();
    }
    connect(from, to, existing = null) {
      const a = this.node(from), b = this.node(to);
      if (!a || !b) throw new Error('Choose existing source and destination elements.');
      if (from === to) throw new Error('An element cannot connect to itself.');
      if (this.edges.some(e => e !== existing && e.getAttribute('consumer') === to)) throw new Error('An element can receive a connection from only one source. Disconnect or reconnect its existing input first.');
      if (a.tagName === 'consumer') throw new Error('A consumer cannot start a connection.');
      if (b.tagName === 'producer') throw new Error('A producer cannot receive a connection.');
      if (this.edges.some(e => e !== existing && e.getAttribute('producer') === from && e.getAttribute('consumer') === to)) throw new Error('This connection already exists.');
      const edge = existing || this.doc.createElement('connection');
      edge.setAttribute('producer', from); edge.setAttribute('consumer', to);
      if (!existing) this.ensure(this.setup, 'connections').append(edge);
      return this.edges.indexOf(edge);
    }
    setComment(name, value) { this.ensure(this.node(name), 'comment').textContent = value; }
    parameters(name) { return children(child(child(this.node(name), 'settings'), 'parameters'), 'parameter'); }
    setParameter(name, index, key, value) {
      validName(key);
      const params = this.parameters(name);
      if (params.some((e, i) => i !== index && e.getAttribute('name') === key)) throw new Error('Parameter names must be unique within an element.');
      let param = params[index];
      if (!param) param = this.ensure(this.ensure(this.node(name), 'settings'), 'parameters').appendChild(this.doc.createElement('parameter'));
      param.setAttribute('name', key); param.setAttribute('value', value);
    }
    replaceNodeXML(name, xml) {
      const current = this.node(name), replacement = parseXML(xml).documentElement;
      if (replacement.tagName !== current.tagName) throw new Error('Keep the same role when editing XML. Use the library to replace a producer or add a different role.');
      const newName = replacement.getAttribute('name'); validName(newName);
      if (newName !== name && this.node(newName)) throw new Error('An element with that name already exists.');
      replacement.setAttribute('x', String(coordinate(replacement.getAttribute('x'), MIN_X)));
      replacement.setAttribute('y', String(coordinate(replacement.getAttribute('y'), MIN_Y)));
      const imported = this.doc.importNode(replacement, true);
      this.rename(name, newName); current.replaceWith(imported);
      return newName;
    }
    setVariablesXML(xml) {
      const el = parseXML(xml).documentElement;
      if (el.tagName !== 'variables') throw new Error('The XML root must be variables.');
      const names = children(el, 'variable').map(e => e.getAttribute('name'));
      if (names.some(n => !n?.trim()) || new Set(names).size !== names.length) throw new Error('Each variable needs a unique, nonempty name.');
      const current = this.ensure(this.setup, 'variables'); current.replaceWith(this.doc.importNode(el, true));
    }
    setDescription(value) { this.ensure(this.setup, 'description').textContent = value; }
    issues() {
      const issues = [], names = this.nodes.map(n => n.getAttribute('name'));
      if (children(this.setup, 'producer').length !== 1) issues.push({level:'error', message:'A network needs exactly one producer.'});
      this.nodes.forEach(n => {
        const name = n.getAttribute('name');
        if (!name?.trim() || names.filter(v => v === name).length > 1) issues.push({level:'error',message:`Missing or duplicate element name: ${name || '(empty)'}`});
        if (!n.getAttribute('typename') || !n.getAttribute('module')) issues.push({level:'error',message:`${name}: typename and module are required.`});
        if (['x','y'].some(a => !n.hasAttribute(a) || !Number.isFinite(Number(n.getAttribute(a))))) issues.push({level:'error',message:`${name}: invalid x/y coordinates.`});
        if (!this.edges.some(e => e.getAttribute('producer') === name || e.getAttribute('consumer') === name)) issues.push({level:'warning',message:`${name} has no connections.`});
      });
      const seen = new Set(), incoming = new Set();
      this.edges.forEach(e => {
        const from=e.getAttribute('producer'),to=e.getAttribute('consumer'),a=this.node(from),b=this.node(to),key=JSON.stringify([from,to]);
        if (from === to) issues.push({level:'error',message:`Self-connection: ${from}`});
        if (incoming.has(to)) issues.push({level:'error',message:`${to} receives more than one connection.`});
        incoming.add(to);
        if (!a || !b) issues.push({level:'error',message:`Broken connection: ${from} → ${to}`});
        if (a?.tagName==='consumer'||b?.tagName==='producer') issues.push({level:'error',message:`Invalid direction: ${from} → ${to}`});
        if (seen.has(key)) issues.push({level:'error',message:`Duplicate connection: ${from} → ${to}`});
        seen.add(key);
      });
      const reachable = new Set(children(this.setup, 'producer').map(n => n.getAttribute('name')));
      let changed = true;
      while (changed) { changed = false; this.edges.forEach(e => {
        const from = e.getAttribute('producer'), to = e.getAttribute('consumer');
        if (reachable.has(from) && this.node(to) && !reachable.has(to)) { reachable.add(to); changed = true; }
      }); }
      if (!this.nodes.some(n => n.tagName === 'consumer' && reachable.has(n.getAttribute('name')))) issues.push({level:'error',message:'A network needs at least one output consumer reachable from its producer.'});
      return issues;

    }
    toXML() { return serializeDocument(this.doc); }
    static empty(name = 'NewNetwork') {
      const doc=parseXML('<messagehubnetwork version="2010-11-22"><setup><variables><variable name="NETWORKNAME" value=""/></variables><description/><processors/><consumers/><connections/></setup></messagehubnetwork>');
      doc.getElementsByTagName('variable')[0].setAttribute('value',name);
      return new NetworkDocument(serialize(doc),name+'.mhn');
    }
  }
  class History {
    constructor(limit=80) { this.limit=limit;this.past=[];this.future=[]; }
    record(xml) { this.past.push(xml);if(this.past.length>this.limit)this.past.shift();this.future=[]; }
    undo(current) { if(!this.past.length)return null;this.future.push(current);return this.past.pop(); }
    redo(current) { if(!this.future.length)return null;this.past.push(current);return this.future.pop(); }
  }
  global.CMHS = {NetworkDocument,History,parseXML,serialize,serializeDocument,withXMLDeclaration,children,child,additionName,MIN_X,MIN_Y};
})(window);
