/* =========================================================
 * record.js — 打卡记录模块
 * 职责：周/月视图切换、周期导航、表格编辑、自动保存
 * 暴露：window.Recorder.render(rootEl, classId)
 * ========================================================= */
(function () {
  'use strict';
  const S = window.Store;

  let state = {
    classId: null,
    periodType: 'week',   // 'week' | 'month'
    periodKey: null,
    saveTimers: {},       // studentId+dim -> pending save entry
    root: null,
  };

  function render(root, classId) {
    flushPendingSaves();
    state.root = root;
    state.classId = classId;

    const settings = S.getSettings();
    if (settings.lastClassId === classId && settings.lastPeriod) {
      state.periodType = settings.lastPeriod.type || 'week';
      state.periodKey = settings.lastPeriod.key || S.currentPeriod(state.periodType);
    } else {
      state.periodType = 'week';
      state.periodKey = S.currentPeriod('week');
    }

    paint();
  }

  function paint() {
    const { root, classId, periodType, periodKey } = state;
    root.innerHTML = '';

    const students = S.listStudents(classId);
    const dims = S.listDims(true);
    const cap = S.countCap(periodType, periodKey);

    // ---------- 工具条 ----------
    const toolbar = window.CC.el('div', { class: 'toolbar' }, [
      // 视图切换
      window.CC.el('div', { class: 'seg' }, [
        segBtn('周视图', 'week'),
        segBtn('月视图', 'month'),
      ]),
      // 周期导航
      window.CC.el('div', { class: 'period-nav' }, [
        window.CC.el('button', {
          class: 'icon-btn',
          html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>',
          onclick: () => shiftPeriod(-1),
          title: '上一期',
        }),
        window.CC.el('span', { class: 'period-label', text: periodLabel() }),
        window.CC.el('button', {
          class: 'icon-btn',
          html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>',
          onclick: () => shiftPeriod(1),
          title: '下一期',
        }),
      ]),
      // 周上限设置（仅周视图）
      periodType === 'week'
        ? window.CC.el('button', {
            class: 'btn btn-ghost btn-sm',
            html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.67 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.67 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.67a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.33 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg> 周上限',
            onclick: () => openWeekCapDialog(),
          })
        : null,
      // 月同步（仅月视图）
      periodType === 'month'
        ? window.CC.el('button', {
            class: 'btn btn-ghost btn-sm',
            html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12V7H3v5M7 12v5M12 12v5M17 12v5"/></svg> 一键同步本月次数',
            onclick: () => confirmMonthSync(classId, periodKey),
          })
        : null,
      window.CC.el('button', {
        class: 'btn btn-ghost btn-sm', text: '回到本期',
        onclick: () => {
          flushPendingSaves();
          state.periodKey = S.currentPeriod(state.periodType);
          persistState();
          paint();
        },
      }),
      window.CC.el('div', { class: 'spacer' }),
      window.CC.el('button', {
        class: 'btn btn-outline btn-sm',
        html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> 导出图片',
        disabled: !students.length,
        onclick: () => window.Exporter.open({
          classId, periodType, periodKey,
        }),
      }),
    ]);
    root.appendChild(toolbar);

    // ---------- 空状态 ----------
    if (!students.length) {
      root.appendChild(window.CC.el('div', { class: 'empty' }, [
        window.CC.el('h3', { text: '还没有学生' }),
        window.CC.el('p', { text: '去「学生管理」添加几位学生，就能开始记录了。' }),
        window.CC.el('button', {
          class: 'btn btn-primary',
          text: '去添加学生',
          onclick: () => (location.hash = `#/class/${classId}/students`),
        }),
      ]));
      return;
    }

    // ---------- 表格 ----------
    const wrap = window.CC.el('div', { class: 'table-wrap' });
    const tbl = window.CC.el('table', { class: 'grid' });

    // thead
    const headCells = [
      window.CC.el('th', { style: { width: '50px' }, text: '#' }),
      window.CC.el('th', { style: { minWidth: '110px' }, text: '学生姓名' }),
    ];
    dims.forEach((d) => headCells.push(window.CC.el('th', { text: d.label })));
    headCells.push(window.CC.el('th', { style: { width: '80px', textAlign: 'right' }, text: '操作' }));
    tbl.appendChild(window.CC.el('thead', {}, window.CC.el('tr', {}, headCells)));

    // tbody
    const tbody = window.CC.el('tbody');
    let filledCount = 0;
    students.forEach((s, i) => {
      const rec = S.getRecord(classId, s.id, periodType, periodKey);
      if (rec && hasAnyValue(rec.values, dims)) filledCount++;
      const cells = [
        window.CC.el('td', { class: 'td-index', text: i + 1 }),
        window.CC.el('td', { class: 'td-name', text: s.name }),
      ];
      dims.forEach((d) => {
        cells.push(window.CC.el('td', {}, renderCell(s, d, rec, cap)));
      });
      cells.push(window.CC.el('td', { style: { textAlign: 'right' } }, [
        window.CC.el('button', {
          class: 'btn btn-ghost btn-xs', text: '清空',
          disabled: !rec,
          onclick: () => {
            if (!rec) return;
            window.CC.Modal.open({
              title: '清空该行',
              body: `将删除「${s.name}」在本周期的全部记录。`,
              foot: [
                window.CC.el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => window.CC.Modal.close() }),
                window.CC.el('button', {
                  class: 'btn btn-danger', text: '清空',
                  onclick: () => {
                    S.clearRecord(classId, s.id, periodType, periodKey);
                    window.CC.Modal.close();
                    S.toast('已清空');
                    paint();
                  },
                }),
              ],
            });
          },
        }),
      ]));
      tbody.appendChild(window.CC.el('tr', { 'data-sid': s.id }, cells));
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    root.appendChild(wrap);

    // 状态条
    const status = window.CC.el('div', { class: 'status-bar' }, [
      window.CC.el('span', { html: `已填 <b>${filledCount}</b> / ${students.length}` }),
      window.CC.el('span', { text: periodType === 'month' ? `本月次数上限 ${cap}` : `本周次数上限 ${cap}` }),
    ]);
    root.appendChild(status);
  }

  // ---------- 单元格渲染 ----------
  function renderCell(student, dim, rec, cap) {
    const v = rec ? rec.values[dim.key] : undefined;

    if (dim.type === 'number') {
      const max = dim.key === 'count'
        ? cap
        : (dim.config && dim.config.max != null ? dim.config.max : 10);
      const min = (dim.config && dim.config.min != null) ? dim.config.min : 0;
      // count 的周视图用 1-5 胶囊；月视图或其他 number 用数字输入
      if (dim.key === 'count' && state.periodType === 'week') {
        const countDim = S.getDimByKey('count');
        const weekMax = countDim?.config?.weekMax || 5;
        return renderPillNumber(student, dim, v, 0, weekMax);
      }
      // 0-5 以内也可用胶囊
      if (max - min <= 5) {
        return renderPillNumber(student, dim, v, min, max);
      }
      return renderNumberInput(student, dim, v, min, max);
    }

    if (dim.type === 'enum') {
      return renderPillEnum(student, dim, v);
    }

    // text
    return renderTextInput(student, dim, v);
  }

  function renderPillNumber(student, dim, v, min, max) {
    const wrap = window.CC.el('div', { class: 'pill-group' });
    for (let n = min; n <= max; n++) {
      const b = window.CC.el('button', {
        class: 'pill' + (v === n ? ' active' : ''),
        text: String(n),
        onclick: () => {
          const cur = currentValue(student.id, dim.key);
          const next = cur === n ? undefined : n; // 再次点击取消
          saveValue(student.id, dim.key, next);
          paint();
        },
      });
      wrap.appendChild(b);
    }
    return wrap;
  }

  function renderPillEnum(student, dim, v) {
    const wrap = window.CC.el('div', { class: 'pill-group pill-enum' });
    (dim.config.options || []).forEach((opt) => {
      const b = window.CC.el('button', {
        class: 'pill' + (v === opt.value ? ' active' : ''),
        text: opt.label,
        'data-v': opt.value,
        onclick: () => {
          const cur = currentValue(student.id, dim.key);
          const next = cur === opt.value ? undefined : opt.value;
          saveValue(student.id, dim.key, next);
          paint();
        },
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function renderNumberInput(student, dim, v, min, max) {
    const input = window.CC.el('input', {
      class: 'num-input', type: 'number',
      value: v == null ? '' : v,
      min, max,
      placeholder: `0-${max}`,
    });
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      let n;
      if (raw === '') n = undefined;
      else {
        n = parseFloat(raw);
        if (isNaN(n)) n = undefined;
        else {
          if (n < min) n = min;
          if (n > max) n = max;
        }
      }
      debouncedSave(student.id, dim.key, n);
    });
    return input;
  }

  function renderTextInput(student, dim, v) {
    const input = window.CC.el('input', {
      class: 'inline-input', type: 'text',
      value: v || '',
      placeholder: (dim.config && dim.config.placeholder) || '一句话点评…',
    });
    input.addEventListener('input', () => {
      debouncedSave(student.id, dim.key, input.value.trim());
    });
    input.addEventListener('blur', () => {
      flushSave(student.id, dim.key, input.value.trim());
    });
    return input;
  }

  // ---------- 保存逻辑 ----------
  function currentValue(studentId, key) {
    const rec = S.getRecord(state.classId, studentId, state.periodType, state.periodKey);
    return rec ? rec.values[key] : undefined;
  }
  function saveValue(studentId, key, value) {
    saveValueInContext(studentId, key, value, getContextSnapshot());
  }
  function saveValueInContext(studentId, key, value, context) {
    S.upsertRecord({
      classId: context.classId,
      studentId,
      periodType: context.periodType,
      periodKey: context.periodKey,
      values: { [key]: value },
    });
  }
  function debouncedSave(studentId, key, value) {
    const k = studentId + '::' + key;
    const context = getContextSnapshot();
    clearPendingSave(k);
    const entry = {
      studentId,
      key,
      value,
      context,
      timerId: setTimeout(() => {
        saveValueInContext(studentId, key, value, context);
        delete state.saveTimers[k];
      }, 320),
    };
    state.saveTimers[k] = entry;
  }
  function flushSave(studentId, key, value) {
    const context = getContextSnapshot();
    const k = studentId + '::' + key;
    clearPendingSave(k);
    saveValueInContext(studentId, key, value, context);
  }
  function flushPendingSaves() {
    Object.keys(state.saveTimers).forEach((k) => {
      const entry = state.saveTimers[k];
      if (!entry) return;
      clearTimeout(entry.timerId);
      saveValueInContext(entry.studentId, entry.key, entry.value, entry.context);
      delete state.saveTimers[k];
    });
  }
  function clearPendingSave(key) {
    const entry = state.saveTimers[key];
    if (!entry) return;
    clearTimeout(entry.timerId);
    delete state.saveTimers[key];
  }
  function getContextSnapshot() {
    return {
      classId: state.classId,
      periodType: state.periodType,
      periodKey: state.periodKey,
    };
  }

  // ---------- 周上限设置对话框 ----------
  function openWeekCapDialog() {
    const countDim = S.getDimByKey('count');
    const currentMax = countDim?.config?.weekMax || 5;
    const input = window.CC.el('input', {
      type: 'number', value: currentMax, min: 1, max: 20,
      style: { width: '100%', padding: '8px 10px', fontSize: '14px' },
    });
    const body = window.CC.el('div', {}, [
      window.CC.el('div', { class: 'form-row' }, [
        window.CC.el('label', { text: '每周次数上限（1–20）' }),
        input,
        window.CC.el('div', { class: 'form-hint', text: '修改后周视图胶囊会随之变化。' }),
      ]),
    ]);
    const ok = () => {
      const v = parseInt(input.value, 10);
      if (isNaN(v) || v < 1 || v > 20) {
        S.toast('请输入 1–20 之间的数字', 'error'); return;
      }
      S.updateDim(countDim.id, {
        config: { ...countDim.config, weekMax: v },
      });
      window.CC.Modal.close();
      S.toast('周上限已更新为 ' + v);
      paint();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    window.CC.Modal.open({
      title: '设置周次数上限',
      body,
      foot: [
        window.CC.el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => window.CC.Modal.close() }),
        window.CC.el('button', { class: 'btn btn-primary', text: '保存', onclick: ok }),
      ],
    });
  }

  function countMonthSyncOverwrites(classId, monthKey) {
    return S.listStudents(classId).reduce((count, student) => {
      const existing = S.getRecord(classId, student.id, 'month', monthKey);
      if (!existing || existing.values.count == null) return count;
      const next = S.calcMonthCountSum(classId, student.id, monthKey);
      return Number(existing.values.count) !== next ? count + 1 : count;
    }, 0);
  }

  function runMonthSync(classId, monthKey) {
    const changed = S.syncMonthCountsForClass(classId, monthKey);
    S.toast(changed > 0 ? `已为 ${changed} 位学生填充本月次数` : '本月暂无周记录可同步');
    paint();
  }

  function confirmMonthSync(classId, monthKey) {
    flushPendingSaves();
    const overwriteCount = countMonthSyncOverwrites(classId, monthKey);
    if (!overwriteCount) {
      runMonthSync(classId, monthKey);
      return;
    }

    window.CC.Modal.open({
      title: '确认同步本月次数',
      body: `将根据周记录重算本月次数，并覆盖 ${overwriteCount} 位学生已手动修改的月次数。`,
      foot: [
        window.CC.el('button', {
          class: 'btn btn-ghost',
          text: '取消',
          onclick: () => window.CC.Modal.close(),
        }),
        window.CC.el('button', {
          class: 'btn btn-primary',
          text: '继续同步',
          onclick: () => {
            window.CC.Modal.close();
            runMonthSync(classId, monthKey);
          },
        }),
      ],
    });
  }

  // ---------- 周期导航 ----------
  function shiftPeriod(delta) {
    flushPendingSaves();
    state.periodKey = S.shiftPeriod(state.periodType, state.periodKey, delta);
    persistState();
    paint();
  }
  function segBtn(label, type) {
    return window.CC.el('button', {
      class: state.periodType === type ? 'active' : '',
      text: label,
      onclick: () => {
        flushPendingSaves();
        state.periodType = type;
        state.periodKey = S.currentPeriod(type);
        persistState();
        paint();
      },
    });
  }
  function periodLabel() {
    return state.periodType === 'week'
      ? S.formatWeekLabel(state.periodKey)
      : S.formatMonthLabel(state.periodKey);
  }
  function persistState() {
    S.setSettings({
      lastClassId: state.classId,
      lastPeriod: { type: state.periodType, key: state.periodKey },
    });
  }

  // ---------- helpers ----------
  function hasAnyValue(values, dims) {
    if (!values) return false;
    return dims.some((d) => {
      const v = values[d.key];
      if (v == null) return false;
      if (typeof v === 'string') return v.trim().length > 0;
      return true;
    });
  }

  window.addEventListener('beforeunload', flushPendingSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSaves();
  });

  window.Recorder = { render, flushPendingSaves };
})();
