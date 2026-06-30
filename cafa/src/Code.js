const getSS = () => SpreadsheetApp.getActiveSpreadsheet();
const getSheet = (name) => getSS().getSheetByName(name);

/**
 * ช่วยค้นหา Index ของคอลัมน์จากชื่อหัวตาราง (รองรับหลายชื่อ และมีค่าเริ่มต้น)
 */
function findColumnIdx(headers, possibleNames, defaultIdx) {
  if (!headers) return defaultIdx;
  for (let name of possibleNames) {
    let idx = headers.indexOf(name);
    if (idx > -1) return idx;
  }
  return defaultIdx;
}

/**
 * แปลง Link Google Drive ให้เป็น Direct Link สำหรับแสดงผลรูปภาพ
 */
function getDirectLink(url) {
  if (!url) return "";
  url = url.toString().trim();
  if (url.indexOf("drive.google.com") > -1) {
    let fileId = "";
    if (url.indexOf("id=") > -1) {
      fileId = url.split("id=")[1].split("&")[0];
    } else {
      let parts = url.split("/");
      let dIdx = parts.indexOf("d");
      if (dIdx > -1 && parts[dIdx + 1]) {
        fileId = parts[dIdx + 1];
      }
    }
    return fileId ? "https://lh3.googleusercontent.com/d/" + fileId : url;
  }
  return url;
}

// --- 1. SETUP & ROUTING ---
function doGet(e) {
  let template = HtmlService.createTemplateFromFile('Index');
  template.navbarButtons = getNavbarButtons();
  template.availableTables = getAvailableTables();
  
  return template.evaluate()
    .setTitle("Café น้องน้ำออย")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ฟังก์ชันสำหรับตั้งค่าชีตและหัวตารางเริ่มต้น
 */
function setupProject() {
  const ss = getSS();
  const sheets = {
    "MenuItems": ["Name", "Description", "Price", "ExtraPrice", "Category", "ImageUrl", "Status", "TrackSales"],
    "Orders": ["Timestamp", "OrderNumber", "CustomerName", "CustomerPhone", "ItemName", "ItemNote", "Quantity", "PricePerItem", "DiscountName", "DiscountValue", "ItemSubtotal", "TotalPrice", "Status", "OrderGrandTotal", "PaymentMethod", "CashReceived", "ChangeGiven", "ProofImageURL"],
    "NavbarButtons": ["Name", "Icon"],
    "Tables": ["TableName", "Status"],
    "Discounts": ["Name", "Value"]
  };

  for (let sheetName in sheets) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(sheets[sheetName]);
      sheet.getRange(1, 1, 1, sheets[sheetName].length).setFontWeight("bold").setBackground("#f3f3f3");
    }
  }
  
  // เพิ่มข้อมูลเริ่มต้นสำหรับ Navbar ถ้ายังไม่มี
  const navS = ss.getSheetByName("NavbarButtons");
  if (navS && navS.getLastRow() === 1) {
    navS.appendRow(["Order", "restaurant_menu"]);
    navS.appendRow(["Order Status", "receipt_long"]);
    navS.appendRow(["จัดการเมนู", "edit_note"]);
    navS.appendRow(["Admin", "dashboard"]);
  }
  
  // เพิ่มข้อมูลเริ่มต้นสำหรับ Tables
  const tableS = ss.getSheetByName("Tables");
  if (tableS && tableS.getLastRow() === 1) {
    tableS.appendRow(["โต๊ะ 1", "Available"]);
    tableS.appendRow(["โต๊ะ 2", "Available"]);
    tableS.appendRow(["โต๊ะ 3", "Available"]);
    tableS.appendRow(["Takeaway", "Available"]);
  }

  // เพิ่มข้อมูลเริ่มต้นสำหรับ Discounts
  const discS = ss.getSheetByName("Discounts");
  if (discS && discS.getLastRow() === 1) {
    discS.appendRow(["ไม่มีส่วนลด", "0"]);
    discS.appendRow(["ส่วนลด 10%", "10"]);
  }

  return "ตั้งค่าระบบเรียบร้อยแล้ว";
}

