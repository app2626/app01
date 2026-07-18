function doGet() {
  return HtmlService.createTemplateFromFile('index')
  .evaluate()
  .addMetaTag('viewport', 'width=device-width, initial-scale=1')
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
}


/**แสดงข้อมูล Tabulator */
  function getData(){
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const ws = ss.getSheetByName('Data')
  const dataRange = ws.getRange('A1').getDataRegion()
  const data = dataRange.getDisplayValues()
  
  const headers = data.shift()
  
  const tabledata = data.map(r =>{
    const tempObject ={}
    headers.forEach((header,i)=>{
      let key = String(header).trim();
      if (i === 0) key = "ID"; 
      else if (i === 1) key = "เรื่อง"; 
      else if (i === 2) key = "สาขา"; 
      else if (i === 3) key = "รายละเอียดสินค้า"; 
      else if (i === 4) key = "บาร์ขาย"; 
      else if (i === 5) key = "ราคาในระบบ"; 
      else if (i === 6) key = "กดShift F2(ปรับราคาขาย)"; 
      else if (i === 7) key = "ราคาสุทธิ"; 
      else if (i === 8) key = "ระยะเวลาโปรโมชั่น"; 
      else if (i === 9) key = "ชื่อ-นามสกุล/เบอร์โทรลูกค้า"; 
      else if (i === 10) key = "แพ็คเกจAIS"; 
      else if (i === 11) key = "IMEIเครื่องที่เอามาTrade(เครื่องเก่า)"; 
      else if (i === 12) key = "Timestamp"; 
      else if (i === 13) key = "สถานะ"; 
      tempObject[key] = r[i];
    })
    return tempObject;
  })
  return tabledata;
}

/** ดึงไฟล์ */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** ตรวจสอบการเข้าสู่ระบบ */
function checkLogin(username, password) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  
  if (!sheet) {
    sheet = ss.insertSheet('Users');
    sheet.appendRow(['Username', 'Password', 'Name', 'Role', 'Branch']);
    sheet.appendRow(['admin', 'admin123', 'Admin', 'แอดมิน', 'All']);
    sheet.appendRow(['super', 'super123', 'Supervisor', 'หัวหน้างาน', 'All']);
    sheet.appendRow(['staff', 'staff123', 'Staff', 'พนักงาน', 'Branch1']);
    sheet.getRange('A1:E1').setFontWeight('bold');
  }
  
  var data = sheet.getDataRange().getDisplayValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === password) {
      return {
        success: true,
        username: data[i][0],
        name: data[i][2],
        role: data[i][3],
        branch: data[i][4]
      };
    }
  }
  return { success: false, message: 'Username หรือ Password ไม่ถูกต้อง' };
}

