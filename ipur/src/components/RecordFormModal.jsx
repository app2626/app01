import { useState } from 'react';

function fieldInput(col, value, onChange) {
  const common =
    'w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:bg-slate-100 dark:disabled:bg-slate-800';

  if (!col.editable) {
    return <input className={common} value={value ?? ''} disabled readOnly />;
  }
  if (col.type === 'boolean') {
    return (
      <select className={common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
        <option value="">-</option>
        <option value="TRUE">TRUE</option>
        <option value="FALSE">FALSE</option>
      </select>
    );
  }
  if (col.type === 'select' && col.options && col.options.length) {
    return (
      <select className={common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">-</option>
        {col.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (col.type === 'number') {
    return <input type="number" step="any" className={common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  if (col.type === 'date') {
    return <input type="text" placeholder="dd/mm/yyyy" className={common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input className={common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

export default function RecordFormModal({ schema, initialRecord, onSave, onClose, canWrite }) {
  const [record, setRecord] = useState(() => ({ ...(initialRecord || {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isEdit = Boolean(initialRecord && initialRecord.RowUID);

  function setField(key, value) {
    setRecord((r) => ({ ...r, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSave(record);
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEdit ? 'แก้ไขข้อมูล' : 'เพิ่มข้อมูลใหม่'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          {!canWrite && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              บัญชีของคุณเป็นสิทธิ์ดูอย่างเดียว ไม่สามารถบันทึกการเปลี่ยนแปลงได้
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {schema
              .filter((col) => col.key !== 'RowUID')
              .map((col) => (
                <div key={col.key} className={col.type === 'text' && col.long ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {col.label}
                    {!col.editable && <span className="ml-1 text-slate-400">(คำนวณอัตโนมัติ)</span>}
                  </label>
                  {fieldInput(col, record[col.key], (v) => setField(col.key, v))}
                </div>
              ))}
          </div>
        </form>
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            type="button"
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy || !canWrite}
            className="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
          >
            {busy ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