// --- 2. MENU & UI DATA ---
function getNavbarButtons() {
  try {
    const navSheet = getSheet("NavbarButtons");
    if (!navSheet) return [{name: "Order", icon: "restaurant_menu"}, {name: "Order Status", icon: "receipt_long"}, {name: "จัดการเมนู", icon: "edit_note"}, {name: "Admin", icon: "dashboard"}];
    const data = navSheet.getDataRange().getValues();
    if (data.length <= 1) return [{name: "Order", icon: "restaurant_menu"}, {name: "Order Status", icon: "receipt_long"}, {name: "จัดการเมนู", icon: "edit_note"}, {name: "Admin", icon: "dashboard"}];
    
    const headers = data[0];
    const nameIdx = findColumnIdx(headers, ["Name", "ชื่อ"], 0);
    const iconIdx = findColumnIdx(headers, ["Icon", "ไอคอน"], 1);

    data.shift();
    return data.map(row => ({ name: row[nameIdx], icon: row[iconIdx] }));
  } catch(e) { return [{name: "Order", icon: "restaurant_menu"}, {name: "Order Status", icon: "receipt_long"}, {name: "จัดการเมนู", icon: "edit_note"}, {name: "Admin", icon: "dashboard"}]; }
}

function getMenuItems() {
  try {
    const menuSheet = getSheet("MenuItems");
    if (!menuSheet) throw new Error("ไม่พบชีต 'MenuItems'");
    const data = menuSheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    
    const headers = data[0];
    const nameIdx = findColumnIdx(headers, ["Name", "ชื่อ", "ชื่อเมนู"], 0);
    const descIdx = findColumnIdx(headers, ["Description", "รายละเอียด"], 1);
    const priceIdx = findColumnIdx(headers, ["Price", "ราคา"], 2);
    const extraIdx = findColumnIdx(headers, ["ExtraPrice", "ราคาพิเศษ"], 3);
    const catIdx = findColumnIdx(headers, ["Category", "หมวดหมู่"], 4);
    const imgIdx = findColumnIdx(headers, ["ImageUrl", "Image", "รูป", "ลิงก์รูป", "Link รูป"], 5);
    const statusIdx = findColumnIdx(headers, ["Status", "สถานะ"], 6);
    const trackIdx = findColumnIdx(headers, ["TrackSales", "ติดตามยอดขาย"], 7);

    data.shift();
    return data.map((row, index) => {
      let price = parseFloat(row[priceIdx]);
      if (isNaN(price)) price = 0;
      let extraPrice = (row[extraIdx] !== "" && !isNaN(row[extraIdx])) ? parseFloat(row[extraIdx]) : null;

      return {
        name: row[nameIdx] ? row[nameIdx].toString().trim() : "ไม่มีชื่อ (แถว " + (index+2) + ")",
        description: row[descIdx] ? row[descIdx].toString() : "",
        price: price,
        extraPrice: extraPrice,
        category: row[catIdx] ? row[catIdx].toString().trim() : "Uncategorized",
        imageUrl: getDirectLink(row[imgIdx]),
        status: row[statusIdx] ? row[statusIdx].toString().trim() : 'Available',
        trackSales: row[trackIdx] ? row[trackIdx].toString().trim().toLowerCase() === 'yes' : false
      };
    }).filter(item => item.name !== "");
  } catch (e) {
    Logger.log("Error in getMenuItems: " + e.toString());
    throw new Error(e.message);
  }
}

// --- 3. TABLE MANAGEMENT ---
function updateTableStatus(tableName, newStatus) {
  try {
    const tableSheet = getSheet("Tables");
    if (!tableSheet) return;
    const tableData = tableSheet.getDataRange().getValues();
    const headers = tableData[0];
    const nameIdx = findColumnIdx(headers, ["TableName", "ชื่อโต๊ะ"], 0);
    const statusIdx = findColumnIdx(headers, ["Status", "สถานะ"], 1);

    for (let i = 1; i < tableData.length; i++) {
      if (tableData[i][nameIdx] !== "" && tableData[i][nameIdx].toString().trim().toLowerCase() === tableName.toString().trim().toLowerCase()) {
        tableSheet.getRange(i + 1, statusIdx + 1).setValue(newStatus);
        break; 
      }
    }
  } catch (e) {
    Logger.log("Error in updateTableStatus: " + e.message);
  }
}

