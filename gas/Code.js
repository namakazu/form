// ────────────
// 設定
// ────────────
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const TOKEN    = PropertiesService.getScriptProperties().getProperty('LINE_ACCESS_TOKEN');

/***********************
 * Webhook / Web App
 ***********************/
function doGet(e){
  const p = (e && e.parameter) ? e.parameter : {};

  if (p.view === 'ping') {
    return HtmlService.createHtmlOutput('<h1>OK</h1>');
  }

  if (p.action === 'getReport') {
    const rows = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ').getDataRange().getValues().slice(1);
    const data = [];
    rows.forEach((r, i) => {
      if (!(r[0] instanceof Date) || r[1] === '支給') return;
      if (r[1] !== '収入' && r[3] <= 0) return;
      data.push({
        rowIndex: i + 1,
        date:     Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy/MM/dd'),
        month:    Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy/MM'),
        category: r[1],
        amount:   Number(r[3]) || 0,
        memo:     r[5] || '',
        uid:      r[6] || ''
      });
    });
    const json = JSON.stringify({ status: 'ok', data });
    const callback = p.callback || '';
    if (callback) return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'getBalance') {
    const myUid   = PropertiesService.getScriptProperties().getProperty('MY_UID');
    const wifeUid = PropertiesService.getScriptProperties().getProperty('WIFE_UID');
    const rows = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ').getDataRange().getValues();
    const thisMon = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM');
    let totalExpense = 0, kazuExpense = 0, momoExpense = 0, totalIncome = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!(r[0] instanceof Date)) continue;
      if (Utilities.formatDate(r[0],'Asia/Tokyo','yyyy/MM') !== thisMon) continue;
      const amt = Number(r[3]) || 0;
      const rowUid = String(r[6] || '');
      if (r[1] === '収入') { totalIncome += Math.abs(amt); continue; }
      if (r[1] === '支給' || amt <= 0) continue;
      totalExpense += amt;
      if (rowUid === myUid)   kazuExpense += amt;
      if (rowUid === wifeUid) momoExpense += amt;
    }
    const balance = totalIncome - totalExpense;
    const payday  = 20;
    const today   = new Date();
    let end = new Date(today);
    if (today.getDate() > payday) end.setMonth(end.getMonth() + 1);
    end.setDate(payday);
    const diffDays = Math.max(Math.ceil((end - today) / (1000*60*60*24)), 1);
    const perDay   = Math.floor(balance / diffDays);
    const json = JSON.stringify({ status:'ok', totalIncome, totalExpense, kazuExpense, momoExpense, balance, diffDays, perDay });
    const callback = p.callback || '';
    if (callback) return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  // ここから追加：世帯予算の一覧取得
  if (p.action === 'getBudgets') {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('予算設定');
    const budgets = {};
    if (sh) {
      sh.getDataRange().getValues().slice(1).forEach(r => {
        if (String(r[0]) === 'household' && r[1] && Number(r[2]) > 0) {
          budgets[String(r[1])] = Number(r[2]);
        }
      });
    }
    const json = JSON.stringify({ status: 'ok', budgets });
    const callback = p.callback || '';
    if (callback) return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }
  // ここまで追加

  if (p.action === 'getFixedCosts') {
    const data = getFixedCostsData();
    const json = JSON.stringify({ status: 'ok', data });
    const callback = p.callback || '';
    if (callback) return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'deleteRecord') {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ');
    const rowIdx = Number(p.rowIndex);
    if (rowIdx >= 1) sh.deleteRow(rowIdx + 1);
    const json = JSON.stringify({ status: 'ok' });
    const callback = p.callback || '';
    if (callback) return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'editRecord') {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ');
    const vals = sh.getDataRange().getValues();
    const rowIdx = Number(p.rowIndex);
    if (rowIdx >= 1 && rowIdx < vals.length) {
      sh.getRange(rowIdx + 1, 1).setValue(new Date(p.dateStr));
      sh.getRange(rowIdx + 1, 2).setValue(p.category);
      sh.getRange(rowIdx + 1, 4).setValue(Number(p.amount));
      sh.getRange(rowIdx + 1, 6).setValue(p.memo || '');
    }
    const json = JSON.stringify({ status: 'ok' });
    const callback = p.callback || '';
    if (callback) return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput('OK');
}

