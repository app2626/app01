/**
 * ACT SAMSUNG Management System V6.8 (Strict Model Mapping)
 * Architecture: Google Apps Script Web App (MVC Model + BI Analytics)
 * Author: Enterprise AI Business Commander
 */

const ADMIN_PIN = "9999"; 

function doGet(e) {
  let template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('ACT SAMSUNG System V1')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ================= SMART SHEET DISCOVERY =================
function findSheet(ss, keyword) {
  const sheets = ss.getSheets();
  const lowerKeyword = keyword.toLowerCase();
  for (let s of sheets) {
    if (s.getName().toLowerCase().indexOf(lowerKeyword) !== -1) {
      return s;
    }
  }
  return null;
}

// ================= MODEL / DATA ACCESS LAYER =================
function getAppData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const annSheet = findSheet(ss, "ประกาศ");
  let announcement = { title: "", detail: "" };
  if(annSheet && annSheet.getLastRow() > 1) {
    const annData = annSheet.getRange(2, 1, 1, 2).getDisplayValues()[0];
    announcement = { title: annData[0], detail: annData[1] };
  }

  const promoSheet = findSheet(ss, "ข่าวสารโปรโมชั่น");
  let promotions = [];
  if(promoSheet && promoSheet.getLastRow() > 1) {
    const promoData = promoSheet.getRange(2, 1, promoSheet.getLastRow() - 1, 3).getDisplayValues();
    promotions = promoData.map(r => ({ title: r[0], detail: r[1], link: r[2] }));
  }

  const locSheet = findSheet(ss, "location");
  let locations = [];
  if(locSheet && locSheet.getLastRow() > 1) {
    const locData = locSheet.getRange(2, 1, locSheet.getLastRow() - 1, 5).getDisplayValues();
    locations = locData.map(r => ({ 
      area: r[0] ? r[0].toString().trim() : "ไม่ระบุ Area",
      support: r[1],
      code: r[3] ? r[3].toString().trim() : "",
      name: r[4]
    })).filter(r => r.code !== "");
  }

  // 💡 อัปเดต: ระบบดึง Master Data จากชีต Product จับคู่หัวตาราง SKU และ Model แบบแม่นยำ 100%
  const productSheet = findSheet(ss, "product");
  let productMap = {};
  if (productSheet && productSheet.getLastRow() > 1) {
    const prodData = productSheet.getDataRange().getDisplayValues();
    let headers = prodData[0];
    let skuIdx = -1;
    let modelIdx = -1;
    
    // ค้นหาคอลัมน์อัตโนมัติจากชื่อหัวตาราง
    for (let i = 0; i < headers.length; i++) {
      let h = headers[i].toString().trim().toLowerCase();
      // เช็คหัวตาราง SKU
      if (h === "sku" || h === "รหัสสินค้า") skuIdx = i;
      // เช็คหัวตาราง Model
      if (h === "model" || h.includes("model") || h === "รุ่น" || h === "ชื่อรุ่น") modelIdx = i;
    }
    
    // ถ้าตั้งชื่อหัวตารางผิดแปลกไป ให้เดาว่าคอลัมน์ A=SKU, B=Model
    if (skuIdx === -1) skuIdx = 0; 
    if (modelIdx === -1) modelIdx = 1; 

    for (let i = 1; i < prodData.length; i++) {
      let sku = prodData[i][skuIdx] ? prodData[i][skuIdx].toString().trim() : "";
      let model = prodData[i][modelIdx] ? prodData[i][modelIdx].toString().trim() : "";
      // แมป SKU เป็น Key และ Model เป็น Value เตรียมส่งให้แดชบอร์ดหน้าเว็บ
      if (sku !== "") {
        productMap[sku] = model;
      }
    }
  }

  const timeSheet = findSheet(ss, "time");
  let timeValid = true;
  if(timeSheet && timeSheet.getLastRow() > 1) {
    const timeData = timeSheet.getRange(2, 1, 1, 2).getDisplayValues()[0];
    timeValid = checkIsTimeValid(timeData[0], timeData[1]);
  }

  return { announcement, promotions, locations, timeValid, productMap }; // ส่งข้อมูล Model ออกไป
}

