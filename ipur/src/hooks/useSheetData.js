import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const PAGE_SIZE = 25;

export function useSheetData(sheetName) {
  const [schema, setSchema] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: '', dir: 'asc' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    setSchema(null);
    setPage(1);
    setSearch('');
    setSort({ key: '', dir: 'asc' });
    api.describeSheet(sheetName).then((res) => setSchema(res.columns)).catch((e) => setError(e.message));
  }, [sheetName]);

  const reload = useCallback(() => {
    const myRequest = ++requestId.current;
    setLoading(true);
    api
      .getRecords(sheetName, { search, page, pageSize: PAGE_SIZE, sortKey: sort.key, sortDir: sort.dir })
      .then((res) => {
        if (myRequest !== requestId.current) return;
        setRows(res.rows);
        setTotal(res.total);
        setError('');
      })
      .catch((e) => {
        if (myRequest !== requestId.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (myRequest !== requestId.current) return;
        setLoading(false);
      });
  }, [sheetName, search, page, sort]);

  useEffect(() => {
    if (!schema) return;
    reload();
  }, [schema, reload]);

  useEffect(() => {
    setPage(1);
  }, [search, sort]);

  return {
    schema,
    rows,
    total,
    page,
    setPage,
    pageSize: PAGE_SIZE,
    search,
    setSearch,
    sort,
    setSort,
    loading,
    error,
    reload,
  };
}
