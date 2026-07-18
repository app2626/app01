function sendTelegramNotification(botToken, chatId, message) {
  if (!botToken || !chatId) {
    console.log('ข้ามการส่งแจ้งเตือน: ไม่พบ Bot Token หรือ Chat ID');
    return;
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: message,
    // parse_mode: 'Markdown' // ใช้ Markdown เพื่อจัดข้อความ
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };

  try {
    UrlFetchApp.fetch(url, options);
    console.log('ส่งข้อความแจ้งเตือนสำเร็จ');
  } catch (error) {
    console.error('เกิดข้อผิดพลาดในการส่งข้อความแจ้งเตือน:', error);
  }
}