function getAvailableTables() {
  try {
    const tableSheet = getSheet("Tables");
    if (!tableSheet) return ["Takeaway"];
    const allTables = tableSheet.getDataRange().getValues();
    const headers = allTables[0];
    const nameIdx = findColumnIdx(headers, ["TableName", "ชื่อโต๊ะ"], 0);
    const statusIdx = findColumnIdx(headers, ["Status", "สถานะ"], 1);

    allTables.shift();
    const available = allTables.filter(row => {
      if (!row[nameIdx]) return false;
      const tableName = row[nameIdx].toString().trim();
      const status = row[statusIdx] ? row[statusIdx].toString().trim() : "";
      return status.toLowerCase() === 'available' || tableName.toLowerCase().includes('takeaway');
    });
    const result = available.map(row => row[nameIdx].toString().trim());
    return result.length > 0 ? result : ["Takeaway"];
  } catch(e) { 
    return ["Takeaway"]; 
  }
}

// --- 4. ORDER PROCESSING ---
function processOrder(orderDetails) {
  try {
    const { customerName, customerPhone, items, discount } = orderDetails;
    const timestamp = new Date();
    const status = "Waiting";
    const scriptTimeZone = Session.getScriptTimeZone();
    const formattedDate = Utilities.formatDate(timestamp, scriptTimeZone, "yyMMddHHmmss");
    const orderNumber = "ORD-" + formattedDate;

    const orderSheet = getSheet("Orders");
    const headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
    
    const getIdx = (possibleNames, defaultIdx) => findColumnIdx(headers, possibleNames, defaultIdx);

    let orderGrandTotal = 0;
    items.forEach(item => {
      const sub = item.price * item.quantity;
      orderGrandTotal += sub;
    });
    
    if (discount && discount.value > 0) {
      orderGrandTotal = orderGrandTotal * (1 - discount.value);
    }

    const newRows = items.map(item => {
      const itemSubtotal = item.price * item.quantity;
      const finalPrice = (discount && discount.value > 0) ? itemSubtotal * (1 - discount.value) : itemSubtotal;
      
      const newRow = new Array(headers.length).fill("");
      newRow[getIdx(["Timestamp", "ประทับเวลา"], 0)] = timestamp;
      newRow[getIdx(["OrderNumber", "เลขที่ออเดอร์"], 1)] = orderNumber;
      newRow[getIdx(["CustomerName", "ชื่อลูกค้า"], 2)] = customerName;
      newRow[getIdx(["CustomerPhone", "เบอร์ติดต่อ", "เบอร์โทร"], 3)] = customerPhone;
      newRow[getIdx(["ItemName", "ชื่อรายการ"], 4)] = item.name;
      newRow[getIdx(["ItemNote", "โน้ต"], 5)] = item.note || "";
      newRow[getIdx(["Quantity", "จำนวน"], 6)] = item.quantity;
      newRow[getIdx(["PricePerItem", "ราคาต่อชิ้น"], 7)] = item.price;
      newRow[getIdx(["DiscountName", "ชื่อส่วนลด"], 8)] = discount ? discount.name : "";
      newRow[getIdx(["DiscountValue", "มูลค่าส่วนลด"], 9)] = discount ? discount.value : "";
      newRow[getIdx(["ItemSubtotal", "ยอดรวมรายการ"], 10)] = itemSubtotal;
      newRow[getIdx(["TotalPrice", "ยอดสุทธิรายการ"], 11)] = finalPrice;
      newRow[getIdx(["Status", "สถานะ"], 12)] = status;
      newRow[getIdx(["OrderGrandTotal", "ยอดรวมทั้งสิ้น"], 13)] = orderGrandTotal;
      return newRow;
    });

    if (newRows.length > 0) {
      orderSheet.getRange(orderSheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
    }

    return { success: true, orderNumber: orderNumber };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// --- 5. PAYMENT & STATUS ---
function processPayment(paymentDetails) {
  try {
    const { orderNumber, paymentMethod, cashReceived, changeGiven, imageData } = paymentDetails;
    const newStatus = "Paid";
    let imageURL = "";
    
    if (paymentMethod === 'Transfer' && imageData) {
      let folder;
      const folders = DriveApp.getFoldersByName("PaymentSlips");
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder("PaymentSlips");
      }
      
      try {
        const decodedImage = Utilities.base64Decode(imageData.split(',')[1]);
        const blob = Utilities.newBlob(decodedImage, MimeType.PNG, `${orderNumber}-proof.png`);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imageURL = getDirectLink(file.getUrl());
      } catch(err) {
        Logger.log("Drive Error: " + err.message);
      }
    }

    const orderSheet = getSheet("Orders");
    const ordersData = orderSheet.getDataRange().getValues();
    const headers = ordersData[0];
    const getIdx = (possibleNames, defaultIdx) => findColumnIdx(headers, possibleNames, defaultIdx);

    const orderNumIdx = getIdx(["OrderNumber", "เลขที่ออเดอร์"], 1);
    const statusIdx = getIdx(["Status", "สถานะ"], 12);
    const payMethodIdx = getIdx(["PaymentMethod", "ช่องทางชำระเงิน"], 14);
    const cashIdx = getIdx(["CashReceived", "เงินรับมา"], 15);
    const changeIdx = getIdx(["ChangeGiven", "เงินทอน"], 16);
    const proofIdx = getIdx(["ProofImageURL", "รูปหลักฐาน"], 17);

    let found = false;
    for (let i = 1; i < ordersData.length; i++) {
      if (ordersData[i][orderNumIdx] === orderNumber) {
        const row = i + 1;
        orderSheet.getRange(row, statusIdx + 1).setValue(newStatus);
        if (payMethodIdx > -1) orderSheet.getRange(row, payMethodIdx + 1).setValue(paymentMethod);
        if (cashIdx > -1) orderSheet.getRange(row, cashIdx + 1).setValue(cashReceived || 0);
        if (changeIdx > -1) orderSheet.getRange(row, changeIdx + 1).setValue(changeGiven || 0);
        if (proofIdx > -1) orderSheet.getRange(row, proofIdx + 1).setValue(imageURL);
        found = true;
      }
    }

    return { success: true, orderNumber: orderNumber };
  } catch (e) { return { success: false, message: e.message }; }
}

// --- 6. DASHBOARD & HISTORY ---
function getDashboardData(reportType = 'last_days', value = 7) {
  try {
    const menuItemsData = getMenuItems();
    const trackableItemNames = new Set(menuItemsData.filter(item => item.trackSales).map(item => item.name));
    const orderSheet = getSheet("Orders");
    if (!orderSheet) return { success: false, message: "ไม่พบชีต Orders" };
    const orderData = orderSheet.getDataRange().getValues();
    const headers = orderData[0];
    const getIdx = (possibleNames, defaultIdx) => findColumnIdx(headers, possibleNames, defaultIdx);

    const statusIdx = getIdx(["Status", "สถานะ"], 12);
    const orderNumIdx = getIdx(["OrderNumber", "เลขที่ออเดอร์"], 1);
    const totalIdx = getIdx(["OrderGrandTotal", "ยอดรวมทั้งสิ้น"], 13);
    const tsIdx = getIdx(["Timestamp", "ประทับเวลา"], 0);
    const nameIdx = getIdx(["ItemName", "ชื่อรายการ"], 4);
    const qtyIdx = getIdx(["Quantity", "จำนวน"], 6);

    orderData.shift();
    
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
    const currentMonthStr = Utilities.formatDate(now, tz, "yyyy-MM");
    
    const currentQuarter = Math.floor((now.getMonth() + 3) / 3);
    const currentYear = now.getFullYear();

    let dailySales = 0, monthlySales = 0, quarterlySales = 0;
    const itemSales = {}, salesByDay = {};
    const processedOrders = new Set();
    
    let reportTitle = "ยอดขาย 7 วันย้อนหลัง";
    let startDate = new Date();
    
    if (reportType === 'last_days') {
      startDate.setDate(now.getDate() - parseInt(value));
      reportTitle = `ยอดขาย ${value} วันย้อนหลัง`;
    } else if (reportType === 'by_month') {
      reportTitle = `ยอดขายประจำเดือน ${value}`;
    }

    orderData.forEach(row => {
      const status = row[statusIdx];
      if (status === 'Cancelled') return;

      const orderNum = row[orderNumIdx];
      const grandTotal = parseFloat(row[totalIdx] || 0);
      const dateObj = new Date(row[tsIdx]);
      
      if (isNaN(dateObj.getTime())) return;
      
      const rowDateStr = Utilities.formatDate(dateObj, tz, "yyyy-MM-dd");
      const rowMonthStr = Utilities.formatDate(dateObj, tz, "yyyy-MM");
      const rowYear = dateObj.getFullYear();
      const rowQuarter = Math.floor((dateObj.getMonth() + 3) / 3);

      if (!processedOrders.has(orderNum)) {
        if (rowDateStr === todayStr) dailySales += grandTotal;
        if (rowMonthStr === currentMonthStr) monthlySales += grandTotal;
        if (rowYear === currentYear && rowQuarter === currentQuarter) quarterlySales += grandTotal;
        
        let includeInChart = false;
        if (reportType === 'last_days') {
          if (dateObj >= startDate) includeInChart = true;
        } else if (reportType === 'by_month') {
          if (rowMonthStr === value) includeInChart = true;
        }

        if (includeInChart) {
          salesByDay[rowDateStr] = (salesByDay[rowDateStr] || 0) + grandTotal;
        }
        
        processedOrders.add(orderNum);
      }

      const itemName = row[nameIdx];
      let baseName = itemName ? itemName.split(' (')[0] : ""; 
      if (trackableItemNames.has(baseName)) {
        const qty = parseInt(row[qtyIdx] || 0);
        itemSales[baseName] = (itemSales[baseName] || 0) + qty;
      }
    });

    return { 
      success: true, 
      dailySales, 
      monthlySales, 
      quarterlySales,
      reportTitle,
      topSellingItems: Object.entries(itemSales).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name, quantity]) => ({ name, quantity })),
      salesByDay
    };
  } catch (e) { return { success: false, message: e.toString() }; }
}

