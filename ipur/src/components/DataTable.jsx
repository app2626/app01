import { useMemo } from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';

export default function DataTable({
  schema,
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  loading,
  error,
  canWrite,
  onAdd,
  onEdit,
  onDelete,
}) {
  const displayCols = useMemo(() => schema.filter((c) => c.primary), [schema]);

  const columns = useMemo(
    () => [
      ...displayCols.map((col) => ({
        id: col.key,
        header: col.label,
        accessorFn: (row) => row[col.key],
        cell: (info) => <span className={col.editable ? '' : 'text-slate-400 italic'}>{String(info.getValue() ?? '')}</span>,
      })),
      {
        id: '_actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex gap-2 justify-end">
            <button onClick={() => onEdit(row.original)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">
              แก้ไข
            </button>
            {canWrite && (
              <button onClick={() => onDelete(row.original)} className="text-red-600 hover:text-red-800 text-xs font-medium">
                ลบ
              </button>
            )}
          </div>
        ),
      },
    ],
    [displayCols, canWrite, onEdit, onDelete],
  );

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggleSort(colKey) {
    if (sort.key !== colKey) onSortChange({ key: colKey, dir: 'asc' });
    else onSortChange({ key: colKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ค้นหา..."
          className="w-full sm:w-72 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {canWrite && (
          <button onClick={onAdd} className="rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 shrink-0">
            + เพิ่มข้อมูล
          </button>
        )}
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={() => header.column.id !== '_actions' && toggleSort(header.column.id)}
                    className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap select-none cursor-pointer"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sort.key === header.column.id ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-900">
            {loading ? (
              <tr>
                <td colSpan={displayCols.length + 1} className="px-3 py-6 text-center text-slate-400">
                  กำลังโหลด...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={displayCols.length + 1} className="px-3 py-6 text-center text-slate-400">
                  ไม่พบข้อมูล
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 whitespace-nowrap text-slate-800 dark:text-slate-200">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>ทั้งหมด {total.toLocaleString()} รายการ</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 disabled:opacity-40"
          >
            ก่อนหน้า
          </button>
          <span>
            หน้า {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 disabled:opacity-40"
          >
            ถัดไป
          </button>
        </div>
      </div>
    </div>
  );
}