function editCell(prop){
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const ws = ss.getSheetByName('Data')
  const id = ws.getRange('A2:A').createTextFinder(prop.id).matchEntireCell(true).matchCase(true).findNext()
  const col = ws.getRange('1:1').createTextFinder(prop.field).matchEntireCell(true).matchCase(true).findNext()
  if(id === null) throw new Error('ไม่มีข้อมูล')
  if(col === null) throw new Error('ไม่มีฟิลด์')
  const rowNum = id.getRow()
  const colNum = col.getColumn()
  ws.getRange(rowNum,colNum).setValue(prop.val)

//Get ค่ามาส่งไลน์
  var data = ws.getDataRange().getDisplayValues()
  data = ws.getRange(rowNum,1,1,ws.getLastColumn()).getDisplayValues()[0]
 
//ชุดส่งไลน์ 
if(prop.val === "อนุมัติ"){
   var subject = "อนุมัติปรับ Shift F2 สาขา " + data[2]; //หัวข้อส่งเมล์

   var mailMessage = "เรียนผู้เกี่ยวข้อง \n"+
                 '\nเรื่อง: '+ data[1]+
                 '\nสาขา: '+ data[2]+
                 '\nรายละเอียดสินค้า: '+ data[3]+
                 '\nบาร์ขาย: '+ data[4]+
                 '\nราคาในระบบ: '+ data[5]+
                 '\nกดShift F2(ปรับราคาขาย): '+ data[6]+
                 '\nราคาสุทธิ: '+ data[7]+
                 '\nระยะเวลาโปรโมชั่น: '+ data[8]+
                 '\nชื่อ-นามสกุล/เบอร์โทรลูกค้า: '+ data[9]+
                 '\nแพ็คเกจAIS: '+ data[10]+
                 '\nIMEIเครื่องที่เอามาTrade(เครื่องเก่า): '+ data[11]+
                 "\n\n📌📌 อนุมัติแล้ว"+
                 "\n👉🏻 ตรวจสอบข้อมูล https://sites.google.com/tgfone.com/shift-f2-bc/shift";

    var mailSheet = ss.getSheetByName('Mail');
    var toAddresses = "";
    var ccAddresses = "";
    
    if (mailSheet) {
      var lastRowM = mailSheet.getLastRow();
      if (lastRowM > 1) {
        var mailData = mailSheet.getRange(2, 1, lastRowM - 1, 2).getDisplayValues();
        var toList = [];
        var ccList = [];
        for (var i = 0; i < mailData.length; i++) {
          if (mailData[i][0]) toList.push(mailData[i][0]);
          if (mailData[i][1]) ccList.push(mailData[i][1]);
        }
        toAddresses = toList.join(",");
        ccAddresses = ccList.join(",");
      }
    }

    if (toAddresses !== "") {
      var emailOptions = {
        to: toAddresses,
        subject: subject,
        body: mailMessage
      };
      if (ccAddresses !== "") {
        emailOptions.cc = ccAddresses;
      }
      MailApp.sendEmail(emailOptions);
    }
  
   var teleMessage = '\nเรื่อง: '+ data[1]+
                 '\nสาขา: '+ data[2]+
                 '\nรายละเอียดสินค้า: '+ data[3]+
                 '\nบาร์ขาย: '+ data[4]+
                 '\nราคาในระบบ: '+ data[5]+
                 '\nกดShift F2(ปรับราคาขาย): '+ data[6]+
                 '\nราคาสุทธิ: '+ data[7]+
                 '\nระยะเวลาโปรโมชั่น: '+ data[8]+
                 '\nชื่อ-นามสกุล/เบอร์โทรลูกค้า: '+ data[9]+
                 '\nแพ็คเกจAIS: '+ data[10]+
                 '\nIMEIเครื่องที่เอามาTrade(เครื่องเก่า): '+ data[11]+
                 '\n📌📌สถานะ: '+ prop.val;
                 
  var settingSheet = ss.getSheetByName('Setting');
  var botToken = (settingSheet && settingSheet.getRange('B3').getValue()) || '8384375131:AAF8Jjy1uoNEAPSYR8zBYtB5LLRVaTkzbrk'; 
  var chatId = (settingSheet && settingSheet.getRange('C3').getValue()) || '-4879940874'; 
  
   sendTelegramNotification(botToken, chatId, teleMessage);
}
}

function getDropdownOptions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var detailSheet = ss.getSheetByName('Detail');
  var locationSheet = ss.getSheetByName('Location');
  
  var topics = [];
  if (detailSheet) {
    var lastRowD = detailSheet.getLastRow();
    if(lastRowD > 1) {
       var detailData = detailSheet.getRange(2, 1, lastRowD - 1, 1).getDisplayValues();
       topics = detailData.map(function(r) { return r[0]; }).filter(String);
    }
  }
  
  var locations = [];
  if (locationSheet) {
    var lastRowL = locationSheet.getLastRow();
    if(lastRowL > 1) {
       var locationData = locationSheet.getRange(2, 1, lastRowL - 1, 1).getDisplayValues();
       locations = locationData.map(function(r) { return r[0]; }).filter(String);
    }
  }
  
  return { topics: topics, locations: locations };
}



