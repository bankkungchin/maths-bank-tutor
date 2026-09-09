






/* ============================================================
   dashboard.js — logic ทั้งหมด (render / fetch / combobox / ฝึก / พิมพ์)
   โหลดหลัง config.js และ questionbank.js
   ── v2.0 ──
   เพิ่ม: การ์ดพัฒนาการ + trend รายครั้ง, checkbox แผนทบทวน (จำใน localStorage),
   จุดอ่อนเรื้อรัง, รายงานผู้ปกครอง 5 สไตล์ (🦅🐬🐘🦉🐝),
   แก้บั๊กกล่อง "จุดต้องแก้" ไม่รวมคอนเซปต์, เลิก hardcode "129 ข้อ"
   ── v2.1 ──
   เพิ่ม renderProgressTrend() สำหรับแท็บ 📈 พัฒนาการ (pane-progress),
   แก้ dropdown รายชื่อโชว์ครบทุกคน (เดิมตัดที่ 80 ชื่อ ทำให้กลุ่มวันจันทร์หาย),
   switchTab รองรับจำนวนแท็บไม่จำกัด, ปุ่มสลับธีม สว่าง/มืด/ตามระบบ,
   ปรับข้อความ 🦉/🐘 ไม่ผูกมัดว่าครูจะติดต่อผู้ปกครอง
   ── v3.1 (SECURITY) ──
   ย้าย login/data ไปเป็น POST — PIN ไม่ไปโผล่ใน URL อีก (ของเดิม v3.0 ส่งเป็น query string)
   ── v3.0 (SECURITY) ──
   รองรับ Apps Script proxy: ถ้า config.js มี PROXY_URL → ทุกอย่างวิ่งผ่าน proxy
   (ไม่ใช้ API key ฝั่งเว็บ, PIN ตรวจฝั่งเซิร์ฟเวอร์, กันเดา PIN รัว)
   ถ้ายังไม่มี PROXY_URL → ทำงานแบบเดิมทุกประการ (ช่วงเปลี่ยนผ่านเว็บไม่ล่ม)
   ============================================================ */
const _USE_PROXY=()=> (typeof PROXY_URL!=='undefined' && PROXY_URL);
/* ⚠️ PIN ต้องส่งด้วย POST เท่านั้น — ถ้าใส่ใน query string มันจะไปติดใน
   ประวัติเบราว์เซอร์ / Referer / log ของ Apps Script ตลอดไป
   (Content-Type ต้องเป็น text/plain ไม่งั้น Apps Script โดน CORS preflight ปัด) */
async function _proxyPost(payload){
  const res = await fetch(PROXY_URL, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(payload)
  });
  return res.json();
}
let pinBuffer='', pinAttempts=0, currentStudent='', currentPin='';
let dashData = null;let dashErr='';let selectedGroups=null;
let diffChartInst=null, groupChartInst=null, distChartInst=null;
let trendChartInst=null, mixChartInst=null;

function goTo(id){ document.querySelectorAll('.page').forEach(p=>p.classList.remove('active')); document.getElementById(id).classList.add('active'); window.scrollTo(0,0); }
function resetAll(){ pinBuffer=''; pinAttempts=0; updatePinDots(); document.getElementById('attemptsMsg').textContent=''; document.getElementById('p2status').textContent=''; }

let studentList=[], selectedStudent='', comboIdx=-1;
/* ⚠️ 18 ส.ค. 69: ทุก fetch ที่ยิง Google Sheets API ต้องต่อ &t=Date.now() เสมอ
   ไม่งั้นเบราว์เซอร์แคชคำตอบเดิมไว้ → ครูกรอกคะแนนใหม่แล้วนักเรียนยังเห็นข้อมูลเก่า
   (หน้าครู teacher-dashboard.html ทำแบบนี้อยู่แล้ว จึงเห็นคะแนนใหม่ทันที) */
async function loadStudents(){
  document.getElementById('p1status').className='status';
  document.getElementById('p1status').textContent='กำลังโหลดรายชื่อ...';
  try{
    if(_USE_PROXY()){
      const res=await fetch(PROXY_URL+'?action=students&t='+Date.now());
      const data=await res.json();
      if(!data.ok){document.getElementById('p1status').className='status err';document.getElementById('p1status').textContent='Error: '+(data.error||'โหลดรายชื่อไม่ได้');return;}
      studentList=data.students||[];
    }else{
      const res=await fetch(`${BASE}/${SHEET_ID}/values/students!B2:B500?key=${API_KEY}&t=${Date.now()}`);
      const data=await res.json();
      if(data.error){document.getElementById('p1status').className='status err';document.getElementById('p1status').textContent='Error: '+data.error.message;return;}
      const seen=new Set(); studentList=[];
      (data.values||[]).forEach(r=>{if(r[0]&&!seen.has(r[0])){seen.add(r[0]);studentList.push(r[0]);}});
    }
    document.getElementById('p1status').className='status ok';
    document.getElementById('p1status').textContent=`โหลดแล้ว ${studentList.length} คน — พิมพ์ชื่อเพื่อค้นหาได้เลย ✓`;
    const inp=document.getElementById('studentSearch'); if(inp){inp.placeholder='พิมพ์ชื่อเพื่อค้นหา… ('+studentList.length+' คน)';}
  }catch(e){document.getElementById('p1status').className='status err';document.getElementById('p1status').textContent='โหลดไม่ได้: '+e.message;}
}
/* ═══════════════════════════════════════════════════════════════
   วันที่ — เพิ่ม 13 ส.ค. 69
   ชีตตั้ง locale อเมริกา Google Sheets API จึงส่งวันที่กลับมาเป็นข้อความ
   "7/23/2026" = เดือน/วัน/ปี  ทำให้ (1) แสดงผลสลับ (2) เรียงลำดับไม่ได้
   ⚠️ ห้ามแก้ด้วยการเปลี่ยน locale ของชีต เพราะ saveExamScore ฝั่ง Apps Script
      รับค่าเป็น M/D/YYYY อยู่ — ต้องแก้ที่ฝั่งแสดงผลเท่านั้น
   ═══════════════════════════════════════════════════════════════ */
function _dMake(y,mo,d){ if(y>2400)y-=543; return new Date(y,mo-1,d); }

/* อ่านวันที่ได้ทุกรูปแบบที่เจอในชีต → Date (อ่านไม่ออกคืน null) */
function _dParse(v){
  if(v instanceof Date) return v;
  var s=String(v==null?'':v).trim();
  if(!s) return null;
  var m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);            // 2026-08-01
  if(m) return _dMake(+m[1],+m[2],+m[3]);
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);   // 7/23/2026 หรือ 23/7/2026
  if(m){ var a=+m[1],b=+m[2];
         return a>12 ? _dMake(+m[3],b,a) : _dMake(+m[3],a,b); }  // ตัวแรก>12 = วันมาก่อน
  var t=Date.parse(s);
  return isNaN(t)?null:new Date(t);
}

/* แสดงผลเป็น วัน/เดือน/ปี พ.ศ. เช่น 23/07/2569
   ── อยากกลับไปใช้ ค.ศ. (23/07/2026) เปลี่ยน DATE_BE เป็น false บรรทัดเดียวจบ ── */
var DATE_BE = true;
function _dFmt(v){
  var d=_dParse(v);
  if(!d) return String(v==null?'':v);
  var p=function(n){ return ('0'+n).slice(-2); };
  return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+(d.getFullYear()+(DATE_BE?543:0));
}

/* คีย์สำหรับเรียงลำดับ — อ่านวันที่ไม่ออกให้ไปอยู่ท้ายสุด */
function _dKey(v){ var d=_dParse(v); return d?d.getTime():8.64e15; }

