import { useEffect, useState } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import DataTable from './components/DataTable.jsx';
import RecordFormModal from './components/RecordFormModal.jsx';
import { useSheetData } from './hooks/useSheetData.js';
import { api, getStoredUser, getToken, isTokenExpired, onSessionExpired, setStoredUser, setToken } from './lib/api.js';
import ChangePasswordModal from './components/ChangePasswordModal.jsx';
import Swal from 'sweetalert2';

const SHEETS = [
  { key: 'PriceSet', label: 'PriceSet' },
  { key: 'Code ส่วนลด', label: 'Code ส่วนลด', readOnly: true },
  { key: 'Cost', label: 'Cost' },
];

function SheetPanel({ sheetName, canWrite, readOnly }) {
  const {
    schema,
    filterFields,
    filterOptions,
    filters,
    setFilter,
    rows,
    total,
    page,
    setPage,
    pageSize,
    search,
    setSearch,
    sort,
    setSort,
    loading,
    error,
    reload,
  } = useSheetData(sheetName);
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

  useEffect(() => {
    if (!schema || loading) {
      Swal.fire({
        title: !schema ? 'กำลังโหลดโครงสร้างข้อมูล...' : 'กำลังโหลดข้อมูล...',
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
    } else {
      setTimeout(() => Swal.close(), 100);
    }
  }, [schema, loading]);

  if (!schema) {
    return null;
  }

  return (
    <>
      <DataTable
        schema={schema}
        filterFields={filterFields}
        filterOptions={filterOptions}
        filters={filters}
        onFilterChange={setFilter}
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
        readOnly={readOnly}
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
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionMessage, setSessionMessage] = useState('');
  const [activeSheet, setActiveSheet] = useState('PriceSet');
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Restore login across page refreshes — the token in sessionStorage is still
  // valid for up to 12h, only the in-memory `user` state was lost on reload.
  // Every real API call is still re-checked server-side, so this is UX-only.
  useEffect(() => {
    const token = getToken();
    const storedUser = getStoredUser();
    if (token && storedUser && !isTokenExpired(token)) {
      setUser(storedUser);
    } else {
      setToken('');
      setStoredUser(null);
    }
    setCheckingSession(false);
  }, []);

  useEffect(() => {
    onSessionExpired((message) => {
      setUser(null);
      setSessionMessage(message || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    });
    return () => onSessionExpired(null);
  }, []);

  function handleLogin(loggedInUser) {
    setSessionMessage('');
    setUser(loggedInUser);
  }

  if (checkingSession) {
    return null;
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} message={sessionMessage} />;
  }

  const canWrite = user.Role === 'Admin';

  function handleLogout() {
    setToken('');
    setStoredUser(null);
    setUser(null);
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <header className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="w-full px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-white">Cost / PriceSet Manager</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.Username} · {user.Role === 'Admin' ? 'สิทธิ์แก้ไข' : 'สิทธิ์ดูอย่างเดียว'}
            </p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setShowChangePassword(true)} className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              เปลี่ยนรหัสผ่าน
            </button>
            <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              ออกจากระบบ
            </button>
          </div>
        </div>
        <div className="w-full px-4 flex gap-1">
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
      <main className="flex-1 w-full px-2 sm:px-4 py-4 overflow-hidden flex flex-col">
        <SheetPanel
          key={activeSheet}
          sheetName={activeSheet}
          canWrite={canWrite}
          readOnly={SHEETS.find((s) => s.key === activeSheet)?.readOnly}
        />
      </main>
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