function doPost(e){
  try{
    const body = JSON.parse(e.postData.contents);

    if (body.action === 'formAdd') {
      formAdd({
        uid:      body.uid,
        dateStr:  body.dateStr,
        amount:   body.amount,
        category: body.category,
        sub:      body.sub || '',
        memo:     body.memo || ''
      });
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
    }

    if (body.action === 'addFixedCost') {
      const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('固定費マスタ');
      sh.appendRow([body.name, body.category, Number(body.amount), Number(body.day), body.enabled]);
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
    }

    if (body.action === 'editFixedCost') {
      const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('固定費マスタ');
      const rowIdx = Number(body.rowIndex);
      if (rowIdx >= 1) {
        sh.getRange(rowIdx + 1, 1).setValue(body.name);
        sh.getRange(rowIdx + 1, 2).setValue(body.category);
        sh.getRange(rowIdx + 1, 3).setValue(Number(body.amount));
        sh.getRange(rowIdx + 1, 4).setValue(Number(body.day));
        sh.getRange(rowIdx + 1, 5).setValue(body.enabled);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
    }

    if (body.action === 'deleteFixedCost') {
      const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('固定費マスタ');
      const rowIdx = Number(body.rowIndex);
      if (rowIdx >= 1) sh.deleteRow(rowIdx + 1);
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
    }

    // ここから追加：画面から世帯予算を保存（upsert）
    if (body.action === 'setBudget') {
      const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('予算設定');
      const category = String(body.category || '').trim();
      const amount   = Number(body.amount) || 0;
      if (!category) return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'カテゴリ不正' })).setMimeType(ContentService.MimeType.JSON);
      const vals = sh.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < vals.length; i++) {
        if (String(vals[i][0]) === 'household' && String(vals[i][1]) === category) {
          sh.getRange(i + 1, 3).setValue(amount);
          found = true;
          break;
        }
      }
      if (!found) sh.appendRow(['household', category, amount]);
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
    }
    // ここまで追加

    if (body && body.events && body.events.forEach) body.events.forEach(handleEvent);
    return ContentService.createTextOutput('OK');

  } catch(err) {
    Logger.log('doPost error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

/***********************
 * 固定費マスタ データ取得
 ***********************/
function getFixedCostsData() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('固定費マスタ');
  if (!sh) return [];
  const rows = sh.getDataRange().getValues().slice(1);
  return rows.map((r, i) => ({
    rowIndex: i + 1,
    name:     String(r[0] || '').trim(),
    category: String(r[1] || 'その他').trim(),
    amount:   Number(r[2]) || 0,
    day:      Number(r[3]) || 1,
    enabled:  r[4] === true || String(r[4]).toUpperCase() === 'TRUE'
  })).filter(r => r.name);
}

/***********************
 * ルーター（LINEメッセージ）
 ***********************/
function handleEvent(ev){
  Logger.log('source: ' + JSON.stringify(ev.source));
  if (ev.type !== 'message' || ev.message.type !== 'text') return;
  const text = ev.message.text.trim();
  const uid  = ev.source.userId;

  if (text === '入力' || text.toLowerCase() === 'help') { replyWithChips(ev.replyToken); return; }
  if (text === '取消' || text === '取り消し') { undoLast(uid, ev.replyToken); return; }
  if (text === 'ID確認') {
    const groupId = ev.source.groupId || 'グループIDなし';
    reply(ev.replyToken, `UserID：\n${uid}\n\nGroupID：\n${groupId}`);
    return;
  }

  const b = text.match(/^予算\s+(\S+)\s+([\d,]+)$/);
  if (b) {
    const [, category, amountRaw] = b;
    const amount = Number(amountRaw.replace(/[,円]/g, ''));
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('予算設定');
    const data = sh.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === uid && data[i][1] === category) { sh.getRange(i + 1, 3).setValue(amount); found = true; break; }
    }
    if (!found) sh.appendRow([uid, category, amount]);
    PropertiesService.getUserProperties().setProperty(`budget_${uid}_${category}`, String(amount));
    replyWithActionChips(ev.replyToken, `✅ ${category} の月予算を ¥${amount.toLocaleString()} に設定しました！`);
    return;
  }

  if (/^支給\s+[\d,]+$/.test(text)) { handleIncome(text, uid, ev.replyToken); return; }
  if (text === '残額') { handleBalance(uid, ev.replyToken); return; }
  if (text.startsWith('設定 ')) { if (handleSettings(text, uid, ev.replyToken)) return; }

  const parsed = parseSmartInput(text);
  if (parsed && parsed.amount > 0) {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ');
    sh.appendRow([parsed.date, parsed.cat, parsed.sub, parsed.amount, 'LINE', parsed.memo, uid]);
    replyWithActionChips(ev.replyToken, `✅ 追加：${Utilities.formatDate(parsed.date,'Asia/Tokyo','MM/dd')} ${parsed.cat} ¥${parsed.amount.toLocaleString()}\n${parsed.memo?parsed.memo:''}`);
    checkBudgetAndAlert(uid, parsed.cat);
    return;
  }

  replyWithChips(ev.replyToken, "うまく読めなかった… 例）600 セコマ / 昨日 890 すき家 / 8/31 食費 600");
}

