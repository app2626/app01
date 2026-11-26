// Identity document and phone number rules (server side; api.html mirrors them for the form).

var ID_TYPES_ = { THAI: 'บัตรประชาชน', PASSPORT: 'พาสปอร์ต' };

/** Thai national ID: 13 digits; digit 13 = (11 − Σ dᵢ·(13−i) mod 11) mod 10. Dashes/spaces allowed on input. */
function thaiIdNo_(v) {
  var s = String(v == null ? '' : v).replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(s)) return '';
  var sum = 0;
  for (var i = 0; i < 12; i++) sum += Number(s.charAt(i)) * (13 - i);
  return (11 - sum % 11) % 10 === Number(s.charAt(12)) ? s : '';
}

/** Passport number (ICAO 9303 document number): letters A-Z and digits, 6-9 characters. Upper-cased. */
function passportNo_(v) {
  var s = String(v == null ? '' : v).replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{6,9}$/.test(s) ? s : '';
}

/**
 * Phone in E.164 spirit. Returns the normalised number or '' when invalid:
 *  - Thai mobile 0[689]xxxxxxxx (10 digits), Thai landline 0[2-7]xxxxxxx (9 digits)
 *  - +66… is converted to the local 0… form
 *  - other countries: + country code + number, 8-15 digits in total (E.164 maximum is 15)
 * Spaces, dashes, dots and parentheses are ignored.
 */
function normalizePhone_(v) {
  var s = String(v == null ? '' : v).replace(/[\s\-().]/g, '');
  if (/^\+66\d{8,9}$/.test(s)) s = '0' + s.slice(3);
  if (/^0[689]\d{8}$/.test(s) || /^0[2-7]\d{7}$/.test(s)) return s;
  if (/^\+[1-9]\d{7,14}$/.test(s) && s.indexOf('+66') !== 0) return s;
  return '';
}

var PHONE_RULE_TEXT_ = 'มือถือ 10 หลัก (06/08/09), เบอร์บ้าน 9 หลัก (02-07) หรือเบอร์ต่างประเทศขึ้นต้นด้วย +รหัสประเทศ';