function _esc(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function filterStudents(){
  const inp=document.getElementById('studentSearch'); const box=document.getElementById('studentOptions');
  if(!inp||!box)return;
  const q=inp.value.trim().toLowerCase();
  if(selectedStudent && inp.value!==selectedStudent) selectedStudent='';
  if(!studentList.length){ box.innerHTML='<div class="combo-empty">กด "โหลดรายชื่อ" ก่อนครับ</div>'; box.classList.add('open'); return; }
  let matches = q ? studentList.filter(n=>n.toLowerCase().includes(q)) : studentList.slice();
  comboIdx=-1;
  if(!matches.length){ box.innerHTML='<div class="combo-empty">ไม่พบชื่อที่ตรงกับ "'+_esc(inp.value)+'"</div>'; box.classList.add('open'); return; }
  box.innerHTML = matches.map((n,i)=>{
    let disp=_esc(n);
    if(q){ const idx=n.toLowerCase().indexOf(q); if(idx>=0){ disp=_esc(n.slice(0,idx))+'<span class="hl">'+_esc(n.slice(idx,idx+q.length))+'</span>'+_esc(n.slice(idx+q.length)); } }
    return `<div class="combo-opt" data-name="${_esc(n)}" onclick="pickStudent(this.getAttribute('data-name'))">${disp}</div>`;
  }).join('');
  box.classList.add('open');
}
function pickStudent(name){
  selectedStudent=name;
  const inp=document.getElementById('studentSearch'); if(inp)inp.value=name;
  document.getElementById('studentOptions').classList.remove('open');
  document.getElementById('p1status').textContent='';
}
function comboKey(e){
  const box=document.getElementById('studentOptions');
  const opts=[...box.querySelectorAll('.combo-opt')];
  if(e.key==='ArrowDown'){e.preventDefault();comboIdx=Math.min(comboIdx+1,opts.length-1);}
  else if(e.key==='ArrowUp'){e.preventDefault();comboIdx=Math.max(comboIdx-1,0);}
  else if(e.key==='Enter'){e.preventDefault(); if(comboIdx>=0&&opts[comboIdx]){pickStudent(opts[comboIdx].getAttribute('data-name'));} else if(opts.length===1){pickStudent(opts[0].getAttribute('data-name'));} else {goToPin();} return;}
  else return;
  opts.forEach((o,i)=>o.classList.toggle('active',i===comboIdx));
  if(opts[comboIdx])opts[comboIdx].scrollIntoView({block:'nearest'});
}
document.addEventListener('click',e=>{ const c=document.getElementById('studentCombo'); const box=document.getElementById('studentOptions'); if(c&&box&&!c.contains(e.target))box.classList.remove('open'); });

function goToPin(){
  let name=selectedStudent;
  if(!name){ const typed=(document.getElementById('studentSearch').value||'').trim(); const exact=studentList.find(n=>n===typed); const ci=typed?studentList.filter(n=>n.toLowerCase().includes(typed.toLowerCase())):[]; if(exact)name=exact; else if(ci.length===1)name=ci[0]; }
  if(!name){document.getElementById('p1status').className='status err';document.getElementById('p1status').textContent='กรุณาพิมพ์แล้วเลือกชื่อจากรายการก่อนครับ';return;}
  selectedStudent=name; document.getElementById('studentSearch').value=name; document.getElementById('studentOptions').classList.remove('open');
  currentStudent=name;
  const short=name.replace(/\s*\(.*\)/,'');
  document.getElementById('p2avatar').textContent=short.substring(0,3);
  document.getElementById('p2name').textContent=short;
  pinBuffer=''; pinAttempts=0; updatePinDots();
  document.getElementById('attemptsMsg').textContent='';
  document.getElementById('p2status').textContent='';
  goTo('p2');
}

function updatePinDots(shake=false,isError=false){
  for(let i=0;i<4;i++){
    const d=document.getElementById('dot'+i);
    d.className='pin-dot'+(i<pinBuffer.length?(isError?' error':' filled'):'');
  }
  if(shake){const disp=document.getElementById('pinDots');disp.style.animation='none';disp.offsetHeight;disp.style.animation='shake .4s ease';}
}
function pinAdd(n){if(pinBuffer.length>=4)return;pinBuffer+=String(n);updatePinDots();if(pinBuffer.length===4)setTimeout(verifyPin,150);}
function pinDel(){if(pinBuffer.length>0){pinBuffer=pinBuffer.slice(0,-1);updatePinDots();}}

async function verifyPin(){
  document.getElementById('p2status').textContent='กำลังตรวจสอบ...';
  try{
    let pinOk=false, pinErr='';
    if(_USE_PROXY()){
      // v3: ตรวจ PIN ฝั่งเซิร์ฟเวอร์ — PIN ของคนอื่นไม่ถูกส่งมาที่เบราว์เซอร์เลย
      const data=await _proxyPost({action:'webLogin', name:currentStudent, pin:pinBuffer});
      pinOk=!!data.ok; pinErr=data.error||'';
    }else{
      const res=await fetch(`${BASE}/${SHEET_ID}/values/students!B2:F500?key=${API_KEY}&t=${Date.now()}`);
      const data=await res.json();
      if(data.error){document.getElementById('p2status').textContent='Error: '+data.error.message;return;}
      const rows=data.values||[];
      const row=rows.find(r=>r[0]===currentStudent);
      const correctPin=row&&row[4]?String(row[4]).trim():null;
      if(!correctPin){pinErr='ยังไม่ได้ตั้ง PIN — กรุณาติดต่อครู';}
      else pinOk=(pinBuffer===correctPin);
    }
    // error พิเศษ (ยังไม่ตั้ง PIN / โดนล็อกชั่วคราว) → แจ้งตรงๆ ไม่นับครั้งผิด
    if(!pinOk&&pinErr&&pinErr!=='PIN ไม่ถูกต้อง'){
      document.getElementById('p2status').className='status err';
      document.getElementById('p2status').textContent=pinErr;
      pinBuffer=''; updatePinDots(); return;
    }
    if(pinOk){
      currentPin=pinBuffer;
      document.getElementById('p2status').textContent='';
      const short=currentStudent.replace(/\s*\(.*\)/,'');
      document.getElementById('modeAvatar').textContent=short.substring(0,3);
      document.getElementById('modeName').textContent=short;
      await fetchDashData();
      goTo('p3');
    } else {
      pinAttempts++;
      updatePinDots(true,true);
      const rem=5-pinAttempts;
      if(pinAttempts>=5){document.getElementById('attemptsMsg').textContent='PIN ผิดหลายครั้ง กรุณาติดต่อครู';document.querySelectorAll('.num-btn').forEach(b=>b.disabled=true);}
      else{document.getElementById('attemptsMsg').textContent=`PIN ไม่ถูกต้อง (เหลือ ${rem} ครั้ง)`;}
      document.getElementById('p2status').textContent='';
      setTimeout(()=>{pinBuffer='';updatePinDots();},600);
    }
  }catch(e){document.getElementById('p2status').textContent='เกิดข้อผิดพลาด: '+e.message;pinBuffer='';updatePinDots();}
}

// ── YouTube: ค้นหาคลิปในช่อง mathsbanktutor ตามหัวข้อ ──
function ytLink(topic){
  return 'https://www.youtube.com/@' + YT_CHANNEL + '/search?query=' + encodeURIComponent(topic);
}
function ytBtn(query,label){
  return `<a href="${ytLink(query)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;background:var(--surf,#FAF9F5);color:#B3261E;border:1px solid #E4C7C5;font-size:11px;font-weight:500;padding:4px 10px;border-radius:12px;text-decoration:none;margin-top:6px" class="subtopic-clip-btn">▶ ${label||'ดูคลิปติว'}</a>`;
}



/* ★ 29 ส.ค. 69 — คะแนนไม่เท่ากันทุกข้อ (ชุดรวม/สนามสอบ)
   ตัวจริงอยู่ใน questionbank.js (MOCK_SETS) — ตรงนี้เป็นทางถอยเผื่อโหลดไฟล์เก่าค้าง
   บทปกติจะได้ 30 เสมอ พฤติกรรมเดิมจึงไม่เปลี่ยน */
function _fullOf(topic){
  try{ if(typeof fullScoreOf==='function') return fullScoreOf(topic); }catch(e){}
  return 30;
}
function _scoreOf(row, topic){
  try{ if(typeof scoreOfRow==='function') return scoreOfRow(row, topic); }catch(e){}
  return parseInt(row[36])||0;
}
function _isMock(t){
  try{ if(typeof isMockChapter==='function') return isMockChapter(t); }catch(e){}
  return /^ชุดรวม\s*\d*/.test(String(t||'').trim());
}

/* ถ้าเก็บข้อที่สะเพร่าได้ครบ จะได้คะแนนเท่าไร — ชุดรวมต้องบวกตามคะแนนรายข้อ ไม่ใช่ +1 ต่อข้อ */
function _careGain(d){
  const full=d.full||30;
  if(full===30) return Math.min(30,(d.score||0)+(d.care||0));
  let g=0;
  for(let q=1;q<=30;q++){
    if((d.qResults||{})[q]==='care'){
      try{ g+= (typeof ptsOfQuestion==='function')?ptsOfQuestion(d.topic,q):1; }catch(e){ g+=1; }
    }
  }
  return Math.min(full,(d.score||0)+g);
}

// ── emoji ของหมวด: ถ้าชื่อหมวดมี emoji นำหน้าแล้ว (บทใหม่) → ไม่เติมซ้ำ ──
function emojiOf(cat){
  cat=cat||'';
  if(/^[\u{1F534}\u{1F535}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{1F7E3}\u{1F7E4}\u{26AB}\u{26AA}]/u.test(cat)) return '';
  return (typeof CAT_EMOJI!=='undefined' && CAT_EMOJI[cat]) || '\u2022';
}
// ── หมวดหมู่: แปลงชื่อ sub-topic ของข้อสอบ → หมวดของคลังฝึก ──
// บทแบบใหม่ (ตรีโกณ ฯลฯ): sub = ชื่อหมวดพร้อม emoji อยู่แล้ว → คืนค่าตรงๆ
// บทเก่า (Expo Logarithm): เดาหมวดจาก keyword
function catOf(s){
  s=s||'';
  // ถ้าขึ้นต้นด้วย emoji วงกลมสี (หมวดแบบใหม่) → เป็นชื่อหมวดอยู่แล้ว คืนค่าตรงๆ
  if(/^[\u{1F534}\u{1F535}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{1F7E3}\u{1F7E4}\u{26AB}\u{26AA}]/u.test(s)) return s;
  // ── logic เดิมสำหรับ Expo Logarithm ──
  if(/อสมการ/.test(s)){ if(/ล็อก|log/i.test(s)) return 'อสมการล็อการิทึม'; return 'อสมการเอกซ์โพเนนเชียล'; }
  if(/กราฟ|เปรียบเทียบ/.test(s)) return 'กราฟฟังก์ชัน';
  if(/ประยุกต์/.test(s)) return 'โจทย์ประยุกต์';
  if(/สมบัติ|ทฤษฎี|แปลงฐาน/.test(s)) return 'สมบัติ/ทฤษฎีบท';
  if(/ล็อก|log/i.test(s)) return 'สมการล็อการิทึม';
  if(/เอกซ์โพ|expo/i.test(s)) return 'สมการเอกซ์โพเนนเชียล';
  return 'สมบัติ/ทฤษฎีบท';
}
function _shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// ── พิมพ์ชุดฝึกออกมาเป็นกระดาษ/PDF ──
function printPracticeSet(){
  const p=window.__practicePlan;
  if(!p||!p.cats||!p.cats.length){alert('ยังไม่มีชุดฝึก — ทำได้แม่นทุกหัวข้อแล้วครับ');return;}
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  let body='';
  p.cats.forEach(c=>{
    let rows='';
    c.picks.forEach(q=>{
      const stars='★'.repeat(q.l)+'☆'.repeat(5-q.l);
      rows+=`<tr><td class="chk">☐</td><td class="qn">ข้อ ${q.n}</td><td class="src">${esc(q.s)}</td><td class="lvl">ระดับ ${q.l} ${stars}</td><td class="yt"><a href="${q.yt}">▶ ดูเฉลย</a><div class="url">${esc(q.yt)}</div></td></tr>`;
    });
    body+=`<div class="cat"><div class="cat-h"><span>${c.emoji} ${esc(c.cat)}</span><span class="pct">พลาด ${c.pct}% · ฝึก ${c.picks.length} ข้อ</span></div><table>${rows}</table></div>`;
  });
  const doc=`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ชุดฝึก ${esc(p.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:'Sarabun',sans-serif}
body{padding:28px 30px;color:#1a1a1a;font-size:13px}
.hd{border-bottom:2px solid #185FA5;padding-bottom:12px;margin-bottom:18px}
.hd h1{font-size:20px;font-weight:700;color:#185FA5}
.hd .meta{font-size:13px;color:#555;margin-top:4px}
.hd .sum{font-size:12px;color:#777;margin-top:6px}
.cat{margin-bottom:18px;page-break-inside:avoid}
.cat-h{display:flex;justify-content:space-between;align-items:center;background:#F0EEE9;border-radius:6px;padding:8px 12px;font-weight:600;font-size:14px;margin-bottom:6px}
.cat-h .pct{font-size:12px;color:#A32D2D;font-weight:500}
table{width:100%;border-collapse:collapse}
td{padding:7px 8px;border-bottom:1px solid #e5e5e5;vertical-align:top}
.chk{font-size:16px;width:24px}
.qn{font-weight:600;white-space:nowrap;width:60px}
.src{color:#444}
.lvl{color:#BA7517;white-space:nowrap;font-size:11px}
.yt a{color:#B3261E;text-decoration:none;font-weight:600;font-size:12px}
.yt .url{font-size:9px;color:#999;word-break:break-all;margin-top:2px}
.ft{margin-top:20px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#888;line-height:1.6}
@media print{body{padding:0}@page{margin:1.4cm}}
</style></head><body>
<div class="hd"><h1>🎯 ชุดฝึกเพิ่ม — ${esc(p.name)}</h1><div class="meta">บท ${esc(p.topic)} · จากผลสอบวันที่ ${esc(_dFmt(p.date))}</div><div class="sum">รวม ${p.grand} ข้อ · เลือกจากคลังข้อสอบจริง ${p.bankCount||''} ข้อ ตามสัดส่วนที่ยังไม่แม่น</div></div>
${body}
<div class="ft">วิธีใช้: ทำโจทย์แต่ละข้อก่อน (เปิดหนังสือรวมข้อสอบบท Expo+Log ตาม "ข้อ N") แล้วเช็กกล่อง ☐ เมื่อทำเสร็จ จากนั้นดูเฉลยวิดีโอตามลิงก์เพื่อทบทวนวิธีคิด · MathsBankTutor</div>
</body></html>`;
  const f=document.createElement('iframe');
  f.style.position='fixed';f.style.right='0';f.style.bottom='0';f.style.width='0';f.style.height='0';f.style.border='0';
  document.body.appendChild(f);
  const fd=f.contentWindow.document; fd.open(); fd.write(doc); fd.close();
  const go=()=>{ try{f.contentWindow.focus();f.contentWindow.print();}catch(e){} setTimeout(()=>{document.body.removeChild(f);},1500); };
  setTimeout(go,600);
}

// ── แผนฝึกเพิ่ม: เลือกข้อจากคลัง 129 ข้อ ตามสัดส่วนที่พลาดในแต่ละหัวข้อ ──

/* ═══════════════════════════════════════════════════════════════
   ★ 29 ส.ค. 69 — สนามสอบ (ชุดรวมทุกบท) ฝั่งนักเรียน
   1) เติมชุดรวมเข้าช่องเลือกบทเอง — ไม่ต้องแก้ index.html
   2) การ์ด "จุดอ่อนรายบท" — สร้าง element เองแล้วแทรกก่อนแท็บฝึกเพิ่ม
   3) แท็บฝึกเพิ่มแบบข้ามบท — จัดกลุ่มตามบท เรียงบทที่พลาดหนักสุดก่อน
   ═══════════════════════════════════════════════════════════════ */

/* เติม option ชุดรวมเข้า #topicFilter (เรียกซ้ำได้ ไม่เพิ่มซ้ำ) */
function ensureMockOptions(){
  const sel=document.getElementById('topicFilter');
  if(!sel||typeof MOCK_SETS==='undefined')return;
  const have={}; Array.from(sel.options).forEach(o=>{have[String(o.value).trim()]=1;});
  Object.keys(MOCK_SETS).sort().forEach(k=>{
    if(have[k])return;
    const o=document.createElement('option');
    o.value=k;
    o.textContent='🎯 '+k+(MOCK_SETS[k].title?' · '+MOCK_SETS[k].title:'');
    sel.appendChild(o);
  });
}

/* ข้อที่ออกในชุดรวม แยกตามบท → [{ch, ok, total, miss:[{q,sub,also}]}] เรียงพลาดหนักสุดก่อน */
function mockByChapter(d){
  const qb=(typeof EMBEDDED_QB!=='undefined')?EMBEDDED_QB[d.topic]:null;
  if(!qb)return[];
  const by={};
  for(let q=1;q<=30;q++){
    const info=qb[q]; if(!info||!info.ch)continue;
    const st=(d.qResults||{})[q];
    if(!st||st==='blank')continue;                  /* ข้อที่ไม่ได้ทำ/ยังไม่กรอก — ไม่นับ */
    const g=by[info.ch]||(by[info.ch]={ch:info.ch,ok:0,total:0,qs:[],miss:[]});
    g.total++; g.qs.push(q);
    if(st==='ok')g.ok++;
    else g.miss.push({q:q,sub:info.sub||'',also:info.also||[],st:st});
  }
  return Object.values(by).sort((a,b)=>{
    const ra=(a.total-a.ok)/a.total, rb=(b.total-b.ok)/b.total;
    return rb-ra || (b.total-b.ok)-(a.total-a.ok) || a.ch.localeCompare(b.ch,'th');
  });
}

/* ── การ์ดจุดอ่อนรายบท (เฉพาะสนามสอบ) ── */
function renderChapterWeak(d){
  const host=document.getElementById('s-practice'); if(!host)return;
  let el=document.getElementById('s-chapweak');
  if(!d.isMock){ if(el)el.innerHTML=''; return; }
  if(!el){ el=document.createElement('div'); el.id='s-chapweak'; host.parentNode.insertBefore(el,host); }

  const list=mockByChapter(d);
  if(!list.length){ el.innerHTML=''; return; }

  const weak=list.filter(g=>g.ok<g.total);
  const perfect=list.filter(g=>g.ok===g.total);
  const colorOf=r=>r>=0.7?'#B42318':r>=0.5?'#C2410C':'#D97706';

  const rows=weak.map(g=>{
    const missN=g.total-g.ok, r=missN/g.total, pct=Math.round(r*100);
    return '<div style="display:grid;grid-template-columns:minmax(96px,150px) 1fr 66px;gap:9px;align-items:center;padding:4px 0">'
      + '<div style="font-size:12.5px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+_esc(g.ch)+'">'+_esc(g.ch)+'</div>'
      + '<div style="height:15px;background:rgba(128,128,128,.13);border-radius:4px;overflow:hidden">'
      +   '<div style="height:100%;width:'+pct+'%;background:'+colorOf(r)+';border-radius:0 4px 4px 0"></div></div>'
      + '<div style="font-size:11px;color:var(--text2);text-align:right;white-space:nowrap">'+g.ok+'/'+g.total+' ข้อ</div></div>';
  }).join('');

  const okLine=perfect.length
    ? '<div style="display:grid;grid-template-columns:minmax(96px,150px) 1fr 66px;gap:9px;align-items:center;padding:4px 0">'
      + '<div style="font-size:12.5px;text-align:right;color:var(--text2)">อีก '+perfect.length+' บท</div><div></div>'
      + '<div style="font-size:11px;color:var(--green,#2F855A);text-align:right">ถูกครบ ✓</div></div>'
    : '';

  const tbl=list.map(g=>'<tr><td style="padding:4px 6px;border-bottom:1px solid rgba(128,128,128,.15)">'+_esc(g.ch)
      +'</td><td style="padding:4px 6px;border-bottom:1px solid rgba(128,128,128,.15);font-size:11px;color:var(--text3)">ข้อ '+g.qs.join(', ')
      +'</td><td style="padding:4px 6px;border-bottom:1px solid rgba(128,128,128,.15);text-align:right">'+g.ok+'/'+g.total+'</td></tr>').join('');

  el.innerHTML='<div class="d-card"><div class="slabel">🧭 จุดอ่อนรายบท</div>'
    + '<div style="font-size:12.5px;color:var(--text2);line-height:1.7;margin-bottom:10px">'
    +   'ชุดนี้ออกคละ <b>'+list.length+' บท</b> — แท่งยาว = บทที่พลาดสัดส่วนมาก ควรกลับไปซ่อมก่อน</div>'
    + (rows||'<div style="font-size:13px;color:var(--green,#2F855A);padding:4px 0">ถูกครบทุกบทเลย เก่งมาก! 🎉</div>')
    + okLine
    + '<div style="font-size:11px;color:var(--text3);margin-top:9px;padding-top:8px;border-top:1px solid rgba(128,128,128,.15);line-height:1.8">'
    +   'ตัวเลขขวา = ทำถูก/ข้อที่ออกในบทนั้น · แถบแดงเข้ม = พลาด 70%+ · ส้ม = 50–69% · เหลือง = ต่ำกว่า 50%</div>'
    + '<details style="margin-top:8px"><summary style="font-size:12px;color:var(--text2);cursor:pointer">ดูว่าเป็นข้อไหนบ้าง</summary>'
    +   '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px">'+tbl+'</table></details>'
    + '</div>';
}

/* ── แท็บฝึกเพิ่มสำหรับสนามสอบ — แยกกลุ่มตามบท ── */
function renderMockPractice(d,el){
  const list=mockByChapter(d).filter(g=>g.miss.length);
  if(!list.length){
    el.innerHTML='<div class="d-card"><div class="slabel">🎯 ฝึกเพิ่มตามจุดที่พลาด</div>'
      +'<div style="font-size:14px;color:var(--green,#2F855A);padding:6px 0">ถูกครบทุกข้อในชุดนี้ ไม่ต้องฝึกเพิ่ม เก่งมาก! 🎉</div></div>';
    return;
  }

  /* คลังของบทหนึ่ง = คลังหลัก + คลัง Ent ของบทเดียวกัน */
  const bankOf=ch=>{
    let b=PRACTICE_BANK[ch];
    if(!b){ const base=String(ch).replace(/\s*ชุดที่\s*\d+\s*$/,'').trim(); b=PRACTICE_BANK[base]; }
    if(!b)return null;
    const base=String(ch).replace(/\s*ชุดที่\s*\d+\s*$/,'').trim();
    const ent=PRACTICE_BANK[base+' Ent'];
    return ent?b.concat(ent):b;
  };

  let grand=0; const cards=[]; const planForPrint=[];
  list.forEach((g,gi)=>{
    const missN=g.miss.length, rate=missN/g.total, pct=Math.round(rate*100);
    const bank=bankOf(g.ch);
    /* หมวดที่พลาดในบทนี้ (ไม่ซ้ำ) พร้อมจำนวนข้อที่พลาดในหมวดนั้น */
    const subs={};
    g.miss.forEach(m=>{ (subs[m.sub]=subs[m.sub]||{sub:m.sub,qs:[],also:m.also}).qs.push(m.q); });
    const subList=Object.values(subs);

    let rows='', picked=0;
    if(bank){
      subList.forEach(sObj=>{
        /* พลาดหมวดนี้กี่ข้อ → เสนอ 2 เท่า (อย่างน้อย 2 มากสุด 5) และไม่เกินที่คลังมีจริง */
        let pool=bank.filter(q=>q.c===sObj.sub);
        if(!pool.length){
          /* หมวดนี้ไม่มีในคลังของบทนี้ → ลองบทที่ข้อนั้นพาดถึง */
          (sObj.also||[]).forEach(alt=>{ const ab=bankOf(alt); if(ab)pool=pool.concat(ab.filter(q=>q.c===sObj.sub)); });
        }
        if(!pool.length)return;
        pool=pool.slice().sort((a,b)=>a.l-b.l);
        let need=Math.min(5,Math.max(2,sObj.qs.length*2));
        need=Math.min(need,pool.length);
        const pick=[];
        if(pool.length<=need){ pick.push.apply(pick,pool); }
        else { const step=pool.length/need; for(let i=0;i<need;i++)pick.push(pool[Math.floor(i*step)]); }
        picked+=pick.length; grand+=pick.length;
        planForPrint.push({cat:g.ch+' · '+sObj.sub,emoji:'',pct:pct,ok:g.ok,total:g.total,
          picks:pick.map(q=>({n:q.n,s:q.s,l:q.l,yt:q.yt}))});
        pick.forEach(q=>{
          const stars='★'.repeat(q.l)+'☆'.repeat(5-q.l);
          rows+='<div class="rev-row"><div style="flex:1"><div style="font-size:12px;color:var(--text1);font-weight:500">ข้อ '+q.n
            +' <span style="color:var(--text3);font-weight:400">· '+_esc(String(q.s||''))+'</span></div>'
            +'<div style="font-size:10px;color:var(--text3)">'+_esc(String(sObj.sub))+' · ระดับ '+q.l+' <span style="color:#BA7517">'+stars+'</span></div></div>'
            +'<a href="'+q.yt+'" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;background:var(--surf,#FAF9F5);color:#B3261E;border:1px solid #E4C7C5;font-size:11px;font-weight:500;padding:5px 12px;border-radius:12px;text-decoration:none;white-space:nowrap">▶ เฉลย</a></div>';
        });
      });
    }

    const missTxt=g.miss.map(m=>'<b>ข้อ '+m.q+'</b> · '+_esc(String(m.sub))).join(' &nbsp;·&nbsp; ');
    const badgeCls=rate>=0.7?'diff-bad':'diff-warn';
    const foot=!bank
      ? 'ยังไม่มีคลังฝึกของบท "'+_esc(g.ch)+'" ในระบบ'
      : (picked?('เลือกจากคลัง'+_esc(g.ch)+' '+bank.length+' ข้อ — เสนอ '+picked+' ข้อ ไล่จากง่ายไปยาก')
               :('คลังบทนี้ยังไม่มีข้อในหัวข้อที่พลาด'));

    cards.push('<div class="d-card" style="padding-top:12px">'
      + '<div style="display:flex;align-items:center;gap:9px;justify-content:space-between;flex-wrap:wrap;margin-bottom:5px">'
      +   '<div style="font-size:14px;font-weight:600;color:var(--text1)">'+(gi+1)+' · '+_esc(g.ch)+'</div>'
      +   '<div class="diff-badge '+badgeCls+'">พลาด '+pct+'%</div></div>'
      + '<div style="font-size:11.5px;color:var(--text2);line-height:1.8;margin-bottom:6px">ทำผิด '+missTxt+'</div>'
      + rows
      + '<div style="font-size:11px;color:var(--text3);margin-top:7px">'+foot+'</div></div>');
  });

  window.__practicePlan={name:d.shortName,topic:d.topic,date:d.date,grand:grand,bankCount:0,cats:planForPrint};
  const head='<div class="d-card"><div class="slabel">🎯 ฝึกเพิ่มตามจุดที่พลาด — '+grand+' ข้อ</div>'
    + '<div style="font-size:12px;color:var(--text2);line-height:1.6">สนามสอบออกคละบท — แยกเป็นกลุ่มตามบท เรียงบทที่พลาดหนักสุดไว้บน '
    + 'แต่ละข้อดึงจากคลังข้อสอบจริงที่<b>หัวข้อเดียวกับข้อที่ทำผิด</b> พร้อมลิงก์เฉลย ✨</div>'
    + (grand?'<button class="pr-print-btn" onclick="printPracticeSet()">🖨️ พิมพ์ชุดฝึก (PDF)</button>':'')
    + '</div>';
  el.innerHTML=head+cards.join('');
}

function renderPracticePlan(d){
  const el=document.getElementById('s-practice'); if(!el)return;
  /* ★ 29 ส.ค. 69 — สนามสอบออกคละบท ดึงคลังบทเดียวไม่พอ ต้องแยกกลุ่มตามบท */
  if(d.isMock){ renderMockPractice(d,el); return; }
  // หาคลังฝึก: ลองชื่อบทตรงๆ ก่อน ถ้าไม่เจอ ตัด "ชุดที่ N" ออกแล้วลองใหม่
  // normalize topic ก่อน lookup (เช่น "Exponential logarithm" → "Expo Logarithm")
  const _normT=(t)=>t?t.replace(/^Exponential logarithm/i,'Expo Logarithm'):t;
  const _nTopic=_normT(d.topic);
  let bank=PRACTICE_BANK[_nTopic];
  if(!bank){ const baseTopic=_nTopic.replace(/\s*ชุดที่\s*\d+\s*$/,'').trim(); bank=PRACTICE_BANK[baseTopic]; }
  // รวมคลัง Ent เข้ากับคลังหลัก (เช่น ตรีโกณมิติ + ตรีโกณมิติ Ent)
  if(bank){ const _base=_nTopic.replace(/\s*ชุดที่\s*\d+\s*$/,'').trim(); const _ent=PRACTICE_BANK[_base+' Ent']; if(_ent) bank=[...bank,..._ent]; }
  if(!bank){ el.innerHTML='<div class="d-card"><div style="font-size:13px;color:var(--text2);line-height:1.6;padding:4px 0">ยังไม่มีคลังฝึกพร้อมเฉลยวิดีโอสำหรับบท <b>'+d.topic+'</b> ครับ — ตอนนี้พร้อมบท: <b>'+Object.keys(PRACTICE_BANK).filter(k=>!/ Ent$/.test(k)).join(', ')+'</b></div></div>'; return; }
  // รวมยอดพลาดตามหมวด (จาก d.subtopics)
  const catMap={};
  d.subtopics.forEach(st=>{ const c=catOf(st.name); if(!catMap[c])catMap[c]={cat:c,ok:0,total:0}; catMap[c].ok+=st.ok; catMap[c].total+=st.total; });
  let cats=Object.values(catMap).map(c=>({cat:c.cat,ok:c.ok,total:c.total,miss:c.total-c.ok,rate:(c.total-c.ok)/c.total})).filter(c=>c.miss>0).sort((a,b)=>b.rate-a.rate||b.miss-a.miss);
  if(!cats.length){ el.innerHTML='<div class="d-card"><div class="slabel">🎯 ฝึกเพิ่มตามจุดที่พลาด</div><div style="font-size:14px;color:var(--green);padding:6px 0">ทำได้แม่นทุกหัวข้อแล้ว ไม่ต้องฝึกเพิ่ม เก่งมาก! 🎉 ลองท้าทายข้อยากขึ้นจากคลังได้เลย</div></div>'; return; }
  const cards=[]; let grand=0; const planForPrint=[];
  cats.forEach(c=>{
    const pct=Math.round(c.rate*100);
    let need=Math.min(8,Math.max(2,Math.round(c.rate*16)));   // พลาด 25% → ~4 ข้อ
    let pool=_shuffle(bank.filter(q=>q.c===c.cat)).sort((a,b)=>a.l-b.l);
    need=Math.min(need,pool.length);   // ไม่เกินจำนวนข้อที่มีจริงในหัวข้อนั้น (ไม่ยืมข้ามหัวข้อ)
    let pick=[];
    if(pool.length<=need){ pick=pool.slice(); }
    else { const step=pool.length/need; for(let i=0;i<need;i++) pick.push(pool[Math.floor(i*step)]); }
    grand+=pick.length;
    planForPrint.push({cat:c.cat,emoji:emojiOf(c.cat),pct:pct,ok:c.ok,total:c.total,picks:pick.map(q=>({n:q.n,s:q.s,l:q.l,yt:q.yt}))});
    const emoji=emojiOf(c.cat);
    let rows='';
    pick.forEach(q=>{ const stars='★'.repeat(q.l)+'☆'.repeat(5-q.l);
      rows+=`<div class="rev-row"><div style="flex:1"><div style="font-size:12px;color:var(--text1);font-weight:500">ข้อ ${q.n} <span style="color:var(--text3);font-weight:400">· ${q.s}</span></div><div style="font-size:10px;color:var(--text3)">ระดับ ${q.l} <span style="color:#BA7517">${stars}</span></div></div><a href="${q.yt}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:5px;background:var(--surf,#FAF9F5);color:#B3261E;border:1px solid #E4C7C5;font-size:11px;font-weight:500;padding:5px 12px;border-radius:12px;text-decoration:none;white-space:nowrap">▶ เฉลย</a></div>`; });
    cards.push(`<div class="d-card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><div style="font-size:14px;font-weight:500;color:var(--text1)">${emoji} ${c.cat}</div><div class="diff-badge ${pct>=50?'diff-bad':'diff-warn'}">พลาด ${pct}%</div></div><div style="font-size:11px;color:var(--text2);margin-bottom:8px">ทำได้ ${c.ok}/${c.total} ข้อในหัวข้อนี้ → แนะนำฝึก <b>${pick.length} ข้อ</b> จากคลังข้อสอบจริง</div>${rows}</div>`);
  });
  // เก็บแผนไว้สำหรับพิมพ์
  window.__practicePlan={name:d.shortName,topic:d.topic,date:d.date,grand,bankCount:bank.length,cats:planForPrint};
  const head=`<div class="d-card"><div class="slabel">🎯 ฝึกเพิ่มตามจุดที่พลาด — ${grand} ข้อ</div><div style="font-size:12px;color:var(--text2);line-height:1.6">เลือกโจทย์จากคลังข้อสอบจริง <b>${bank.length} ข้อ</b> ให้ตามสัดส่วนที่ยังไม่แม่นในแต่ละหัวข้อ — ยิ่งพลาดมาก ยิ่งได้ฝึกหัวข้อนั้นเยอะ แต่ละข้อมีลิงก์เฉลยวิดีโอให้ศึกษาเองต่อได้เลย ✨</div><button class="pr-print-btn" onclick="printPracticeSet()">🖨️ พิมพ์ชุดฝึก (PDF)</button></div>`;
  el.innerHTML=head+cards.join('');
}

function parseStatus(val){
  if(!val)return'blank';
  const v=val.trim();
  if(v==='✅'||v.includes('ถูก'))return'ok';
  if(v==='⚠️'||v.includes('สะเพร่า'))return'care';
  if(v==='C'||v.includes('คอนเซปต์'))return'concept';
  if(v==='X'||v.includes('ทำไม่ได้'))return'cant';
  if(v==='⏰'||v.includes('ไม่ทัน')||v.includes('ไม่ทำ'))return'timeout';
  if(v.includes('ผิด'))return'cant';
  return'blank';
}

async function fetchDashData(){
  selectedGroups=null; // reset ตัวกรองกลุ่มทุกครั้งที่ดึงข้อมูลใหม่
  const topicFilter=document.getElementById('topicFilter').value.trim();
  let resData,longData;
  if(_USE_PROXY()){
    // v3: ดึงผ่าน proxy — ต้องมี PIN ที่ถูกต้องเท่านั้น คนนอกดึงข้อมูลไม่ได้
    const j=await _proxyPost({action:'webData', name:currentStudent, pin:currentPin});
    if(!j.ok){dashData=null;dashErr='เชื่อมต่อระบบไม่ได้: '+(j.error||'ลองใหม่อีกครั้ง');return;}
    resData={values:j.results||[]}; longData={values:j.results_long||[]};
  }else{
    [resData,longData]=await Promise.all([
      fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent('results!A:AR')}?key=${API_KEY}&t=${Date.now()}`).then(r=>r.json()),
      fetch(`${BASE}/${SHEET_ID}/values/${encodeURIComponent('results_long!A:H')}?key=${API_KEY}&t=${Date.now()}`).then(r=>r.json())
    ]);
    if(resData.error){dashData=null;dashErr='เชื่อมต่อ Google Sheets ไม่ได้: '+(resData.error.message||'ตรวจสอบอินเทอร์เน็ต/API key');return;}
  }
  const rows=resData.values||[];
  const _norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const me=_norm(currentStudent);
  const allMine=rows.slice(1).filter(r=>_norm(r[1])===me);
  // เรียงตามวันที่สอบจริง — เดิมเรียงตามลำดับแถวในชีต (ลำดับที่ครูกรอก)
  // แก้จุดนี้จุดเดียวได้ทั้ง: ผลสอบ "ล่าสุด" · กราฟพัฒนาการ · ▲▼ เทียบครั้งก่อน · 🔥 ดีขึ้นติดกัน
  allMine.sort(function(a,b){ return _dKey(a&&a[3]) - _dKey(b&&b[3]); });
  const myRows=allMine.filter(r=>!topicFilter||(r[4]||'').includes(topicFilter));
  if(!myRows.length){
    dashData=null;
    if(!allMine.length){
      dashErr='ไม่พบผลสอบของ "'+currentStudent+'" ใน results\n\nสาเหตุที่พบบ่อย: ชื่อ/กลุ่มตอนกรอกผลไม่ตรงกับรายชื่อในระบบ (เช่น กลุ่มใหม่ที่ยังไม่ได้เพิ่ม)';
    }else{
      const topics=[...new Set(allMine.map(r=>r[4]))].join(', ');
      dashErr='"'+currentStudent+'" ยังไม่มีผลสอบบท "'+topicFilter+'"\n\nบทที่มีผลแล้ว: '+topics+'\nลองเปลี่ยนตัวกรองเป็น "ทุกบท" ดูครับ';
    }
    return;
  }
  dashErr='';
  const myRow=myRows[myRows.length-1];
  const group=myRow[2]||'',date=myRow[3]||'',topic=myRow[4]||'';
  const score=_scoreOf(myRow,topic),care=parseInt(myRow[37])||0,concept=parseInt(myRow[38])||0,cant=parseInt(myRow[39])||0,timeout=parseInt(myRow[40])||0,wrong=cant,blank=timeout;
  const qResults={};
  for(let i=1;i<=30;i++)qResults[i]=parseStatus(myRow[5+i]||'');
  const latestByName={};
  rows.slice(1).filter(r=>r[2]===group&&(!topicFilter||(r[4]||'').includes(topicFilter))).forEach(r=>{latestByName[r[1]]=r;});
  const groupMembers=Object.values(latestByName).map(r=>({name:r[1],score:_scoreOf(r,r[4]||topic),care:parseInt(r[37])||0,concept:parseInt(r[38])||0,cant:parseInt(r[39])||0,timeout:parseInt(r[40])||0,isMe:r[1]===currentStudent})).sort((a,b)=>b.score-a.score);
  const rank=groupMembers.findIndex(m=>m.isMe)+1;
  // เทียบทุกคนที่สอบบทเดียวกัน (ทุกกลุ่ม)
  const latestAllByName={};
  rows.slice(1).filter(r=>_norm(r[4])===_norm(topic)).forEach(r=>{latestAllByName[_norm(r[1])]=r;});
  const allMembers=Object.values(latestAllByName).map(r=>({name:r[1],group:r[2]||'',score:_scoreOf(r,r[4]||topic),care:parseInt(r[37])||0,concept:parseInt(r[38])||0,cant:parseInt(r[39])||0,timeout:parseInt(r[40])||0,isMe:_norm(r[1])===me})).sort((a,b)=>b.score-a.score);
  const allRank=allMembers.findIndex(m=>m.isMe)+1;
  const allAvg=allMembers.length?Math.round(allMembers.reduce((s,m)=>s+m.score,0)/allMembers.length):0;
  // รายชื่อกลุ่มทั้งหมดที่สอบบทนี้ (สำหรับ picker)
  const groupsInTopic=[...new Set(allMembers.map(m=>m.group).filter(Boolean))].sort();
  // ดึงจาก results_long: A=ชื่อ B=กลุ่ม C=วันที่ D=บท E=ข้อที่ F=สถานะ G=sub_topic H=ระดับ
  const longRows=(longData.values||[]).slice(1);
  let myAna=longRows.filter(r=>r[0]===currentStudent&&(!topicFilter||(r[3]||'').includes(topicFilter))&&(r[3]||'')===topic);
  // เติม sub/level จาก EMBEDDED_QB ถ้า results_long ไม่มี (column G/H ว่างหรือเป็น 0)
  // normalize topic name ให้ตรงกับ EMBEDDED_QB key
  const normTopic=(t)=>{
    if(!t) return t;
    // "Exponential logarithm" → "Expo Logarithm"
    return t.replace(/^Exponential logarithm/i,'Expo Logarithm')
            .replace(/^exponential logarithm/i,'Expo Logarithm');
  };
  const embTopic = normTopic(topic);
  if(myAna.length&&EMBEDDED_QB[embTopic]){
    myAna=myAna.map(r=>{
      const qNum=parseInt(r[4])||0;
      const qb=EMBEDDED_QB[embTopic][qNum]||{};
      const sub=(r[6]&&r[6]!=='—')?r[6]:(qb.sub||'—');
      const lvl=(parseInt(r[7])>0)?r[7]:(qb.level||0);
      return [r[0],r[1],r[2],r[3],r[4],r[5],sub,lvl];
    });
  }
  // dedup: เก็บเฉพาะ row แรกของแต่ละข้อ (กัน results_long มีหลาย row ต่อข้อ)
  const seenQ={}; myAna=myAna.filter(r=>{const q=r[4]; if(seenQ[q])return false; seenQ[q]=true; return true;});
  // Fallback: results_long ยังไม่มีข้อมูลการสอบนี้ → คำนวณจาก QUESTION_BANK ที่ฝังไว้
  if(!myAna.length&&EMBEDDED_QB[embTopic]){
    myAna=[];
    for(let q=1;q<=30;q++){
      const st=myRow[5+q]||'';
      if(!st)continue;
      const qb=EMBEDDED_QB[embTopic][q]||{};
      myAna.push([currentStudent,group,date,topic,q,st,qb.sub||'—',qb.level||0]);
    }
  }
  const stMap={};
  myAna.forEach(r=>{
    const st=r[6]||'',lv=parseInt(r[7])||0,status=parseStatus(r[5]||'');
    if(!st||st==='—')return;
    if(!stMap[st])stMap[st]={name:st,level:lv,ok:0,care:0,concept:0,cant:0,timeout:0,wrong:0,blank:0,total:0};
    stMap[st].total++;
    if(status==='ok')stMap[st].ok++;
    else if(status==='care')stMap[st].care++;
    else if(status==='wrong')stMap[st].wrong++;
    else stMap[st].blank++;
  });
  const subtopics=Object.values(stMap).sort((a,b)=>a.ok/a.total-b.ok/b.total);
  const diffMap={};
  myAna.forEach(r=>{const lv=parseInt(r[7])||0,status=parseStatus(r[5]||'');if(!diffMap[lv])diffMap[lv]={ok:0,total:0};diffMap[lv].total++;if(status==='ok')diffMap[lv].ok++;});
  // ── สถิติกลุ่มย่อย: sub-topic ที่ทั้งกลุ่มอ่อนร่วมกัน (จาก results_long ของทุกคนในกลุ่ม บทนี้) ──
  let grpLong=longRows.filter(r=>(r[1]||'')===group&&(r[3]||'')===topic);
  // เติม sub จาก EMBEDDED_QB ถ้า results_long ไม่มี (เหมือน myAna)
  if(grpLong.length&&EMBEDDED_QB[embTopic]){
    grpLong=grpLong.map(r=>{
      const qNum=parseInt(r[4])||0;
      const qb=EMBEDDED_QB[embTopic][qNum]||{};
      const sub=(r[6]&&r[6]!=='—')?r[6]:(qb.sub||'—');
      return [r[0],r[1],r[2],r[3],r[4],r[5],sub,r[7]];
    });
  }
  const grpStMap={};
  grpLong.forEach(r=>{
    const st=r[6]||'',status=parseStatus(r[5]||'');
    if(!st||st==='—')return;
    if(!grpStMap[st])grpStMap[st]={name:st,ok:0,care:0,concept:0,cant:0,timeout:0,wrong:0,blank:0,total:0};
    grpStMap[st].total++;
    if(status==='ok')grpStMap[st].ok++;else if(status==='care')grpStMap[st].care++;
    else if(status==='concept')grpStMap[st].concept++;
    else if(status==='cant')grpStMap[st].cant++;
    else if(status==='timeout')grpStMap[st].timeout++;
    else if(status==='wrong')grpStMap[st].wrong++;
    else grpStMap[st].blank++;
  });
  const grpSubtopics=Object.values(grpStMap).sort((a,b)=>a.ok/a.total-b.ok/b.total);
  // สถิติรวมกลุ่ม
  const grpScores=groupMembers.map(m=>m.score);
  const grpAvg=grpScores.length?Math.round(grpScores.reduce((a,b)=>a+b,0)/grpScores.length*10)/10:0;
  const grpCareAvg=groupMembers.length?Math.round(groupMembers.reduce((a,m)=>a+m.care,0)/groupMembers.length*10)/10:0;
  const grpHi=grpScores.length?Math.max(...grpScores):0;
  const grpLo=grpScores.length?Math.min(...grpScores):0;
  const grpStats={avg:grpAvg,careAvg:grpCareAvg,hi:grpHi,lo:grpLo,count:groupMembers.length};
  // ── v2: ประวัติการสอบทุกครั้งของนักเรียนคนนี้ (ตาม topicFilter) สำหรับ trend ──
  const history=myRows.map(r=>({date:r[3]||'',topic:r[4]||'',full:_fullOf(r[4]||''),score:_scoreOf(r,r[4]||''),ok:parseInt(r[36])||0,care:parseInt(r[37])||0,concept:parseInt(r[38])||0,cant:parseInt(r[39])||0,timeout:parseInt(r[40])||0}));
  const prev=history.length>1?history[history.length-2]:null;
  const delta=prev?score-prev.score:null;
  let streak=0; for(let i=history.length-1;i>0;i--){ if(history[i].score>history[i-1].score)streak++; else break; }
  const isBest=history.length>1&&score>=Math.max(...history.map(h=>h.score));
  // results_long ทุกแถวของนักเรียนคนนี้ (ทุกการสอบ) — ใช้หา "จุดอ่อนเรื้อรัง"
  const myLongAll=longRows.filter(r=>r[0]===currentStudent);
  // v2.1: ประวัติทุกบท (ไม่สน topicFilter) — fallback ของแท็บพัฒนาการเมื่อบทที่กรองมีสอบครั้งเดียว
  const allHistory=allMine.map(r=>({date:r[3]||'',topic:r[4]||'',full:_fullOf(r[4]||''),score:_scoreOf(r,r[4]||''),ok:parseInt(r[36])||0,care:parseInt(r[37])||0,concept:parseInt(r[38])||0,cant:parseInt(r[39])||0,timeout:parseInt(r[40])||0}));
  const full=_fullOf(topic), isMock=_isMock(topic);
  dashData={group,date,topic,full,isMock,score,care,concept,cant,timeout,wrong,blank,qResults,groupMembers,rank,allMembers,allRank,allAvg,groupsInTopic,subtopics,diffMap,myAna,grpSubtopics,grpStats,history,prev,delta,streak,isBest,myLongAll,allHistory,shortName:currentStudent.replace(/\s*\(.*\)/,'')};
}

async function showDashboard(mode){
  dashData=null;
  await fetchDashData();
  if(!dashData){alert(dashErr||'ยังไม่มีข้อมูลสอบในระบบ');return;}
  const d=dashData;
  if(mode==='student'){
    renderStudentDash(d);
    goTo('p4');
  } else {
    renderParentDash(d);
    goTo('p5');
  }
}

// ═══════ v2: การ์ดพัฒนาการ + trend ═══════
function _sparkSvg(scores,w,h,full){
  if(!scores||scores.length<2)return'';
  const n=scores.length,max=full||30,pad=7;
  const pts=scores.map((v,i)=>[
    Math.round((pad+i*(w-2*pad)/(n-1))*10)/10,
    Math.round((h-pad-(v/max)*(h-2*pad))*10)/10
  ]);
  const line=pts.map(p=>p.join(',')).join(' ');
  const last=pts[pts.length-1];
  const ty=Math.round((h-pad-(25/max)*(h-2*pad))*10)/10;
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:${h}px;display:block"><line x1="${pad}" y1="${ty}" x2="${w-pad}" y2="${ty}" stroke="#A32D2D" stroke-width="1" stroke-dasharray="4 3" opacity=".5"/><polyline points="${line}" fill="none" stroke="#185FA5" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#C77E1A"/></svg>`;
}
function renderTrendCard(d){
  const anchor=document.getElementById('s-encourage');
  let card=document.getElementById('s-trendCard');
  if(!card){ if(!anchor)return; anchor.insertAdjacentHTML('afterend','<div id="s-trendCard"></div>'); card=document.getElementById('s-trendCard'); }
  const hist=d.history||[];
  if(hist.length<2){ card.innerHTML=''; return; }
  const scores=hist.map(h=>h.score);
  const deltaTxt=d.delta==null?'':(d.delta>0?'▲ +'+d.delta:(d.delta<0?'▼ '+d.delta:'▬ เท่าเดิม'));
  const deltaColor=d.delta>0?'#3B7D2A':(d.delta<0?'#C77E1A':'var(--text3,#948F86)');
  const chip=(t,bg,c)=>`<span style="display:inline-block;background:${bg};color:${c};font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;margin-right:4px">${t}</span>`;
  let chips='';
  if(d.isBest)chips+=chip('🏆 สูงสุดตั้งแต่เริ่มเรียน','#EAF5E6','#3B7D2A');
  if(d.streak>=2)chips+=chip('🔥 ดีขึ้น '+d.streak+' ครั้งติด','#FFF1E0','#B45309');
  if(d.delta!=null&&d.delta<0)chips+=chip('อยู่ในช่วงผันผวนปกติ — โฟกัสที่แผนทบทวนต่อได้เลย','#F0F4F8','#57534E');
  // error-mix รายครั้ง (สูงสุด 8 ครั้งล่าสุด)
  let mixHtml='';
  const mh=hist.slice(-8);
  if(mh.length>=2){
    const cols=mh.map(h=>{
      /* ★ แถบนี้นับ "จำนวนข้อ" (เต็ม 30 เสมอ) ไม่ใช่คะแนนถ่วงน้ำหนัก */
      const seg=(v,c)=>v>0?`<div style="height:${Math.max(2,Math.round(v/30*66))}px;background:${c}"></div>`:'';
      return `<div style="text-align:center"><div style="display:flex;flex-direction:column-reverse;width:20px;border-radius:4px;overflow:hidden;margin:0 auto">${seg(h.ok!=null?h.ok:h.score,'#8FBF7F')}${seg(h.care,'#F2C94C')}${seg(h.concept,'#C9A6F0')}${seg(h.cant,'#E89090')}${seg(h.timeout,'#B8C2CC')}</div><div style="font-size:9px;color:var(--text3,#948F86);margin-top:2px">${h.score}</div></div>`;
    }).join('');
    mixHtml=`<div style="margin-top:10px;border-top:1px dashed var(--border,#E7E4DC);padding-top:8px"><div style="font-size:11px;color:var(--text3,#948F86);margin-bottom:6px">ส่วนผสมผลรายครั้ง — 🟩 ถูก · 🟨 สะเพร่า · 🟪 คอนเซปต์ · 🟥 ทำไม่ได้ · ⬜ ไม่ทัน <span style="color:var(--text2,#57534E)">(คะแนนเท่าเดิมแต่สีข้างบนหด = กำลังพัฒนา)</span></div><div style="display:flex;gap:9px;align-items:flex-end">${cols}</div></div>`;
  }
  card.innerHTML=`<div style="background:#fff;border:1px solid var(--border,#E7E4DC);border-radius:14px;padding:14px 16px;margin:10px 0">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:11px;color:var(--text3,#948F86)">📈 พัฒนาการของคุณ · ${hist.length} ครั้ง · เทียบกับตัวเองเท่านั้น</div>
        <div style="font-size:24px;font-weight:700;color:${deltaColor}">${deltaTxt} <span style="font-size:12px;color:var(--text3,#948F86);font-weight:400">จากครั้งก่อน (${d.prev.score} → ${d.score})</span></div>
        <div style="margin-top:5px">${chips}</div>
      </div>
      <div style="flex:1;min-width:170px;max-width:250px">
        ${_sparkSvg(scores,250,62,d.full||30)}
        <div style="font-size:10px;color:var(--text3,#948F86);text-align:right">เส้นประแดง = เป้า ${Math.round((d.full||30)*25/30)}/${d.full||30} · ${scores.join(' → ')}</div>
      </div>
    </div>
    ${mixHtml}
  </div>`;
}

// ═══════ v2.1: แท็บ 📈 พัฒนาการ (pane-progress) — Chart.js เต็มรูปแบบ ═══════
function renderProgressTrend(d){
  const pane=document.getElementById('pane-progress'); if(!pane)return;
  let hist=d.history||[]; let note='';
  if(hist.length<2&&(d.allHistory||[]).length>=2){ hist=d.allHistory; note='บทที่กรองอยู่มีการสอบครั้งเดียว — กราฟนี้จึงรวมทุกบท เพื่อให้เห็นภาพรวมพัฒนาการ'; }
  if(hist.length<2){
    pane.innerHTML='<div class="d-card"><div class="slabel">📈 พัฒนาการ</div><div style="font-size:13px;color:var(--text2);line-height:1.7">ยังมีผลสอบครั้งเดียว — กราฟพัฒนาการจะเริ่มแสดงตั้งแต่การสอบครั้งที่ 2 เป็นต้นไปครับ 💪<br>ระหว่างนี้ดูจุดที่ต้องเก็บได้ที่แท็บ "แผนทบทวน" เลย</div></div>';
    return;
  }
  pane.innerHTML=`
    <div class="d-card" style="padding:1rem">
      <div class="slabel">📈 คะแนนรายครั้ง — เทียบกับตัวเองเท่านั้น</div>
      ${note?'<div style="font-size:11.5px;color:var(--amber);margin-bottom:8px">'+note+'</div>':''}
      <div style="position:relative;width:100%;height:220px"><canvas id="s-trendChart"></canvas></div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px">${_mixedScale?'กราฟนี้รวมหลายชุดสอบที่คะแนนเต็มไม่เท่ากัน จึงแสดงเป็น % ของคะแนนเต็ม':'เส้นประแดง = เป้าหมาย '+Math.round(_trendFull*25/30)+'/'+_trendFull+' (เกณฑ์คณะแข่งขันสูง)'}</div>
    </div>
    <div class="d-card" style="padding:1rem">
      <div class="slabel">ส่วนผสมผลรายครั้ง</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px">คะแนนรวมเท่าเดิมแต่แถบด้านบนหดลง = กำลังพัฒนา (เช่น ❌ กลายเป็น ⚠️)</div>
      <div style="position:relative;width:100%;height:220px"><canvas id="s-mixChart"></canvas></div>
    </div>
    <div class="d-card">
      <div class="slabel">สรุปรายครั้ง</div>
      <div id="s-trendTable"></div>
    </div>`;
  /* ★ 29 ส.ค. 69 — ประวัติอาจปนบทปกติ (เต็ม 30) กับสนามสอบ (เต็ม 100)
     คนละสเกลบนแกนเดียวกันอ่านผิดแน่ → ถ้าปนกันให้แปลงเป็น % ทั้งกราฟ */
  const _fulls=[...new Set(hist.map(h=>h.full||30))];
  const _mixedScale=_fulls.length>1;
  const _trendFull=_mixedScale?100:_fulls[0];
  const _sc=h=>_mixedScale?Math.round((h.score/(h.full||30))*100):h.score;
  const labels=hist.map((h,i)=>h.date?_dFmt(h.date):('ครั้ง '+(i+1)));
  if(trendChartInst){trendChartInst.destroy();trendChartInst=null;}
  trendChartInst=new Chart(document.getElementById('s-trendChart'),{
    type:'line',
    data:{labels,datasets:[
      {label:_mixedScale?'คะแนน (%)':'คะแนน',data:hist.map(h=>_sc(h)),borderColor:'#185FA5',backgroundColor:'rgba(24,95,165,.12)',fill:true,tension:.25,pointRadius:4,pointBackgroundColor:'#185FA5'},
      {label:'เป้า '+Math.round(_trendFull*25/30),data:hist.map(()=>Math.round(_trendFull*25/30)),borderColor:'#A32D2D',borderDash:[6,4],pointRadius:0,fill:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+': '+c.raw+(_mixedScale?'%':'')}}},
      scales:{y:{min:0,max:_trendFull,ticks:{stepSize:_trendFull>50?10:5},grid:{color:'rgba(128,128,128,0.1)'}},x:{grid:{display:false},ticks:{font:{size:10}}}}}
  });
  if(mixChartInst){mixChartInst.destroy();mixChartInst=null;}
  mixChartInst=new Chart(document.getElementById('s-mixChart'),{
    type:'bar',
    data:{labels,datasets:[
      {label:'✅ ถูก',data:hist.map(h=>h.ok!=null?h.ok:h.score),backgroundColor:'#4C9A2A'},
      {label:'⚠️ สะเพร่า',data:hist.map(h=>h.care),backgroundColor:'#FDE910'},
      {label:'C คอนเซปต์',data:hist.map(h=>h.concept),backgroundColor:'#F5A623'},
      {label:'❌ ทำไม่ได้',data:hist.map(h=>h.cant),backgroundColor:'#ef4444'},
      {label:'⏰ ไม่ทัน',data:hist.map(h=>h.timeout),backgroundColor:'#a855f7'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:10},boxWidth:12}}},
      scales:{x:{stacked:true,grid:{display:false},ticks:{font:{size:10}}},y:{stacked:true,min:0,max:30,ticks:{stepSize:5},grid:{color:'rgba(128,128,128,0.1)'}}}}
  });
  const tbl=document.getElementById('s-trendTable');
  if(tbl){
    let rowsH='';
    hist.forEach((h,i)=>{
      const dlt=i>0?h.score-hist[i-1].score:null;
      const dtxt=dlt==null?'<span style="color:var(--text3)">—</span>':(dlt>0?'<span style="color:#3B7D2A;font-weight:600">▲ +'+dlt+'</span>':(dlt<0?'<span style="color:#C77E1A;font-weight:600">▼ '+dlt+'</span>':'▬ 0'));
      rowsH+=`<div class="rev-row"><div style="min-width:24px;font-size:12px;color:var(--text3)">${i+1}</div><div style="flex:1"><div style="font-size:12.5px;color:var(--text1)">${h.topic||'—'}</div><div style="font-size:10.5px;color:var(--text3)">${h.date?_dFmt(h.date):''}</div></div><div style="font-size:13px;font-weight:600;min-width:48px;text-align:right">${h.score}/${h.full||30}</div><div style="min-width:56px;text-align:right;font-size:12px">${dtxt}</div></div>`;
    });
    tbl.innerHTML=rowsH;
  }
}

