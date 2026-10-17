function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**Include */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**Global */
const SPREADSHEET_ID = '1g7rOP29go7LNkv8Mpsk9VS8d7tLV9iugIN9mbShFuus';
const SHEET_NAME = 'ลิ้งค์แอเรียปิด-เปิดสาขา';

const TARGET_COLUMNS = [
  { title: 'แอเรีย', aliases: ['แอเรีย', 'area', 'area zone', 'areaสาขา'] },
  { title: 'ซัพพอต', aliases: ['ซัพพอต', 'ซัพพอร์ต', 'support'] },
  { title: 'Location', aliases: ['location', 'code', 'location code', 'รหัสสาขา', 'locnas', 'loca'] },
  { title: 'Location Odoo', aliases: ['location odoo', 'location code odoo', 'code odoo', 'รหัสสาขา odoo', 'odoo'] },
  { title: 'Location name', aliases: ['location name', 'code name', 'ชื่อสาขา', 'name of branch', 'name'] },
  { title: 'รายชื่อหัวหน้าสาขา/ผู้ดูแล', aliases: ['รายชื่อหัวหน้าสาขา/ผู้ดูแล', 'หัวหน้าสาขา', 'ผู้ดูแล', 'หัวหน้าร้าน/senior', 'หัวหน้าร้าน /senior', 'หัวหน้าร้าน'] },
  { title: 'เบอร์โทรสาขา', aliases: ['เบอร์โทรสาขา', 'เบอร์สาขา', 'มือถือร้าน', 'เบอร์ร้าน'] },
  { title: 'เบอร์โทรส่วนตัว', aliases: ['เบอร์โทรส่วนตัว', 'เบอร์ส่วนตัว', 'เบอร์โทรพนักงาน'] },
  { title: 'e-mail', aliases: ['e-mail', 'email', 'อีเมล', 'อีเมล์', 'e mail', 'mail (สาขา)'] },
  { title: 'รอบเบิก', aliases: ['รอบเบิก', 'รอบเบิก จากขนส่ง'] },
  { title: 'ภาค', aliases: ['ภาค', 'ภาค ขนส่ง', 'zone ขนส่ง', 'region', 'ภูมภาค', 'ภูมิภาค', 'ภาค scg ผลักของยึดตามนี้'] },
  { title: 'Status', aliases: ['status', 'status/shop', 'area zone update', 'สถานะ'] }
];

const ALLOWED_STATUSES = [
  'เปิดสาขา',
  'ปิดชั่วคราว',
  'งดส่งสินค้าชั่วคราว'
];