/***********************
 * LINE送受信ユーティリティ
 ***********************/
function reply(replyToken, msg){
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method:'post',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${TOKEN}`},
    payload: JSON.stringify({ replyToken, messages:[{ type:'text', text:msg }] })
  });
}

function push(to, msg){
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method:'post',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${TOKEN}`},
    payload: JSON.stringify({ to, messages:[{ type:'text', text:msg }] })
  });
}

/***********************
 * 入力支援：辞書 & パーサ
 ***********************/
const CATEGORY_DICT = {
  "食費":["食費","外食","ランチ","弁当","カフェ","コンビニ","セコマ","セイコーマート","すき家","ガスト","しゃぶ葉","マック","吉野家","松屋","ミスド","ドーナツ","ドーナッツ"],
  "交通":["交通","電車","バス","地下鉄","タクシー","ガソリン","駐車場"],
  "交際":["交際","飲み会","会食","プレゼント","ギフト"],
  "日用品":["日用品","ドラッグ","薬局","洗剤","ティッシュ","トイレット","ダイソー","ニトリ"],
  "娯楽":["娯楽","映画","温泉","カラオケ","ゲーム","漫画"],
  "その他":["その他","雑費","不明","未分類"]
};

const STORE_HINTS = {
  "セコマ":["食費","コンビニ"], "セイコーマート":["食費","コンビニ"],
  "すき家":["食費","外食"], "ガスト":["食費","外食"], "しゃぶ葉":["食費","外食"],
  "マクドナルド":["食費","外食"], "吉野家":["食費","外食"], "松屋":["食費","外食"],
  "ミスド":["食費","外食"], "ミスタードーナツ":["食費","外食"]
};

function normAmount(s){ return Number((s||"").replace(/[^\d]/g,"")||0); }

function parseDateToken(tok){
  const tz='Asia/Tokyo'; const today=new Date(); today.setHours(0,0,0,0);
  if(!tok||tok==="今日") return today;
  if(tok==="昨日"){ const d=new Date(today); d.setDate(d.getDate()-1); return d; }
  const m=tok.match(/^(\d{1,2})\/(\d{1,2})$/);
  if(m){ const y=Utilities.formatDate(new Date(),tz,'yyyy'); return new Date(`${y}/${m[1]}/${m[2]}`); }
  return today;
}

function guessCategory(words){
  for(const w of words){ for(const k in STORE_HINTS){ if(w.includes(k)) return {cat:STORE_HINTS[k][0], sub:STORE_HINTS[k][1]}; } }
  for(const base in CATEGORY_DICT){ for(const a of CATEGORY_DICT[base]){ if(words.some(w=>w.includes(a))) return {cat:base, sub:""}; } }
  return {cat:"その他", sub:""};
}

function parseSmartInput(text){
  let m=text.match(/^(\d{1,2}\/\d{1,2}|今日|昨日)\s+(\S+)?\s*([\d,\.円]+)\s*(.*)$/);
  if(m){
    const d=parseDateToken(m[1]), amount=normAmount(m[3]),
          words=[m[2]||"", m[4]||""].join(" ").trim().split(/\s+/),
          hint=guessCategory(words);
    return {date:d, cat:hint.cat!=="その他"?hint.cat:(m[2]||"その他"), sub:hint.sub, amount, memo:(m[4]||"").trim()};
  }
  m=text.match(/^([\d,\.円]+)\s+(.+)$/);
  if(m){
    const amount=normAmount(m[1]), rest=m[2].trim(), words=rest.split(/\s+/), hint=guessCategory(words);
    return {date:parseDateToken('今日'), cat:hint.cat, sub:hint.sub, amount, memo:rest};
  }
  m=text.match(/^(\S+)\s+([\d,\.円]+)\s*(.*)$/);
  if(m){
    const amount=normAmount(m[2]), words=[m[1],m[3]||""].join(" ").split(/\s+/), hint=guessCategory(words);
    return {date:parseDateToken('今日'), cat:hint.cat!=="その他"?hint.cat:m[1], sub:hint.sub, amount, memo:(m[3]||"").trim()};
  }
  return null;
}

