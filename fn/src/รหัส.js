/*
# ระบบ Login
# Credit: https://www.google.com/
# ผู้พัฒนา: https://www.google.com/
*/

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('FN+ Consignment')
    .setFaviconUrl('https://i.postimg.cc/5tcXkv1h/Demo-(5).png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
}

function authorizeEmail() {
  // ฟังก์ชั่นนี้มีไว้เพื่อให้ Google ตรวจสอบสิทธิ์ในการส่งอีเมล
  MailApp.sendEmail(Session.getActiveUser().getEmail(), "ทดสอบสิทธิ์ FN+ Consignment", "คุณได้ให้สิทธิ์ระบบส่งอีเมลเรียบร้อยแล้ว");
}

/**Approve with Remark */
function statusRecordWithRemark(obj) {
  let lock = LockService.getScriptLock();
  lock.tryLock(10000);
  if (lock.hasLock()) {
    try {
      let ss = getDataSheet_();
      var data = ss.getDataRange().getDisplayValues();
      var id = data.map(r => r[0]);
      var index = id.indexOf(obj.record);
      // FIX: ป้องกัน crash เมื่อหา record ไม่พบ (index = -1 → getRange(0,...) error)
      if (index < 1) throw new Error('ไม่พบข้อมูล ID: ' + obj.record);

      // Support multiple actions for multi-step workflow
      if (obj.action === 'approve') {
        ss.getRange(index + 1, 33).setValue(obj.status);
        ss.getRange(index + 1, 34).setValue(obj.Remark || "-"); // Remark(การเงิน)
        ss.getRange(index + 1, 35).setValue(obj.financeAmount || "-"); // ยอดเงินโอนที่ได้รับ(การเงิน)
        ss.getRange(index + 1, 36).setValue(obj.financeRemarkExtra || "-"); // Remark(การเงิน)ใส่หมายเหตุเพิ่มถ้ามี
      } else if (obj.action === 'updateSO') {
        ss.getRange(index + 1, 33).setValue(obj.status);
        ss.getRange(index + 1, 37).setValue(obj.soRemark || "-"); // Remark(SO)
        ss.getRange(index + 1, 38).setValue(obj.soCreated || "-"); // Sales Order created
        ss.getRange(index + 1, 39).setValue(obj.soRemarkExtra || "-"); // Remark(SO)ใส่หมายเหตุเพิ่มถ้ามี
      } else if (obj.action === 'updateAR') {
        ss.getRange(index + 1, 33).setValue(obj.status);
        ss.getRange(index + 1, 40).setValue(obj.invoice || "-"); // Invoice บัญชี
        ss.getRange(index + 1, 41).setValue(obj.arRemark || "-"); // AR ใส่หมายเกตุถ้ามี
      } else {
        // Fallback
        ss.getRange(index + 1, 33).setValue(obj.status);
        ss.getRange(index + 1, 34).setValue(obj.Remark || "-");
      }

      var dataArray = ss.getRange(index + 1, 1, 1, ss.getLastColumn()).getDisplayValues()[0];

      if (obj.action === 'approve' && (obj.status == "รอเปิด SO" || obj.status == "ไม่อนุมัติ")) {
        var msg = "ผลการอนุมัติและการดำเนินการ"
          + '\nวันที่ขออนุมัติ: ' + dataArray[1]
          + '\nสาขา: ' + dataArray[2]
          + '\nชื่อตัวและสกุล (ลูกค้า): ' + dataArray[7]
          + '\nเบอร์ติดต่อลูกค้า: ' + dataArray[8]
          + '\nชื่อรุ่นสินค้า: ' + dataArray[15]
          + '\nราคาเต็ม: ' + dataArray[19]
          + '\nจำนวนงวด: ' + dataArray[28]
          + '\nงวดละ: ' + dataArray[29]
          + '\n📌📌สถานะ ' + dataArray[32]
          + '\n📝 หมายเหตุ: ' + (obj.Remark || "-")
          + (obj.financeAmount ? '\n💰 ยอดเงินโอนที่ได้รับ(การเงิน): ' + obj.financeAmount : "")

        var subjectTitle = "";
        if (obj.status == "รอเปิด SO") {
          subjectTitle = "อนุมัติให้ทำรายการ FN+ Consignment ได้ สาขา " + dataArray[2];
        } else {
          subjectTitle = "ไม่อนุมัติให้ทำรายการ FN+ Consignment ได้ สาขา " + dataArray[2];
        }

        try {
          sendNotify_(msg, true, [], subjectTitle);
        } catch (e) {
          console.error("Notify Error: " + e.message);
        }
        var log = SpreadsheetApp.getActive().getSheetByName('Log')
        log.appendRow([new Date(), obj.name, obj.status])
      } else if (obj.action === 'updateSO') {
        var log = SpreadsheetApp.getActive().getSheetByName('Log')
        log.appendRow([new Date(), obj.name, "Update SO"])
      } else if (obj.action === 'updateAR') {
        var log = SpreadsheetApp.getActive().getSheetByName('Log')
        log.appendRow([new Date(), obj.name, "Update AR"])
      }
    } finally {
      lock.releaseLock();
    }
  } else {
    throw new Error("ระบบกำลังประมวลผลข้อมูลอื่นอยู่ กรุณาลองใหม่อีกครั้ง");
  }
}