function updateOrderStatus(orderNumber, newStatus) {
  try {
    const orderSheet = getSheet("Orders");
    const ordersData = orderSheet.getDataRange().getValues();
    const headers = ordersData[0];
    const orderNumIdx = findColumnIdx(headers, ["OrderNumber", "เลขที่ออเดอร์"], 1);
    const statusIdx = findColumnIdx(headers, ["Status", "สถานะ"], 12);
    const tableIdx = findColumnIdx(headers, ["TableNumber", "เลขโต๊ะ"], 3);
    
    let tableToClear = null;
    let found = false;
    for (let i = 1; i < ordersData.length; i++) {
      if (ordersData[i][orderNumIdx] === orderNumber) {
        orderSheet.getRange(i + 1, statusIdx + 1).setValue(newStatus);
        tableToClear = ordersData[i][tableIdx];
        found = true;
      }
    }
    
    if (found && newStatus === 'Paid' && tableToClear && tableToClear.toString().toLowerCase() !== 'takeaway') {
      updateTableStatus(tableToClear, 'Available');
    }
    
    return { success: true, orderNumber: orderNumber, newStatus: newStatus };
  } catch (e) { return { success: false, message: e.message }; }
}

function cancelOrder(orderNumber) {
  try {
    const orderSheet = getSheet("Orders");
    const ordersData = orderSheet.getDataRange().getValues();
    const headers = ordersData[0];
    const orderNumIdx = findColumnIdx(headers, ["OrderNumber", "เลขที่ออเดอร์"], 1);
    const statusIdx = findColumnIdx(headers, ["Status", "สถานะ"], 12);
    const tableIdx = findColumnIdx(headers, ["TableNumber", "เลขโต๊ะ"], 3);
    
    let tableToClear = null;
    let found = false;
    for (let i = 1; i < ordersData.length; i++) {
      if (ordersData[i][orderNumIdx] === orderNumber) {
        orderSheet.getRange(i + 1, statusIdx + 1).setValue("Cancelled");
        tableToClear = ordersData[i][tableIdx];
        found = true;
      }
    }
    
    if (found && tableToClear && tableToClear.toString().toLowerCase() !== 'takeaway') {
      updateTableStatus(tableToClear, 'Available');
    }
    
    return { success: true, orderNumber: orderNumber };
  } catch (e) { return { success: false, message: e.message }; }
}

