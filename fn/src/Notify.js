// Notifications: Telegram + email. Failures are logged, never thrown (the record is already saved).

var MAIL_LOW_ = 40;           // warn admins when this few emails are left today
var MAIL_RESERVE_ = 20;       // below this, only essential mail (password-reset codes) is sent
var MAIL_ALERT_TTL_ = 21600;  // at most one quota warning per 6 h

function escapeHtmlServer_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Telegram only. isApprove picks the approval bot/chat, otherwise the new-request one. */
function sendTelegram_(msg, isApprove, imageForTelegram) {
  var config = getConfig_();
  var botToken = isApprove ? config.notifyApproveToken : config.notifyNewToken;
  var chatId = isApprove ? config.notifyApproveChatId : config.notifyNewChatId;
  if (!botToken || !chatId) return;
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

/** Emails left today, or null when the quota cannot be read. */
function mailQuota_() {
  try { return MailApp.getRemainingDailyQuota(); } catch (e) { return null; }
}

function mailQuotaAlert_(left) {
  var cache = CacheService.getScriptCache();
  if (cache.get('mailq_alert')) return;
  cache.put('mailq_alert', '1', MAIL_ALERT_TTL_);
  sendTelegram_('⚠️ FN+ Consignment: โควตาอีเมลวันนี้เหลือ ' + left + ' ฉบับ' +
    (left <= 0 ? ' อีเมลทุกประเภทรวมถึงรหัสลืมรหัสผ่าน จะไม่ถูกส่งจนกว่าโควตาจะรีเซ็ต (ภายใน 24 ชม.)'
      : left <= MAIL_RESERVE_ ? ' อีเมลแจ้งเตือนหยุดส่งชั่วคราว เก็บโควตาที่เหลือไว้ให้รหัสลืมรหัสผ่าน (รีเซ็ตภายใน 24 ชม.)' : ''), false);
}

/**
 * Every email goes through here. Skips (returns false) instead of failing when today's quota is
 * used up, and warns admins on Telegram once when the quota is low or gone. The last
 * MAIL_RESERVE_ emails of the day are kept for essential mail, so notifications can never use up
 * the quota a locked-out user needs for a password-reset code.
 */
function sendMail_(opts, essential) {
  var recipients = String(opts.to || '').split(',').filter(String).length +
    (opts.cc ? String(opts.cc).split(',').filter(String).length : 0);
  if (!recipients) return false;
  var left = mailQuota_();
  var floor = essential ? 0 : MAIL_RESERVE_;
  if (left !== null && left - recipients < floor) {
    console.error('Mail quota exhausted (' + left + ' left): skipped "' + opts.subject + '"');
    mailQuotaAlert_(left);
    return false;
  }
  try {
    MailApp.sendEmail(opts);
  } catch (e) {
    console.error('Email Error: ' + e.message);
    return false;
  }
  if (left !== null && left - recipients <= MAIL_LOW_) mailQuotaAlert_(left - recipients);
  return true;
}

function sendNotify_(msg, isApprove, attachments, subjectTitle, imageForTelegram) {
  sendTelegram_(msg, isApprove, imageForTelegram);
  var config = getConfig_();
  if (config.emailTo) {
    var mailOptions = {
      to: config.emailTo.replace(/\s+/g, ''),
      subject: subjectTitle || (isApprove ? 'แจ้งเตือนการเปลี่ยนสถานะ' : 'แจ้งเตือนคำขอใหม่'),
      htmlBody: escapeHtmlServer_(msg).replace(/\n/g, '<br>')
    };
    if (config.emailCc) mailOptions.cc = config.emailCc.replace(/\s+/g, '');
    if (attachments && attachments.length) mailOptions.attachments = attachments;
    sendMail_(mailOptions);
  }
}

/** Plain-text email to one user (escaped, newlines kept). essential: may use the reserve. */
function mailUser_(to, subject, text, essential) {
  if (!to) return false;
  return sendMail_({ to: to, subject: subject, htmlBody: escapeHtmlServer_(text).replace(/\n/g, '<br>') }, !!essential);
}