function submitNewForm(formData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Data');
  
  var timeId = new Date().getTime().toString();
  var currentTimestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  
  var rowData = [
    timeId,
    formData.topic,
    formData.branch,
    formData.productDetail,
    formData.barcode,
    formData.systemPrice,
    formData.shiftF2Price,
    formData.netPrice,
    formData.promotionPeriod,
    formData.customerInfo,
    formData.aisPackage,
    formData.imeiTrade,
    currentTimestamp,
    "รออนุมัติ"
  ];
  
  ws.appendRow(rowData);
  
  var message = '\nเรื่อง: ' + formData.topic +
              '\nสาขา: ' + formData.branch +
              '\nรายละเอียดสินค้า: ' + formData.productDetail +
              '\nบาร์ขาย: ' + formData.barcode +
              '\nราคาในระบบ: ' + formData.systemPrice +
              '\nกดShift F2(ปรับราคาขาย): ' + formData.shiftF2Price +
              '\nราคาสุทธิ: ' + formData.netPrice +
              '\nระยะเวลาโปรโมชั่น: ' + formData.promotionPeriod +
              '\nชื่อ-นามสกุล/เบอร์โทรลูกค้า: ' + formData.customerInfo +
              '\nแพ็คเกจAIS: ' + formData.aisPackage +
              '\nIMEIเครื่องที่เอามาTrade(เครื่องเก่า): ' + formData.imeiTrade + 
              '\n📌สถานะ: รออนุมัติ https://sites.google.com/tgfone.com/shift-f2-bc/shift';
              
  var settingSheet = ss.getSheetByName('Setting');
  var botToken = (settingSheet && settingSheet.getRange('B2').getValue()) || '8433395449:AAFJWzKSxgqAAKzOuRlRW1rUVd11uZFKhb4'; 
  var chatId = (settingSheet && settingSheet.getRange('C2').getValue()) || '-4922095959'; 
 
  sendTelegramNotification(botToken, chatId, message);
  
  return true;
}

function getAdminSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settingSheet = ss.getSheetByName('Setting');
  var detailSheet = ss.getSheetByName('Detail');
  var locationSheet = ss.getSheetByName('Location');
  var mailSheet = ss.getSheetByName('Mail');

  var botToken1 = settingSheet ? settingSheet.getRange('B2').getValue() : "";
  var chatId1 = settingSheet ? settingSheet.getRange('C2').getValue() : "";
  var botToken2 = settingSheet ? settingSheet.getRange('B3').getValue() : "";
  var chatId2 = settingSheet ? settingSheet.getRange('C3').getValue() : "";

  var topics = [];
  if (detailSheet) {
    var lastRowD = detailSheet.getLastRow();
    if(lastRowD > 1) {
      var dData = detailSheet.getRange(2, 1, lastRowD - 1, 1).getDisplayValues();
      topics = dData.map(function(r) { return r[0]; }).filter(String);
    }
  }

  var branches = [];
  if (locationSheet) {
    var lastRowL = locationSheet.getLastRow();
    if(lastRowL > 1) {
      var lData = locationSheet.getRange(2, 1, lastRowL - 1, 1).getDisplayValues();
      branches = lData.map(function(r) { return r[0]; }).filter(String);
    }
  }

  var emails = [];
  if (mailSheet) {
    var lastRowM = mailSheet.getLastRow();
    if(lastRowM > 1) {
      var mData = mailSheet.getRange(2, 1, lastRowM - 1, 2).getDisplayValues();
      emails = mData.map(function(r) { return { to: r[0] || "", cc: r[1] || "" }; }).filter(function(e) { return e.to !== "" || e.cc !== ""; });
    }
  }

  return {
    botToken1: botToken1,
    chatId1: chatId1,
    botToken2: botToken2,
    chatId2: chatId2,
    topics: topics.join('\n'),
    branches: branches.join('\n'),
    emails: emails
  };
}

