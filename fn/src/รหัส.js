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

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
