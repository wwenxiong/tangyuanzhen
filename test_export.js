// 测试 buildStyledXlsx 导出功能（带框线样式）
const fs = require('fs');
const { TextEncoder } = require('util');

// 加载 initial-data.js
const initialContent = fs.readFileSync('./web-app/initial-data.js', 'utf-8');
const sandbox = { window: {} };
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(initialContent, sandbox);
const INITIAL_DATA = sandbox.window.INITIAL_DATA;

// ---- 从 app.js 提取的辅助函数 ----
function xmlEscape(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}

function crc32(data) {
  if (typeof data === 'string') data = new TextEncoder().encode(data);
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) { crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZipStore(files) {
  const enc = new TextEncoder();
  const parts = [], centralDir = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(dataBytes), size = dataBytes.length;
    const lh = new Uint8Array(30), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    parts.push(lh, nameBytes, dataBytes);
    const cd = new Uint8Array(46), cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true); cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
    centralDir.push(cd, nameBytes);
    offset += 30 + nameBytes.length + size;
  }
  const cdSize = centralDir.reduce((s, a) => s + a.length, 0);
  const eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
  const all = parts.concat(centralDir, [eocd]);
  const total = all.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const p of all) { result.set(p, pos); pos += p.length; }
  return result;
}

function buildStyledXlsx(branchName, rows) {
  const xesc = xmlEscape;
  const colWidths = [4.875, 10.625, 10.625, 15.625, 52.875, 29, 9.375];
  let sx = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  sx += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
  sx += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  sx += '<cols>';
  colWidths.forEach(function (w, i) { sx += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; });
  sx += '</cols>';
  sx += '<sheetData>';
  sx += '<row r="1" ht="50" customHeight="1">';
  sx += '<c r="A1" s="1" t="inlineStr"><is><t>' + xesc(branchName) + '村党支部2026年度党员学习统计表</t></is></c>';
  for (var c = 1; c < 7; c++) { sx += '<c r="' + String.fromCharCode(65 + c) + '1" s="1"/>'; }
  sx += '</row>';
  sx += '<row r="2" ht="30" customHeight="1">';
  sx += '<c r="A2" s="2" t="inlineStr"><is><t>填报单位：</t></is></c>';
  for (var c = 1; c < 7; c++) { sx += '<c r="' + String.fromCharCode(65 + c) + '2" s="2"/>'; }
  sx += '</row>';
  var headers = ['序号', '姓名', '入党时间', '参加培训时间', '培训方式及内容', '培训时长（45分钟=1学时）', '总学时'];
  sx += '<row r="3" ht="30" customHeight="1">';
  headers.forEach(function (h, i) { sx += '<c r="' + String.fromCharCode(65 + i) + '3" s="3" t="inlineStr"><is><t>' + xesc(h) + '</t></is></c>'; });
  sx += '</row>';
  var fNumericValues = rows.map(function (r) {
    var durStr = (r.duration || '').toString();
    var m = durStr.match(/^([\d.]+)(?:学时)?$/);
    return m ? parseFloat(m[1]) : NaN;
  });
  var excelRow = 4, mergeList = [];
  rows.forEach(function (r, rowIdx) {
    var isFirst = r._isFirst, recordCount = r._recordCount || 0;
    sx += '<row r="' + excelRow + '">';
    if (isFirst && r.seq !== '') { sx += '<c r="A' + excelRow + '" s="4"><v>' + r.seq + '</v></c>'; }
    else { sx += '<c r="A' + excelRow + '" s="4"/>'; }
    if (isFirst && r.name) { sx += '<c r="B' + excelRow + '" s="4" t="inlineStr"><is><t>' + xesc(r.name) + '</t></is></c>'; }
    else { sx += '<c r="B' + excelRow + '" s="4"/>'; }
    if (isFirst && r.joinDate) {
      var jd = r.joinDate, jm = jd.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
      if (jm) { jd = jm[3] ? jm[0].slice(0,4)+'.'+String(jm[2]).padStart(2,'0')+'.'+String(jm[3]).padStart(2,'0') : jm[0].slice(0,4)+'.'+String(jm[2]).padStart(2,'0'); }
      sx += '<c r="C' + excelRow + '" s="4" t="inlineStr"><is><t>' + xesc(jd) + '</t></is></c>';
    } else { sx += '<c r="C' + excelRow + '" s="4"/>'; }
    var td = r.trainDate || '';
    if (td) {
      var tm = td.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
      if (tm) { td = tm[3] ? tm[0].slice(0,4)+'.'+String(tm[2]).padStart(2,'0')+'.'+String(tm[3]).padStart(2,'0') : tm[0].slice(0,4)+'.'+String(tm[2]).padStart(2,'0'); }
      sx += '<c r="D' + excelRow + '" s="4" t="inlineStr"><is><t>' + xesc(td) + '</t></is></c>';
    } else { sx += '<c r="D' + excelRow + '" s="4"/>'; }
    if (r.content) { sx += '<c r="E' + excelRow + '" s="5" t="inlineStr"><is><t>' + xesc(r.content) + '</t></is></c>'; }
    else { sx += '<c r="E' + excelRow + '" s="5"/>'; }
    var durStr = (r.duration || '').toString();
    var pureNumMatch = durStr.match(/^([\d.]+)(?:学时)?$/);
    if (!durStr) { sx += '<c r="F' + excelRow + '" s="4"/>'; }
    else if (pureNumMatch) { sx += '<c r="F' + excelRow + '" s="4"><v>' + parseFloat(pureNumMatch[1]) + '</v></c>'; }
    else { sx += '<c r="F' + excelRow + '" s="4" t="inlineStr"><is><t>' + xesc(durStr) + '</t></is></c>'; }
    if (isFirst) {
      if (recordCount <= 1) {
        var gv = 0;
        if (recordCount === 1) { var fn = fNumericValues[rowIdx]; if (!isNaN(fn)) gv = fn; }
        sx += '<c r="G' + excelRow + '" s="6"><v>' + gv + '</v></c>';
      } else {
        var startR = excelRow, endR = excelRow + recordCount - 1, cachedSum = 0;
        for (var i = rowIdx; i < rowIdx + recordCount && i < fNumericValues.length; i++) { var fn2 = fNumericValues[i]; if (!isNaN(fn2)) cachedSum += fn2; }
        cachedSum = cachedSum % 1 === 0 ? cachedSum : parseFloat(cachedSum.toFixed(2));
        sx += '<c r="G' + excelRow + '" s="6"><f>SUM(F' + startR + ':F' + endR + ')</f><v>' + cachedSum + '</v></c>';
      }
    } else { sx += '<c r="G' + excelRow + '" s="6"/>'; }
    sx += '</row>';
    if (isFirst) {
      var mc = recordCount > 0 ? recordCount : 1;
      if (mc > 1) {
        mergeList.push('A' + excelRow + ':A' + (excelRow + mc - 1));
        mergeList.push('B' + excelRow + ':B' + (excelRow + mc - 1));
        mergeList.push('C' + excelRow + ':C' + (excelRow + mc - 1));
        mergeList.push('G' + excelRow + ':G' + (excelRow + mc - 1));
      }
    }
    excelRow++;
  });
  sx += '</sheetData>';
  sx += '<mergeCells count="' + (mergeList.length + 2) + '">';
  sx += '<mergeCell ref="A1:G1"/>';
  sx += '<mergeCell ref="A2:D2"/>';
  mergeList.forEach(function (ref) { sx += '<mergeCell ref="' + ref + '"/>'; });
  sx += '</mergeCells>';
  sx += '</worksheet>';

  var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="3"><font><sz val="11"/><name val="宋体"/></font><font><b/><sz val="22"/><name val="宋体"/></font><font><b/><sz val="11"/><name val="宋体"/></font></fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="7">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    + '</cellXfs></styleSheet>';

  var contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  var workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xesc(branchName.slice(0, 31)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
  var workbookRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';

  return createZipStore([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: relsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { name: 'xl/styles.xml', data: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', data: sx }
  ]);
}

// ---- 测试 ----
const branchName = '东凤鸣';
const branch = INITIAL_DATA.branches.find(b => b.name === branchName);
const members = INITIAL_DATA.members.filter(m => m.branchId === branch.id).sort((a,b)=>a.name.localeCompare(b.name,'zh'));
const allRecords = INITIAL_DATA.records;

function sumDuration(records) {
  let total = 0;
  records.forEach(r => { const m = (r.duration||'').toString().match(/[\d.]+/); if (m) total += parseFloat(m[0]); });
  return total % 1 === 0 ? total : parseFloat(total.toFixed(2));
}

const rows = [];
let memberIndex = 0;
members.forEach((member) => {
  memberIndex++;
  const records = allRecords.filter(r => r.memberId === member.id).sort((a,b)=>(a.trainingDate||'').localeCompare(b.trainingDate||''));
  if (records.length === 0) {
    rows.push({ seq: memberIndex, name: member.name, joinDate: member.joinDate||'', trainDate:'', content:'', duration:'', _isFirst:true, _recordCount:0 });
  } else {
    records.forEach((r, idx) => {
      rows.push({
        seq: idx===0 ? memberIndex : '', name: idx===0 ? member.name : '',
        joinDate: idx===0 ? (member.joinDate||'') : '',
        trainDate: r.trainingDate||'', content: r.methodAndContent||'', duration: r.duration||'',
        _isFirst: idx===0, _recordCount: records.length
      });
    });
  }
});

// 生成xlsx
const xlsxData = buildStyledXlsx(branchName, rows);
const outPath = 'f:\\单位\\汤原镇\\_test_export_.xlsx';
fs.writeFileSync(outPath, Buffer.from(xlsxData));
console.log('已生成:', outPath, '大小:', xlsxData.length, 'bytes');

// 用SheetJS读取验证
const XLSX = require('./web-app/xlsx.full.min.js');
const wb2 = XLSX.read(fs.readFileSync(outPath), { type: 'buffer', cellDates: true, cellStyles: true });
const ws2 = wb2.Sheets[wb2.SheetNames[0]];
const range = XLSX.utils.decode_range(ws2['!ref']);

console.log('\n=== 导出校验 ===');
console.log('Sheet名:', wb2.SheetNames[0]);
console.log('范围:', ws2['!ref']);
console.log('合并数:', (ws2['!merges']||[]).length);
console.log('前5个合并:', JSON.stringify((ws2['!merges']||[]).slice(0,5).map(m => `${XLSX.utils.encode_cell(m.s)}:${XLSX.utils.encode_cell(m.e)}`)));

console.log('\n=== 关键单元格 ===');
['A1','A2','A3','G3','B4','C4','D4','F4','G4'].forEach(a => {
  const cell = ws2[a];
  if (cell) {
    let info = `${a}: t=${cell.t}`;
    if (cell.v !== undefined) info += `, v=${JSON.stringify(cell.v).slice(0,50)}`;
    if (cell.f) info += `, f=${cell.f}`;
    console.log(info);
  } else { console.log(`${a}: (空)`); }
});

console.log('\n=== 前5个党员G列SUM ===');
let cnt = 0;
for (let r = 3; r <= range.e.r && cnt < 5; r++) {
  const b = ws2[XLSX.utils.encode_cell({r, c:1})];
  const g = ws2[XLSX.utils.encode_cell({r, c:6})];
  if (b && b.v) {
    cnt++;
    console.log(`  行${r+1} ${b.v} -> G: ${g?.f||''} = ${g?.v}`);
  }
}

console.log('\n=== 测试完成 ===');