function getDiscounts() {
  try {
    const discountSheet = getSheet("Discounts");
    if (!discountSheet) return [];
    const data = discountSheet.getDataRange().getValues();
    const headers = data[0];
    const nameIdx = findColumnIdx(headers, ["Name", "ชื่อ"], 0);
    const valIdx = findColumnIdx(headers, ["Value", "มูลค่า"], 1);

    data.shift();
    return data.map(row => {
      let val = parseFloat(row[valIdx]);
      if (val > 1) val = val / 100; 
      return { name: row[nameIdx] ? row[nameIdx].toString().trim() : "", value: isNaN(val) ? 0 : val };
    }).filter(d => d.name !== "");
  } catch (e) { return []; }
}

// --- 7. ORDER HISTORY & POLLING ---

function getOrderHistory(dateString) {
  try {
    const orderSheet = getSheet("Orders");
    const data = orderSheet.getDataRange().getValues();
    const headers = data[0];
    const getIdx = (possibleNames, defaultIdx) => findColumnIdx(headers, possibleNames, defaultIdx);

    const tsIdx = getIdx(["Timestamp", "ประทับเวลา"], 0);
    const orderNumIdx = getIdx(["OrderNumber", "เลขที่ออเดอร์"], 1);
    const nameCustIdx = getIdx(["CustomerName", "ชื่อลูกค้า"], 2);
    const statusIdx = getIdx(["Status", "สถานะ"], 12);
    const totalIdx = getIdx(["OrderGrandTotal", "ยอดรวมทั้งสิ้น"], 13);
    const nameIdx = getIdx(["ItemName", "ชื่อรายการ"], 4);
    const noteIdx = getIdx(["ItemNote", "โน้ต"], 5);
    const qtyIdx = getIdx(["Quantity", "จำนวน"], 6);

    data.shift();
    
    const tz = Session.getScriptTimeZone();
    const targetDate = dateString; 
    
    const groupedOrders = {};

    data.forEach(row => {
      const timestamp = row[tsIdx];
      if (!(timestamp instanceof Date)) return;
      
      const rowDateStr = Utilities.formatDate(timestamp, tz, "yyyy-MM-dd");
      if (rowDateStr !== targetDate) return;

      const orderNum = row[orderNumIdx];
      if (!groupedOrders[orderNum]) {
        groupedOrders[orderNum] = {
          orderNumber: orderNum,
          customerName: row[nameCustIdx],
          status: row[statusIdx],
          timestampForDisplay: Utilities.formatDate(timestamp, tz, "HH:mm"),
          isoTimestamp: timestamp.toISOString(),
          items: [],
          total: parseFloat(row[totalIdx] || 0)
        };
      }

      groupedOrders[orderNum].items.push({
        name: row[nameIdx],
        quantity: row[qtyIdx],
        note: row[noteIdx]
      });
    });

    return groupedOrders;
  } catch (e) {
    Logger.log("Error in getOrderHistory: " + e.toString());
    throw new Error("ไม่สามารถดึงข้อมูลออเดอร์ได้: " + e.message);
  }
}