function getStockByBranch(locCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stockSheet = findSheet(ss, "stock");
  if(!stockSheet) return [];

  const actSheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
  let usedImeis = new Set(); 
  if(actSheet && actSheet.getLastRow() > 1) {
    const actData = actSheet.getDataRange().getDisplayValues();
    for(let i = 1; i < actData.length; i++) {
      let uImei = actData[i][7] ? actData[i][7].toString().trim() : "";
      if(uImei !== "") usedImeis.add(uImei);
    }
  }
  
  const data = stockSheet.getDataRange().getDisplayValues();
  let result = [];
  
  for(let i = 1; i < data.length; i++) {
    let sLoc = data[i][0] ? data[i][0].toString().trim() : "";
    if(sLoc == locCode || sLoc == "Warehouse Transfer") {
      let imei = data[i][4] ? data[i][4].toString().trim() : "";
      if(imei !== "" && !usedImeis.has(imei)) {
        result.push({
          sku: data[i][2].toString().trim(),
          desc: data[i][3].toString().trim(),
          imei: imei,
          originalLoc: sLoc
        });
      }
    }
  }
  return result;
}

function checkIsTimeValid(startStr, endStr) {
  if(!startStr || !endStr) return true;
  try {
    let now = new Date();
    let sStr = startStr.toString().trim();
    let eStr = endStr.toString().trim();
    
    if (sStr.includes('/') || sStr.includes('-')) {
      let parseD = function(str) {
        let p = str.split(' ')[0].split(/[-/]/);
        if(p.length === 3) {
          return p[0].length === 4 ? new Date(p[0], p[1]-1, p[2]) : new Date(p[2], p[1]-1, p[0]);
        }
        return new Date(str);
      };
      
      let startDate = parseD(sStr);
      let endDate = parseD(eStr);
      
      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          startDate.setHours(0, 0, 0, 0);
          endDate.setHours(23, 59, 59, 999); 
          return (now >= startDate && now <= endDate);
      }
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    let st = sStr.split(":");
    let startMinutes = parseInt(st[0]||0)*60 + parseInt(st[1]||0);
    let en = eStr.split(":");
    let endMinutes = parseInt(en[0]||0)*60 + parseInt(en[1]||0);
    return (currentMinutes >= startMinutes && currentMinutes <= endMinutes);
  } catch(e) {
    return true; 
  }
}

// ================= CONTROLLER / BUSINESS LOGIC =================

function getRecords() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
  if(!sheet || sheet.getLastRow() <= 1) return [];
  
  const locSheet = findSheet(ss, "location");
  let locAreaMap = {};
  if(locSheet && locSheet.getLastRow() > 1) {
    const locData = locSheet.getRange(2, 1, locSheet.getLastRow() - 1, 4).getDisplayValues();
    locData.forEach(function(row) {
      let lCode = row[3] ? row[3].toString().trim() : "";
      let lArea = row[0] ? row[0].toString().trim() : "ไม่ระบุ Area";
      if(lCode) locAreaMap[lCode] = lArea;
    });
  }

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getDisplayValues();
  
  let validData = [];
  data.forEach(function(r, index) {
    if(r[7] && r[7].toString().trim() !== "") { 
      let targetLocCode = r[3] ? r[3].toString().trim() : "";
      let mappedArea = locAreaMap[targetLocCode] || "ไม่ระบุ Area";

      validData.push({
        rowId: index + 2,
        timestamp: r[0],
        actDate: r[1],
        empName: r[2],
        locCode: targetLocCode,
        locName: r[4],
        sku: r[5],
        desc: r[6],
        imei: r[7],
        status: r[8],
        rrp: r[9] || "",
        discount: r[10] || "",
        promoPrice: r[11] || "",
        cutBarcode: r[12] || "",
        suggestPrice: r[13] || "",
        area: mappedArea 
      });
    }
  });
  
  return validData;
}