/**DataTable */
function getData(admin) {
  let ss = getDataSheet_();
  var data = ss.getDataRange().getDisplayValues().slice(1);
  
  // 1. กรองแถวว่างออก (ป้องกันปัญหาดึงแถวว่างที่ไม่มีข้อมูลมาแสดง)
  // FIX: เช็คข้อมูลทั้งแถวแทนการเช็คแค่ ID (เผื่อกรณี User พิมพ์ข้อมูลลง Sheet เองแล้วเว้น ID ไว้)
  data = data.filter(r => r.join("").trim() !== "");

  // 2. กรองข้อมูลตามสิทธิ์ (Role)
  let adminSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Admin");
  if (adminSheet && admin) {
    let adminData = adminSheet.getDataRange().getDisplayValues().slice(1);
    let user = adminData.find(r => r[2].trim() === admin.trim());
    let role = user ? user[3].trim() : "";

    // ปลดล็อกให้พนักงานเห็นข้อมูลในตารางได้ทั้งหมด
    // if (role !== "แอดมิน" && role !== "บัญชี") {
    //   data = data.filter(r => r[4].trim() === admin.trim() || r[3].trim() === admin.trim());
    // }
  }

  // 3. จัดการโครงสร้างข้อมูลให้ครบทุกคอลัมน์ตาม UI DataTables
  return data.map(r => {
    while(r.length < 42) r.push("");
    return r;
  }) || [];
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**ค้นหาข้อมูล */
function findRecord(record) {
  let ss = getDataSheet_();
  var data = ss.getDataRange().getDisplayValues();
  var id = data.map(r => r[0]);
  var index = id.indexOf(record);
  // FIX: ป้องกัน crash เมื่อหา record ไม่พบ (index = -1 → getRange(0,...) error)
  if (index < 1) throw new Error('ไม่พบข้อมูล ID: ' + record);
  return ss.getRange(index + 1, 1, 1, ss.getLastColumn()).getDisplayValues()[0];
}

function saveDataB64(obj) {
  let lock = LockService.getScriptLock()
  lock.tryLock(15000)
  if (lock.hasLock()) {
    try {
      let ss = getDataSheet_();
      let config = getConfig_();
      let folderId = config.driveFolderId;
      let folder;
      
      try {
        if (folderId) {
          folder = DriveApp.getFolderById(folderId);
        } else {
          folder = DriveApp.getFolderById('1_b5LnM6ZOV3vulT2i5Jk3QtKoAwEvRD5');
        }
      } catch (e) {
        try {
          folder = DriveApp.createFolder("FN+ Consignment_Uploads");
        } catch (e2) {
          throw new Error("ไม่สามารถเข้าถึงหรือสร้างโฟลเดอร์ใน Google Drive ได้ กรุณาตั้งค่า Folder ID ให้ถูกต้อง");
        }
      }
      
      let ucFile = "";
      let file = "";
      let blob1 = null;
      let blob2 = null;
      let file2Id = "";
      
      if (obj.file1Data) {
        blob1 = Utilities.newBlob(Utilities.base64Decode(obj.file1Data.base64), obj.file1Data.mimeType, obj.file1Data.name);
        file = folder.createFile(blob1).getId();
        ucFile = "https://lh3.googleusercontent.com/d/" + file;
      }

      let ucFile2 = "";
      if (obj.file2Data) {
        blob2 = Utilities.newBlob(Utilities.base64Decode(obj.file2Data.base64), obj.file2Data.mimeType, obj.file2Data.name);
        file2Id = folder.createFile(blob2).getId();
        ucFile2 = "https://drive.google.com/uc?id=" + file2Id;
      }

    ss.appendRow(["'" + new Date().getTime().toString(),
    obj.date,
    obj.location,
    obj.emp_id,
    obj.emp_name,
    "'" + obj.emp_phone,
    "'" + obj.id_card_number,
    obj.customer_name,
    "'" + obj.customer_phone,
    obj.address,
    obj.road,
    obj.district,
    obj.amphoe,
    obj.province,
    obj.zipcode,
    obj.productname,
    obj.imei,
    obj.premium_combined,
    obj.guarantee,
    obj.price,
    obj.down,
    obj.discountais,
    obj.discountpromotion,
    obj.discounttradein,
    obj.discounttradeup,
    obj.discountbigc,
    obj.dues,
    obj.netprice,
    obj.installments,
    obj.installment_amount,
      ucFile,
      ucFile2,
      "รออนุมัติ",
      ""
    ])

    var dataArray = ss.getRange(ss.getLastRow(), 1, 1, ss.getLastColumn()).getDisplayValues()[0]
    var msg = "ขออนุมัติเพื่อการขาย FN+ Consignment"
      + '\nวันที่ขออนุมัติ: ' + dataArray[1]
      + '\nสาขา: ' + dataArray[2]
      + '\nชื่อตัวและสกุล (ลูกค้า): ' + dataArray[7]
      + '\nเบอร์ติดต่อลูกค้า: ' + dataArray[8]
      + '\nชื่อรุ่นสินค้า: ' + dataArray[15]
      + '\nIMEI: ' + dataArray[16]
      + '\nราคาขายปลีกปกติ: ' + dataArray[19]
      + '\nเงินดาวน์: ' + dataArray[20]
      + '\nส่วนลด เปิดเบอร์ AIS: ' + dataArray[21]
      + '\nส่วนลด promotion: ' + dataArray[22]
      + '\nส่วนลด Trade in: ' + dataArray[23]
      + '\nส่วนลด Trade up: ' + dataArray[24]
      + '\nส่วนลด Big point: ' + dataArray[25]
      + '\nค่าธรรมเนียม: ' + dataArray[26]
      + '\nราคาสุทธิ: ' + dataArray[27]
      + '\nจำนวนงวด: ' + dataArray[28]
      + '\nงวดละ: ' + dataArray[29]
      + '\n📌สถานะ ' + 'รออนุมัติ'

    var attachments = [];
    var imageForLine = null;
    
    if (blob1) {
      attachments.push(blob1);
      imageForLine = blob1;
    }
    
    if (blob2) {
      attachments.push(blob2);
    }

    var subjectTitle = "ขออนุมัติทำรายการ FN+ Consignment ชื่อ " + obj.customer_name + " สาขา " + obj.location;

    try {
      sendNotify_(msg, false, attachments, subjectTitle, imageForLine); // แจ้งคำขอใหม่ (isApprove = false)
    } catch (e) {
      console.error("Notify Error: " + e.message);
    }

    return true;
    } finally {
      lock.releaseLock();
    }
  } else {
    throw new Error("ระบบกำลังประมวลผลข้อมูลอื่นอยู่ กรุณาลองใหม่อีกครั้ง");
  }
}