function getNewOrders(latestTimestamp) {
  try {
    const orderSheet = getSheet("Orders");
    const data = orderSheet.getDataRange().getValues();
    const headers = data[0];
    const getIdx = (possibleNames, defaultIdx) => findColumnIdx(headers, possibleNames, defaultIdx);

    const tsIdx = getIdx(["Timestamp", "ประทับเวลา"], 0);
    const orderNumIdx = getIdx(["OrderNumber", "เลขที่ออเดอร์"], 1);
    const nameCustIdx = getIdx(["CustomerName", "ชื่อลูกค้า"], 2);
    const statusIdx = getIdx(["Status", "สถานะ"], 12);
    const nameIdx = getIdx(["ItemName", "ชื่อรายการ"], 4);
    const noteIdx = getIdx(["ItemNote", "โน้ต"], 5);
    const qtyIdx = getIdx(["Quantity", "จำนวน"], 6);

    data.shift();
    
    const lastTime = new Date(latestTimestamp);
    const newOrders = {};

    data.forEach(row => {
      const timestamp = row[tsIdx];
      if (!(timestamp instanceof Date) || timestamp <= lastTime) return;

      const orderNum = row[orderNumIdx];
      if (!newOrders[orderNum]) {
        newOrders[orderNum] = {
          orderNumber: orderNum,
          customerName: row[nameCustIdx],
          status: row[statusIdx],
          timestampForDisplay: Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "HH:mm"),
          isoTimestamp: timestamp.toISOString(),
          items: []
        };
      }
      newOrders[orderNum].items.push({
        name: row[nameIdx],
        quantity: row[qtyIdx],
        note: row[noteIdx]
      });
    });

    return newOrders;
  } catch (e) { return {}; }
}