function renderStudentDash(d){
  document.getElementById('s-avatar').textContent=d.shortName.substring(0,3);
  document.getElementById('s-name').textContent=d.shortName;
  document.getElementById('s-group').textContent='· '+d.group;
  document.getElementById('s-topic').textContent=d.topic+' · '+_dFmt(d.date);
  document.getElementById('s-rank').innerHTML=d.rank+' <span style="font-size:12px;color:var(--text3)">/ '+d.groupMembers.length+'</span>'+(d.allMembers.length>d.groupMembers.length?'<div style="font-size:10px;color:var(--text3);font-weight:400;margin-top:2px">รวมทุกกลุ่ม '+d.allRank+'/'+d.allMembers.length+'</div>':'');
  const avg=d.groupMembers.length?Math.round(d.groupMembers.reduce((s,m)=>s+m.score,0)/d.groupMembers.length):0;
  document.getElementById('s-score').innerHTML=d.score+' <span style="font-size:13px;color:var(--text3);font-weight:400">/ 30</span>';
  document.getElementById('s-scorepct').textContent=Math.round(d.score/(d.full||30)*100)+'% · เฉลี่ยกลุ่ม '+Math.round(avg/(d.full||30)*100)+'%'+(d.allMembers.length>d.groupMembers.length?' · เฉลี่ยรวม '+Math.round(d.allAvg/(d.full||30)*100)+'%':'');
  document.getElementById('s-wrong').innerHTML=(d.wrong+d.care+d.concept+d.blank)+' <span style="font-size:13px;color:var(--text3);font-weight:400">ข้อ</span>';
  document.getElementById('s-wrongsub').textContent=d.blank+' ไม่ทำ · '+d.care+' สะเพร่า · '+d.concept+' คอนเซปต์ · '+d.wrong+' ทำไม่ได้';
  // ข้อความให้กำลังใจ — เน้นสิ่งที่ควบคุมได้
  const encEl=document.getElementById('s-encourage');
  if(encEl){
    let msg='';
    if(d.care>=3){msg=`💡 มี ${d.care} ข้อที่ทำเป็นแล้วแต่พลาดจากความรีบ — ถ้าตรวจทานให้ดีอีกนิด คะแนนขึ้นได้อีก ${d.care} ข้อเลย!`;}
    else if(d.blank>=3){msg=`💡 มี ${d.blank} ข้อที่ยังไม่ได้ลอง — ครั้งหน้าลองจัดเวลาให้ครบทุกข้อ อาจได้คะแนนเพิ่มอีก`;}
    else if(d.score>=24){msg=`🌟 ทำได้ยอดเยี่ยม! รักษาจังหวะนี้ไว้`;}
    else{msg=`💪 ทุกข้อที่ผิดคือโอกาสเรียนรู้ — โฟกัสทีละหัวข้อ แล้วครั้งหน้าจะดีขึ้นแน่นอน`;}
    encEl.innerHTML=msg;
    encEl.style.display='block';
  }
  try{renderTrendCard(d);}catch(e){console.error('trend',e);}
  try{renderProgressTrend(d);}catch(e){console.error('progress',e);}
  const qClass={ok:'q-ok',care:'q-care',concept:'q-concept',cant:'q-cant',timeout:'q-timeout',wrong:'q-wrong',blank:'q-blank'};
  ['qgrid1','qgrid2'].forEach(id=>document.getElementById(id).innerHTML='');
  for(let i=1;i<=30;i++){const g=document.getElementById(i<=15?'qgrid1':'qgrid2');const el=document.createElement('div');el.className='q-cell '+qClass[d.qResults[i]];el.textContent=i;g.appendChild(el);}
  const needReview=d.myAna.filter(r=>['wrong','blank','care','concept','cant','timeout'].includes(parseStatus(r[5]||''))).map(r=>({q:parseInt(r[4]),sub:r[6]||'',year:r[3]||'',level:parseInt(r[7])||0,type:parseStatus(r[5]||'')})).sort((a,b)=>{
    const pri={care:0,concept:1,wrong:2,cant:2,timeout:3,blank:4};
    const pa=pri[a.type]!=null?pri[a.type]:9;
    const pb=pri[b.type]!=null?pri[b.type]:9;
    return pa-pb||a.q-b.q;
  });
  const rl=document.getElementById('s-reviewList');rl.innerHTML='';
  if(!needReview.length){rl.innerHTML='<div style="font-size:13px;color:var(--text2);padding:8px 0">ทำถูกทุกข้อ 🎉</div>';}
  else { rl.innerHTML='<div style="font-size:11px;color:var(--text2);margin-bottom:10px;display:flex;flex-wrap:wrap;gap:10px"><span>⚠️ สะเพร่า</span><span>📖 คอนเซปต์</span><span>❌ ผิด/ทำไม่ได้</span><span>⏰ ไม่ทัน</span></div>';
  needReview.forEach(r=>{const statusEmoji={ok:'✅',care:'⚠️',concept:'📖',cant:'❌',timeout:'⏰',wrong:'❌',blank:'⬜'}[r.type]||'⚠️';const stars='★'.repeat(r.level)+'☆'.repeat(5-r.level);rl.innerHTML+=`<div class="rev-row"><div style="min-width:20px;font-size:11px;color:var(--text2);font-weight:500">${r.q}</div><div style="flex:1"><div style="font-size:12px;color:var(--text1)">${r.sub}</div><div style="font-size:10px;color:var(--text3)">${r.year} · ระดับ ${r.level} <span style="color:#BA7517">${stars}</span></div></div><span style="font-size:16px">${statusEmoji}</span></div>`;});
  } // close else
  const sl=document.getElementById('s-subtopicList');sl.innerHTML='';
  // คำแนะนำว่าควรโฟกัสหัวข้อไหน
  const weakSt=d.subtopics.filter(st=>Math.round(st.ok/st.total*100)<70);
  const hintEl=document.getElementById('s-subtopicHint');
  if(d.subtopics.length===0){
    hintEl.innerHTML=`ยังไม่มีข้อมูลแยกหัวข้อสำหรับบทนี้ — ดูผลรายข้อได้ที่ tab "รายข้อ" ครับ`;
  } else if(weakSt.length>0){
    hintEl.innerHTML=`บทนี้มี <b>${d.subtopics.length} หัวข้อ</b> — ลองโฟกัสที่ <b style="color:var(--red)">${weakSt[0].name}</b>${weakSt.length>1?` และ <b style="color:var(--amber)">${weakSt[1].name}</b>`:''} ก่อน เพราะยังทำได้ต่ำกว่า 70% 💪`;
  } else {
    hintEl.innerHTML=`บทนี้มี <b>${d.subtopics.length} หัวข้อ</b> — ทำได้ดีทุกหัวข้อแล้ว เก่งมาก! 🎉 ลองท้าทายข้อระดับยากขึ้นได้เลย`;
  }
  d.subtopics.forEach(st=>{const pct=Math.round(st.ok/st.total*100);const cls=pct>=80?'diff-ok':pct>=50?'diff-warn':pct>0?'diff-bad':'diff-skip';const showYt=pct<70;sl.innerHTML+=`<div class="st-row"><div style="flex:1"><div style="font-size:12px;color:var(--text1)">${st.name}</div><div style="font-size:10px;color:var(--text3)">ระดับ ${st.level} · ${st.ok}/${st.total} ข้อ</div>${showYt?ytBtn(d.topic+' '+st.name):''}</div><div class="diff-badge ${cls}">${st.total===0?'—':pct+'%'}</div></div>`;});
  try{renderChapterWeak(d);}catch(e){console.error("chapweak",e);}
  try{renderPracticePlan(d);}catch(e){console.error("practice",e);}
  // ── แผนทบทวน: เรียงตาม effort ต่ำ → ผลสูง ──
  const planEl=document.getElementById('s-studyPlan');
  if(planEl){
    planEl.innerHTML='';
    const steps=[];
    // ขั้น 1: สะเพร่า (ได้คืนง่ายสุด — รู้อยู่แล้ว แค่ฝึกรอบคอบ)
    const careQs=d.myAna.filter(r=>parseStatus(r[5]||'')==='care').map(r=>({q:parseInt(r[4]),sub:r[6]||''}));
    if(careQs.length)steps.push({n:steps.length+1,icon:'⚡',color:'#F5A623',title:`เก็บคะแนนจากข้อสะเพร่า (${careQs.length} ข้อ)`,
      desc:`ข้อ ${careQs.map(c=>c.q).join(', ')} — ทำเป็นอยู่แล้ว! ลองทำซ้ำแบบไม่รีบ แล้วจดว่าครั้งแรกพลาดตรงไหน (อ่านโจทย์ตก? คำนวณพลาด?) ใช้เวลาน้อยสุดแต่ได้คะแนนคืนเต็ม ๆ`});
    // ขั้น 2: ข้อผิดระดับง่าย-กลาง (1-3)
    // ขั้น 2: ข้อคอนเซปต์ (C) ระดับง่าย-กลาง
    const conceptQs=d.myAna.filter(r=>parseStatus(r[5]||'')==='concept'&&parseInt(r[7])<=3).map(r=>({q:parseInt(r[4]),sub:r[6]||''}));
    if(conceptQs.length)steps.push({n:steps.length+1,icon:'💡',color:'#a855f7',title:`เสริมคอนเซปต์พื้นฐาน (${conceptQs.length} ข้อ)`,
      desc:`ข้อ ${conceptQs.map(c=>c.q).join(', ')} — ผิดเพราะยังไม่เข้าใจหลักการ ดูคลิปติวหัวข้อ ${[...new Set(conceptQs.map(c=>c.sub))].slice(0,2).join(', ')} ก่อนทำซ้ำ`,
      yt:[...new Set(conceptQs.map(c=>c.sub))].slice(0,3)});
    // ขั้น 3: ข้อผิด/ทำไม่ได้ระดับง่าย-กลาง (wrong + cant)
    const easyWrong=d.myAna.filter(r=>['wrong','cant'].includes(parseStatus(r[5]||''))&&parseInt(r[7])<=3).map(r=>({q:parseInt(r[4]),sub:r[6]||''}));
    if(easyWrong.length)steps.push({n:steps.length+1,icon:'📗',color:'#4C9A2A',title:`แก้ข้อผิดระดับพื้นฐาน (${easyWrong.length} ข้อ)`,
      desc:`ข้อ ${easyWrong.map(c=>c.q).join(', ')} — ระดับไม่ยาก ทบทวนหลักการของหัวข้อ ${[...new Set(easyWrong.map(c=>c.sub))].join(', ')} ก่อน 💪`,
      yt:[...new Set(easyWrong.map(c=>c.sub))].slice(0,3)});
    // ขั้น 4: ข้อไม่ทัน/ไม่ทำระดับง่าย-กลาง
    const easyBlank=d.myAna.filter(r=>['blank','timeout'].includes(parseStatus(r[5]||''))&&parseInt(r[7])<=3).map(r=>({q:parseInt(r[4]),sub:r[6]||''}));
    if(easyBlank.length)steps.push({n:steps.length+1,icon:'📘',color:'#185FA5',title:`ลองข้อที่ไม่ทัน/ไม่ได้ทำระดับพื้นฐาน (${easyBlank.length} ข้อ)`,
      desc:`ข้อ ${easyBlank.map(c=>c.q).join(', ')} — ยังไม่ได้ทำหรือเวลาไม่ทัน เริ่มจากอ่านโจทย์ช้า ๆ แล้วเขียนสิ่งที่รู้ออกมาก่อน`,
      yt:[...new Set(easyBlank.map(c=>c.sub))].slice(0,3)});
    // ขั้น 5: ข้อยาก (4-5)
    const hardOnes=d.myAna.filter(r=>['wrong','blank','concept','cant','timeout'].includes(parseStatus(r[5]||''))&&parseInt(r[7])>=4).map(r=>({q:parseInt(r[4]),sub:r[6]||''}));
    if(hardOnes.length)steps.push({n:steps.length+1,icon:'🏔️',color:'#A32D2D',title:`ท้าทายข้อยาก (${hardOnes.length} ข้อ)`,
      desc:`ข้อ ${hardOnes.map(c=>c.q).join(', ')} — ระดับ 4-5 ทำทีหลังสุดเมื่อพื้นฐานแน่นแล้ว ศึกษาจากคลิปติวในช่อง MathsBankTutor`,
      yt:[...new Set(hardOnes.map(c=>c.sub))].slice(0,3)});
    // ── v2: จุดอ่อนเรื้อรัง — sub-topic ที่พลาดซ้ำมากกว่า 1 การสอบ ──
    let chronicHtml='';
    try{
      const missBySub={};
      (d.myLongAll||[]).forEach(r=>{
        const sub=(r[6]&&r[6]!=='—')?r[6]:''; if(!sub)return;
        const st=parseStatus(r[5]||''); if(st==='ok'||st==='blank')return;
        if(!missBySub[sub])missBySub[sub]=new Set();
        missBySub[sub].add((r[2]||'')+'|'+(r[3]||''));
      });
      const chronic=Object.entries(missBySub).filter(([,set])=>set.size>=2).map(([sub,set])=>({sub,times:set.size})).sort((a,b)=>b.times-a.times).slice(0,4);
      if(chronic.length){
        chronicHtml='<div style="background:#FDF3E3;border:1px solid #F0D9AE;border-radius:10px;padding:10px 12px;margin:2px 0 10px"><div style="font-size:12px;font-weight:600;color:#8A5A10;margin-bottom:4px">🔁 จุดอ่อนเรื้อรัง — พลาดซ้ำมากกว่า 1 การสอบ</div>'
          +chronic.map(c=>`<div style="font-size:12px;color:var(--text2);padding:3px 0">• ${c.sub} <span style="color:var(--text3)">(พลาดใน ${c.times} การสอบ)</span><br>${ytBtn(c.sub,'ทบทวนคลิปหัวข้อนี้')}</div>`).join('')
          +'<div style="font-size:11px;color:#8A5A10;margin-top:6px">หัวข้อที่พลาดซ้ำแบบนี้ ควรกลับไปทำความเข้าใจแนวคิดใหม่กับครู ไม่ใช่แค่ฝึกโจทย์เพิ่มครับ (พลาดครั้งแรกในหัวข้ออื่นเป็นเรื่องปกติ ไม่ต้องกังวล)</div></div>';
      }
    }catch(e){console.error('chronic',e);}
    if(!steps.length){planEl.innerHTML=chronicHtml+'<div style="font-size:13px;color:var(--green);padding:8px 0">ทำถูกครบทุกข้อ ไม่มีอะไรต้องทบทวน 🎉</div>';}
    else{
      // ── v2: checkbox + progress (จำสถานะใน localStorage รายการสอบ) ──
      const spKey=n=>'sp:'+currentStudent+':'+d.topic+':'+d.date+':'+n;
      let done0=0; steps.forEach(s=>{try{if(localStorage.getItem(spKey(s.n))==='1')done0++;}catch(e){}});
      let html=chronicHtml+`<div style="margin-bottom:8px"><div style="background:var(--blue-l,#E8F1FA);height:9px;border-radius:99px;overflow:hidden"><div id="sp-fill" style="height:100%;background:#185FA5;border-radius:99px;transition:width .3s;width:${Math.round(done0/steps.length*100)}%"></div></div><div id="sp-text" style="font-size:11px;color:var(--text3);margin-top:4px">ทำแล้ว ${done0} จาก ${steps.length} ขั้น${done0===steps.length?' — ครบแล้ว เก่งมาก! 🎉':''}</div></div>`;
      steps.forEach(s=>{
        let isDone=false; try{isDone=localStorage.getItem(spKey(s.n))==='1';}catch(e){}
        html+=`<div class="sp-row" style="display:flex;gap:12px;padding:12px 0;border-bottom:0.5px solid var(--border);opacity:${isDone?'0.55':'1'}">
        <input type="checkbox" data-spkey="${spKey(s.n)}" onchange="spTick(this)" ${isDone?'checked':''} style="width:19px;height:19px;accent-color:#185FA5;margin-top:6px;cursor:pointer;flex-shrink:0">
        <div style="width:32px;height:32px;border-radius:50%;background:${s.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0">${s.n}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text1);margin-bottom:3px">${s.icon} ${s.title}</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:6px">${s.desc}</div>
          ${s.yt?`<div style="display:flex;gap:6px;flex-wrap:wrap">${s.yt.map(t=>`<a href="${ytLink(t)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;background:#FF0000;color:#fff;font-size:10px;font-weight:500;padding:3px 10px;border-radius:20px;text-decoration:none">🎬 ${t}</a>`).join('')}</div>`:''}
        </div>
      </div>`;
      });
      planEl.innerHTML=html;
    }
  }
  if(diffChartInst){diffChartInst.destroy();diffChartInst=null;}
  const diffLevels=Object.keys(d.diffMap).sort((a,b)=>a-b);
  diffChartInst=new Chart(document.getElementById('s-diffChart'),{type:'bar',data:{labels:diffLevels.map(l=>'ระดับ '+l),datasets:[{label:'% ถูก',data:diffLevels.map(lv=>Math.round(d.diffMap[lv].ok/d.diffMap[lv].total*100)),backgroundColor:['#B5D4F4','#85B7EB','#378ADD','#185FA5','#0C447C'],borderRadius:4,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw+'%'}}},scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%',stepSize:25},grid:{color:'rgba(128,128,128,0.1)'}},x:{grid:{display:false}}}}});
  const cl=document.getElementById('s-compareList');cl.innerHTML='';
  // ── ภาพรวมกลุ่ม ──
  const gn=document.getElementById('s-grpName');if(gn)gn.textContent='· '+d.group;
  const gs=document.getElementById('s-grpStats');
  if(gs&&d.grpStats){
    const st=d.grpStats;
    const box=(label,val,sub,color)=>`<div style="background:var(--surf);border-radius:var(--r-md);padding:10px 12px"><div style="font-size:10px;color:var(--text3)">${label}</div><div style="font-size:18px;font-weight:600;color:${color||'var(--text1)'}">${val}</div><div style="font-size:10px;color:var(--text3)">${sub||''}</div></div>`;
    gs.innerHTML=box('คะแนนเฉลี่ยกลุ่ม',st.avg+'<span style="font-size:11px;color:var(--text3);font-weight:400"> /'+(d.full||30)+'</span>','จาก '+st.count+' คน','var(--blue)')
      +box('ช่วงคะแนน',st.lo+'–'+st.hi,'ต่ำสุด–สูงสุด')
      +box('สะเพร่าเฉลี่ย',st.careAvg+'<span style="font-size:11px;color:var(--text3);font-weight:400"> ข้อ</span>','ต่อคน','#C77E1A');
  }
  // ── หัวข้อที่กลุ่มควรทบทวนร่วมกัน ──
  const gw=document.getElementById('s-grpWeak');
  if(gw){
    gw.innerHTML='';
    if(!d.grpSubtopics||!d.grpSubtopics.length){
      gw.innerHTML='<div style="font-size:12px;color:var(--text3)">ยังไม่มีข้อมูลแยกหัวข้อของกลุ่มนี้</div>';
    }else{
      d.grpSubtopics.forEach(st=>{
        const pct=st.total?Math.round(st.ok/st.total*100):0;
        const cls=pct>=80?'diff-ok':pct>=50?'diff-warn':pct>0?'diff-bad':'diff-skip';
        const showYt=pct<70;
        gw.innerHTML+=`<div class="st-row"><div style="flex:1"><div style="font-size:12px;color:var(--text1)">${st.name}</div><div style="font-size:10px;color:var(--text3)">ทั้งกลุ่มทำถูก ${st.ok}/${st.total} · สะเพร่า ${st.care} · ผิด ${st.wrong} · ไม่ทำ ${st.blank}</div>${showYt?ytBtn(d.topic+' '+st.name,'คลิปติวกลุ่ม'):''}</div><div class="diff-badge ${cls}">${pct}%</div></div>`;
      });
    }
  }
  // ── การ์ด 2: เทียบกับกลุ่มอื่น (เลือกได้) ──
  renderAllComparison(d);
  let ac=0;
  d.groupMembers.forEach(s=>{const pct=Math.round(s.score/(d.full||30)*100);cl.innerHTML+=`<div class="cmp-row"><div class="cmp-name">${s.isMe?d.shortName:'เพื่อน '+(s.isMe?0:++ac)}${s.isMe?'<span class="me-tag">คุณ</span>':''}</div><div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${s.isMe?'#185FA5':'#B5D4F4'}"></div></div><div class="cmp-score">${s.score}/${d.full||30}</div></div>`;});
  if(groupChartInst){groupChartInst.destroy();groupChartInst=null;}
  let bc=0;
  groupChartInst=new Chart(document.getElementById('s-groupChart'),{type:'bar',data:{labels:d.groupMembers.map(s=>s.isMe?d.shortName:'เพื่อน '+(++bc)),datasets:[{label:'คะแนน',data:d.groupMembers.map(s=>s.score),backgroundColor:d.groupMembers.map(s=>s.isMe?'#185FA5':'#B5D4F4'),borderRadius:4,borderWidth:0},{label:'สะเพร่า',data:d.groupMembers.map(s=>s.care),backgroundColor:d.groupMembers.map(s=>s.isMe?'#BA7517':'#FAC775'),borderRadius:4,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+': '+c.raw}}},scales:{y:{min:0,max:30,ticks:{stepSize:5},grid:{color:'rgba(128,128,128,0.1)'}},x:{grid:{display:false}}}}});
}

function renderAllComparison(d){
  const picker=document.getElementById('s-grpPicker');
  const statsEl=document.getElementById('s-allStats');
  const listEl=document.getElementById('s-allCompareList');
  if(!picker||!statsEl||!listEl)return;

  const groups=d.groupsInTopic||[];
  // ครั้งแรก / เปลี่ยนนักเรียน → default เลือกทุกกลุ่ม
  if(selectedGroups===null)selectedGroups=groups.slice();

  // ถ้ามีแค่กลุ่มเดียวที่สอบบทนี้ → ยังไม่มีกลุ่มอื่นให้เทียบ
  if(groups.length<=1){
    picker.innerHTML='';
    statsEl.innerHTML='';
    const dw=document.getElementById('s-allDistWrap');if(dw)dw.style.display='none';
    const tw=document.getElementById('s-top10Wrap');if(tw)tw.style.display='none';
    listEl.style.display='block';
    listEl.innerHTML=`<div style="font-size:12px;color:var(--text3);line-height:1.6">ยังมีแค่กลุ่ม <b>${d.group}</b> ที่สอบบท "${d.topic}"<br>เมื่อกลุ่มอื่นสอบบทเดียวกัน จะเทียบข้ามกลุ่มได้ที่นี่ครับ</div>`;
    return;
  }
  // มีหลายกลุ่ม → โชว์ dist + top10
  const dw=document.getElementById('s-allDistWrap');if(dw)dw.style.display='block';
  const tw=document.getElementById('s-top10Wrap');if(tw)tw.style.display='block';
  listEl.style.display='none';

  // ปุ่มเลือกกลุ่ม (chip toggle)
  picker.innerHTML='';
  groups.forEach(g=>{
    const on=selectedGroups.includes(g);
    const isMine=g===d.group;
    const chip=document.createElement('button');
    chip.textContent=g+(isMine?' (กลุ่มคุณ)':'');
    chip.style.cssText=`font-size:11px;padding:5px 12px;border-radius:16px;border:1px solid ${on?'#185FA5':'var(--border-md)'};background:${on?'#185FA5':'transparent'};color:${on?'#fff':'var(--text2)'};cursor:pointer;font-weight:${isMine?'600':'400'}`;
    chip.onclick=()=>{
      if(selectedGroups.includes(g)){
        if(selectedGroups.length>1)selectedGroups=selectedGroups.filter(x=>x!==g);
      }else{
        selectedGroups=selectedGroups.concat(g);
      }
      renderAllComparison(d);
    };
    picker.appendChild(chip);
  });

  // กรองสมาชิกตามกลุ่มที่เลือก
  const members=(d.allMembers||[]).filter(m=>selectedGroups.includes(m.group));
  const scores=members.map(m=>m.score);
  const avg=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10:0;
  const myScore=d.score;
  const sorted=[...members].sort((a,b)=>b.score-a.score);
  const myRank=sorted.findIndex(m=>m.isMe)+1;
  // เปอร์เซ็นไทล์: มีกี่ % ของคนที่คะแนนน้อยกว่าหรือเท่าเรา
  const below=members.filter(m=>m.score<myScore).length;
  const pctile=members.length?Math.round(below/members.length*100):0;
  const topPct=100-pctile; // อยู่ top กี่ %

  const box=(label,val,sub,color)=>`<div style="background:var(--surf);border-radius:var(--r-md);padding:10px 12px"><div style="font-size:10px;color:var(--text3)">${label}</div><div style="font-size:18px;font-weight:600;color:${color||'var(--text1)'}">${val}</div><div style="font-size:10px;color:var(--text3)">${sub||''}</div></div>`;
  statsEl.innerHTML=box('อันดับของคุณ',(myRank||'—')+'<span style="font-size:11px;color:var(--text3);font-weight:400"> /'+members.length+'</span>','จาก '+selectedGroups.length+' กลุ่ม','var(--blue)')
    +box('คุณอยู่ Top',topPct+'%','ของทุกคนที่สอบบทนี้',topPct<=25?'#3B7D2A':topPct<=50?'#185FA5':'#C77E1A')
    +box('คะแนนคุณ',myScore+'<span style="font-size:11px;color:var(--text3);font-weight:400"> /'+(d.full||30)+'</span>',(myScore>=avg?'+':'')+(Math.round((myScore-avg)*10)/10)+' จากเฉลี่ย '+avg,myScore>=avg?'#3B7D2A':'#C77E1A');

  // ── กราฟ distribution: แบ่งช่วงคะแนน 0-5,6-10,...,26-30 ──
  const bins=[{lo:0,hi:5,label:'0-5'},{lo:6,hi:10,label:'6-10'},{lo:11,hi:15,label:'11-15'},{lo:16,hi:20,label:'16-20'},{lo:21,hi:25,label:'21-25'},{lo:26,hi:30,label:'26-30'}];
  const counts=bins.map(b=>members.filter(m=>m.score>=b.lo&&m.score<=b.hi).length);
  const myBin=bins.findIndex(b=>myScore>=b.lo&&myScore<=b.hi);
  const barColors=bins.map((b,i)=>i===myBin?'#185FA5':'#CBD9E8');
  if(distChartInst){distChartInst.destroy();distChartInst=null;}
  distChartInst=new Chart(document.getElementById('s-distChart'),{
    type:'bar',
    data:{labels:bins.map(b=>b.label),datasets:[{label:'จำนวนคน',data:counts,backgroundColor:barColors,borderRadius:4,borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:c=>c.raw+' คน'+(c.dataIndex===myBin?' (รวมคุณ)':'')}}},
      scales:{y:{beginAtZero:true,ticks:{stepSize:Math.max(1,Math.ceil(Math.max(...counts)/5)),precision:0},grid:{color:'rgba(128,128,128,0.1)'},title:{display:true,text:'จำนวนคน',font:{size:10}}},
        x:{grid:{display:false},title:{display:true,text:'ช่วงคะแนน',font:{size:10}}}}}
  });

  // ── ตาราง Top 10 ──
  const top10El=document.getElementById('s-top10');
  if(top10El){
    top10El.innerHTML='';
    const top=sorted.slice(0,10);
    let oc=0;
    top.forEach((m,i)=>{
      const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.';
      const label=m.isMe?d.shortName:('เพื่อน '+(++oc)+' · '+m.group);
      const bg=m.isMe?'var(--blue-l)':'transparent';
      top10El.innerHTML+=`<div style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;background:${bg};border-bottom:0.5px solid var(--border)">
        <div style="width:28px;text-align:center;font-size:13px;font-weight:600;color:var(--text2)">${medal}</div>
        <div style="flex:1;font-size:12px;color:var(--text1)">${label}${m.isMe?'<span class="me-tag">คุณ</span>':''}</div>
        <div style="font-size:13px;font-weight:600;color:var(--text1)">${m.score}<span style="font-size:10px;color:var(--text3);font-weight:400">/${d.full||30}</span></div>
      </div>`;
    });
    // ถ้าฉันไม่ติด top 10 → แสดงแถวของฉันต่อท้าย
    if(myRank>10){
      top10El.innerHTML+=`<div style="text-align:center;font-size:11px;color:var(--text3);padding:4px">· · ·</div>
      <div style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;background:var(--blue-l)">
        <div style="width:28px;text-align:center;font-size:13px;font-weight:600;color:var(--blue)">${myRank}.</div>
        <div style="flex:1;font-size:12px;color:var(--text1)">${d.shortName}<span class="me-tag">คุณ</span></div>
        <div style="font-size:13px;font-weight:600;color:var(--text1)">${myScore}<span style="font-size:10px;color:var(--text3);font-weight:400">/${d.full||30}</span></div>
      </div>`;
    }
  }
}

