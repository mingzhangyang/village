import { normalizeChronicleKind } from '../state-contract.js';

export function renderChronicleList(container,entries,formatDate){
  const doc=container&&container.ownerDocument;
  if(!container||!doc||typeof doc.createElement!=='function'||typeof container.replaceChildren!=='function'){
    throw new TypeError('A DOM container with ownerDocument is required.');
  }
  const label=typeof formatDate==='function'?formatDate:value=>String(value??'');
  const items=Array.isArray(entries)?entries:[];
  const nodes=items.map(entry=>{
    const safe=entry&&typeof entry==='object'?entry:{};
    const li=doc.createElement('li');
    li.className=`k-${normalizeChronicleKind(safe.k)}`;
    const time=doc.createElement('time');
    time.textContent=label(safe.d);
    const text=doc.createElement('span');
    text.textContent=typeof safe.t==='string'?safe.t:String(safe.t??'');
    li.appendChild(time);
    li.appendChild(text);
    return li;
  });
  container.replaceChildren(...nodes);
}
