import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const PAGE_SIZE = 25;

export function useSheetData(sheetName) {
  const [schema, setSchema] = useState(null);
  const [filterFields, setFilterFields] = useState([]);
  const [filterOptions, setFilterOptions] = useState({});
  const [filters, setFilters] = useState({});
  const [allRows, setAllRows] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: '', dir: 'asc' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    setSchema(null);
    setFilterFields([]);
    setFilterOptions({});
    setFilters({});
    setPage(1);
    setSearch('');
    setSort({ key: '', dir: 'asc' });
    setAllRows([]);
    api
      .describeSheet(sheetName)
      .then((res) => {
        setSchema(res.columns);
        setFilterFields(res.filters || []);
      })
      .catch((e) => setError(e.message));
    api
      .getFilterOptions(sheetName)
      .then((res) => setFilterOptions(res.options || {}))
      .catch(() => {});
  }, [sheetName]);

  const reload = useCallback(() => {
    const myRequest = ++requestId.current;
    setLoading(true);
    api
      .getRecords(sheetName, {
        pageSize: 999999, // Fetch all data
      })
      .then((res) => {
        if (myRequest !== requestId.current) return;
        setAllRows(res.rows);
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
  }, [sheetName]);

  useEffect(() => {
    if (!schema) return;
    reload();
  }, [schema, reload]);

  // Client-side processing
  const processedData = useMemo(() => {
    let result = [...allRows];

    // Filter
    filterFields.forEach((field) => {
      const raw = filters[field.key];
      if (raw === undefined || raw === null || raw === '') return;
      if (field.mode === 'select') {
        result = result.filter(r => String(r[field.key] == null ? '' : r[field.key]).trim() === String(raw).trim());
      } else {
        const needle = String(raw).trim().toLowerCase();
        result = result.filter(r => String(r[field.key] == null ? '' : r[field.key]).toLowerCase().includes(needle));
      }
    });

    // Search
    const searchTrimmed = search.trim().toLowerCase();
    if (searchTrimmed && schema) {
      result = result.filter(r => {
        return schema.some(col => String(r[col.key] == null ? '' : r[col.key]).toLowerCase().includes(searchTrimmed));
      });
    }

    // Sort
    if (sort.key) {
      const dir = sort.dir === 'desc' ? -1 : 1;
      result.sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key];
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av == null ? '' : av).localeCompare(String(bv == null ? '' : bv)) * dir;
      });
    }

    return result;
  }, [allRows, filters, search, sort, schema, filterFields]);

  const total = processedData.length;
  const rows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return processedData.slice(start, start + PAGE_SIZE);
  }, [processedData, page]);

  useEffect(() => {
    setPage(1);
  }, [search, filters, sort]);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return {
    schema,
    filterFields,
    filterOptions,
    filters,
    setFilter,
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