/***********************
 * Quick Reply
 ***********************/
function replyWithChips(replyToken, promptText){
  const items = Object.keys(CATEGORY_DICT).map(name=>({ type:"action", action:{ type:"message", label:name, text:`${name} ` } }));
  const payload={ replyToken, messages:[{ type:"text", text:promptText||"例）600 セコマ／昨日 890 すき家／8/31 食費 600", quickReply:{ items } }] };
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method:'post', headers:{'Content-Type':'application/json','Authorization':`Bearer ${TOKEN}`},
    payload: JSON.stringify(payload)
  });
}

function replyWithActionChips(replyToken, text){
  const items = [
    {type:"action",action:{type:"message",label:"もう1件",text:"入力"}},
    {type:"action",action:{type:"message",label:"残額",text:"残額"}},
    {type:"action",action:{type:"message",label:"取消",text:"取消"}},
    {type:"action",action:{type:"message",label:"支給(例)",text:"支給 20000"}},
    {type:"action",action:{type:"message",label:"予算(例)",text:"予算 食費 30000"}}
  ];
  const payload={ replyToken, messages:[{ type:"text", text, quickReply:{ items } }] };
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method:'post', headers:{'Content-Type':'application/json','Authorization':`Bearer ${TOKEN}`},
    payload: JSON.stringify(payload)
  });
}

/***********************
 * 機能：取消/設定/支給/残額
 ***********************/
function undoLast(uid, replyToken){
  const sh=SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ');
  const vals=sh.getDataRange().getValues();
  for(let i=vals.length-1;i>=1;i--){
    if(String(vals[i][6]||"")===uid){ sh.deleteRow(i+1); reply(replyToken,"↩️ 直近の1件を取り消しました"); return; }
  }
  reply(replyToken,"取り消す対象が見つかりませんでした");
}

function handleSettings(text, uid, replyToken){
  let m=text.match(/^設定\s+支給日\s+(\d{1,2})$/);
  if(m){ PropertiesService.getUserProperties().setProperty(`payday_${uid}`, m[1]); reply(replyToken,`✅ 支給日：毎月${m[1]}日`); return true; }
  m=text.match(/^設定\s+在宅\s+([月火水木金土日,、]+)$/);
  if(m){
    const norm=m[1].replace(/、/g,',').replace(/\s+/g,'').split(',').map(s=>s.trim());
    PropertiesService.getUserProperties().setProperty(`wfh_${uid}`, norm.join(','));
    reply(replyToken,`✅ 在宅曜日：${norm.join('・')}`); return true;
  }
  return false;
}

function handleIncome(text, uid, replyToken){
  const m=text.match(/^支給\s+([\d,]+)$/); if(!m) return false;
  const amount=Number(m[1].replace(/[,円]/g,''));
  const sh=SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ');
  sh.appendRow([new Date(), '支給', '', -amount, 'LINE', 'お小遣い支給', uid]);
  replyWithActionChips(replyToken, `✅ 支給 ¥${amount.toLocaleString()} を登録しました`);
  return true;
}

function handleBalance(uid, replyToken){
  const myUid   = PropertiesService.getScriptProperties().getProperty('MY_UID');
  const wifeUid = PropertiesService.getScriptProperties().getProperty('WIFE_UID');
  const sh   = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ');
  const rows = sh.getDataRange().getValues();
  const thisMon = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM');
  let totalExpense = 0, kazuExpense = 0, momoExpense = 0, totalIncome = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!(r[0] instanceof Date)) continue;
    if (Utilities.formatDate(r[0],'Asia/Tokyo','yyyy/MM') !== thisMon) continue;
    const amt = Number(r[3]) || 0;
    const rowUid = String(r[6] || '');
    if (r[1] === '収入') { totalIncome += Math.abs(amt); continue; }
    if (r[1] === '支給' || amt <= 0) continue;
    totalExpense += amt;
    if (rowUid === myUid)   kazuExpense += amt;
    if (rowUid === wifeUid) momoExpense += amt;
  }
  const balance   = totalIncome - totalExpense;
  const spendDays = countSpendingDaysToNextPayday(uid);
  const perDay    = spendDays > 0 ? Math.floor(balance / spendDays) : balance;
  const balanceSign = balance >= 0 ? '' : '-';
  const msg =
    `📊 今月の残額\n━━━━━━━━━━\n` +
    `💰 収入合計: ¥${totalIncome.toLocaleString()}\n` +
    `💴 支出合計: ¥${totalExpense.toLocaleString()}\n` +
    ` └ 👤 夫: ¥${kazuExpense.toLocaleString()}\n` +
    ` └ 👤 妻: ¥${momoExpense.toLocaleString()}\n` +
    `━━━━━━━━━━\n` +
    `残額: ${balanceSign}¥${Math.abs(balance).toLocaleString()}\n` +
    `目安: ¥${perDay.toLocaleString()}/日（残り${spendDays}日）`;
  replyWithActionChips(replyToken, msg);
}

