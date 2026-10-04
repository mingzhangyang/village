let host;
let activeResolve=null;
let returnFocus=null;

function ensureHost(){
  if(host)return host;
  host=document.createElement('div');
  host.id='askMdl';
  host.className='dlg-back';
  host.hidden=true;
  host.innerHTML=`
    <div class="dlg card ask-dlg" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="askTitle">
      <div class="kick" id="askKick">请确认</div>
      <h2 id="askTitle"></h2>
      <p id="askText"></p>
      <input class="ask-input" id="askInput" type="text" maxlength="40" aria-labelledby="askTitle" aria-describedby="askText" hidden>
      <div class="ask-actions">
        <button class="btn" id="askCancel">取消</button>
        <button class="btn primary" id="askOk">确定</button>
      </div>
    </div>`;
  document.body.appendChild(host);
  host.addEventListener('click',event=>{
    if(event.target===host&&!document.getElementById('askCancel').hidden)finish(null);
  });
  document.getElementById('askCancel').addEventListener('click',()=>finish(null));
  document.getElementById('askOk').addEventListener('click',()=>finish(readValue()));
  document.addEventListener('keydown',event=>{
    if(!host||host.hidden)return;
    if(event.key==='Escape'&&!document.getElementById('askCancel').hidden){
      event.preventDefault();finish(null);return;
    }
    if(event.key==='Enter'&&!event.shiftKey){
      event.preventDefault();finish(readValue());return;
    }
    if(event.key!=='Tab')return;
    const dlg=host.querySelector('.dlg');
    const focusable=[...dlg.querySelectorAll('button:not([hidden]),input:not([hidden])')]
      .filter(el=>!el.disabled&&el.getClientRects().length);
    if(!focusable.length){event.preventDefault();dlg.focus();return;}
    const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
    if(event.shiftKey&&(active===first||active===dlg)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
  });
  return host;
}

function readValue(){
  const input=document.getElementById('askInput');
  return input.hidden?true:input.value.trim();
}

function finish(value){
  if(!host||host.hidden)return;
  host.hidden=true;
  const resolve=activeResolve;
  activeResolve=null;
  const focus=returnFocus;
  returnFocus=null;
  if(focus&&typeof focus.focus==='function')focus.focus({preventScroll:true});
  if(resolve)resolve(value);
}

function open({kick='请确认',title='',text='',input=false,defaultValue='',confirmLabel='确定',cancelLabel='取消'}={}){
  ensureHost();
  if(activeResolve)finish(null);
  returnFocus=document.activeElement;
  document.getElementById('askKick').textContent=kick;
  document.getElementById('askTitle').textContent=title;
  document.getElementById('askText').textContent=text;
  const field=document.getElementById('askInput');
  field.hidden=!input;
  field.value=input?defaultValue:'';
  const cancel=document.getElementById('askCancel');
  cancel.hidden=cancelLabel==null;
  if(cancelLabel!=null)cancel.textContent=cancelLabel;
  document.getElementById('askOk').textContent=confirmLabel;
  host.hidden=false;
  const dlg=host.querySelector('.dlg');
  (input?field:document.getElementById('askOk')).focus({preventScroll:true});
  if(input)field.select();
  else dlg.scrollTop=0;
  return new Promise(resolve=>{activeResolve=resolve;});
}

export function createUiDialog(){
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
