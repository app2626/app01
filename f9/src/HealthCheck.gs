/**
 * Health‑check function that can be called with `clasp run healthCheck`.
 * It returns a JSON object summarising key parts of the system:
 *   - Settings keys present
 *   - Number of products loaded
 *   - Whether all required spec columns exist in the Products sheet
 */
function healthCheck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = getKeyValueSettings(ss);
  const productSheet = ss.getSheetByName('Products');
  const header = productSheet.getRange(1,1,1,productSheet.getLastColumn()).getValues()[0];
  const requiredSpec = ['Display','Processor','RAM','Rear Camera','Front Camera','Battery','OS','Connectivity','Warranty'];
  const missing = requiredSpec.filter(col => header.indexOf(col) === -1);
  const products = getTableDataAsJson(productSheet);
  return {
    settingsKeys: Object.keys(settings),
    productCount: products.length,
    missingSpecColumns: missing,
    status: missing.length === 0 ? 'OK' : 'MISSING_SPEC'
  };
}