// ═══════ v2: รายงานผู้ปกครอง 5 สไตล์ (🦅🐬🐘🦉🐝) ═══════
// ผู้ปกครองเลือกสไตล์เอง → จำใน localStorage ของเครื่องนั้น (ไม่ต้องแก้ Sheet)
const PARENT_TYPES={
  eagle:   {em:'🦅',nm:'นกอินทรี',tag:'เป้าหมายชัด เห็นแผน'},
  dolphin: {em:'🐬',nm:'โลมา',tag:'ข้อมูลเต็มทุกมิติ'},
  elephant:{em:'🐘',nm:'ช้าง',tag:'อบอุ่น ข่าวดีมาก่อน'},
  owl:     {em:'🦉',nm:'นกฮูก',tag:'สรุปสั้น เชื่อมั่น'},
  bee:     {em:'🐝',nm:'ผึ้ง',tag:'การ์ดเดียวจบ'}
};
function _getPType(){ try{return localStorage.getItem('ptype:'+currentStudent)||'dolphin';}catch(e){return 'dolphin';} }

/* ═══════ v3.1: ระบบข้อความไม่ซ้ำ ═══════
   (1) _pv() = หมุนสำนวนตามครั้งที่สอบ → ครั้งติดกันไม่ได้ประโยคเดิม แต่รายงานเดิมเปิดกี่รอบก็เหมือนเดิม
   (2) _parentFacts() = ดึงข้อเท็จจริงเฉพาะตัวนักเรียน (เลขข้อ ชื่อหัวข้อ จุดที่พลาดซ้ำ) มาใส่ในประโยค */
