export function createUiDialog(doc=globalThis.document){
  let host=null,dlg=null,kickEl=null,titleEl=null,textEl=null,inputEl=null,cancelEl=null,okEl=null;
  let activeResolve=null,returnFocus=null;

  const visible=el=>!!el&&!el.hidden&&typeof el.focus==='function'
    &&(!el.getClientRects||el.getClientRects().length>0);

  function finish(value){
    if(!host||host.hidden)return;
    host.hidden=true;
    const resolve=activeResolve;activeResolve=null;
    const focus=returnFocus;returnFocus=null;
    if(visible(focus))focus.focus({preventScroll:true});
    if(resolve)resolve(value);
  }

  function ensureHost(){
    if(host)return host;
    host=doc.createElement('div');host.id='askMdl';host.className='dlg-back';host.hidden=true;

    dlg=doc.createElement('div');dlg.className='dlg card ask-dlg';dlg.tabIndex=-1;
    dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-labelledby','askTitle');

    kickEl=doc.createElement('div');kickEl.className='kick';kickEl.id='askKick';kickEl.textContent='请确认';
    titleEl=doc.createElement('h2');titleEl.id='askTitle';
    textEl=doc.createElement('p');textEl.id='askText';

    inputEl=doc.createElement('input');inputEl.className='ask-input';inputEl.id='askInput';inputEl.type='text';inputEl.maxLength=40;inputEl.hidden=true;
    inputEl.setAttribute('aria-labelledby','askTitle');inputEl.setAttribute('aria-describedby','askText');

    const actions=doc.createElement('div');actions.className='ask-actions';
    cancelEl=doc.createElement('button');cancelEl.className='btn';cancelEl.id='askCancel';cancelEl.textContent='取消';
    okEl=doc.createElement('button');okEl.className='btn primary';okEl.id='askOk';okEl.textContent='确定';
    actions.appendChild(cancelEl);actions.appendChild(okEl);

    dlg.appendChild(kickEl);dlg.appendChild(titleEl);dlg.appendChild(textEl);dlg.appendChild(inputEl);dlg.appendChild(actions);
    host.appendChild(dlg);doc.body.appendChild(host);

    host.addEventListener('click',event=>{if(event.target===host&&!cancelEl.hidden)finish(null);});
    cancelEl.addEventListener('click',()=>finish(null));
    okEl.addEventListener('click',()=>finish(inputEl.hidden?true:inputEl.value.trim()));
    doc.addEventListener('keydown',event=>{
      if(!host||host.hidden||event.isComposing)return;
      if(event.key==='Escape'&&!cancelEl.hidden){event.preventDefault();finish(null);return;}
      if(event.key==='Enter'&&!event.shiftKey){
        event.preventDefault();finish(!cancelEl.hidden&&cancelEl.contains(event.target)?null:(inputEl.hidden?true:inputEl.value.trim()));return;
      }
      if(event.key!=='Tab')return;
      const focusable=[inputEl,cancelEl,okEl].filter(el=>!el.hidden&&!el.disabled&&visible(el));
      event.preventDefault();
      if(!focusable.length){dlg.focus();return;}
      const active=doc.activeElement,index=focusable.indexOf(active);
      if(index<0){(event.shiftKey?focusable[focusable.length-1]:focusable[0]).focus();return;}
      const next=(index+(event.shiftKey?-1:1)+focusable.length)%focusable.length;
      focusable[next].focus();
    });
    return host;
  }

  function open({kick='请确认',title='',text='',input=false,defaultValue='',confirmLabel='确定',cancelLabel='取消'}={}){
    ensureHost();
    if(activeResolve)finish(null);
    returnFocus=doc.activeElement;
    kickEl.textContent=kick;titleEl.textContent=title;textEl.textContent=text;
    inputEl.hidden=!input;inputEl.value=input?defaultValue:'';
    cancelEl.hidden=cancelLabel==null;if(cancelLabel!=null)cancelEl.textContent=cancelLabel;
    okEl.textContent=confirmLabel;
    host.hidden=false;
    (input?inputEl:okEl).focus({preventScroll:true});
    if(input&&typeof inputEl.select==='function')inputEl.select();else dlg.scrollTop=0;
    return new Promise(resolve=>{activeResolve=resolve;});
  }

  return {
    isOpen:()=>!!host&&!host.hidden,
    async confirm(text,{title='确定要继续吗？',kick='请确认',confirmLabel='确定',cancelLabel='取消'}={}){
      return (await open({kick,title,text,confirmLabel,cancelLabel}))===true;
    },
    async prompt(text,{title='输入名称',kick='溪谷',defaultValue='',confirmLabel='确定',cancelLabel='取消'}={}){
      const value=await open({kick,title,text,input:true,defaultValue,confirmLabel,cancelLabel});
      return typeof value==='string'?value:null;
    },
    async alert(text,{title='提示',kick='溪谷',confirmLabel='知道了'}={}){
      await open({kick,title,text,confirmLabel,cancelLabel:null});
    }
  };
}
