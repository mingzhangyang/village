import { describe, expect, it } from 'vitest';
import { createUiDialog } from '../src/ui/dialog.js';

class FakeTarget{
  constructor(){this.listeners=new Map();}
  addEventListener(type,handler){
    const list=this.listeners.get(type)||[];list.push(handler);this.listeners.set(type,list);
  }
  emit(type,event){
    for(const handler of this.listeners.get(type)||[])handler(event);
  }
}

class FakeElement extends FakeTarget{
  constructor(doc,tag){
    super();this.doc=doc;this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.hidden=false;this.disabled=false;
    this.id='';this.className='';this.textContent='';this.value='';this.type='';this.maxLength=0;this.tabIndex=0;this.scrollTop=0;this.attributes={};
  }
  appendChild(child){child.parentNode=this;this.children.push(child);return child;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  contains(node){for(let cur=node;cur;cur=cur.parentNode)if(cur===this)return true;return false;}
  focus(){this.doc.activeElement=this;}
  select(){this.selected=true;}
  getClientRects(){for(let cur=this;cur;cur=cur.parentNode)if(cur.hidden)return [];return [1];}
  click(){this.emit('click',{target:this});}
}

class FakeDocument extends FakeTarget{
  constructor(){super();this.body=new FakeElement(this,'body');this.activeElement=this.body;}
  createElement(tag){return new FakeElement(this,tag);}
  getElementById(id){
    const walk=node=>{if(node.id===id)return node;for(const child of node.children){const found=walk(child);if(found)return found;}return null;};
    return walk(this.body);
  }
  keydown(key,{shiftKey=false,isComposing=false}={}){
    let prevented=false;
    const event={key,shiftKey,isComposing,target:this.activeElement,preventDefault(){prevented=true;}};
    this.emit('keydown',event);return prevented;
  }
}

const setup=()=>{
  const doc=new FakeDocument(),opener=doc.createElement('button');doc.body.appendChild(opener);opener.focus();
  return {doc,opener,ui:createUiDialog(doc)};
};

describe('in-app dialog interaction contract',()=>{
  it('treats Enter on Cancel as cancellation and restores focus',async()=>{
    const {doc,opener,ui}=setup();
    const result=ui.confirm('危险操作');
    const cancel=doc.getElementById('askCancel');cancel.focus();doc.keydown('Enter');
    await expect(result).resolves.toBe(false);
    expect(doc.activeElement).toBe(opener);
  });

  it('does not submit prompts while IME composition is active',async()=>{
    const {doc,ui}=setup();
    const result=ui.prompt('命名',{defaultValue:'溪谷'});
    const input=doc.getElementById('askInput');input.value='山海';
    let settled=false;result.then(()=>{settled=true;});
    doc.keydown('Enter',{isComposing:true});await Promise.resolve();
    expect(settled).toBe(false);
    doc.keydown('Enter');
    await expect(result).resolves.toBe('山海');
  });

  it('associates prompt input with title and description',async()=>{
    const {doc,ui}=setup();
    const result=ui.prompt('给世界命名',{title:'新世界'});
    const input=doc.getElementById('askInput');
    expect(input.getAttribute('aria-labelledby')).toBe('askTitle');
    expect(input.getAttribute('aria-describedby')).toBe('askText');
    doc.getElementById('askCancel').click();
    await expect(result).resolves.toBeNull();
  });

  it('supports Escape and backdrop cancellation',async()=>{
    const {doc,ui}=setup();
    const escapeResult=ui.confirm('确认？');doc.keydown('Escape');
    await expect(escapeResult).resolves.toBe(false);

    const backdropResult=ui.confirm('确认？');doc.getElementById('askMdl').click();
    await expect(backdropResult).resolves.toBe(false);
  });

  it('keeps keyboard focus trapped within the dialog',async()=>{
    const {doc,ui}=setup();
    const result=ui.confirm('确认？');
    const cancel=doc.getElementById('askCancel'),ok=doc.getElementById('askOk');
    expect(doc.activeElement).toBe(ok);
    doc.keydown('Tab');expect(doc.activeElement).toBe(cancel);
    doc.keydown('Tab',{shiftKey:true});expect(doc.activeElement).toBe(ok);
    cancel.click();await result;
  });

  it('keeps prompt focus cycling in DOM order',async()=>{
    const {doc,ui}=setup();
    const result=ui.prompt('命名',{defaultValue:'溪谷'});
    const input=doc.getElementById('askInput'),cancel=doc.getElementById('askCancel'),ok=doc.getElementById('askOk');
    expect(doc.activeElement).toBe(input);
    doc.keydown('Tab',{shiftKey:true});expect(doc.activeElement).toBe(ok);
    doc.keydown('Tab');expect(doc.activeElement).toBe(input);
    input.focus();doc.keydown('Tab');expect(doc.activeElement).toBe(cancel);
    cancel.click();await result;
  });

  it('does not let Escape dismiss alert-only dialogs',async()=>{
    const {doc,ui}=setup();
    const result=ui.alert('提示');
    let settled=false;result.then(()=>{settled=true;});
    doc.keydown('Escape');await Promise.resolve();
    expect(settled).toBe(false);
    doc.getElementById('askOk').click();await result;
  });
});