function getOrderDetails(orderNumber) {
  try {
    const orderSheet = getSheet("Orders");
    const data = orderSheet.getDataRange().getValues();
    const headers = data[0];
    const getIdx = (possibleNames, defaultIdx) => findColumnIdx(headers, possibleNames, defaultIdx);

    const orderNumIdx = getIdx(["OrderNumber", "เลขที่ออเดอร์"], 1);
    const nameCustIdx = getIdx(["CustomerName", "ชื่อลูกค้า"], 2);
    const totalIdx = getIdx(["OrderGrandTotal", "ยอดรวมทั้งสิ้น"], 13);
    const subtotalIdx = getIdx(["ItemSubtotal", "ยอดรวมรายการ"], 10);
    const discValIdx = getIdx(["DiscountValue", "มูลค่าส่วนลด"], 9);
    const nameIdx = getIdx(["ItemName", "ชื่อรายการ"], 4);
    const qtyIdx = getIdx(["Quantity", "จำนวน"], 6);
    const priceIdx = getIdx(["PricePerItem", "ราคาต่อชิ้น"], 7);
    const noteIdx = getIdx(["ItemNote", "โน้ต"], 5);

    data.shift();
    
    const items = [];
    let details = {};

    data.forEach(row => {
      if (row[orderNumIdx] === orderNumber) {
        if (!details.orderNumber) {
          details = {
            orderNumber: orderNumber,
            customerName: row[nameCustIdx],
            subtotal: 0,
            discountAmount: 0,
            total: parseFloat(row[totalIdx] || 0)
          };
        }
        
        const itemSubtotal = parseFloat(row[subtotalIdx] || 0);
        details.subtotal += itemSubtotal;
        
        const discVal = parseFloat(row[discValIdx] || 0);
        if (discVal > 0) {
           details.discountAmount += (itemSubtotal * discVal);
        }

        items.push({
          name: row[nameIdx],
          quantity: row[qtyIdx],
          price: parseFloat(row[priceIdx] || 0),
          note: row[noteIdx]
        });
      }
    });
    
    details.items = items;
    return details;
  } catch (e) { 
    throw new Error(e.message); 
  }
}

function updateMenuItemStatus(itemName, newStatus) {
  try {
    const menuSheet = getSheet("MenuItems");
    const data = menuSheet.getDataRange().getValues();
    const headers = data[0];
    const nameIdx = findColumnIdx(headers, ["Name", "ชื่อ", "ชื่อเมนู"], 0);
    const statusIdx = findColumnIdx(headers, ["Status", "สถานะ"], 6);

    for (let i = 1; i < data.length; i++) {
      if (data[i][nameIdx].toString().trim() === itemName.toString().trim()) {
        menuSheet.getRange(i + 1, statusIdx + 1).setValue(newStatus);
        return { success: true, itemName: itemName, newStatus: newStatus };
      }
    }
    throw new Error("ไม่พบชื่อเมนูนี้ในระบบ");
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function saveMenuItem(itemData) {
  try {
    const menuSheet = getSheet("MenuItems");
    const data = menuSheet.getDataRange().getValues();
    const headers = data[0];
    const nameIdx = findColumnIdx(headers, ["Name", "ชื่อ", "ชื่อเมนู"], 0);
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][nameIdx].toString().trim() === itemData.name.trim()) {
        rowIndex = i + 1;
        break;
      }
    }

    const rowValues = [
      itemData.name,
      itemData.description,
      itemData.price,
      itemData.extraPrice,
      itemData.category,
      itemData.imageUrl,
      itemData.status || 'Available',
      itemData.trackSales ? 'Yes' : 'No'
    ];

    if (rowIndex > 0) {
      menuSheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      menuSheet.appendRow(rowValues);
    }
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function deleteMenuItem(itemName) {
  try {
    const menuSheet = getSheet("MenuItems");
    const data = menuSheet.getDataRange().getValues();
    const headers = data[0];
    const nameIdx = findColumnIdx(headers, ["Name", "ชื่อ", "ชื่อเมนู"], 0);

    for (let i = 1; i < data.length; i++) {
      if (data[i][nameIdx].toString().trim() === itemName.trim()) {
        menuSheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    throw new Error("ไม่พบเมนูที่ต้องการลบ");
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}