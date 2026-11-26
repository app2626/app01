// Audit trail: one row per change to accounts or settings, in the "Audit" sheet.
// Never throws: a failed audit write must not undo or block the change that already happened.

/** "Display name (username)" for a session user. */
function actorLabel_(user) {
  return user.name && user.name !== user.username ? user.name + ' (' + user.username + ')' : user.username;
}

/** actor: session user object or a plain string (self-service actions use the username). */
function audit_(actor, action, target, detail) {
  try {
    var who = typeof actor === 'string' ? actor : actorLabel_(actor);
    var sheet = ensureSheetByName_('Audit');
    sheet.appendRow([new Date(), cellText_(who), action, cellText_(target), cellText_(String(detail == null ? '' : detail).slice(0, 500))]);
  } catch (e) {
    console.error('Audit write failed: ' + e.message);
  }
}
