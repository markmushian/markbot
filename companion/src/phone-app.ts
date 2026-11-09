/** The phone-specific client. Served by the sidecar at /app as one self-contained
 * document: no build step, no CDN, no third-party script, and no token in the
 * HTML. The device token is entered once and kept only in this browser's
 * localStorage; every API call carries it as a bearer header.
 *
 * Deliberately not a shrunken desktop: bottom tab bar, large touch targets,
 * one column, and a terminal that streams over fetch (EventSource cannot send
 * an Authorization header).
 */

export const PHONE_APP_PATH = "/app";

export const PHONE_APP_HTML = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1">
<meta name="theme-color" content="#161b20">
<title>Mark Bot · 手机工作台</title>
<style>
:root{--bg:#12171b;--card:#1c2329;--line:#2c353c;--ink:#e8edf1;--dim:#93a2ad;--accent:#5ec8e5;--ok:#4ade80;--warn:#fbbf24;--bad:#fb7185}
@media(prefers-color-scheme:light){:root{--bg:#f5f7f9;--card:#fff;--line:#dfe5ea;--ink:#1b242b;--dim:#66757f;--accent:#0b769b;--ok:#15803d;--warn:#b45309;--bad:#be123c}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;padding-bottom:calc(72px + env(safe-area-inset-bottom))}
header{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:calc(10px + env(safe-area-inset-top)) 16px 10px;display:flex;align-items:center;gap:10px}
header b{font-size:16px;flex:1}header small{display:block;color:var(--dim);font-size:11px;font-weight:400}
.dot{width:9px;height:9px;border-radius:50%;background:var(--bad);flex:none}.dot.on{background:var(--ok)}
main{padding:14px 16px 20px}
section{display:none}section.active{display:block}
h2{font-size:13px;color:var(--dim);font-weight:600;margin:0 0 10px;text-transform:uppercase;letter-spacing:.08em}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:10px}
.card h3{margin:0 0 4px;font-size:15px}.card p{margin:0;color:var(--dim);font-size:12px;word-break:break-word}
.row{display:flex;gap:8px;align-items:center;margin-top:10px}
input,textarea,select{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:11px 12px;width:100%;outline:none}
input:focus,textarea:focus{border-color:var(--accent)}
button{font:inherit;min-height:44px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:10px 14px;cursor:pointer}
button.primary{background:var(--accent);color:#06222b;border-color:transparent;font-weight:700}
button:disabled{opacity:.45}.grow{flex:1}
nav{position:fixed;left:0;right:0;bottom:0;z-index:6;display:grid;grid-template-columns:repeat(4,1fr);background:var(--card);border-top:1px solid var(--line);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
nav button{border:0;background:transparent;color:var(--dim);font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:56px}
nav button.active{color:var(--accent)}nav button span:first-child{font-size:20px;line-height:1}
.badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:10px;background:var(--line);color:var(--dim);margin-left:6px}
.badge.ok{background:color-mix(in_srgb,var(--ok) 18%,transparent);color:var(--ok)}
.badge.warn{background:color-mix(in_srgb,var(--warn) 18%,transparent);color:var(--warn)}
pre{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px;min-height:180px;max-height:44vh;overflow:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all;margin:0}
.hint{color:var(--dim);font-size:11px;line-height:1.6;margin:8px 0 0}
.status{font-size:11px;color:var(--dim);padding:4px 0}
.err{color:var(--bad);font-size:12px}
</style></head>
<body>
<header><span class="dot" id="dot"></span><div style="flex:1"><b>Mark Bot</b><small id="sub">手机工作台 · 未连接</small></div><button id="setup" style="min-height:36px;padding:6px 10px;font-size:12px">连接</button></header>
<main>
  <section id="tasks" class="active"><h2>任务 / Agents</h2><div id="taskList"></div></section>
  <section id="board"><h2>看板 · 四列</h2><div id="boardList"></div></section>
  <section id="approvals"><h2>等待你处理</h2><div id="approvalList"></div></section>
  <section id="terminal"><h2>远程交互式终端</h2>
    <div class="card"><p>终端在这台电脑上启动，命令只写入 shell 的标准输入。需要在「设置 → 远程访问」为本设备开启计算机访问权限。</p>
      <div class="row"><button class="primary grow" id="termOpen">连接终端</button><button id="termClose" disabled>断开</button></div>
      <p class="status" id="termStatus">未连接</p></div>
    <pre id="termOut"></pre>
    <div class="row"><input id="termIn" placeholder="输入命令后回车（不会自动替你执行其它命令）" autocomplete="off" autocapitalize="off" spellcheck="false" disabled><button class="primary" id="termSend" disabled>发送</button></div>
    <p class="hint">会话最多 4 个、空闲 10 分钟自动回收；单次输入上限 4096 字符。</p>
  </section>
</main>
<nav>
  <button data-tab="tasks" class="active"><span>▤</span>任务</button>
  <button data-tab="board"><span>▦</span>看板</button>
  <button data-tab="approvals"><span>✓</span>审批</button>
  <button data-tab="terminal"><span>›_</span>终端</button>
</nav>
<script>
(function(){
  var KEY='markbot.phone.token', BASE='', token=localStorage.getItem(KEY)||'', sessionId=null, streamAbort=null;
  var $=function(id){return document.getElementById(id)};
  function api(path, init){
    init=init||{};init.headers=Object.assign({'Authorization':'Bearer '+token},init.headers||{});
    if(init.body&&!init.headers['Content-Type'])init.headers['Content-Type']='application/json';
    return fetch(BASE+path,init).then(function(r){return r.json().then(function(d){return {ok:r.ok,status:r.status,data:d}}).catch(function(){return {ok:r.ok,status:r.status,data:{}}})});
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function status(text,on){$('dot').className='dot'+(on?' on':'');$('sub').textContent='手机工作台 · '+text}
  function tab(name){Array.prototype.forEach.call(document.querySelectorAll('nav button'),function(b){b.className=b.getAttribute('data-tab')===name?'active':''});Array.prototype.forEach.call(document.querySelectorAll('main section'),function(s){s.className=s.id===name?'active':''})}
  Array.prototype.forEach.call(document.querySelectorAll('nav button'),function(b){b.onclick=function(){tab(b.getAttribute('data-tab'))}});
  $('setup').onclick=function(){var next=prompt('设备令牌（在电脑端配对后取得）',token);if(next!==null){token=next.trim();localStorage.setItem(KEY,token);refresh()}};

  function botCard(bot){
    var busy=bot.busy||bot.activity==='working', asks=bot.openAsks||0;
    return '<div class="card"><h3>'+esc(bot.name||bot.id)+'<span class="badge '+(busy?'warn':'ok')+'">'+(busy?'执行中':'空闲')+'</span></h3>'+
      '<p>'+esc(bot.modelSelection&&bot.modelSelection.model||'')+' · '+esc(bot.section||'未分组')+'</p>'+
      (asks?'<p style="color:var(--warn);margin-top:6px">'+asks+' 项等待你处理</p>':'')+
      '<div class="row"><input class="grow" placeholder="给这个 Agent 发消息" data-send="'+esc(bot.id)+'"><button data-sendbtn="'+esc(bot.id)+'">发送</button></div></div>';
  }
  function column(state){return state==='running'?'in-progress':state==='done'?'done':state==='review'?'blocked':'todo'}
  function refresh(){
    if(!token){status('未连接（点右上「连接」填令牌）',false);$('taskList').innerHTML='<p class="hint">先在电脑端「设置 → 远程访问」配对手机，然后点右上角「连接」填入设备令牌。</p>';return}
    api('/api/bots').then(function(r){
      if(!r.ok){status('连接失败 · HTTP '+r.status,false);$('taskList').innerHTML='<p class="err">'+esc(r.data.error||'无法读取')+'</p>';return}
      status('已连接',true);
      var bots=Array.isArray(r.data.bots)?r.data.bots:(Array.isArray(r.data)?r.data:[]);
      var html=bots.map(botCard).join('');$('taskList').innerHTML=html||'<p class="hint">还没有 Agent。</p>';
      var groups={todo:[],'in-progress':[],done:[],blocked:[]};
      bots.forEach(function(b){var s=b.activity==='waiting-on-you'||b.openAsks>0?'needs-you':b.busy?'running':'done';groups[column(s)].push(b)});
      var names={todo:'TO DO',in-progress:'IN PROGRESS',done:'DONE',blocked:'BLOCKED'};
      $('boardList').innerHTML=Object.keys(names).map(function(k){return '<div class="card"><h3>'+names[k]+' <span class="badge">'+groups[k].length+'</span></h3><p>'+(groups[k].map(function(b){return esc(b.name)}).join('、')||'—')+'</p></div>'}).join('');
      var waiting=bots.filter(function(b){return b.activity==='waiting-on-you'||b.openAsks>0});
      $('approvalList').innerHTML=waiting.length?waiting.map(botCard).join(''):'<p class="hint">暂时没有需要你处理的事项。</p>';
      Array.prototype.forEach.call(document.querySelectorAll('[data-sendbtn]'),function(btn){btn.onclick=function(){
        var id=btn.getAttribute('data-sendbtn'),input=document.querySelector('[data-send="'+id+'"]'),text=input&&input.value.trim();
        if(!text)return;api('/api/bots/'+encodeURIComponent(id)+'/messages',{method:'POST',body:JSON.stringify({text:text})}).then(function(res){input.value='';status(res.ok?'已派发':'派发失败',res.ok)});
      }});
    }).catch(function(e){status('网络错误',false);$('taskList').innerHTML='<p class="err">'+esc(e.message)+'</p>'});
  }

  function append(text,stream){var out=$('termOut');out.textContent+=text;out.scrollTop=out.scrollHeight}
  function termStatus(text){$('termStatus').textContent=text}
  $('termOpen').onclick=function(){
    if(!token){termStatus('请先点右上角「连接」填入设备令牌');return}
    $('termOpen').disabled=true;
    api('/api/terminal/sessions',{method:'POST',body:'{}'}).then(function(r){
      if(!r.ok){termStatus('无法连接：'+(r.data.error||r.status));$('termOpen').disabled=false;return}
      sessionId=r.data.id;termStatus('已连接 · '+esc(r.data.shell||'shell'));
      $('termClose').disabled=false;$('termIn').disabled=false;$('termSend').disabled=false;$('termOut').textContent='';
      streamAbort=new AbortController();
      fetch(BASE+'/api/terminal/sessions/'+sessionId+'/stream',{headers:{'Authorization':'Bearer '+token},signal:streamAbort.signal}).then(function(res){
        if(!res.ok||!res.body)throw new Error('SSE '+res.status);
        var reader=res.body.getReader(),dec=new TextDecoder(),buf='';
        function pump(){return reader.read().then(function(step){
          if(step.done){termStatus('终端流已结束');return}
          buf+=dec.decode(step.value,{stream:true});var parts=buf.split('\\n\\n');buf=parts.pop();
          parts.forEach(function(block){block.split('\\n').forEach(function(line){if(line.indexOf('data: ')===0){try{var d=JSON.parse(line.slice(6));append((d.text||'')+(d.stream==='stdout'?'':'\\n'),d.stream)}catch(e){}}})});
          return pump()})}
        return pump();
      }).catch(function(e){if(e.name!=='AbortError')termStatus('流中断：'+e.message)});
    }).catch(function(e){termStatus('网络错误：'+e.message);$('termOpen').disabled=false});
  };
  function send(){var input=$('termIn'),text=input.value;if(!sessionId||!text)return;input.value='';
    api('/api/terminal/sessions/'+sessionId+'/input',{method:'POST',body:JSON.stringify({text:text})}).then(function(r){if(!r.ok)append('\\n[输入失败] '+(r.data.error||r.status)+'\\n','stderr')})}
  $('termSend').onclick=send;
  $('termIn').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();send()}};
  $('termClose').onclick=function(){
    if(streamAbort)streamAbort.abort();
    if(sessionId)api('/api/terminal/sessions/'+sessionId,{method:'DELETE'});
    sessionId=null;$('termClose').disabled=true;$('termIn').disabled=true;$('termSend').disabled=true;$('termOpen').disabled=false;termStatus('已断开');
  };
  refresh();
})();
</script></body></html>`;