function _pSeed(d){ return ((d.history&&d.history.length)||1) + String(d.date||'').length; }
function _pv(pool,d,off){ if(!pool||!pool.length)return''; return pool[(_pSeed(d)+(off||0))%pool.length]; }
function _thaiList(a,max){ a=(a||[]).filter(Boolean); if(!a.length)return''; const t=a.slice(0,max||2); return t.join(' และ ')+(a.length>(max||2)?' (และหัวข้ออื่น)':''); }
function _parentFacts(d){
  const f={};
  const st=s=>d.myAna.filter(r=>parseStatus(r[5]||'')===s);
  const qn=s=>st(s).map(r=>parseInt(r[4])).filter(n=>n).sort((a,b)=>a-b);
  const subs=s=>[...new Set(st(s).map(r=>r[6]).filter(x=>x&&x!=='—'))];
  f.careQ=qn('care'); f.conceptQ=qn('concept'); f.cantQ=qn('cant'); f.timeQ=qn('timeout');
  f.careSub=subs('care'); f.conceptSub=subs('concept'); f.cantSub=subs('cant');
  f.weak=(d.subtopics||[]).filter(s=>s.total&&Math.round(s.ok/s.total*100)<70);
  f.strong=(d.subtopics||[]).filter(s=>s.total>=2&&s.ok/s.total>=0.8);
  f.weakName=f.weak.length?f.weak[0].name:'';
  f.strongName=f.strong.length?f.strong[f.strong.length-1].name:'';
  // จุดที่พลาดซ้ำข้ามการสอบ (จาก results_long ทุกครั้ง)
  const mm={};
  (d.myLongAll||[]).forEach(r=>{
    const s=(r[6]&&r[6]!=='—')?r[6]:''; if(!s)return;
    const k=parseStatus(r[5]||''); if(k==='ok'||k==='blank')return;
    (mm[s]=mm[s]||new Set()).add((r[2]||'')+'|'+(r[3]||''));
  });
  f.chronic=Object.entries(mm).filter(([,v])=>v.size>=2).sort((a,b)=>b[1].size-a[1].size).map(([k,v])=>({sub:k,times:v.size}));
  f.qList=(arr)=>arr.length?('ข้อ '+arr.slice(0,6).join(', ')+(arr.length>6?' …':'')):'';
  return f;
}
function setPType(k){ try{localStorage.setItem('ptype:'+currentStudent,k);}catch(e){} if(dashData)renderParentDash(dashData); }
function _fillParentQGrid(d){
  const qClass={ok:'q-ok',care:'q-care',concept:'q-concept',cant:'q-cant',timeout:'q-timeout',wrong:'q-wrong',blank:'q-blank'};
  ['p-qgrid1','p-qgrid2'].forEach(id=>{const g=document.getElementById(id);if(g)g.innerHTML='';});
  for(let i=1;i<=30;i++){const g=document.getElementById(i<=15?'p-qgrid1':'p-qgrid2');if(!g)continue;const el=document.createElement('div');el.className='q-cell '+qClass[d.qResults[i]];el.textContent=i;g.appendChild(el);}
}
function renderParentDash(d){
  const name=d.shortName;
  (function(){const el=document.getElementById('p-avatar');el.textContent=name;el.style.fontSize=name.length>5?'9px':name.length>3?'11px':'13px';el.style.lineHeight='1.2';el.style.textAlign='center';}());
  document.getElementById('p-topic').textContent=d.topic+' · '+_dFmt(d.date);
  const _pHeader=document.querySelector('#p5 .container [style*="font-size:15px"]');
  if(_pHeader) _pHeader.textContent='รายงานผลการเรียน — '+name;
  // แถบเลือกสไตล์ (แทรกเหนือ summary ครั้งแรกครั้งเดียว)
  let bar=document.getElementById('p-animalBar');
  if(!bar){ const ps=document.getElementById('p-summary'); if(ps){ps.insertAdjacentHTML('beforebegin','<div id="p-animalBar"></div>'); bar=document.getElementById('p-animalBar');} }
  const cur=_getPType();
  if(bar){
    bar.innerHTML='<div style="font-size:11px;color:var(--text3,#948F86);margin-bottom:6px">สไตล์การรายงาน — เลือกแบบที่ใกล้เคียง "สไตล์การเชียร์ลูก" ของคุณ (ระบบจะจำไว้ในเครื่องนี้)</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">'
      +Object.entries(PARENT_TYPES).map(([k,a])=>`<button onclick="setPType('${k}')" style="flex:1 1 100px;min-width:96px;border:1.5px solid ${k===cur?'#185FA5':'var(--border,#E7E4DC)'};background:${k===cur?'var(--blue-l,#E8F1FA)':'#fff'};border-radius:10px;padding:7px 4px;cursor:pointer;text-align:center;font-family:inherit"><span style="font-size:20px;display:block">${a.em}</span><b style="font-size:12px">${a.nm}</b><span style="display:block;font-size:9.5px;color:var(--text3,#948F86)">${a.tag}</span></button>`).join('')
      +'</div>';
  }
  const wc=document.getElementById('p-weakcard');
  if(cur==='eagle'){if(wc)wc.style.display='none';_parentEagle(d);return;}
  if(cur==='elephant'){if(wc)wc.style.display='none';_parentElephant(d);return;}
  if(cur==='owl'){if(wc)wc.style.display='none';_parentOwl(d);return;}
  if(cur==='bee'){if(wc)wc.style.display='none';_parentBee(d);return;}
  _parentDolphin(d);
}