function saveAdminSettings(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Save Settings
  var settingSheet = ss.getSheetByName('Setting');
  if (!settingSheet) {
    settingSheet = ss.insertSheet('Setting');
  }
  settingSheet.getRange('B2').setValue(data.botToken1);
  settingSheet.getRange('C2').setValue(data.chatId1);
  settingSheet.getRange('B3').setValue(data.botToken2);
  settingSheet.getRange('C3').setValue(data.chatId2);

  // Save Topics
  var detailSheet = ss.getSheetByName('Detail');
  if (!detailSheet) {
    detailSheet = ss.insertSheet('Detail');
    detailSheet.getRange('A1').setValue('หัวข้อ');
  }
  var topics = data.topics.split('\n').map(function(t) { return t.trim(); }).filter(String);
  if(detailSheet.getLastRow() > 1) {
    detailSheet.getRange(2, 1, detailSheet.getLastRow() - 1, 1).clearContent();
  }
  if(topics.length > 0) {
    var tArray = topics.map(function(t) { return [t]; });
    detailSheet.getRange(2, 1, tArray.length, 1).setValues(tArray);
  }

  // Save Branches
  var locationSheet = ss.getSheetByName('Location');
  if (!locationSheet) {
    locationSheet = ss.insertSheet('Location');
    locationSheet.getRange('A1').setValue('สาขา');
  }
  var branches = data.branches.split('\n').map(function(t) { return t.trim(); }).filter(String);
  if(locationSheet.getLastRow() > 1) {
    locationSheet.getRange(2, 1, locationSheet.getLastRow() - 1, 1).clearContent();
  }
  if(branches.length > 0) {
    var bArray = branches.map(function(b) { return [b]; });
    locationSheet.getRange(2, 1, bArray.length, 1).setValues(bArray);
  }

  // Save Emails
  var mailSheet = ss.getSheetByName('Mail');
  if (!mailSheet) {
    mailSheet = ss.insertSheet('Mail');
    mailSheet.getRange('A1:B1').setValues([['To', 'CC']]);
  }
  if(mailSheet.getLastRow() > 1) {
    mailSheet.getRange(2, 1, mailSheet.getLastRow() - 1, 2).clearContent();
  }
  if(data.emails && data.emails.length > 0) {
    var eArray = data.emails.map(function(e) { return [e.to, e.cc]; });
    mailSheet.getRange(2, 1, eArray.length, 2).setValues(eArray);
  }

  return true;
}

function getUsers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var userSheet = ss.getSheetByName('Users');
  if (!userSheet) return [];
  
  var lastRow = userSheet.getLastRow();
  if (lastRow <= 1) return [];
  
  var data = userSheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  var users = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) {
      users.push({
        username: data[i][0],
        password: data[i][1],
        name: data[i][2],
        role: data[i][3]
      });
    }
  }
  return users;
}

function saveUser(user, isNew) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var userSheet = ss.getSheetByName('Users');
  if (!userSheet) {
    userSheet = ss.insertSheet('Users');
    userSheet.appendRow(['Username', 'Password', 'Name', 'Role']);
  }
  
  var data = userSheet.getDataRange().getValues();
  
  // Find if username already exists
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === user.username) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (isNew && rowIndex !== -1) {
    throw new Error('มีชื่อผู้ใช้งาน (Username) นี้อยู่ในระบบแล้ว');
  }
  
  if (rowIndex !== -1) {
    // Update
    userSheet.getRange(rowIndex, 2, 1, 3).setValues([[user.password, user.name, user.role]]);
  } else {
    // Add new
    userSheet.appendRow([user.username, user.password, user.name, user.role]);
  }
  return true;
}

function deleteUser(username) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var userSheet = ss.getSheetByName('Users');
  if (!userSheet) return false;
  
  var data = userSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      userSheet.deleteRow(i + 1);
      return true;
    }
  }
  throw new Error('ไม่พบชื่อผู้ใช้งานนี้ในระบบ');
}