/***********************
 * 集計
 ***********************/
function monthlyTotalCategory(category, uid){
  const sh   = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ');
  const rows = sh.getDataRange().getValues();
  const thisMon = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy/MM');
  let sum = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!(r[0] instanceof Date)) continue;
    if (Utilities.formatDate(r[0],'Asia/Tokyo','yyyy/MM') !== thisMon) continue;
    if (uid && r[6] !== uid) continue;
    if (r[1] !== category) continue;
    const amt = Number(r[3]) || 0;
    if (amt > 0) sum += amt;
  }
  return sum;
}

function checkBudgetAndAlert(uid, category){
  const limit = Number(PropertiesService.getUserProperties().getProperty(`budget_${uid}_${category}`) || 0);
  if (!limit) return;
  const spent = monthlyTotalCategory(category, uid);
  if (spent >= limit) push(uid, `⚠️ ${category} が予算 ¥${limit.toLocaleString()} を超えました！`);
}

function countSpendingDaysToNextPayday(uid){
  const today=new Date(); today.setHours(0,0,0,0);
  const payday=Number(PropertiesService.getUserProperties().getProperty(`payday_${uid}`) || 20);
  let end=new Date(today);
  if(today.getDate()>payday){ end.setMonth(end.getMonth()+1); }
  end.setDate(payday); end.setHours(0,0,0,0);
  const wmap={'日':0,'月':1,'火':2,'水':3,'木':4,'金':5,'土':6};
  const wfh=(PropertiesService.getUserProperties().getProperty(`wfh_${uid}`)||'').split(',').filter(Boolean).map(d=>wmap[d]);
  const cal=CalendarApp.getCalendarById('ja.japanese#holiday@group.v.calendar.google.com');
  let d=new Date(today), cnt=0;
  while(d<=end){
    const dow=d.getDay();
    const weekend=(dow===0||dow===6);
    const holiday=cal?cal.getEventsForDay(d).length>0:false;
    const isWfh=wfh.includes(dow);
    if(!weekend && !holiday && !isWfh) cnt++;
    d.setDate(d.getDate()+1);
  }
  return Math.max(cnt,0);
}

function formAdd(payload){
  if (!payload) throw new Error('payload missing');
  const uid    = String(payload.uid || '').trim();
  const cat    = String(payload.category || 'その他').trim();
  const sub    = String(payload.sub || '').trim();
  const memo   = String(payload.memo || '').trim();
  const amount = Number(String(payload.amount || '').replace(/[^\d.-]/g,''));
  if (!amount || amount === 0) throw new Error('金額が不正です');
  const d = new Date(payload.dateStr);
  if (isNaN(d.getTime())) throw new Error('日付が不正です');
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ');
  sh.appendRow([d, cat, sub, amount, 'LIFF', memo, uid]);
  try { if (cat !== '収入') checkBudgetAndAlert(uid, cat); } catch(e) {}
  try {
    const sign = amount < 0 ? '+' : '';
    const label = cat === '収入' ? '収入' : '支出';
    push(uid, `✅ ${label}追加：${Utilities.formatDate(d,'Asia/Tokyo','MM/dd')} ${cat} ${sign}¥${Math.abs(amount).toLocaleString()}\n${memo?memo:''}`);
  } catch(e) {}
  return { ok:true };
}

function authorizeOnce(){
  UrlFetchApp.fetch('https://example.com');
  const cal = CalendarApp.getCalendarById('ja.japanese#holiday@group.v.calendar.google.com');
  if (cal) cal.getEventsForDay(new Date());
}

/***********************
 * 固定費の自動記録（毎日トリガー用）
 ***********************/