// ── 🐬 โลมา: รายงานฉบับเต็ม (โค้ดเดิมทั้งหมด) ──
function _parentDolphin(d){
  const name=d.shortName;
  const pct=Math.round(d.score/(d.full||30)*100);
  const avg=d.groupMembers.length?Math.round(d.groupMembers.reduce((s,m)=>s+m.score,0)/d.groupMembers.length):0;
  const avgPct=Math.round(avg/(d.full||30)*100);

  // ระดับ
  let level,levelClass,levelDesc;
  if(pct>=90){level='ดีเยี่ยม';levelClass='level-A';levelDesc='ทำได้เกินเป้าหมาย';}
  else if(pct>=70){level='ดี';levelClass='level-B';levelDesc='อยู่ในเกณฑ์ที่ดี';}
  else if(pct>=50){level='พอใช้';levelClass='level-C';levelDesc='ต้องพัฒนาเพิ่ม';}
  else{level='ต้องพัฒนา';levelClass='level-D';levelDesc='ต้องให้ความสนใจเป็นพิเศษ';}

  const aboveAvg=d.score>=avg;

  // (header/avatar ถูกย้ายไปทำใน renderParentDash แล้ว)
  // summary
  document.getElementById('p-summary').innerHTML=`
    <div style="font-size:13px;color:var(--blue);font-weight:500;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">ภาพรวมการสอบครั้งนี้</div>
    <div class="summary-headline">
      <span class="summary-highlight">${name}</span> ทำคะแนนได้
      <span class="summary-highlight">${d.score}/${d.full||30} คะแนน (${pct}%)</span>
      อยู่ในระดับ <span class="level-badge ${levelClass}">${level}</span>
    </div>
    <div class="summary-headline" style="margin-bottom:0">
      <b>เทียบในกลุ่ม:</b> อันดับที่ <span class="summary-highlight">${d.rank}</span> จาก <span class="summary-highlight">${d.groupMembers.length}</span> คน
      ${aboveAvg
        ? `— <span class="summary-highlight green">สูงกว่าค่าเฉลี่ยกลุ่ม</span> (${avgPct}%)`
        : `— ค่าเฉลี่ยกลุ่มอยู่ที่ ${avgPct}%`}
    </div>
    ${d.allMembers.length>d.groupMembers.length?`
    <div class="summary-headline" style="margin-bottom:0;margin-top:6px">
      <b>เทียบทุกคนที่สอบบทนี้:</b> อันดับที่ <span class="summary-highlight">${d.allRank}</span> จาก <span class="summary-highlight">${d.allMembers.length}</span> คน
      ${d.score>=d.allAvg
        ? `— <span class="summary-highlight green">สูงกว่าค่าเฉลี่ยรวม</span> (${Math.round(d.allAvg/(d.full||30)*100)}%)`
        : `— ค่าเฉลี่ยรวมอยู่ที่ ${Math.round(d.allAvg/(d.full||30)*100)}%`}
    </div>`:''}`;

  // วิเคราะห์ปัญหา
  const problems=[];
  // ── สรุปรวมต้องทบทวน ──
  const totalReview=(d.care||0)+(d.concept||0)+(d.cant||0)+(d.timeout||0);
  if(totalReview>0)problems.push({icon:'🔁',color:'var(--amber-bg,#fff7ed)',border:'var(--amber,#f59e0b)',count:totalReview,countColor:'var(--amber,#f59e0b)',title:'ต้องทบทวนรวม '+totalReview+' ข้อ',desc:'แบ่งเป็น: ⚠️สะเพร่า '+(d.care||0)+' | 🧠คอนเซปต์ '+(d.concept||0)+' | ❌ทำไม่ได้ '+(d.cant||0)+' | ⏰ไม่ทัน '+(d.timeout||0)+' ข้อ'});
  const F=_parentFacts(d);
  if((d.concept||0)>0)problems.push({icon:'🧠',color:'#f3e8ff',border:'#a855f7',count:(d.concept||0),countColor:'#a855f7',title:'คอนเซปต์ยังไม่แน่น '+(d.concept||0)+' ข้อ',desc:_pv([
    `${F.qList(F.conceptQ)||'บางข้อ'} ผิดเพราะหลักการยังไม่แน่น${F.conceptSub.length?' — อยู่ในหัวข้อ '+_thaiList(F.conceptSub):''} ควรทบทวนทฤษฎีให้เข้าใจก่อนทำโจทย์เพิ่ม`,
    `กลุ่มนี้คือข้อที่น้อง "เข้าใจคลาดเคลื่อน" ไม่ใช่ "ไม่ตั้งใจ"${F.conceptSub.length?' โดยเฉพาะเรื่อง'+_thaiList(F.conceptSub):''} — ดูคลิปหรือให้ครูอธิบายซ้ำจะได้ผลกว่าการทำโจทย์เยอะๆ`,
    `${F.qList(F.conceptQ)||'บางข้อ'} เป็นจุดที่ต้องกลับไปตั้งต้นใหม่ที่หลักการ การรีบทำโจทย์เพิ่มตอนนี้จะยิ่งจำวิธีผิดไปใช้ครับ`,
    `ผิดจากความเข้าใจ ไม่ใช่ความประมาท${F.conceptSub.length?' — หัวข้อ '+_thaiList(F.conceptSub)+' ยังต้องปูพื้นเพิ่ม':''} เป็นจุดที่ครูจะอธิบายซ้ำให้ในคาบครับ`
  ],d,0)});
  if((d.cant||0)>0)problems.push({icon:'❌',color:'#fee2e2',border:'#ef4444',count:(d.cant||0),countColor:'#ef4444',title:'ทำไม่ได้ '+(d.cant||0)+' ข้อ',desc:_pv([
    `${F.qList(F.cantQ)||'บางข้อ'} ยังทำไม่ได้ — ควรดูคลิปเฉลยแล้วลองทำใหม่ด้วยตัวเองอีกครั้ง`,
    `เป็นโจทย์ที่เกินระดับที่น้องฝึกมาถึงตอนนี้${F.cantSub.length?' (หัวข้อ '+_thaiList(F.cantSub)+')':''} ไม่ใช่เรื่องน่ากังวล แต่เป็นลำดับถัดไปที่ต้องเก็บ`,
    `ข้อกลุ่มนี้ครูแนะนำให้ทำทีหลังสุด หลังเก็บข้อที่พลาดจากความรีบครบแล้ว จะได้คะแนนคืนคุ้มแรงกว่า`,
    `${F.qList(F.cantQ)||'บางข้อ'} คือเป้าหมายระยะถัดไป — ถ้าเก็บได้ครั้งหน้าคะแนนจะขยับชัดเจนครับ`
  ],d,1)});
  if((d.timeout||0)>0)problems.push({icon:'⏰',color:'#f1f5f9',border:'#94a3b8',count:(d.timeout||0),countColor:'#94a3b8',title:'ไม่ทันเวลา '+(d.timeout||0)+' ข้อ',desc:_pv([
    `${F.qList(F.timeQ)||'บางข้อ'} หมดเวลาก่อน — ฝึกข้ามข้อที่ติดแล้ววนกลับมาทีหลัง จะเก็บคะแนนได้มากขึ้น`,
    `การบริหารเวลาเป็นทักษะแยกจากความเก่ง ฝึกจับเวลาที่บ้านสัก 2-3 ครั้งก็เห็นผลแล้วครับ`,
    `น้องใช้เวลากับข้อยากนานเกินไปจนไม่เหลือเวลาข้อท้าย ลองฝึกกวาดข้อง่ายให้ครบก่อนหนึ่งรอบ`,
    `${F.qList(F.timeQ)||'ข้อท้ายๆ'} ยังไม่ได้ลงมือเพราะเวลาหมด — ไม่ได้แปลว่าทำไม่ได้ครับ`
  ],d,2)});
  if(d.care>0)problems.push({icon:'🟡',color:'var(--amber-l)',border:'var(--amber)',title:'รู้คำตอบแล้ว แต่พลาดจากความรีบ',desc:_pv([
    `${F.qList(F.careQ)||''} พลาดทั้งที่ทำเป็น — ลองชวนน้องอธิบายวิธีตรวจคำตอบให้ฟัง ได้ผลกว่าการเตือนให้ระวังครับ`,
    `นี่คือ ${d.care} คะแนนที่อยู่ใกล้มือที่สุด${F.careSub.length?' (หัวข้อ '+_thaiList(F.careSub)+')':''} ความรอบคอบฝึกได้เหมือนกล้ามเนื้อ`,
    `น้องรู้วิธีทำครบแล้ว เหลือแค่จังหวะตรวจทาน — ลองให้จดว่าแต่ละข้อพลาดตรงไหน (อ่านโจทย์ตก/คำนวณ/ลอกเลข) จะเห็นรูปแบบตัวเอง`,
    `ถ้าเก็บกลุ่มนี้ได้ครบ คะแนนจะขึ้นเป็น ${_careGain(d)}/${d.full||30} ทันทีโดยไม่ต้องเรียนอะไรใหม่เลยครับ`
  ],d,3),count:d.care,countColor:'var(--amber)'});
  if(d.blank>0)problems.push({icon:'⬜',color:'var(--surf)',border:'var(--border-md)',title:'ข้อที่ยังไม่ได้ลงมือทำ',desc:_pv([
    `มี ${d.blank} ข้อที่เว้นไว้ — ลองถามด้วยความเข้าใจว่าเพราะเวลาไม่พอ ไม่เข้าใจโจทย์ หรือไม่มั่นใจ`,
    `${d.blank} ข้อที่ไม่ได้แตะ อาจบอกเรื่องการจัดลำดับข้อมากกว่าเรื่องความรู้ครับ`,
    `การเว้นข้อไว้บางครั้งคือการตัดสินใจที่ดี (ไม่เสียเวลากับข้อยาก) ลองถามน้องว่าตั้งใจข้ามหรือทำไม่ทัน`
  ],d,4),count:d.blank,countColor:'var(--text3)'});

  const pp=document.getElementById('p-problems');pp.innerHTML='';
  if(!problems.length){pp.innerHTML='<div style="font-size:14px;color:var(--green);padding:8px 0">ไม่พบปัญหา — ทำได้ดีมากทุกข้อ 🎉</div>';}
  else problems.forEach(p=>{pp.innerHTML+=`<div class="problem-card" style="background:${p.color};border-left:4px solid ${p.border};margin-bottom:10px"><div class="problem-icon">${p.icon}</div><div style="flex:1"><div class="problem-title">${p.title}</div><div class="problem-desc">${p.desc}</div></div><div class="problem-count" style="color:${p.countColor}">${p.count}</div></div>`;});

  // หัวข้อที่อ่อน
  const weak=d.subtopics.filter(st=>Math.round(st.ok/st.total*100)<70).slice(0,5);
  const wt=document.getElementById('p-weaktopics');wt.innerHTML='';
  if(!weak.length){document.getElementById('p-weakcard').style.display='none';}
  else{
    document.getElementById('p-weakcard').style.display='block';
    weak.forEach(st=>{
      const pct2=Math.round(st.ok/st.total*100);
      const color=pct2>=50?'var(--amber)':'var(--red)';
      wt.innerHTML+=`<div class="weak-topic">
        <div style="flex:1"><div style="font-size:14px;color:var(--text1)">${st.name}</div><div style="font-size:11px;color:var(--text3)">ทำถูก ${st.ok}/${st.total} ข้อ</div></div>
        <div style="font-size:13px;font-weight:500;color:${color}">${pct2}%</div>
      </div>`;
    });
  }

  // คำแนะนำ
  const actions=[];
  if(F.chronic.length)actions.push({title:'จุดที่พลาดซ้ำหลายครั้ง',color:'#8A5A10',text:_pv([
    `หัวข้อ "${F.chronic[0].sub}" น้องพลาดใน ${F.chronic[0].times} การสอบแล้ว — จุดแบบนี้ต้องกลับไปเรียนแนวคิดใหม่กับครู การฝึกโจทย์เพิ่มอย่างเดียวมักไม่พอครับ`,
    `"${F.chronic[0].sub}" เป็นจุดเรื้อรัง (พลาด ${F.chronic[0].times} ครั้ง) ครูจะจับน้องคุยเฉพาะหัวข้อนี้ — ที่บ้านช่วยได้ด้วยการถามว่า "หัวข้อนี้ติดตรงไหน" แทนการให้ทำโจทย์เพิ่ม`,
    `ต่างจากข้อที่พลาดครั้งแรก (ปกติมาก) — "${F.chronic[0].sub}" พลาดมา ${F.chronic[0].times} ครั้งติด แปลว่ามีความเข้าใจบางอย่างคลาดเคลื่อนตั้งแต่ต้น ต้องรื้อใหม่ครับ`
  ],d,5)});
  if(d.wrong>=5)actions.push({title:'วางแผนทบทวนหัวข้อที่อ่อน',color:'var(--blue)',text:_pv([
    `โฟกัสที่ "${weak.length?weak[0].name:'หัวข้อที่ทำผิด'}" ก่อนหัวข้ออื่น — สนับสนุนให้น้องวางแผนเอง (ดูคลิป/ทำโจทย์เก่าซ้ำ) การเข้าใจให้แน่นสำคัญกว่าเร่งทำเยอะ`,
    `${weak.length>1?'สองหัวข้อที่ควรเก็บก่อนคือ '+_thaiList(weak.slice(0,2).map(w=>w.name)):'หัวข้อ "'+(weak.length?weak[0].name:'ที่ทำผิด')+'"'} — ทำทีละหัวข้อจนแน่น ดีกว่ากวาดทุกหัวข้อพร้อมกันครับ`,
    `ลองให้น้องเป็นคนเลือกเองว่าจะเริ่มจากหัวข้อไหน แล้วคุณพ่อคุณแม่เป็นคนถามความคืบหน้า — ความรู้สึกเป็นเจ้าของแผนช่วยเรื่องแรงจูงใจมากครับ`
  ],d,6)});
  if(d.care>=3)actions.push({title:'ฝึกความรอบคอบแบบเจาะจุด',color:'var(--amber)',text:_pv([
    `${F.qList(F.careQ)} พลาดจากความรีบ — ให้น้องจดว่าแต่ละข้อพลาดเพราะอะไร (อ่านโจทย์ตก/คำนวณ/ลอกเลข) พอเห็นรูปแบบซ้ำจะแก้ได้ตรงจุด`,
    `ตั้งเป้าแคบๆ ว่าครั้งหน้าลดข้อสะเพร่าจาก ${d.care} เหลือ ${Math.max(1,Math.floor(d.care/2))} ข้อ — เป้าที่วัดได้ทำให้เด็กรู้ว่าตัวเองสำเร็จหรือยัง`,
    `ลองให้น้องทำข้อเดิมซ้ำแบบไม่จับเวลา ถ้าทำถูกหมด = ปัญหาคือจังหวะ ไม่ใช่ความรู้ ซึ่งแก้ง่ายกว่ามากครับ`,
    `เทคนิคที่ได้ผลกับเด็กหลายคน: อ่านโจทย์จบแล้วขีดเส้นใต้ "สิ่งที่โจทย์ถาม" ก่อนลงมือคำนวณ`
  ],d,7)});
  if(d.blank>=3)actions.push({title:'พูดคุยด้วยความเข้าใจ',color:'var(--text2)',text:_pv([
    `มี ${d.blank} ข้อที่ไม่ได้ทำ — คุยแบบเปิดใจว่าเพราะเวลาไม่พอ ไม่เข้าใจโจทย์ หรือกังวล การฟังโดยไม่ตำหนิทำให้น้องกล้าบอกปัญหาจริง`,
    `ลองถามว่า "ตอนเจอข้อที่ข้าม รู้สึกยังไง" — คำตอบจะบอกว่าเป็นปัญหาเวลา หรือความมั่นใจ ซึ่งแก้คนละวิธีครับ`,
    `${d.blank} ข้อที่เว้นไว้อาจเป็นการตัดสินใจที่ถูกแล้วก็ได้ (ไม่จมกับข้อยาก) ลองฟังเหตุผลของน้องก่อนสรุปครับ`
  ],d,8)});
  if(aboveAvg&&pct>=70)actions.push({title:'ชื่นชมที่ความพยายาม',color:'var(--green)',text:_pv([
    `${name} ทำได้เหนือค่าเฉลี่ยกลุ่ม — ชมที่ "ความตั้งใจและวิธีคิด" มากกว่า "เก่ง" ช่วยให้น้องเชื่อว่าความสำเร็จมาจากสิ่งที่ควบคุมได้`,
    `${F.strongName?'หัวข้อ "'+F.strongName+'" น้องทำได้แม่นมาก ':''}ลองชมแบบเจาะจง เช่น "แม่เห็นว่าลูกทำเรื่องนี้ได้ดีขึ้นจริงๆ" — คำชมที่เจาะจงมีน้ำหนักกว่าคำว่าเก่งครับ`,
    `${d.streak>=2?'ดีขึ้น '+d.streak+' ครั้งติด — ':''}ชมที่ความสม่ำเสมอ เพราะนั่นคือสิ่งที่พาไปถึงเป้าหมายจริงๆ ไม่ใช่คะแนนครั้งใดครั้งหนึ่ง`
  ],d,9)});
  if(!actions.length)actions.push({title:'รักษาจังหวะที่ดีไว้',color:'var(--green)',text:_pv([
    `ผลอยู่ในเกณฑ์ดีมาก ให้กำลังใจและติดตามอย่างสม่ำเสมอ ความต่อเนื่องคือกุญแจของการเตรียมสอบครับ`,
    `ไม่มีจุดที่ต้องแก้เร่งด่วน — ช่วงนี้เหมาะกับการรักษาวินัยเดิมและพักผ่อนให้พอ`,
    `${F.strongName?'"'+F.strongName+'" แม่นแล้ว ':''}ขั้นถัดไปคือลองข้อที่ยากขึ้นเพื่อไม่ให้หยุดพัฒนา ครูเตรียมชุดฝึกไว้ให้แล้วครับ`
  ],d,10)});

  const pa=document.getElementById('p-actions');pa.innerHTML='';
  actions.forEach(a=>{pa.innerHTML+=`<div class="action-card" style="border-left-color:${a.color}"><div class="action-title" style="color:${a.color}">${a.title}</div><div class="action-text">${a.text}</div></div>`;});
  // ── คำถามชวนคุย — ปรับตามผลสอบจริง ──
  const talkEl=document.getElementById('p-talkList');
  if(talkEl){
    talkEl.innerHTML='';
    const talks=[];
    talks.push(_pv([
      '"บทนี้ข้อไหนที่ภูมิใจว่าทำได้ที่สุด?" — เริ่มจากจุดแข็งก่อนเสมอ',
      (F.strongName?'"เห็นครูบอกว่าเรื่อง '+F.strongName+' ลูกทำได้ดี ทำยังไงถึงเข้าใจเรื่องนี้?" — ให้เล่าความสำเร็จก่อน':'"ข้อไหนที่รู้สึกว่าทำได้ดีที่สุด?" — เปิดด้วยเรื่องบวกเสมอ'),
      '"ครั้งนี้มีอะไรที่ทำได้ดีกว่าครั้งที่แล้วบ้าง?" — ให้ลูกเป็นคนสังเกตพัฒนาการตัวเอง'
    ],d,11));
    if(d.care>0)talks.push(_pv([
      '"ข้อที่พลาดเพราะรีบ ถ้าย้อนกลับไปได้จะทำต่างจากเดิมยังไง?" — ให้ลูกคิดวิธีแก้เอง ดีกว่าบอกให้ระวัง',
      '"ตอนทำข้อนั้น รีบเพราะอะไร — กลัวไม่ทัน หรือคิดว่าง่าย?" — สาเหตุต่างกัน วิธีแก้ก็ต่างกัน',
      '"ถ้าจะกันพลาดแบบเดิมครั้งหน้า ลูกจะทำยังไง?" — ให้ลูกออกแบบวิธีของตัวเอง จะจำได้นานกว่า'
    ],d,12));
    if(d.blank>0)talks.push(_pv([
      '"ข้อที่เว้นไว้ เจอตอนไหนของเวลาสอบ?" — ช่วยรู้ว่าปัญหาคือการจัดเวลาหรือความมั่นใจ',
      '"ข้อที่ข้ามไป ถ้ามีเวลาอีก 5 นาทีคิดว่าทำได้ไหม?" — แยกว่า "ไม่ทัน" หรือ "ทำไม่ได้"'
    ],d,13));
    if(d.wrong>0)talks.push(_pv([
      '"หัวข้อไหนที่อยากเข้าใจมากขึ้น?" — เปิดทางให้ลูกขอความช่วยเหลือโดยไม่เสียหน้า',
      (F.weakName?'"เรื่อง '+F.weakName+' ตอนนี้ติดตรงไหน?" — คำถามเจาะจงได้คำตอบที่ใช้ได้จริงกว่า':'"มีหัวข้อไหนที่อยากให้ครูอธิบายซ้ำไหม?"'),
      '"ถ้าให้เลือกเก็บหัวข้อเดียวก่อนสอบครั้งหน้า จะเลือกอะไร?" — ฝึกให้ลูกจัดลำดับความสำคัญเอง'
    ],d,14));
    talks.push(_pv([
      '"มีอะไรให้พ่อแม่ช่วยไหม?" — บางครั้งแค่ถามก็เพียงพอแล้ว',
      '"ช่วงนี้เหนื่อยไหม อยากให้บ้านช่วยอะไรเป็นพิเศษ?" — ดูแลสภาพใจควบคู่กับคะแนน',
      '"อยากให้แม่/พ่อถามเรื่องเรียนบ่อยแค่ไหนถึงจะพอดี?" — ให้ลูกกำหนดระยะห่างเอง ลดแรงต้าน'
    ],d,15));
    talks.forEach(t=>{
      talkEl.innerHTML+=`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:0.5px solid var(--border)">
        <div style="color:var(--blue);flex-shrink:0">•</div>
        <div style="font-size:13px;color:var(--text1);line-height:1.6">${t}</div>
      </div>`;
    });
  }

  // q-grid
  const qClass={ok:'q-ok',care:'q-care',concept:'q-concept',cant:'q-cant',timeout:'q-timeout',wrong:'q-wrong',blank:'q-blank'};
  ['p-qgrid1','p-qgrid2'].forEach(id=>document.getElementById(id).innerHTML='');
  for(let i=1;i<=30;i++){const g=document.getElementById(i<=15?'p-qgrid1':'p-qgrid2');const el=document.createElement('div');el.className='q-cell '+qClass[d.qResults[i]];el.textContent=i;g.appendChild(el);}
}

// ── 🦅 นกอินทรี: เทียบกับตัวเองเท่านั้น + ตารางแผนที่ครูดำเนินการแล้ว + ประโยคแนะนำ ──
function _parentEagle(d){
  const name=d.shortName,hist=d.history||[];
  const deltaTxt=d.delta==null?'':(d.delta>0?'+'+d.delta:''+d.delta);
  document.getElementById('p-summary').innerHTML=`
    <div style="font-size:13px;color:var(--blue);font-weight:500;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">🦅 รายงานความก้าวหน้า — เทียบกับตัวเองเท่านั้น</div>
    <div class="summary-headline"><span class="summary-highlight">${name}</span> ได้ <span class="summary-highlight">${d.score}/${d.full||30}</span>${d.delta!=null?` (${deltaTxt} จากครั้งก่อน)`:''}${d.isBest?' · 🏆 สูงสุดตั้งแต่เริ่มเรียน':''}${d.streak>=2?` · 🔥 ดีขึ้น ${d.streak} ครั้งติด`:''}</div>
    ${hist.length>=2?`<div style="max-width:280px;margin-top:6px">${_sparkSvg(hist.map(h=>h.score),280,60,d.full||30)}<div style="font-size:10px;color:var(--text3)">เส้นประแดง = เป้า ${Math.round((d.full||30)*25/30)}/${d.full||30} · ${hist.map(h=>h.score).join(' → ')}</div></div>`:''}`;
  const F=_parentFacts(d);
  const rows=[];
  if(d.care>0)rows.push([`⚠️ สะเพร่า${F.careQ.length?'<div style="font-size:10.5px;color:var(--text3)">'+F.qList(F.careQ)+'</div>':''}`,d.care,_pv([
    'ฝึก checklist ตรวจทานก่อนตอบ ใช้ในคาบเรียนถัดไป',
    'ให้ทำข้อเดิมซ้ำแบบไม่จับเวลา เพื่อยืนยันว่าเป็นเรื่องจังหวะไม่ใช่ความรู้',
    'ฝึกขีดเส้นใต้สิ่งที่โจทย์ถามก่อนลงมือ — ลดพลาดจากการอ่านตก',
    'ให้จดสาเหตุที่พลาดรายข้อ แล้วครูทวนรูปแบบที่ซ้ำกับน้อง'
  ],d,0)]);
  if(d.concept>0)rows.push([`🧠 คอนเซปต์${F.conceptSub.length?'<div style="font-size:10.5px;color:var(--text3)">'+_thaiList(F.conceptSub)+'</div>':''}`,d.concept,_pv([
    'มอบคลิปเฉลย + แบบฝึกหัวข้อที่พลาด พร้อมกำหนดส่ง',
    'อธิบายหลักการซ้ำในคาบ แล้วให้ลองอธิบายกลับให้ครูฟัง',
    'ปูพื้นหัวข้อนี้ใหม่ก่อน แล้วค่อยกลับมาทำโจทย์ระดับเดิม',
    'จับคู่ทบทวนกับข้อคล้ายกันจากคลัง เพื่อยืนยันว่าเข้าใจจริง'
  ],d,1)]);
  if(d.cant>0)rows.push([`❌ ทำไม่ได้${F.cantQ.length?'<div style="font-size:10.5px;color:var(--text3)">'+F.qList(F.cantQ)+'</div>':''}`,d.cant,_pv([
    'ครูอธิบายเพิ่มรายบุคคล แล้วให้ลองทำซ้ำ',
    'จัดไว้เป็นเป้าหมายรอบถัดไป หลังเก็บข้อที่ได้คืนง่ายครบแล้ว',
    'ให้เริ่มจากโจทย์ระดับง่ายกว่าในหัวข้อเดียวกันก่อนไต่ขึ้น',
    'ครูจะทำเป็นตัวอย่างให้ดูทีละขั้น แล้วให้ทำเวอร์ชันที่เปลี่ยนตัวเลข'
  ],d,2)]);
  if(d.timeout>0)rows.push([`⏰ ไม่ทัน${F.timeQ.length?'<div style="font-size:10.5px;color:var(--text3)">'+F.qList(F.timeQ)+'</div>':''}`,d.timeout,_pv([
    'ฝึกจับเวลารายข้อ (2.5 นาที/ข้อ) เก็บข้อง่ายก่อน',
    'ฝึกกลยุทธ์ "กวาดข้อง่ายรอบแรก แล้ววนกลับข้อยาก"',
    'ซ้อมทำครึ่งชุดจับเวลา เพื่อสร้างความเร็วแบบไม่กดดัน',
    'ตั้งกติกาว่าข้อไหนคิดเกิน 3 นาทีให้ข้ามก่อน'
  ],d,3)]);
  if(F.chronic.length)rows.push([`🔁 พลาดซ้ำ<div style="font-size:10.5px;color:var(--text3)">${F.chronic[0].sub}</div>`,F.chronic[0].times+' ครั้ง',_pv([
    'ครูจะรื้อแนวคิดหัวข้อนี้ใหม่กับน้องเป็นรายบุคคล',
    'จัดเป็นวาระพิเศษ — สอนใหม่จากต้น ไม่ใช่แค่เพิ่มโจทย์',
    'นัดทบทวนเฉพาะหัวข้อนี้ก่อนสอบครั้งหน้า'
  ],d,4)]);
  const td='padding:7px 8px;border-bottom:1px solid var(--border,#E7E4DC)';
  const th='text-align:left;padding:6px 8px;background:var(--surf,#FAF9F5);font-size:11.5px;color:var(--text3)';
  document.getElementById('p-problems').innerHTML=rows.length?
    `<table style="width:100%;border-collapse:collapse;font-size:13px"><tr><th style="${th}">ประเด็น</th><th style="${th}">จำนวน</th><th style="${th}">ติวเตอร์ดำเนินการแล้ว</th></tr>`
    +rows.map(r=>`<tr><td style="${td}">${r[0]}</td><td style="${td}">${r[1]} ข้อ</td><td style="${td}">${r[2]}</td></tr>`).join('')+'</table>'
    :'<div style="font-size:14px;color:var(--green);padding:8px 0">ครั้งนี้ไม่มีจุดต้องแก้ — ทำได้ครบทุกข้อ 🎉</div>';
  const sayPool=[
    `"ครูบอกว่า${d.streak>=2?'ลูกพัฒนาขึ้น '+d.streak+' ครั้งติด':'ทุกจุดที่ลูกพลาดมีแผนแก้ชัดเจนแล้ว'} เก่งมากที่ไม่หยุดพยายาม"`,
    F.strongName?`"ครูบอกว่าเรื่อง ${F.strongName} ลูกทำได้แม่นมาก — พ่อ/แม่ดีใจที่เห็นลูกเก็บทีละเรื่องแบบนี้"`:`"เห็นความตั้งใจของลูกทุกสัปดาห์ ไม่ต้องรีบ ค่อยๆ เก็บไปทีละเรื่อง"`,
    d.care>0?`"ครูบอกว่าลูกทำเป็นเกือบหมด เหลือแค่เรื่องความรอบคอบ — แปลว่าพื้นฐานลูกแน่นแล้วนะ"`:`"${d.score} คะแนนนี้มาจากความสม่ำเสมอของลูกเอง พ่อ/แม่ภูมิใจ"`,
    `"อยากรู้ว่าช่วงนี้ลูกเหนื่อยไหม — เรื่องคะแนนค่อยว่ากัน ขอให้ลูกดูแลตัวเองก่อน"`
  ];
  const dontPool=[
    `"ทำไมยังไม่เต็ม 30" / "เพื่อนได้เท่าไหร่" — การเทียบกับผู้อื่นช่วงเตรียมสอบเพิ่มความกังวล และทำให้เด็กเริ่มปิดบังคะแนน`,
    `"แค่นี้เองเหรอ" / "ตั้งใจกว่านี้หน่อย" — เด็กที่ตั้งใจอยู่แล้วจะตีความว่าความพยายามที่ทำไปไม่ถูกมองเห็น`,
    `"ถ้าไม่ขยันตอนนี้จะสอบไม่ติดนะ" — การขู่ด้วยอนาคตเพิ่ม anxiety แต่ไม่เพิ่มพฤติกรรมการอ่านหนังสือ`,
    `เปรียบเทียบกับพี่น้องหรือลูกคนอื่น — ทำลายความสัมพันธ์ในบ้านโดยไม่ช่วยเรื่องคะแนนเลยครับ`
  ];
  document.getElementById('p-actions').innerHTML=`
    <div style="border-left:4px solid #3B7D2A;background:#EAF5E6;padding:11px 13px;border-radius:0 10px 10px 0;margin-bottom:8px;font-size:13px"><b style="display:block;font-size:12px;margin-bottom:3px">✅ ประโยคที่ช่วยลูกได้มากสัปดาห์นี้</b>${_pv(sayPool,d,5)}</div>
    <div style="border-left:4px solid #A32D2D;background:#FBEAEA;padding:11px 13px;border-radius:0 10px 10px 0;font-size:13px"><b style="display:block;font-size:12px;margin-bottom:3px">⛔ ประโยคที่งานวิจัยพบว่าทำให้คะแนนครั้งหน้าแย่ลง</b>${_pv(dontPool,d,6)}</div>`;
  const talkEl=document.getElementById('p-talkList');
  if(talkEl)talkEl.innerHTML='<div style="font-size:13px;color:var(--text1);line-height:1.9">• '+_pv([
    '"เป้าครั้งหน้าลูกอยากได้เท่าไหร่ ให้พ่อแม่ช่วยอะไรได้บ้าง?" — ให้ลูกเป็นเจ้าของเป้าหมายเอง',
    '"ถ้าจะขยับอีก 2-3 คะแนน ลูกคิดว่าต้องเก็บเรื่องไหนก่อน?" — ฝึกวางแผนด้วยตัวเอง',
    (F.weakName?'"เรื่อง '+F.weakName+' ลูกอยากให้ครูช่วยแบบไหน?" — ให้ลูกเป็นคนขอความช่วยเหลือเอง':'"มีหัวข้อไหนที่อยากให้ครูช่วยเป็นพิเศษไหม?"')
  ],d,7)+'<br>• '+_pv([
    '"ข้อไหนที่ภูมิใจว่าแก้ได้แล้ว?" — เริ่มจากความก้าวหน้าก่อนเสมอ',
    '"ครั้งนี้ลูกทำอะไรได้ดีกว่าครั้งก่อน?" — ให้ลูกฝึกมองพัฒนาการของตัวเอง',
    '"อยากให้พ่อแม่เชียร์แบบไหนถึงจะรู้สึกดี?" — เด็กแต่ละคนต้องการแรงเชียร์คนละแบบ'
  ],d,8)+'</div>';
  _fillParentQGrid(d);
}