function normalizeHeader_(str) {
  return (str || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveColumnIndices_(headerRow) {
  const normalizedHeaders = headerRow.map(normalizeHeader_);
  const usedIndices = {};
  const result = new Array(TARGET_COLUMNS.length).fill(-1);

  // 1. จับคู่แบบตรงตัว (Exact match) ตามลำดับความสำคัญของชื่อคอลัมน์ก่อน
  TARGET_COLUMNS.forEach((col, colIdx) => {
    const candidates = [col.title].concat(col.aliases || []).map(normalizeHeader_);
    for (let c = 0; c < candidates.length; c++) {
      let matchedIdx = -1;
      for (let i = 0; i < normalizedHeaders.length; i++) {
        if (usedIndices[i]) continue;
        if (normalizedHeaders[i] === candidates[c]) {
          matchedIdx = i;
          break;
        }
      }
      if (matchedIdx !== -1) {
        result[colIdx] = matchedIdx;
        usedIndices[matchedIdx] = true;
        break;
      }
    }
  });

  // 2. จับคู่แบบบางส่วน (Partial match) โดยจัดลำดับ Location Odoo (3) และ Location name (4) ก่อน Location (2)
  const partialOrder = [3, 4, 0, 1, 2, 5, 6, 7, 8, 9, 10, 11];
  partialOrder.forEach(colIdx => {
    if (result[colIdx] !== -1) return;
    const col = TARGET_COLUMNS[colIdx];
    const aliases = (col.aliases || []).map(normalizeHeader_);
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (usedIndices[i] || !normalizedHeaders[i]) continue;
      const h = normalizedHeaders[i];
      const matched = aliases.some(alias => h.indexOf(alias) !== -1);
      if (matched) {
        result[colIdx] = i;
        usedIndices[i] = true;
        break;
      }
    }
  });

  // 3. Fallback ตามลำดับคอลัมน์ หากไม่พบหัวตารางที่ตรงกัน
  TARGET_COLUMNS.forEach((_, colIdx) => {
    if (result[colIdx] === -1 && colIdx < headerRow.length && !usedIndices[colIdx]) {
      result[colIdx] = colIdx;
      usedIndices[colIdx] = true;
    }
  });

  return result;
}

function getSourceSheet_() {
  // 1. ตรวจสอบในชีตปัจจุบันก่อน (กรณีเชื่อมต่อ IMPORTRANGE ในชีต "สาขา" หรือ "ลิ้งค์แอเรียปิด-เปิดสาขา" หรือ "ทั้งหมด" แล้ว)
  try {
    const active = SpreadsheetApp.getActive();
    if (active) {
      const localCandidates = [SHEET_NAME, 'สาขา', 'ทั้งหมด'];
      for (let i = 0; i < localCandidates.length; i++) {
        const s = active.getSheetByName(localCandidates[i]);
        if (s && s.getLastRow() > 1 && s.getLastColumn() >= 5) {
          const firstCell = (s.getRange(1, 1).getDisplayValue() || '').toString().trim();
          if (firstCell !== '#REF!' && firstCell !== '#ERROR!' && firstCell !== '#N/A') {
            return s;
          }
        }
      }
    }
  } catch (e) {
    // ignore and proceed to openById
  }

  // 2. เปิดไฟล์ต้นทางโดยตรงผ่าน SPREADSHEET_ID
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ws = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (!ws) {
    throw new Error('ไม่พบชีต "' + SHEET_NAME + '" ในไฟล์ต้นทาง');
  }
  return ws;
}

/**DataTable */
function getData(id) {
  const ws = getSourceSheet_();
  const lastRow = ws.getLastRow();
  if (lastRow <= 1) return [];

  // ดึงข้อมูลช่วง A:V (คอลัมน์ 1 ถึง 22)
  const maxCols = Math.min(Math.max(ws.getLastColumn(), 12), 22);
  const rawData = ws.getRange(1, 1, lastRow, maxCols).getDisplayValues();

  // ค้นหาแถวที่เป็นหัวตาราง (เผื่อมีแถวว่างด้านบน)
  let headerRowIdx = 0;
  let bestMatchCount = -1;
  const searchLimit = Math.min(5, rawData.length);
  for (let r = 0; r < searchLimit; r++) {
    const rowNorm = rawData[r].map(normalizeHeader_);
    let matches = 0;
    TARGET_COLUMNS.forEach(col => {
      const candidates = [col.title].concat(col.aliases || []).map(normalizeHeader_);
      if (rowNorm.some(h => h && candidates.indexOf(h) !== -1)) matches++;
    });
    if (matches > bestMatchCount) {
      bestMatchCount = matches;
      headerRowIdx = r;
    }
  }

  const colIndices = resolveColumnIndices_(rawData[headerRowIdx]);
  const dataRows = rawData.slice(headerRowIdx + 1);

  // ดึงเฉพาะ 12 คอลัมน์ ตัดแถวว่างออก และกรองเฉพาะสถานะที่กำหนด
  const mappedData = dataRows
    .map(row => colIndices.map(idx => (idx !== -1 && idx < row.length ? row[idx] : '')))
    .filter(row => {
      if (!row.some(cell => (cell || '').toString().trim() !== '')) return false;
      const status = (row[11] || '').toString().trim().replace(/\s+/g, ' ');
      return ALLOWED_STATUSES.indexOf(status) !== -1;
    });

  const filterKey = (id || '').toString().trim();
  if (!filterKey || filterKey === 'ทั้งหมด') {
    return mappedData;
  }

  // กรองจากคอลัมน์ "แอเรีย" (index 0) หรือ "ซัพพอต" (index 1)
  return mappedData.filter(row => {
    const area = (row[0] || '').toString().trim();
    const support = (row[1] || '').toString().trim();
    return (
      area === filterKey ||
      area.indexOf(filterKey) !== -1 ||
      support === filterKey ||
      support.indexOf(filterKey) !== -1
    );
  });
}