function recordFixedCosts(){
  const today = new Date();
  const todayDay = today.getDate();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const masterSheet = ss.getSheetByName('固定費マスタ');
  const logSheet    = ss.getSheetByName('支出ログ');
  if (!masterSheet) { Logger.log('固定費マスタシートが見つかりません'); return; }

  const masterRows = masterSheet.getDataRange().getValues().slice(1);
  const recorded = [];

  masterRows.forEach(r => {
    const name      = String(r[0] || '').trim();
    const category  = String(r[1] || 'その他').trim();
    const amount    = Number(r[2]) || 0;
    const recordDay = Number(r[3]) || 1;
    const enabled   = r[4] === true || String(r[4]).toUpperCase() === 'TRUE';
    if (!name || amount <= 0 || !enabled || recordDay !== todayDay) return;

    const thisMon = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy/MM');
    const existing = logSheet.getDataRange().getValues().slice(1);
    const alreadyRecorded = existing.some(row => {
      if (!(row[0] instanceof Date)) return false;
      if (Utilities.formatDate(row[0], 'Asia/Tokyo', 'yyyy/MM') !== thisMon) return false;
      return row[1] === category && row[5] === name;
    });
    if (alreadyRecorded) return;

    logSheet.appendRow([today, category, '', amount, '固定費', name, '']);
    recorded.push({ name, category, amount });
  });

  if (recorded.length === 0) return;

  let msg = `📋 固定費を自動記録しました\n━━━━━━━━━━\n`;
  recorded.forEach(item => { msg += `${getCatEmoji(item.category)} ${item.name}: ¥${item.amount.toLocaleString()}\n`; });
  const total = recorded.reduce((s, r) => s + r.amount, 0);
  msg += `━━━━━━━━━━\n合計: ¥${total.toLocaleString()}`;

  const targets = [
    PropertiesService.getScriptProperties().getProperty('MY_UID'),
    PropertiesService.getScriptProperties().getProperty('WIFE_UID')
  ].filter(Boolean);
  targets.forEach(uid => push(uid, msg));
}

/***********************
 * 日次振り返り通知（毎日21時トリガー用）
 ***********************/
function sendDailyReport() {
  const SHEET_ID_LOCAL = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const now   = new Date();
  const today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd');
  const mon   = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM');
  const dateLabel = Utilities.formatDate(now, 'Asia/Tokyo', 'MM/dd');
  const rows = SpreadsheetApp.openById(SHEET_ID_LOCAL).getSheetByName('支出ログ').getDataRange().getValues().slice(1);
  const budgetRows = SpreadsheetApp.openById(SHEET_ID_LOCAL).getSheetByName('予算設定').getDataRange().getValues().slice(1);

  const todayCats = {}; let todayTotal = 0;
  rows.forEach(r => {
    if (!(r[0] instanceof Date)) return;
    if (Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy/MM/dd') !== today) return;
    if (r[1] === '支給' || r[1] === '収入') return;
    const amt = Number(r[3]) || 0; if (amt <= 0) return;
    todayTotal += amt; todayCats[r[1]] = (todayCats[r[1]] || 0) + amt;
  });

  const monCats = {}; let monTotal = 0;
  rows.forEach(r => {
    if (!(r[0] instanceof Date)) return;
    if (Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy/MM') !== mon) return;
    if (r[1] === '支給' || r[1] === '収入') return;
    const amt = Number(r[3]) || 0; if (amt <= 0) return;
    monTotal += amt; monCats[r[1]] = (monCats[r[1]] || 0) + amt;
  });

  let msg = `📊 本日の振り返り（${dateLabel}）\n━━━━━━━━━━\n`;
  if (Object.keys(todayCats).length === 0) {
    msg += `本日の支出はありませんでした 🎉\n`;
  } else {
    Object.entries(todayCats).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => { msg += `${getCatEmoji(cat)} ${cat}: ¥${amt.toLocaleString()}\n`; });
    msg += `━━━━━━━━━━\n本日合計: ¥${todayTotal.toLocaleString()}\n`;
  }
  msg += `\n📅 今月の累計\n`;
  if (Object.keys(monCats).length === 0) {
    msg += `今月の支出はまだありません\n`;
  } else {
    Object.entries(monCats).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
      const budget = budgetRows.find(r => r[1] === cat);
      if (budget && budget[2] > 0) {
        const limit = budget[2], remain = limit - amt, pct = Math.round((amt / limit) * 100), warn = pct >= 80 ? '⚠️' : '';
        msg += `${getCatEmoji(cat)} ${cat}: ¥${amt.toLocaleString()} / 予算¥${limit.toLocaleString()}（残り¥${remain.toLocaleString()} ${warn}${pct}%）\n`;
      } else {
        msg += `${getCatEmoji(cat)} ${cat}: ¥${amt.toLocaleString()}\n`;
      }
    });
    msg += `━━━━━━━━━━\n今月合計支出: ¥${monTotal.toLocaleString()}`;
  }

  const targets = [
    PropertiesService.getScriptProperties().getProperty('MY_UID'),
    PropertiesService.getScriptProperties().getProperty('WIFE_UID')
  ].filter(Boolean);
  targets.forEach(uid => push(uid, msg));
}

