// Notifications: Telegram + email. Failures are logged, never thrown (the record is already saved).

function escapeHtmlServer_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sendNotify_(msg, isApprove, attachments, subjectTitle, imageForTelegram) {
  var config = getConfig_();
  var botToken = isApprove ? config.notifyApproveToken : config.notifyNewToken;
  var chatId = isApprove ? config.notifyApproveChatId : config.notifyNewChatId;

  if (botToken && chatId) {
    try {
      var base = 'https://api.telegram.org/bot' + botToken;
      if (imageForTelegram) {
        UrlFetchApp.fetch(base + '/sendPhoto', { method: 'post', payload: { chat_id: chatId, photo: imageForTelegram, caption: String(msg).slice(0, 1024) }, muteHttpExceptions: true });
      } else {
        UrlFetchApp.fetch(base + '/sendMessage', { method: 'post', payload: { chat_id: chatId, text: msg }, muteHttpExceptions: true });
      }
    } catch (e) {
      console.error('Telegram Error: ' + e.message);
    }
  }

  if (config.emailTo) {
    try {
      var mailOptions = {
        to: config.emailTo.replace(/\s+/g, ''),
        subject: subjectTitle || (isApprove ? 'แจ้งเตือนการเปลี่ยนสถานะ' : 'แจ้งเตือนคำขอใหม่'),
        htmlBody: escapeHtmlServer_(msg).replace(/\n/g, '<br>')
      };
      if (config.emailCc) mailOptions.cc = config.emailCc.replace(/\s+/g, '');
      if (attachments && attachments.length) mailOptions.attachments = attachments;
      MailApp.sendEmail(mailOptions);
    } catch (emailErr) {
      console.error('Email Error: ' + emailErr.message);
    }
  }
}