// ── 🐘 ช้าง: ข่าวดีมาก่อน ไม่มีสีแดง มี context และคำสัญญาจากครู ──
function _parentElephant(d){
  const name=d.shortName, F=_parentFacts(d);
  const goods=[];
  if(d.isBest)goods.push(`คะแนนสูงสุดตั้งแต่เริ่มเรียน — ${d.score}/${d.full||30}`);
  if(d.streak>=2)goods.push(`พัฒนาดีขึ้นต่อเนื่อง ${d.streak} ครั้งติด`);
  else if(d.delta!=null&&d.delta>0)goods.push(`คะแนนเพิ่มขึ้น ${d.delta} ข้อจากครั้งก่อน`);
  if(F.strongName)goods.push(`หัวข้อ "${F.strongName}" น้องทำได้แม่นมากในชุดนี้`);
  if(d.care>0)goods.push(`มี ${d.care} ข้อที่น้องรู้วิธีทำอยู่แล้ว เพียงฝึกความรอบคอบอีกนิดก็ได้คะแนนคืน`);
  if(d.grpStats&&d.score>=d.grpStats.avg)goods.push(`คะแนนอยู่เหนือค่าเฉลี่ยของกลุ่ม (${d.grpStats.avg}/${d.full||30})`);
  if(d.timeout===0&&d.blank===0)goods.push('น้องลงมือทำครบทุกข้อ ไม่มีข้อไหนถูกปล่อยว่าง — สะท้อนความตั้งใจได้ดีมาก');
  if(F.strong.length>=2)goods.push(`มี ${F.strong.length} หัวข้อที่น้องทำได้เกิน 80% แล้วในบทนี้`);
  if(!goods.length)goods.push('น้องมาเรียนสม่ำเสมอและตั้งใจทำครบทุกขั้นตอน — ความต่อเนื่องแบบนี้คือรากฐานที่ดีที่สุดครับ');
  // หมุนลำดับข่าวดี เพื่อไม่ให้เห็นชุดเดิมซ้ำเมื่อผลใกล้เคียงกัน
  if(goods.length>3){ const k=_pSeed(d)%goods.length; goods.push(...goods.splice(0,k)); }
  document.getElementById('p-summary').innerHTML=`
    <div style="font-size:13px;color:#3B7D2A;font-weight:600;margin-bottom:8px">🐘 ข่าวดีของ${name}ประจำรายงานนี้ 🌱</div>
    ${goods.slice(0,3).map((g,i)=>`<div class="summary-headline" style="margin-bottom:4px">${i+1}. ${g}</div>`).join('')}`;
  const below=d.grpStats&&d.score<d.grpStats.avg;
  document.getElementById('p-problems').innerHTML=`
    <div style="font-size:13px;color:var(--text2);line-height:1.9">
    <b>บริบทที่อยากให้ทราบ:</b> ${_pv([
      `ค่าเฉลี่ยของกลุ่มครั้งนี้อยู่ที่ ${d.grpStats?d.grpStats.avg:'—'}/${d.full||30} ${below?'— ชุดนี้ท้าทายทั้งกลุ่ม คะแนนของน้องอยู่ในจังหวะการเรียนรู้ที่เหมาะสมครับ':'— น้องทำได้ดีมากครับ'}`,
      `ข้อสอบชุดนี้คัดจากข้อสอบเข้ามหาวิทยาลัยจริง ระดับความยากจึงสูงกว่าข้อสอบในโรงเรียน ${below?'คะแนนที่เห็นจึงไม่ได้สะท้อนว่าน้องอ่อนครับ':'ซึ่งน้องรับมือได้ดี'}`,
      `ครูออกแบบให้แต่ละชุดมีข้อยากปนอยู่เสมอ เพื่อวัดว่าควรเสริมตรงไหน ${below?'คะแนนไม่เต็มจึงเป็นเรื่องที่คาดไว้แล้ว':'น้องผ่านจุดที่ตั้งใจวัดไว้ได้'}ครับ`
    ],d,0)}<br>
    <b>สิ่งที่ครูดูแลอยู่:</b> ${_pv([
      'จุดเล็กๆ ที่ยังพลาด ครูมีแผนฝึกในคาบเรียนครบทุกจุดแล้ว ไม่ต้องเพิ่มอะไรที่บ้าน',
      (F.weakName?`ครูจะเสริมเรื่อง "${F.weakName}" ให้ในคาบถัดไป — เตรียมแบบฝึกไว้แล้ว ไม่ต้องหาเพิ่มที่บ้านครับ`:'ครูเตรียมแบบฝึกเฉพาะจุดให้น้องแล้ว ที่บ้านไม่ต้องเพิ่มภาระอะไร'),
      'ทุกข้อที่พลาดถูกบันทึกและจัดลำดับให้แล้วว่าจะเก็บเรื่องไหนก่อน — เป็นหน้าที่ของครูครับ'
    ],d,1)}<br>
    <b>จังหวะการเรียนรู้:</b> ${_pv([
      'คะแนนขึ้นๆ ลงๆ ระหว่างเตรียมสอบเป็นเรื่องปกติมาก สิ่งที่ครูโฟกัสคือแนวโน้มระยะยาวของน้อง',
      'เด็กที่เตรียมสอบทุกคนมีช่วงที่คะแนนนิ่งหรือย่อลง ก่อนจะขยับขึ้นอีกครั้ง — เป็นธรรมชาติของการเรียนรู้ครับ',
      'ครูไม่ตัดสินจากคะแนนครั้งเดียว แต่ดูทิศทางรวม 4-5 ครั้ง ซึ่งของน้องยังอยู่ในเส้นทางที่ดีครับ'
    ],d,2)}</div>`;
  document.getElementById('p-actions').innerHTML=`<div class="action-card" style="border-left-color:#3B7D2A"><div class="action-title" style="color:#3B7D2A">สิ่งเดียวที่ช่วยได้มากที่สุด</div><div class="action-text">${_pv([
    'บรรยากาศผ่อนคลายที่บ้าน — เด็กที่ผู้ปกครองกังวลน้อย ทำข้อสอบได้ดีกว่าอย่างมีนัยสำคัญ ความห่วงใยของคุณส่งถึงน้องอยู่แล้วครับ',
    'ดูแลเรื่องการนอนให้พอ — การพักผ่อนมีผลต่อคะแนนมากกว่าการอ่านเพิ่มอีก 1 ชั่วโมงในคืนก่อนสอบครับ',
    'ให้น้องได้มีเวลาว่างที่ไม่เกี่ยวกับการเรียนบ้าง — สมองต้องการช่วงพักเพื่อจัดระเบียบสิ่งที่เรียนมา',
    'เวลากินข้าวด้วยกันโดยไม่พูดเรื่องคะแนน มีค่ากับน้องมากกว่าที่คิดครับ'
  ],d,3)}</div></div>`;
  const talkEl=document.getElementById('p-talkList');
  if(talkEl)talkEl.innerHTML='<div style="font-size:13px;color:var(--text1);line-height:1.9">• '+_pv([
    '"วันนี้เรียนอะไรสนุกที่สุด?" — คำถามที่ไม่มีคะแนนเป็นคำตอบ',
    '"ช่วงนี้มีเรื่องอะไรอยากเล่าให้ฟังไหม?" — เปิดพื้นที่โดยไม่เจาะจงเรื่องเรียน',
    '"เหนื่อยไหมช่วงนี้?" — ให้ลูกรู้ว่าคุณเห็นความพยายาม ไม่ใช่แค่ผลลัพธ์'
  ],d,4)+'<br>• '+_pv([
    '"อยากกินอะไรพิเศษหลังสอบเสร็จ?" — ให้การสอบจบด้วยความรู้สึกดี',
    '"สุดสัปดาห์นี้อยากไปไหนกันไหม?" — ให้ลูกมีอะไรรอคอยนอกจากการสอบ',
    '"มีอะไรที่พ่อแม่ทำแล้วช่วยลูกได้จริงๆ บ้าง?" — ถามตรงๆ ดีกว่าเดาครับ'
  ],d,5)+'</div>';
  _fillParentQGrid(d);
}

// ── 🦉 นกฮูก: ไฟจราจร + 3 บรรทัดจบ + กติกาว่าครูจะติดต่อเมื่อไหร่ ──
function _parentOwl(d){
  const hist=d.history||[], F=_parentFacts(d);
  const drop2=hist.length>=3&&hist[hist.length-1].score<hist[hist.length-2].score&&hist[hist.length-2].score<hist[hist.length-3].score;
  let st='🟢',color='#3B7D2A',head;
  if(d.score<15||drop2){ st='🔴';color='#A32D2D'; head=_pv([
    'ชุดนี้ท้าทายสำหรับน้อง — ครูปรับแผนฝึกเฉพาะจุดให้แล้ว กำลังใจจากบ้านช่วยได้มากครับ',
    'ช่วงนี้น้องกำลังเจอเนื้อหาที่ยากขึ้น ครูจัดลำดับการเก็บใหม่ให้แล้ว',
    (F.chronic.length?`มีหัวข้อที่พลาดซ้ำ ("${F.chronic[0].sub}") ครูจะรื้อแนวคิดใหม่กับน้องครับ`:'ครูขอเวลาปรับแผนกับน้องอีกสักระยะ ยังอยู่ในช่วงที่แก้ได้ครับ')
  ],d,0); }
  else if(d.delta!=null&&d.delta<0){ st='🟡';color='#C77E1A'; head=_pv([
    'คะแนนย่อลงเล็กน้อย — อยู่ในช่วงผันผวนปกติของการเตรียมสอบ',
    'ครั้งนี้ขยับลงนิดหน่อย ยังอยู่ในกรอบที่ครูคาดไว้ครับ',
    'คะแนนแกว่งเป็นเรื่องปกติเมื่อเนื้อหาเปลี่ยนบท — ครูติดตามอยู่'
  ],d,1); }
  else { head=_pv([
    'เป็นไปตามแผน — ไม่ต้องดำเนินการใดๆ',
    'ทุกอย่างอยู่ในเส้นทาง ให้กำลังใจตามปกติพอครับ',
    (d.isBest?'ครั้งนี้ทำได้ดีที่สุดตั้งแต่เริ่มเรียน — น่าชื่นใจครับ':'น้องรักษาระดับได้ดี ไม่มีอะไรต้องกังวล')
  ],d,2); }
  document.getElementById('p-summary').innerHTML=`
    <div style="display:flex;align-items:center;gap:14px">
      <div style="font-size:40px">${st}</div>
      <div><div style="font-size:16px;font-weight:700;color:${color}">${head}</div>
      <div style="font-size:13.5px;color:var(--text2);margin-top:4px">${d.shortName} · ${d.topic} · ได้ <b>${d.score}/${d.full||30}</b>${d.delta!=null?(d.delta>=0?' (▲ +'+d.delta+')':' (▼ '+d.delta+')'):''}${d.isBest?' · สูงสุดตั้งแต่เริ่มเรียน':''}<br>${(d.care+d.concept+d.cant+d.timeout)>0?_pv([
        'จุดที่ต้องเก็บ ครูจัดแผนฝึกให้แล้ว',
        (F.weakName?'จุดที่ต้องเก็บหลักคือ "'+F.weakName+'" — อยู่ในแผนของครูแล้ว':'จุดที่ต้องเก็บมีครบในแผนทบทวนแล้ว'),
        (d.care>0?'ส่วนใหญ่เป็นข้อที่น้องทำเป็นแต่พลาดจังหวะ — เก็บคืนได้ไม่ยาก':'ครูจัดลำดับสิ่งที่ต้องเก็บให้เรียบร้อยแล้ว')
      ],d,3):'ไม่มีจุดต้องเก็บเพิ่ม'}</div></div>
    </div>`;
  const td='padding:6px 8px;border-bottom:1px solid var(--border,#E7E4DC)';
  document.getElementById('p-problems').innerHTML=`
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">ความหมายของสัญญาณไฟ:</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
    <tr><td style="${td}">🔴</td><td style="${td}">ชุดนี้ท้าทาย หรือคะแนนย่อต่อเนื่อง</td><td style="${td}">ลองชวนลูกคุยเบาๆ และดูรายละเอียดได้ในสไตล์ 🐬 โลมา</td></tr>
    <tr><td style="${td}">🟡</td><td style="${td}">กำลังปรับตัว คะแนนแกว่งเล็กน้อย</td><td style="${td}">ติดตามผลครั้งถัดไป ยังไม่ต้องทำอะไรเพิ่ม</td></tr>
    <tr><td style="padding:6px 8px">🟢</td><td style="padding:6px 8px">ทุกอย่างอยู่ในแผน</td><td style="padding:6px 8px">ให้กำลังใจตามปกติ เท่านี้พอครับ</td></tr></table>`;
  document.getElementById('p-actions').innerHTML='';
  const talkEl=document.getElementById('p-talkList');
  if(talkEl)talkEl.innerHTML='<div style="font-size:13px;color:var(--text1)">• '+_pv([
    '"ช่วงนี้เป็นยังไงบ้าง?" — แค่ให้ลูกรู้ว่าคุณพร้อมฟัง เท่านี้พอครับ',
    '"มีอะไรอยากเล่าไหม?" — คำถามสั้นๆ ที่เปิดประตูไว้โดยไม่กดดัน',
    '"ถ้าอยากให้ช่วยอะไรบอกได้นะ" — ประโยคเดียวที่ทำให้ลูกรู้ว่ามีที่พึ่ง',
    (d.isBest?'"ได้ข่าวว่าครั้งนี้ทำได้ดีที่สุดเลย เก่งมาก" — ชมสั้นๆ ก็มีน้ำหนักครับ':'"เห็นว่าลูกตั้งใจมาตลอด พ่อ/แม่เห็นนะ" — การถูกมองเห็นสำคัญกับวัยรุ่นมาก')
  ],d,4)+'</div>';
  _fillParentQGrid(d);
}

// ── 🐝 ผึ้ง: การ์ดเดียวจบ + สิ่งเดียวที่อยากให้ทำ ──
function _parentBee(d){
  const name=d.shortName;
  let praise='ตั้งใจเรียนสม่ำเสมอ';
  if(d.isBest)praise='ทำคะแนนสูงสุดตั้งแต่เริ่มเรียน';
  else if(d.streak>=2)praise='พัฒนาขึ้น '+d.streak+' ครั้งติด';
  else if(d.delta!=null&&d.delta>0)praise='คะแนนดีขึ้นจากครั้งก่อน';
  const F=_parentFacts(d);
  // พาดหัวการ์ด — หมุนสำนวนตามรอบสอบ
  const headline=_pv([
    `${praise} กำลังไปได้ดีครับ`,
    (F.strongName?`เรื่อง "${F.strongName}" น้องทำได้แม่นมากในชุดนี้`:`${praise} — ครูเห็นความสม่ำเสมอครับ`),
    (d.care>0?`ทำเป็นเกือบครบ เหลือเก็บเรื่องความรอบคอบอีกนิดเดียว`:`${praise} ครับ`),
    (d.grpStats&&d.score>=d.grpStats.avg?`อยู่เหนือค่าเฉลี่ยกลุ่ม (${d.grpStats.avg}/${d.full||30}) ครับ`:`${praise} — ครูดูแลจุดที่เหลือให้แล้ว`)
  ],d,0);
  // "สิ่งเดียวที่อยากให้ทำ" — คลังใหญ่สุด เพราะเป็นหัวใจของสไตล์นี้
  const askPool=[
    {t:'ชมความพยายาม',b:`คืนนี้บอกน้องสั้นๆ ว่า <i>"พ่อ/แม่ได้ข่าวจากครูแบงก์ว่าลูก${praise} ภูมิใจนะ"</i>`,n:'10 วินาที แต่ผลต่อความมุ่งมั่นของลูกมากกว่าที่คิดครับ'},
    {t:'ชมแบบเจาะจง',b:F.strongName?`ลองพูดว่า <i>"ได้ยินว่าเรื่อง ${F.strongName} ลูกทำได้ดีมาก"</i>`:`ลองพูดว่า <i>"เห็นว่าลูกตั้งใจมาตลอด แม่/พ่อเห็นนะ"</i>`,n:'คำชมที่เจาะจงมีน้ำหนักกว่าคำว่า "เก่ง" หลายเท่าครับ'},
    {t:'ถามด้วยความสนใจ',b:`ลองถามน้องว่า <i>"ข้อไหนที่ภูมิใจว่าทำได้ที่สุด?"</i> แล้วฟังเฉยๆ`,n:'การถูกฟังโดยไม่ถูกตัดสิน คือสิ่งที่วัยรุ่นต้องการมากที่สุดครับ'},
    {t:'ดูแลร่างกาย',b:`ช่วยดูให้น้องได้นอนก่อน 23.00 สัก 2-3 คืนสัปดาห์นี้`,n:'การนอนพอมีผลต่อคะแนนมากกว่าการอ่านเพิ่มอีก 1 ชั่วโมงครับ'},
    {t:'ให้พื้นที่',b:`สัปดาห์นี้ลองไม่ถามเรื่องคะแนนสัก 2-3 วัน แล้วชวนทำอย่างอื่นแทน`,n:'ช่วงพักสมองทำให้สิ่งที่เรียนมาเข้าที่ — และลดความกดดันไปในตัว'},
    {t:'ยืนยันว่าอยู่ข้างเดียวกัน',b:`บอกน้องว่า <i>"คะแนนขึ้นลงได้ ขอแค่ลูกไม่หยุดพยายาม พ่อ/แม่อยู่ข้างลูกเสมอ"</i>`,n:'ประโยคนี้สำคัญมากในช่วงที่คะแนนไม่เป็นไปตามหวังครับ'}
  ];
  const ask=askPool[(_pSeed(d)+1)%askPool.length];
  document.getElementById('p-summary').innerHTML=`
    <div style="max-width:340px;margin:0 auto;border:1px solid var(--border,#E7E4DC);border-radius:14px;overflow:hidden;box-shadow:0 3px 10px rgba(0,0,0,.08)">
      <div style="background:#185FA5;color:#fff;padding:10px 14px;font-size:13px">📊 MathsBankTutor · รายงาน${name}</div>
      <div style="padding:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:28px">${d.score>=15?'🟢':'🟡'}</div>
          <div><b style="font-size:18px">${d.score}/${d.full||30}</b> <span style="font-size:11px;color:var(--text3)">· ${d.topic}</span><br><span style="font-size:12.5px">${headline}</span></div>
        </div>
        <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:10px 12px;margin-top:10px;font-size:12.5px">💬 <b style="color:#C2410C">สิ่งเดียวที่อยากรบกวน — ${ask.t}:</b><br>${ask.b}<br><span style="font-size:11px;color:var(--text3)">${ask.n}</span></div>
      </div>
    </div>`;
  document.getElementById('p-problems').innerHTML='<div style="font-size:12px;color:var(--text3)">'+_pv([
    'อยากเห็นรายละเอียดเต็ม สลับสไตล์เป็น 🐬 โลมา ด้านบนได้ทุกเมื่อ — หรือทักครูแบงก์ได้เลยครับ',
    'ถ้ามีเวลาอยากดูละเอียดขึ้น กดสไตล์ 🐬 โลมา ด้านบนได้เลยครับ',
    'มีคำถามเพิ่มเติม ทักครูแบงก์ได้ตลอดครับ — หรือกด 🦅 นกอินทรี เพื่อดูแผนที่ครูวางไว้'
  ],d,2)+'</div>';
  document.getElementById('p-actions').innerHTML='';
  const talkEl=document.getElementById('p-talkList');
  if(talkEl)talkEl.innerHTML='';
  _fillParentQGrid(d);
}