/***********************
 * 月次サマリー通知（毎月1日の朝トリガー用）
 ***********************/
function sendMonthlyReport() {
  const now = new Date();

  // 先月の年月を取得（今月1日の前日 = 先月末）
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMon      = Utilities.formatDate(lastMonthEnd, 'Asia/Tokyo', 'yyyy/MM');
  const lastMonLabel = Utilities.formatDate(lastMonthEnd, 'Asia/Tokyo', 'M月');

  // 先々月の年月（前月比の計算に使う）
  const twoMonthsAgoEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
  const twoMonAgo = Utilities.formatDate(twoMonthsAgoEnd, 'Asia/Tokyo', 'yyyy/MM');

  const myUid   = PropertiesService.getScriptProperties().getProperty('MY_UID');
  const wifeUid = PropertiesService.getScriptProperties().getProperty('WIFE_UID');
  const rows = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ').getDataRange().getValues().slice(1);

  // 先月の収入・支出・夫妻別・カテゴリ別を集計
  let lastMonIncome = 0, lastMonExpense = 0, kazuExpense = 0, momoExpense = 0;
  const catTotals = {};
  rows.forEach(r => {
    if (!(r[0] instanceof Date)) return;
    if (Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy/MM') !== lastMon) return;
    const amt = Number(r[3]) || 0;
    const uid = String(r[6] || '');
    if (r[1] === '収入') { lastMonIncome += Math.abs(amt); return; }
    if (r[1] === '支給' || amt <= 0) return;
    lastMonExpense += amt;
    if (uid === myUid)   kazuExpense += amt;
    if (uid === wifeUid) momoExpense += amt;
    catTotals[r[1]] = (catTotals[r[1]] || 0) + amt;
  });

  // 先々月の支出合計（前月比の計算用）
  let twoMonExpense = 0;
  rows.forEach(r => {
    if (!(r[0] instanceof Date)) return;
    if (Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy/MM') !== twoMonAgo) return;
    if (r[1] === '収入' || r[1] === '支給') return;
    const amt = Number(r[3]) || 0;
    if (amt > 0) twoMonExpense += amt;
  });

  // 余剰資金・前月比・年間ペースを計算
  const surplus    = lastMonIncome - lastMonExpense;
  const monthlyDiff = twoMonExpense > 0 ? lastMonExpense - twoMonExpense : null;
  const annualPace = surplus * 12;

  // 支出カテゴリのTop3を抽出
  const top3 = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // メッセージ組み立て
  let msg = `📅 ${lastMonLabel}の家計まとめ\n━━━━━━━━━━\n`;
  msg += `💰 収入：¥${lastMonIncome.toLocaleString()}\n`;
  msg += `💴 支出：¥${lastMonExpense.toLocaleString()}\n`;
  msg += ` └ 👤 夫：¥${kazuExpense.toLocaleString()}\n`;
  msg += ` └ 👤 妻：¥${momoExpense.toLocaleString()}\n`;
  msg += `━━━━━━━━━━\n`;

  // 余剰資金（黒字/赤字で表現を変える）
  if (surplus >= 0) {
    msg += `✨ 余剰資金：¥${surplus.toLocaleString()}\n`;
  } else {
    msg += `⚠️ 赤字：-¥${Math.abs(surplus).toLocaleString()}\n`;
  }

  // 前月比（データがある場合のみ表示）
  if (monthlyDiff !== null) {
    const arrow = monthlyDiff <= 0 ? '▼' : '▲';
    const label = monthlyDiff <= 0 ? '節約' : '増加';
    msg += `前月比：${arrow}¥${Math.abs(monthlyDiff).toLocaleString()}（${label}）\n`;
  }

  // 支出Top3
  if (top3.length > 0) {
    msg += `\n📊 支出トップ3\n`;
    top3.forEach(([cat, amt], i) => {
      msg += `${i + 1}位 ${getCatEmoji(cat)} ${cat}：¥${amt.toLocaleString()}\n`;
    });
  }

  // 年間ペース（黒字の場合のみ表示）
  if (surplus > 0) {
    msg += `\n💡 このペースなら年間\n¥${annualPace.toLocaleString()} 貯まります！`;
  }

  // 夫婦両方に送信
  const targets = [myUid, wifeUid].filter(Boolean);
  targets.forEach(uid => push(uid, msg));
}

/***********************
 * 支出ペースアラート（毎日トリガー用）
 ***********************/
// ここから追加：月の経過割合に対して支出が過多かどうかをチェックして通知
function checkSpendingPace() {
  const now     = new Date();
  const today   = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); // 月末日
  const elapsed = today / lastDay; // 月の経過割合（0〜1）

  const thisMon = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM');
  const rows    = SpreadsheetApp.openById(SHEET_ID).getSheetByName('支出ログ').getDataRange().getValues().slice(1);
  const budgetSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('予算設定');

  // 今月の支出をカテゴリ別に集計
  const monCats = {};
  let totalExpense = 0, totalIncome = 0;
  rows.forEach(r => {
    if (!(r[0] instanceof Date)) return;
    if (Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy/MM') !== thisMon) return;
    const amt = Number(r[3]) || 0;
    if (r[1] === '収入') { totalIncome += Math.abs(amt); return; }
    if (r[1] === '支給' || amt <= 0) return;
    totalExpense += amt;
    monCats[r[1]] = (monCats[r[1]] || 0) + amt;
  });

  // 世帯予算を取得
  const budgetVals = budgetSheet ? budgetSheet.getDataRange().getValues().slice(1) : [];
  const budgets = {};
  budgetVals.forEach(r => {
    if (String(r[0]) === 'household' && r[1] && Number(r[2]) > 0) {
      budgets[String(r[1])] = Number(r[2]);
    }
  });

  // 収入をもとにペース判定（収入未入力なら予算合計で代用）
  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
  const baseIncome  = totalIncome > 0 ? totalIncome : totalBudget;

  // アラート条件：支出が「収入 × 経過割合 × 1.2」を超えたら（20%バッファ）
  if (baseIncome <= 0) return; // 収入も予算もなければスキップ
  const threshold = baseIncome * elapsed * 1.2;
  if (totalExpense <= threshold) return;

  // カテゴリ別にペースオーバーのものをピックアップ
  const overCats = [];
  Object.entries(monCats).forEach(([cat, amt]) => {
    const budget = budgets[cat];
    if (!budget) return;
    const pct = amt / budget;
    if (pct > elapsed * 1.2) {
      overCats.push({ cat, amt, budget, pct: Math.round(pct * 100) });
    }
  });

  // 通知メッセージを組み立て
  const dayLabel  = `${today}日時点（月の${Math.round(elapsed * 100)}%経過）`;
  let msg = `⚡ 支出ペースが速めです（${dayLabel}）\n━━━━━━━━━━\n`;
  msg += `💴 今月の支出：¥${totalExpense.toLocaleString()}\n`;
  msg += `📊 ペース目安：¥${Math.round(baseIncome * elapsed).toLocaleString()}\n`;
  if (overCats.length > 0) {
    msg += `\n⚠️ ペースオーバーのカテゴリ\n`;
    overCats.sort((a, b) => b.pct - a.pct).forEach(({ cat, amt, budget, pct }) => {
      msg += `${getCatEmoji(cat)} ${cat}：¥${amt.toLocaleString()} / 予算¥${budget.toLocaleString()}（${pct}%）\n`;
    });
  }
  msg += `\n💡 残りはセーブしていきましょう！`;

  // 夫婦両方に送信
  const targets = [
    PropertiesService.getScriptProperties().getProperty('MY_UID'),
    PropertiesService.getScriptProperties().getProperty('WIFE_UID')
  ].filter(Boolean);
  targets.forEach(uid => push(uid, msg));
}
// ここまで追加

function getCatEmoji(cat) {
  const map = {
    '食費':'🍜', '外食':'🍜', '食費・日用品':'🛒', '交通':'🚃',
    '交際':'🥂', '交際費':'🥂', '日用品':'🛒', '娯楽':'🎉',
    '光熱費・通信費':'💡', '収入':'💰', 'その他':'📦'
  };
  return map[cat] || '📌';
}