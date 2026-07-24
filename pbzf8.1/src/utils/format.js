export function formatTHB(amount) {
  return `฿${Math.round(amount).toLocaleString("th-TH")}`;
}

export function calcPoints(price, rate = 0.01) {
  return Math.round(price * rate);
}

const INSTALLMENT_BANKS = [
  { name: "KBANK", months: [6, 10] },
  { name: "KTC", months: [6, 10] },
  { name: "SCB", months: [6, 10] },
  { name: "BBL", months: [6, 10] }
];

export function calcInstallments(price, banks = INSTALLMENT_BANKS) {
  const rows = [];
  banks.forEach(bank => {
    (bank.months || []).forEach(m => {
      rows.push({ bank: bank.name, months: m, monthly: price / m });
    });
  });
  return rows;
}
