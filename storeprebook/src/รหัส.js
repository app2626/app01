// var tokenID = "N3H91dxRpiIthXARDcVbumOiZIFkx8qWDL3QGgLrrdo" // idไลน์แจ้งเตือน

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
}

function include(filename){
  return HtmlService.createHtmlOutputFromFile(filename).getContent()
}

function getData(id){
  if(id == undefined){ id = 'HANDSET' }
  let ss = SpreadsheetApp.getActive().getSheetByName('data')
  let data = ss.getDataRange().getDisplayValues()
  let rowID = data.filter(r => r[0] == id)
  return rowID
}

function getData2(id){
  if(id == undefined){ id = 'คงค้าง' }
  let ss = SpreadsheetApp.getActive().getSheetByName('save')
  let data = ss.getDataRange().getDisplayValues()
  let rowID = data.filter(r => r[9] == id)
  return rowID
}

function saveData(cart, id_user, id_user2, id_user3, name_user) {
  const date = new Date()
  const result = date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('save');
  cart.forEach(r => {
    ss.appendRow([
      Date.now().toString(),
      result,
      r.id,
      r.name,
      r.count,
      id_user,
      name_user,
      id_user2,
      id_user3
    ])
  })
  // ลบการแจ้งเตือนออก (sendNotify)
}

function readId(idx) {
  let ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('save')
  let data = ss.getDataRange().getDisplayValues()
  let rowID = data.find(r => r[0] == idx)
  return rowID
}

function editAppData(obj){
  let ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('data')
  let data = ss.getDataRange().getDisplayValues()
  let rowID = data.findIndex(r => r[1] == obj.data1) + 1
  if(rowID > 0){
    ss.getRange(rowID, 4).setValue(obj.data3)
    ss.getRange(rowID, 5).setValue(obj.data4)
    ss.getRange(rowID, 9).setValue(obj.data5)
  }
}

function readIdUser(idx) {
  let ss3 = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('user')
  let data3 = ss3.getDataRange().getDisplayValues()
  let rowID3 = data3.find(r => r[0] == idx)
  return rowID3
}

function getUserList() {
  let ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('user');
  let data = ss.getDataRange().getDisplayValues();
  return data.slice(1); // ส่งข้อมูลทั้งหมดยกเว้นหัวตาราง
}

function readAdd(idx) {
  let ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('data')
  let data = ss.getDataRange().getDisplayValues()
  let rowID = data.find(r => r[1] == idx)
  return rowID
}

// ลบฟังก์ชัน sendNotify ออก
