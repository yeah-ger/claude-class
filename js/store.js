/* =========================================================
 * store.js — Claude Class 数据层
 * 职责：localStorage 读写 + 实体 CRUD + 周期工具 + 事件总线
 * 依赖：无
 * ======================================================= */
(function (global) {
  'use strict';

  // ---------- keys ----------
  const K = {
    classes: 'cc_classes',
    students: 'cc_students',
    dims: 'cc_dims',
    records: 'cc_records',
    rankdims: 'cc_rankdims',
    trash: 'cc_trash',
    settings: 'cc_settings',
    version: 'cc_version',
  };
  const VERSION = '1.0';

  // ---------- utils ----------
  const uid = () =>
    'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const now = () => new Date().toISOString();
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function read(key, def) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return def;
      return JSON.parse(v);
    } catch (e) {
      console.warn('[store.read]', key, e);
      return def;
    }
  }
  function write(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error('[store.write]', key, e);
      toast('保存失败：' + e.message, 'error');
    }
  }

  // ---------- 事件总线 ----------
  const listeners = {};
  function on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
  }
  function emit(evt, payload) {
    (listeners[evt] || []).forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(e); }
    });
  }

  // ---------- 初始化（首次建库） ----------
  function init() {
    const currentVer = read(K.version);
    if (!currentVer) {
      // 首次使用
      write(K.version, VERSION);
      write(K.classes, []);
      write(K.students, []);
      write(K.dims, defaultDims());
      write(K.records, []);
      write(K.rankdims, defaultRankDims());
      write(K.trash, { classes: [], students: [] });
      write(K.settings, { theme: 'auto', lastClassId: null, lastPeriod: null });
    } else if (currentVer !== VERSION) {
      // 版本升级：更新版本号，保留数据，兜底补充缺失键
      write(K.version, VERSION);
      if (!read(K.classes)) write(K.classes, []);
      if (!read(K.students)) write(K.students, []);
      if (!read(K.dims) || !read(K.dims).length) write(K.dims, defaultDims());
      if (!read(K.records)) write(K.records, []);
      if (!read(K.rankdims) || !read(K.rankdims).length) write(K.rankdims, defaultRankDims());
      if (!read(K.trash)) write(K.trash, { classes: [], students: [] });
      if (!read(K.settings)) write(K.settings, { theme: 'auto', lastClassId: null, lastPeriod: null });
    }
    // 兜底修复
    if (!read(K.dims) || !read(K.dims).length) write(K.dims, defaultDims());
    if (!read(K.rankdims) || !read(K.rankdims).length) write(K.rankdims, defaultRankDims());
    if (!read(K.trash)) write(K.trash, { classes: [], students: [] });
  }

  // ---------- 默认维度 ----------
  function defaultDims() {
    return [
      { id: uid(), key: 'count', label: '打卡次数', type: 'number',
        config: { min: 0, max: 5, maxFormula: 'weekCap' },
        builtin: true, visible: true, order: 1 },
      { id: uid(), key: 'perf', label: '打卡表现', type: 'enum',
        config: { options: [
          { value: 'excellent', label: '优',   color: 'var(--success)' },
          { value: 'good',      label: '良',   color: 'var(--warning)' },
          { value: 'cheer',     label: '加油', color: 'var(--danger)'  },
        ]},
        builtin: true, visible: true, order: 2 },
      { id: uid(), key: 'remark', label: '简要评语', type: 'text',
        config: { placeholder: '一句话点评…' },
        builtin: true, visible: true, order: 3 },
    ];
  }
  function defaultRankDims() {
    return [
      { id: uid(), label: '打卡次数总和', expr: 'sum(count)',   order: 'desc', scope: 'student', builtin: true },
      { id: uid(), label: '平均表现分',   expr: 'avg(perfNum)', order: 'desc', scope: 'student', builtin: true },
      { id: uid(), label: '综合分',       expr: 'mix',          order: 'desc', scope: 'student', builtin: true },
    ];
  }

  // ---------- 周期工具 ----------
  function getISOWeek(d) {
    // ISO 8601：周一开始，周归属于其周四所在的年
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return { year: date.getUTCFullYear(), week: weekNum };
  }
  // 反推：某 ISO 年周的周一 Date
  function isoWeekMonday(year, week) {
    // 1月4日一定在 ISO W1 内
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7; // 1-7
    const w1Monday = new Date(jan4);
    w1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
    const target = new Date(w1Monday);
    target.setUTCDate(w1Monday.getUTCDate() + (week - 1) * 7);
    return target;
  }
  function weekKey(d) {
    const { year, week } = getISOWeek(d);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  // 该 period 下 count 上限
  function countCap(periodType, periodKey) {
    const countDim = getDimByKey('count');
    const weekMax = countDim?.config?.weekMax || 5;
    if (periodType === 'week') return weekMax;
    // month
    const [y, m] = periodKey.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const set = new Set();
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      set.add(weekKey(d));
    }
    return set.size * weekMax;
  }
  // 计算某学生某月所有周记录的 count 总和
  function calcMonthCountSum(classId, studentId, monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const seen = new Set();
    let sum = 0;
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      const wk = weekKey(d);
      if (seen.has(wk)) continue;
      seen.add(wk);
      const rec = getRecord(classId, studentId, 'week', wk);
      if (rec && rec.values.count != null) {
        sum += Number(rec.values.count) || 0;
      }
    }
    return sum;
  }
  // 为班级内所有学生批量计算并写入月 count
  function syncMonthCountsForClass(classId, monthKey) {
    const students = listStudents(classId);
    let changed = 0;
    students.forEach((s) => {
      const sum = calcMonthCountSum(classId, s.id, monthKey);
      const existing = getRecord(classId, s.id, 'month', monthKey);
      if (sum > 0 || (existing && existing.values.count != null)) {
        upsertRecord({
          classId, studentId: s.id,
          periodType: 'month', periodKey: monthKey,
          values: { count: sum },
        });
        changed++;
      }
    });
    return changed;
  }
  // 周：返回 "YYYY-Www 第N周（MM.DD - MM.DD）"
  function formatWeekLabel(periodKey) {
    const [yStr, wStr] = periodKey.split('-W');
    const y = Number(yStr); const w = Number(wStr);
    const monday = isoWeekMonday(y, w);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const mm = (d) => String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = (d) => String(d.getUTCDate()).padStart(2, '0');
    return `${y} 第 ${w} 周 · ${mm(monday)}.${dd(monday)} – ${mm(sunday)}.${dd(sunday)}`;
  }
  function formatMonthLabel(periodKey) {
    const [y, m] = periodKey.split('-');
    return `${y} 年 ${Number(m)} 月`;
  }

  // 周期前后跳转
  function shiftPeriod(periodType, periodKey, delta) {
    if (periodType === 'week') {
      const [y, w] = periodKey.split('-W').map(Number);
      const monday = isoWeekMonday(y, w);
      monday.setUTCDate(monday.getUTCDate() + delta * 7);
      // 用 UTC 日期但用本地 weekKey 时注意 —— 这里 monday 是 UTC，转成本地同日
      const local = new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
      return weekKey(local);
    } else {
      const [y, m] = periodKey.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return monthKey(d);
    }
  }
  function currentPeriod(periodType) {
    const d = new Date();
    return periodType === 'week' ? weekKey(d) : monthKey(d);
  }

  // ========================================================
  //  CRUD
  // ========================================================

  // ---------- Class ----------
  function listClasses(includeArchived) {
    const list = read(K.classes, []);
    return includeArchived ? list : list.filter((c) => !c.archived);
  }
  function getClass(id) {
    return read(K.classes, []).find((c) => c.id === id) || null;
  }
  function createClass(name) {
    name = (name || '').trim();
    if (!name) throw new Error('班级名不能为空');
    const list = read(K.classes, []);
    const c = { id: uid(), name, createdAt: now(), archived: false };
    list.push(c);
    write(K.classes, list);
    emit('classes:changed');
    return c;
  }
  function updateClass(id, patch) {
    const list = read(K.classes, []);
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...patch };
    write(K.classes, list);
    emit('classes:changed');
    return list[idx];
  }
  function deleteClass(id) {
    // 软删除：移到回收站
    const list = read(K.classes, []);
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const [removed] = list.splice(idx, 1);
    removed.archived = true;
    removed.archivedAt = now();
    const trash = read(K.trash, { classes: [], students: [] });
    trash.classes.push(removed);
    write(K.classes, list);
    write(K.trash, trash);
    emit('classes:changed'); emit('trash:changed');
  }
  function restoreClass(id) {
    const trash = read(K.trash, { classes: [], students: [] });
    const idx = trash.classes.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const [c] = trash.classes.splice(idx, 1);
    c.archived = false; delete c.archivedAt;
    const list = read(K.classes, []);
    list.push(c);
    write(K.classes, list);
    write(K.trash, trash);
    emit('classes:changed'); emit('trash:changed');
  }
  function purgeClass(id) {
    // 彻底删除：连带学生 & 记录
    const trash = read(K.trash, { classes: [], students: [] });
    trash.classes = trash.classes.filter((c) => c.id !== id);
    // 也从学生回收站清掉这个班的
    trash.students = trash.students.filter((s) => s.classId !== id);
    write(K.trash, trash);

    const students = read(K.students, []).filter((s) => s.classId !== id);
    write(K.students, students);

    const records = read(K.records, []).filter((r) => r.classId !== id);
    write(K.records, records);

    emit('classes:changed'); emit('trash:changed'); emit('records:changed');
  }

  // ---------- Student ----------
  function listStudents(classId, includeArchived) {
    const list = read(K.students, []).filter((s) => s.classId === classId);
    const r = includeArchived ? list : list.filter((s) => !s.archived);
    return r.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
  }
  function getStudent(id) {
    return read(K.students, []).find((s) => s.id === id) || null;
  }
  function createStudent(classId, name) {
    name = (name || '').trim();
    if (!name) throw new Error('学生姓名不能为空');
    const list = read(K.students, []);
    const order = list.filter((s) => s.classId === classId).length + 1;
    const s = { id: uid(), classId, name, order, createdAt: now(), archived: false };
    list.push(s);
    write(K.students, list);
    emit('students:changed');
    return s;
  }
  function bulkCreateStudents(classId, nameText) {
    const names = String(nameText || '')
      .split(/[\n,，、;；]+/).map((x) => x.trim()).filter(Boolean);
    const list = read(K.students, []);
    let order = list.filter((s) => s.classId === classId).length;
    const added = [];
    for (const name of names) {
      order++;
      const s = { id: uid(), classId, name, order, createdAt: now(), archived: false };
      list.push(s);
      added.push(s);
    }
    write(K.students, list);
    emit('students:changed');
    return added;
  }
  function updateStudent(id, patch) {
    const list = read(K.students, []);
    const idx = list.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...patch };
    write(K.students, list);
    emit('students:changed');
    return list[idx];
  }
  function deleteStudent(id) {
    const list = read(K.students, []);
    const idx = list.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const [removed] = list.splice(idx, 1);
    removed.archived = true;
    removed.archivedAt = now();
    const trash = read(K.trash, { classes: [], students: [] });
    trash.students.push(removed);
    write(K.students, list);
    write(K.trash, trash);
    emit('students:changed'); emit('trash:changed');
  }
  function restoreStudent(id) {
    const trash = read(K.trash, { classes: [], students: [] });
    const idx = trash.students.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const [s] = trash.students.splice(idx, 1);
    s.archived = false; delete s.archivedAt;
    const list = read(K.students, []);
    list.push(s);
    write(K.students, list);
    write(K.trash, trash);
    emit('students:changed'); emit('trash:changed');
  }
  function purgeStudent(id) {
    const trash = read(K.trash, { classes: [], students: [] });
    trash.students = trash.students.filter((s) => s.id !== id);
    write(K.trash, trash);
    const records = read(K.records, []).filter((r) => r.studentId !== id);
    write(K.records, records);
    emit('trash:changed'); emit('records:changed');
  }

  // ---------- Dimension ----------
  function listDims(visibleOnly) {
    const list = read(K.dims, []);
    const r = visibleOnly ? list.filter((d) => d.visible) : list.slice();
    return r.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  function getDim(id) {
    return read(K.dims, []).find((d) => d.id === id) || null;
  }
  function getDimByKey(key) {
    return read(K.dims, []).find((d) => d.key === key) || null;
  }
  function createDim(dim) {
    const list = read(K.dims, []);
    const order = list.length + 1;
    const key = 'custom_' + uid().slice(1, 7);
    const d = { id: uid(), key, builtin: false, visible: true, order, ...dim };
    list.push(d);
    write(K.dims, list);
    emit('dims:changed');
    return d;
  }
  function moveDim(id, delta) {
    const ordered = listDims(false);
    const idx = ordered.findIndex((d) => d.id === id);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= ordered.length) return null;
    const [item] = ordered.splice(idx, 1);
    ordered.splice(nextIdx, 0, item);
    const normalized = ordered.map((d, i) => ({ ...d, order: i + 1 }));
    write(K.dims, normalized);
    emit('dims:changed');
    return normalized.find((d) => d.id === id) || null;
  }
  function updateDim(id, patch) {
    const list = read(K.dims, []);
    const idx = list.findIndex((d) => d.id === id);
    if (idx < 0) return null;
    // 内置 key 不改
    if (list[idx].builtin) {
      delete patch.key; delete patch.type; delete patch.builtin;
    }
    list[idx] = { ...list[idx], ...patch };
    write(K.dims, list);
    emit('dims:changed');
    return list[idx];
  }
  function deleteDim(id) {
    const list = read(K.dims, []);
    const d = list.find((x) => x.id === id);
    if (!d || d.builtin) return;
    write(K.dims, list.filter((x) => x.id !== id));
    emit('dims:changed');
  }

  // ---------- Record ----------
  function listRecords(filter) {
    // filter: { classId, studentId, periodType, periodKey, periodKeys: [] }
    let list = read(K.records, []);
    if (filter) {
      if (filter.classId) list = list.filter((r) => r.classId === filter.classId);
      if (filter.studentId) list = list.filter((r) => r.studentId === filter.studentId);
      if (filter.periodType) list = list.filter((r) => r.periodType === filter.periodType);
      if (filter.periodKey) list = list.filter((r) => r.periodKey === filter.periodKey);
      if (filter.periodKeys) list = list.filter((r) => filter.periodKeys.includes(r.periodKey));
    }
    return list;
  }
  function getRecord(classId, studentId, periodType, periodKey) {
    return read(K.records, []).find((r) =>
      r.classId === classId && r.studentId === studentId &&
      r.periodType === periodType && r.periodKey === periodKey
    ) || null;
  }
  function upsertRecord({ classId, studentId, periodType, periodKey, values }) {
    const list = read(K.records, []);
    const idx = list.findIndex((r) =>
      r.classId === classId && r.studentId === studentId &&
      r.periodType === periodType && r.periodKey === periodKey);
    let rec;
    if (idx >= 0) {
      const merged = { ...list[idx].values, ...values };
      // undefined 表示删除该键
      Object.keys(values).forEach((k) => {
        if (values[k] === undefined) delete merged[k];
      });
      rec = { ...list[idx], values: merged, updatedAt: now() };
      list[idx] = rec;
    } else {
      // 过滤掉 undefined
      const clean = {};
      Object.keys(values).forEach((k) => {
        if (values[k] !== undefined) clean[k] = values[k];
      });
      rec = { id: uid(), classId, studentId, periodType, periodKey,
              values: clean, updatedAt: now() };
      list.push(rec);
    }
    write(K.records, list);
    emit('records:changed');
    return rec;
  }
  function clearRecord(classId, studentId, periodType, periodKey) {
    const list = read(K.records, []).filter((r) =>
      !(r.classId === classId && r.studentId === studentId &&
        r.periodType === periodType && r.periodKey === periodKey));
    write(K.records, list);
    emit('records:changed');
  }

  // ---------- RankDim ----------
  function listRankDims() {
    return read(K.rankdims, []);
  }
  function createRankDim(r) {
    const list = read(K.rankdims, []);
    const n = { id: uid(), builtin: false, ...r };
    list.push(n); write(K.rankdims, list);
    emit('rankdims:changed'); return n;
  }
  function updateRankDim(id, patch) {
    const list = read(K.rankdims, []);
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return null;
    if (list[idx].builtin) { delete patch.expr; }
    list[idx] = { ...list[idx], ...patch };
    write(K.rankdims, list); emit('rankdims:changed');
    return list[idx];
  }
  function deleteRankDim(id) {
    const list = read(K.rankdims, []);
    const r = list.find((x) => x.id === id);
    if (!r || r.builtin) return;
    write(K.rankdims, list.filter((x) => x.id !== id));
    emit('rankdims:changed');
  }

  // ---------- Trash ----------
  function listTrash() {
    return read(K.trash, { classes: [], students: [] });
  }

  // ---------- Settings ----------
  function getSettings() { return read(K.settings, { theme: 'auto' }); }
  function setSettings(patch) {
    const s = { ...getSettings(), ...patch };
    write(K.settings, s); emit('settings:changed'); return s;
  }

  // ---------- 示例数据 ----------
  function loadDemo() {
    // 若已有数据则拒绝
    if (read(K.classes, []).length) return false;
    const c1 = createClass('Kid\u0027s Box 2 · 周四班');
    const c2 = createClass('KB2 · 周五班');
    bulkCreateStudents(c1.id, '张嘉和\n李若辰\n王可昕\n陈逸飞\n林嘉宜\n赵一诺');
    bulkCreateStudents(c2.id, '苏沐阳\n周子谦\n吴泽凯\n邓思妍');

    const s1 = listStudents(c1.id);
    const pk = currentPeriod('week');
    const perfs = ['excellent', 'good', 'excellent', 'good', 'cheer', 'excellent'];
    const remarks = [
      '课堂专注，单词默写全对',
      '作业工整，口语略羞涩',
      '积极举手，发音漂亮',
      '本周进步明显',
      '继续加油，别怕错',
      '全勤，拼读扎实',
    ];
    s1.forEach((s, i) => {
      upsertRecord({
        classId: c1.id, studentId: s.id, periodType: 'week', periodKey: pk,
        values: { count: [5, 4, 5, 3, 2, 5][i], perf: perfs[i], remark: remarks[i] },
      });
    });
    return true;
  }

  // ---------- Toast（简 UI 辅助） ----------
  function toast(msg, type) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show ' + (type || '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- 数值化辅助（用于聚合） ----------
  function perfToNum(v) {
    return v === 'excellent' ? 3 : v === 'good' ? 2 : v === 'cheer' ? 1 : 0;
  }

  // ---------- 导出 ----------
  const api = {
    K, VERSION, init,
    on, emit,
    uid, clone, toast,
    // class
    listClasses, getClass, createClass, updateClass, deleteClass,
    restoreClass, purgeClass,
    // student
    listStudents, getStudent, createStudent, bulkCreateStudents,
    updateStudent, deleteStudent, restoreStudent, purgeStudent,
    // dim
    listDims, getDim, getDimByKey, createDim, moveDim, updateDim, deleteDim,
    // record
    listRecords, getRecord, upsertRecord, clearRecord,
    // rankdim
    listRankDims, createRankDim, updateRankDim, deleteRankDim,
    // trash
    listTrash,
    // settings
    getSettings, setSettings,
    // period
    weekKey, monthKey, countCap, formatWeekLabel, formatMonthLabel,
    shiftPeriod, currentPeriod, getISOWeek,
    // month sync
    calcMonthCountSum, syncMonthCountsForClass,
    // demo
    loadDemo,
    // helpers
    perfToNum,
  };
  global.Store = api;
})(window);