function saveBatchRecords(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // รอสูงสุด 15 วินาที
  } catch (e) {
    return { success: false, message: "ขณะนี้ระบบกำลังประมวลผลข้อมูลจากผู้ใช้อื่นจำนวนมาก กรุณารอสักครู่แล้วลองใหม่อีกครั้ง" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stockSheet = findSheet(ss, "stock");
    if(!stockSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต Stock" };
    const stockData = stockSheet.getDataRange().getDisplayValues();
    const validStockKeys = new Set();
    
    for(let i = 1; i < stockData.length; i++) {
      let sLoc = stockData[i][0] ? stockData[i][0].toString().trim() : "";
      let sSku = stockData[i][2] ? stockData[i][2].toString().trim() : "";
      let sImei = stockData[i][4] ? stockData[i][4].toString().trim() : "";
      validStockKeys.add(`${sLoc}|${sSku}|${sImei}`);
    }

    const targetSheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
    if(!targetSheet) return { success: false, message: "ไม่พบฐานข้อมูลชีต 'อยู่ระหว่างดำเนินการ'" };
    
    // เรียกใช้ SpreadsheetApp.flush() เผื่อคิวซิงค์ข้อมูลให้เสร็จก่อนอ่านค่า
    SpreadsheetApp.flush();
    
    let usedImeis = new Set();
    if(targetSheet.getLastRow() > 1) {
      const actData = targetSheet.getDataRange().getDisplayValues();
      for(let i = 1; i < actData.length; i++) {
        let uImei = actData[i][7] ? actData[i][7].toString().trim() : "";
        if(uImei !== "") usedImeis.add(uImei);
      }
    }

    const timestamp = "'" + Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");
    let actD = payload.actDate.split('-');
    let formattedActDate = payload.actDate;
    if(actD.length === 3) { formattedActDate = "'" + actD[2] + "/" + actD[1] + "/" + actD[0]; }
    const actEmpName = `${payload.locCode}+${payload.empName}`;
    
    let errors = [];
    let rowsToInsert = [];

    payload.items.forEach((item, index) => {
      let checkKey = `${payload.locCode}|${item.sku}|${item.imei}`;
      let transferKey = `Warehouse Transfer|${item.sku}|${item.imei}`;
      if(usedImeis.has(item.imei)) {
        errors.push(`รายการที่ ${index + 1} (IMEI: ${item.imei}) ถูกทำรายการแอคไปแล้ว`);
      } else if(!validStockKeys.has(checkKey) && !validStockKeys.has(transferKey)) {
        errors.push(`รายการที่ ${index + 1} (IMEI: ${item.imei}) ไม่มีในสต๊อกของสาขานี้ (หรือ Warehouse Transfer)`);
      } else {
        rowsToInsert.push([
          timestamp, formattedActDate, actEmpName, payload.locCode, payload.locName,
          item.sku, item.desc, item.imei, item.status || "ยังไม่ขาย", "", "", "", "", ""
        ]);
      }
    });

    if(errors.length > 0) return { success: false, message: "ตรวจพบข้อผิดพลาด:\n" + errors.join("\n") };
    
    rowsToInsert.forEach(row => targetSheet.appendRow(row));
    SpreadsheetApp.flush(); // บังคับเขียนลงแผ่นงานทันที
    
    return { success: true, message: `บันทึกข้อมูล ${rowsToInsert.length} รายการสำเร็จ` };
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาดในการบันทึก: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

function updateStatus(rowId, newStatus) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
    sheet.getRange(rowId, 9).setValue(newStatus);
    return { success: true, message: "อัปเดตสถานะสำเร็จ" };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

function verifyAdminAndExport(pin) {
  if(pin === ADMIN_PIN) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = findSheet(ss, "อยู่ระหว่างดำเนินการ");
    const data = sheet.getDataRange().getDisplayValues();
    let csvString = data.map((row, rIdx) =>
      row.map(field => {
        let text = field.toString();
        // แถวข้อมูล: ครอบเลขยาว (IMEI) และวันที่ ด้วย ="..." กัน Excel แปลงค่าเพี้ยน
        if (rIdx > 0 && (/^\d{11,}$/.test(text) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(text))) {
          return '"=""' + text.replace(/"/g, '""""') + '"""';
        }
        if (/[",\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
        return text;
      }).join(",")
    ).join("\r\n");
    return { success: true, csvData: csvString };
  } else {
    return { success: false, message: "รหัส Admin ไม่ถูกต้อง!" };
  }
}