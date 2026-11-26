// FN+ Consignment — web app entry point. Server logic lives in Schema/Auth/Settings/Requests/Notify.js.

function doGet() {
  var out = HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('FN+ Consignment')
    .setFaviconUrl('https://i.postimg.cc/5tcXkv1h/Demo-(5).png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  // Opened from a home-screen icon: full screen, no browser bars. Each tag is optional, so a name
  // HtmlService refuses must never take the whole app down.
  [['mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-capable', 'yes'],
   ['apple-mobile-web-app-status-bar-style', 'default'], ['apple-mobile-web-app-title', 'FN+ Consignment']]
    .forEach(function (m) { try { out.addMetaTag(m[0], m[1]); } catch (e) { console.error('meta ' + m[0] + ': ' + e.message); } });
  return out;
}

function authorizeEmail() {
  // ฟังก์ชั่นนี้มีไว้เพื่อให้ Google ตรวจสอบสิทธิ์ในการส่งอีเมล
  MailApp.sendEmail(Session.getActiveUser().getEmail(), "ทดสอบสิทธิ์ FN+ Consignment", "คุณได้ให้สิทธิ์ระบบส่งอีเมลเรียบร้อยแล้ว");
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
