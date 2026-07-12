import { useState } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import DataTable from './components/DataTable.jsx';
import RecordFormModal from './components/RecordFormModal.jsx';
import { useSheetData } from './hooks/useSheetData.js';
import { api, setToken } from './lib/api.js';

const SHEETS = [
  { key: 'Cost', label: 'Cost' },
  { key: 'PriceSet', label: 'PriceSet' },
];

function SheetPanel({ sheetName, canWrite }) {
  const { schema, rows, total, page, setPage, pageSize, search, setSearch, sort, setSort, loading, error, reload } =
    useSheetData(sheetName);
  const [modalRecord, setModalRecord] = useState(undefined);

  async function handleSave(record) {
    await api.saveRecord(sheetName, record);
    setModalRecord(undefined);
    reload();
  }

  async function handleDelete(row) {
    if (!window.confirm('ยืนยันการลบรายการนี้?')) return;
    await api.deleteRecord(sheetName, row.RowUID);
    reload();
  }

  if (!schema) {
    return <div className="text-slate-400 text-sm py-8 text-center">กำลังโหลดโครงสร้างข้อมูล...</div>;
  }

  return (
    <>
      <DataTable
        schema={schema}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        loading={loading}
        error={error}
        canWrite={canWrite}
        onAdd={() => setModalRecord({})}
        onEdit={(row) => setModalRecord(row)}
        onDelete={handleDelete}
      />
      {modalRecord !== undefined && (
        <RecordFormModal
          schema={schema}
          initialRecord={modalRecord}
          canWrite={canWrite}
          onSave={handleSave}
          onClose={() => setModalRecord(undefined)}
        />
      )}
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [activeSheet, setActiveSheet] = useState('Cost');

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  const canWrite = user.Role === 'Admin';

  function handleLogout() {
    setToken('');
    setUser(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-white">Cost / PriceSet Manager</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.Username} · {user.Role === 'Admin' ? 'สิทธิ์แก้ไข' : 'สิทธิ์ดูอย่างเดียว'}
            </p>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            ออกจากระบบ
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {SHEETS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSheet(s.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeSheet === s.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <SheetPanel key={activeSheet} sheetName={activeSheet} canWrite={canWrite} />
      </main>
    </div>
  );
}
