import { describe, expect, it } from 'vitest';
import { renderChronicleList } from '../src/ui/chronicle.js';

class FakeElement{
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.children=[];this.className='';this.textContent='';}
  appendChild(child){this.children.push(child);return child;}
  replaceChildren(...children){this.children=children;}
}
class FakeDocument{
  createElement(tag){return new FakeElement(this,tag);}
}

describe('chronicle render boundary',()=>{
  it('renders imported chronicle data as inert text with a trusted class',()=>{
    const doc=new FakeDocument(),root=new FakeElement(doc,'ul');
    renderChronicleList(root,[{d:9,k:'info" onmouseover="alert(1)',t:'<img src=x onerror=alert(1)>'}],day=>`D${day}`);
    const item=root.children[0];
    expect(item.className).toBe('k-info');
    expect(item.children[0].textContent).toBe('D9');
    expect(item.children[1].textContent).toBe('<img src=x onerror=alert(1)>');
  });
  it('preserves supported chronicle classes',()=>{
    const doc=new FakeDocument(),root=new FakeElement(doc,'ul');
    renderChronicleList(root,[{d:1,k:'birth',t:'出生'}],String);
    expect(root.children[0].className).toBe('k-birth');
  });
});