function switchTab(name){
  // v2.1: จับคู่ปุ่ม↔ชื่อจาก onclick โดยตรง — รองรับจำนวนแท็บไม่จำกัด และไม่ชนกับแท็บของคลังทบทวน
  document.querySelectorAll('#p4 .tab-row .tab').forEach(t=>{
    const m=(t.getAttribute('onclick')||'').match(/switchTab\('([^']+)'\)/);
    t.classList.toggle('active',!!m&&m[1]===name);
  });
  document.querySelectorAll('#p4 .pane').forEach(p=>p.classList.toggle('active',p.id==='pane-'+name));
  // resize chart เมื่อ pane ที่มี canvas เพิ่งโผล่ (canvas วาดตอนซ่อนจะขนาด 0)
  if(name==='compare'){
    setTimeout(()=>{
      try{if(groupChartInst) groupChartInst.resize();}catch(e){}
      try{if(distChartInst)  distChartInst.resize();}catch(e){}
    }, 50);
  }
  if(name==='progress'){
    setTimeout(()=>{
      try{if(trendChartInst) trendChartInst.resize();}catch(e){}
      try{if(mixChartInst)   mixChartInst.resize();}catch(e){}
    }, 50);
  }
}

// ── v2: ติ๊กแผนทบทวน — บันทึกใน localStorage + อัปเดต progress bar ──
function spTick(cb){
  try{localStorage.setItem(cb.getAttribute('data-spkey'),cb.checked?'1':'0');}catch(e){}
  const row=cb.closest('.sp-row'); if(row)row.style.opacity=cb.checked?'0.55':'1';
  const boxes=[...document.querySelectorAll('#s-studyPlan input[type=checkbox]')];
  const n=boxes.filter(b=>b.checked).length;
  const f=document.getElementById('sp-fill'); if(f)f.style.width=(boxes.length?Math.round(n/boxes.length*100):0)+'%';
  const t=document.getElementById('sp-text'); if(t)t.textContent='ทำแล้ว '+n+' จาก '+boxes.length+' ขั้น'+(n===boxes.length?' — ครบแล้ว เก่งมาก! 🎉':'');
}
// ── v2.1: สลับธีม สว่าง/มืด/ตามระบบ (จำค่าใน localStorage) ──
const _DARK_CSS=`html.force-dark{--bg:#1C1C1A;--card:#252523;--border:rgba(255,255,255,0.08);--border-md:rgba(255,255,255,0.15);--text1:#F0EEE9;--text2:#A8A8A0;--text3:#666660;--surf:#2C2C2A;--blue-l:#042C53;--amber-l:#412402;--red-l:#501313;--green-l:#173404}
html.force-dark .q-blank{background:repeating-linear-gradient(45deg,#333,#333 4px,#444 4px,#444 8px);color:#999;border:1px dashed #555}
html.force-light{--bg:#F5F4F1;--card:#FFFFFF;--border:rgba(0,0,0,0.08);--border-md:rgba(0,0,0,0.14);--text1:#1A1A1A;--text2:#666660;--text3:#999993;--surf:#F0EEE9;--blue-l:#E6F1FB;--amber-l:#FAEEDA;--red-l:#FCEBEB;--green-l:#EAF3DE}
html.force-light .q-blank{background:repeating-linear-gradient(45deg,#E8E6E0,#E8E6E0 4px,#D8D5CC 4px,#D8D5CC 8px);color:#777;border:1px dashed #AAA}`;
function _applyTheme(mode){
  document.documentElement.classList.remove('force-dark','force-light');
  if(mode==='dark')document.documentElement.classList.add('force-dark');
  else if(mode==='light')document.documentElement.classList.add('force-light');
  const b=document.getElementById('themeToggle');
  if(b){b.textContent=mode==='dark'?'🌙':(mode==='light'?'☀️':'🌓');
       b.title='ธีม: '+(mode==='dark'?'มืด':(mode==='light'?'สว่าง':'ตามระบบ'))+' — กดเพื่อสลับ';}
}
function toggleTheme(){
  const order=['auto','dark','light'];
  let cur='auto'; try{cur=localStorage.getItem('themeMode')||'auto';}catch(e){}
  const next=order[(order.indexOf(cur)+1)%order.length];
  try{localStorage.setItem('themeMode',next);}catch(e){}
  _applyTheme(next);
}
function _initTheme(){
  const st=document.createElement('style'); st.textContent=_DARK_CSS; document.head.appendChild(st);
  const b=document.createElement('button'); b.id='themeToggle'; b.onclick=toggleTheme;
  b.style.cssText='position:fixed;right:14px;bottom:14px;z-index:99;width:44px;height:44px;border-radius:50%;border:1px solid var(--border-md);background:var(--card);font-size:19px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.18);line-height:1';
  document.body.appendChild(b);
  let cur='auto'; try{cur=localStorage.getItem('themeMode')||'auto';}catch(e){}
  _applyTheme(cur);
}
document.addEventListener('DOMContentLoaded',()=>{try{loadStudents();}catch(e){} try{_initTheme();}catch(e){} try{ensureMockOptions();}catch(e){}});

/* ═══════════════════════════════════════════════════════════════════
   เฟส 2 (14 ส.ค. 69) — นักเรียนกรอกคะแนนเอง ส่งให้ครูตรวจ (หน้า p8)

   คะแนนที่ส่งจากหน้านี้ไปพักที่ชีต results_pending เท่านั้น
   ไม่แตะ results จนกว่าครูจะกดอนุมัติ → ค่าเฉลี่ยกลุ่มกับอันดับของเพื่อนไม่เพี้ยน
   ═══════════════════════════════════════════════════════════════════ */

/* URL ของ Apps Script "Maths Bank Tutor API" — ตัวเดียวกับที่หน้าครูใช้ */
const SUBMIT_URL = 'https://script.google.com/macros/s/AKfycbzh0M26XbDfjrVuUjUgn1Dr-Z209ms9UibPAxfd-YiB7oHnD-1ubzc3PNtadO7tULjm/exec';

const SUB_STATES = [
  { v:'',            short:'–', label:'ยังไม่ระบุ', bg:'var(--surf)',  fg:'var(--text3)' },
  { v:'✅ ถูก',       short:'✓', label:'ถูก',       bg:'#4C9A2A',      fg:'#fff' },
  { v:'⚠️ สะเพร่า',   short:'ส', label:'สะเพร่า',   bg:'#FDE910',      fg:'#5C3A00' },
  { v:'C คอนเซปต์',   short:'C', label:'คอนเซปต์',  bg:'#F5A623',      fg:'#fff' },
  { v:'X ทำไม่ได้',   short:'X', label:'ทำไม่ได้',  bg:'#D93025',      fg:'#fff' },
  { v:'⏰ ไม่ทัน',     short:'⏰', label:'ไม่ทัน',    bg:'#a855f7',      fg:'#fff' }
];

const subState = { st:new Array(30).fill(''), brush:1, sending:false };

/* รายชื่อบทมาตรฐาน — อ่านจากดรอปดาวน์ "กรองเฉพาะบท" ที่มีอยู่แล้ว
   จะได้ไม่ต้องเก็บรายการซ้ำอีกที่ (แก้ที่ index.html ที่เดียวพอ) */
function subChapters(){
  return [...document.querySelectorAll('#topicFilter option')]
    .map(o => o.value).filter(Boolean);
}

function subIdx(v){ const i = SUB_STATES.findIndex(s => s.v === v); return i < 0 ? 0 : i; }

function subCounts(){
  const n = { ok:0, care:0, concept:0, cant:0, timeout:0, blank:0 };
  subState.st.forEach(v => {
    if(!v) n.blank++;
    else if(v.indexOf('ถูก')!==-1) n.ok++;
    else if(v.indexOf('สะเพร่า')!==-1) n.care++;
    else if(v.indexOf('คอนเซปต์')!==-1) n.concept++;
    else if(v.indexOf('ทำไม่ได้')!==-1) n.cant++;
    else if(v.indexOf('ไม่ทัน')!==-1) n.timeout++;
  });
  return n;
}

function subOpen(){
  if(!currentStudent){ goTo('p1b'); return; }
  goTo('p8');

  const short = currentStudent.replace(/\s*\([^)]*\)\s*$/,'').trim();
  const av = document.getElementById('sub-avatar');
  av.textContent = short.substring(0,3);
  document.getElementById('sub-who').textContent = currentStudent;

  const sel = document.getElementById('subChapter');
  if(!sel.options.length){
    sel.innerHTML = subChapters().map(c => `<option value="${_esc(c)}">${_esc(c)}</option>`).join('');
  }
  const dt = document.getElementById('subDate');
  if(!dt.value){
    const d = new Date();
    dt.value = d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  }
  subRender();
  subLoadList();
}

function subRender(){
  const b = document.getElementById('subBrush');
  b.innerHTML = SUB_STATES.map((s,i) => `
    <button onclick="subState.brush=${i};subRender()"
      style="background:${s.bg};color:${s.fg};border-color:${subState.brush===i?'var(--text1)':'var(--border-md)'}">
      ${s.short} ${s.label}</button>`).join('');

  document.getElementById('subGrid').innerHTML = subState.st.map((v,i) => {
    const s = SUB_STATES[subIdx(v)];
    return `<button onclick="subTap(${i})" style="background:${v?s.bg:'var(--card)'};color:${v?s.fg:'var(--text3)'}">
      <span>${i+1}</span>${s.short}</button>`;
  }).join('');

  const n = subCounts();
  document.getElementById('subCounts').innerHTML =
    `ทำถูก <b style="font-size:18px;color:var(--blue)">${n.ok}</b>/30 ข้อ` +
    `<span style="font-size:11px;color:var(--text3)"> · ยังไม่ระบุ ${n.blank}</span>`;
}

function subTap(i){
  const cur = subIdx(subState.st[i]);
  subState.st[i] = (cur === subState.brush)
    ? SUB_STATES[(cur+1) % SUB_STATES.length].v
    : SUB_STATES[subState.brush].v;
  subRender();
}

function subFillAll(v){ subState.st = new Array(30).fill(v); subRender(); }

async function subPost(payload){
  const res = await fetch(SUBMIT_URL, {
    method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(Object.assign({ name: currentStudent, pin: currentPin }, payload))
  });
  return res.json();
}

async function subSend(){
  if(subState.sending) return;
  const st = document.getElementById('subStatus');
  const n = subCounts();
  if(n.blank === 30){ st.className='status err'; st.textContent='ยังไม่ได้กรอกข้อไหนเลยครับ'; return; }
  if(n.blank > 0 && !confirm(`ยังไม่ได้ระบุ ${n.blank} ข้อ (จะถูกส่งเป็น "ไม่ทำ")\nส่งเลยไหม?`)) return;

  const chapter = document.getElementById('subChapter').value;
  const date    = document.getElementById('subDate').value;
  const note    = document.getElementById('subNote').value.trim();
  if(!chapter){ st.className='status err'; st.textContent='เลือกบทก่อนครับ'; return; }

  subState.sending = true;
  const btn = document.getElementById('subSendBtn');
  btn.disabled = true; btn.textContent = 'กำลังส่ง...';
  st.className='status'; st.textContent='';

  try{
    const j = await subPost({ action:'submitMyScore', chapter, date, note, statuses: subState.st });
    if(j && j.ok){
      st.className='status ok';
      st.textContent = (j.resubmitted ? 'ส่งใหม่แทนของเดิมแล้ว' : 'ส่งให้ครูแล้ว') + ` · ทำถูก ${j.score}/30 ข้อ — รอครูตรวจครับ`;
      subState.st = new Array(30).fill('');
      document.getElementById('subNote').value = '';
      subRender(); subLoadList();
    }else{
      st.className='status err';
      st.textContent = (j && j.error) || 'ส่งไม่สำเร็จ';
    }
  }catch(e){
    st.className='status err'; st.textContent='เชื่อมต่อไม่ได้: ' + e.message;
  }
  subState.sending = false;
  btn.disabled = false; btn.textContent = '📤 ส่งให้ครูตรวจ';
}

async function subLoadList(){
  const box = document.getElementById('subList');
  box.innerHTML = '<div style="font-size:13px;color:var(--text3)">กำลังโหลด...</div>';
  try{
    const j = await subPost({ action:'myPendingList' });
    if(!j || !j.ok){ box.innerHTML = '<div style="font-size:13px;color:var(--red)">โหลดไม่สำเร็จ</div>'; return; }
    if(!j.items.length){ box.innerHTML = '<div style="font-size:13px;color:var(--text3)">ยังไม่เคยส่งคะแนนครับ</div>'; return; }

    const badge = s => s === 'approved' ? '<span class="sub-badge sub-ok">✅ ครูอนุมัติแล้ว</span>'
                     : s === 'rejected' ? '<span class="sub-badge sub-no">❌ ครูตีกลับ</span>'
                     : '<span class="sub-badge sub-wait">⏳ รอครูตรวจ</span>';

    /* ★ 30 ส.ค. 69 — เก็บไว้ให้ปุ่มแก้ไข/ยกเลิกใช้ (myPendingList ส่ง statuses กลับมาให้อยู่แล้ว) */
    window.__subItems = j.items.slice();
    box.innerHTML = j.items.slice().reverse().map(it => {
      const editable = it.status !== 'approved';
      /* ใช้ inline style — index.html ไม่มี class สำหรับปุ่มเล็กนี้ */
      const _btn='font-family:inherit;font-size:11.5px;padding:5px 11px;border-radius:11px;cursor:pointer;background:var(--card,#FAF9F5);';
      const acts = editable
        ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
             <button onclick="subEditItem('${_esc(String(it.pid))}')" style="${_btn}border:1px solid var(--border-md,#D9D2C6);color:var(--text1,#1A1815)">✏️ แก้ไข</button>
             <button onclick="subCancelItem('${_esc(String(it.pid))}')" style="${_btn}border:1px solid #E4C7C5;color:#B3261E">🗑 ยกเลิกการส่ง</button>
           </div>`
        : `<div style="font-size:11px;color:var(--text3);margin-top:5px">ครูอนุมัติแล้ว — ถ้าต้องแก้ ต้องแจ้งครูครับ</div>`;
      return `
      <div class="sub-row" style="align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-size:13.5px;font-weight:500;color:var(--text1)">${_esc(it.chapter)}</div>
          <div style="font-size:11px;color:var(--text3)">${_dFmt(it.date)} · ส่งเมื่อ ${_esc(it.submittedAt)}</div>
          ${it.note ? `<div style="font-size:11.5px;color:var(--red);margin-top:3px">ครูบอกว่า: ${_esc(it.note)}</div>` : ''}
          ${acts}
        </div>
        <div style="font-family:var(--font-num,inherit);font-size:14px;font-weight:600;min-width:44px;text-align:right">${it.score}/30</div>
        <div>${badge(it.status)}</div>
      </div>`;
    }).join('');
  }catch(e){
    box.innerHTML = '<div style="font-size:13px;color:var(--red)">เชื่อมต่อไม่ได้</div>';
  }
}


/* ★ 30 ส.ค. 69 — ดึงของที่เคยส่งกลับมาแก้ แล้วส่งทับของเดิม
   (ฝั่งเซิร์ฟเวอร์ submitMyScore เขียนทับแถวเดิมอยู่แล้วถ้าบทเดียวกันและยังไม่อนุมัติ) */
function subEditItem(pid){
  const it=(window.__subItems||[]).find(x=>String(x.pid)===String(pid));
  const st=document.getElementById('subStatus');
  if(!it){ if(st){st.className='status err'; st.textContent='ไม่พบรายการนี้ ลองรีเฟรชหน้าครับ';} return; }
  if(it.status==='approved'){ if(st){st.className='status err'; st.textContent='ครูอนุมัติแล้ว แก้เองไม่ได้ครับ';} return; }

  subState.st=(it.statuses||[]).slice(0,30);
  while(subState.st.length<30) subState.st.push('');

  const sel=document.getElementById('subChapter');
  if(sel){
    if(![...sel.options].some(o=>o.value===it.chapter)){
      const o=document.createElement('option'); o.value=it.chapter; o.textContent=it.chapter; sel.appendChild(o);
    }
    sel.value=it.chapter;
  }
  const dt=document.getElementById('subDate');
  if(dt&&it.date){ const d=_dParse(it.date);
    if(d) dt.value=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  const nt=document.getElementById('subNote'); if(nt) nt.value='';

  subRender();
  if(st){ st.className='status'; st.textContent='ดึงคำตอบเดิมของบท "'+it.chapter+'" กลับมาแล้ว — แก้ข้อที่ต้องการ แล้วกด "ส่งให้ครูตรวจ" อีกครั้ง จะทับของเดิมให้เอง'; }
  const grid=document.getElementById('subGrid'); if(grid&&grid.scrollIntoView) grid.scrollIntoView({behavior:'smooth',block:'center'});
}

/* ยกเลิกการส่ง — ถอนออกจากรายการรอตรวจของครู */
async function subCancelItem(pid){
  const it=(window.__subItems||[]).find(x=>String(x.pid)===String(pid));
  const st=document.getElementById('subStatus');
  if(!it) return;
  if(!confirm('ยกเลิกการส่งคะแนนบท "'+it.chapter+'" ?\n\nรายการนี้จะหายจากรายการรอตรวจของครู\nถ้าต้องการส่งใหม่ ต้องกรอกใหม่ทั้ง 30 ข้อ')) return;
  if(st){ st.className='status'; st.textContent='กำลังยกเลิก...'; }
  try{
    const j=await subPost({action:'cancelMyScore', pid:it.pid});
    if(j&&j.ok){
      if(st){ st.className='status ok'; st.textContent='ยกเลิกการส่งบท "'+it.chapter+'" แล้วครับ'; }
      subLoadList();
    }else{
      if(st){ st.className='status err'; st.textContent=(j&&j.error)||'ยกเลิกไม่สำเร็จ'; }
    }
  }catch(e){ if(st){ st.className='status err'; st.textContent='เชื่อมต่อไม่ได้: '+e.message; } }
}

/* ── โหมดวางจาก Gemini (หน้า p8) ─────────────────────────────────
   ต่างจากหน้าครูตรงที่นักเรียนกรอกของตัวเองคนเดียว จึงไม่ต้องอ่านชื่อ/บท
   อ่านแค่ "ข้อ N: สถานะ" แล้วเติมลงตาราง — ไม่ส่งทันที ให้ตรวจก่อน
   ล็อก 30 ช่องตายตัว ข้อไหน Gemini ข้ามไปก็เว้นว่าง ไม่เลื่อนขึ้นมาแทนที่ */
function subSetMode(m){
  document.getElementById('subTabTap').classList.toggle('active', m==='tap');
  document.getElementById('subTabPaste').classList.toggle('active', m==='paste');
  document.getElementById('subPastePane').style.display = (m==='paste') ? '' : 'none';
}

function subStatusOf(raw){
  const s = String(raw||'').trim();
  if(!s || /^[-–—.\s]+$/.test(s)) return '';
  if(s.indexOf('✅')>=0 || s.indexOf('ถูก')>=0) return '✅ ถูก';
  if(s.indexOf('⚠')>=0 || s.indexOf('สะเพร่า')>=0) return '⚠️ สะเพร่า';
  if(s.indexOf('⏰')>=0 || s.indexOf('ไม่ทัน')>=0) return '⏰ ไม่ทัน';
  if(s.indexOf('C')>=0 || s.indexOf('คอนเซปต์')>=0) return 'C คอนเซปต์';
  if(s.indexOf('X')>=0 || s.indexOf('❌')>=0 || s.indexOf('ทำไม่ได้')>=0 || s.indexOf('ผิด')>=0) return 'X ทำไม่ได้';
  return '⏰ ไม่ทัน';
}

function subParsePaste(){
  const box = document.getElementById('subPasteBox');
  const msg = document.getElementById('subPasteMsg');
  const raw = (box.value||'').trim();
  if(!raw){ msg.style.color='var(--red)'; msg.textContent='ยังไม่ได้วางข้อความ'; return; }

  const st = new Array(30).fill('');
  const re = /ข้อ\s*(\d+)\s*:\s*([^ข\d\n]*)/g;
  let m, found = 0;
  while((m = re.exec(raw)) !== null){
    const q = parseInt(m[1],10);
    if(q>=1 && q<=30){ st[q-1] = subStatusOf(m[2]); found++; }
  }
  if(!found){
    msg.style.color='var(--red)';
    msg.textContent='อ่านไม่เจอเลย — ข้อความต้องอยู่ในรูป "ข้อ 1: ✅"';
    return;
  }
  subState.st = st;
  subRender();
  const n = subCounts();
  msg.style.color='var(--green)';
  msg.textContent = `อ่านได้ ${found} ข้อ · ทำถูก ${n.ok}/30 ข้อ` + (n.blank ? ` · ยังไม่ระบุ ${n.blank} ข้อ` : '');
  subSetMode('tap');
}