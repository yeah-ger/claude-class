/* =========================================================
 * dashboard.js — 数据汇总看板
 * 职责：KPI + 排名（个人/班级/总）+ 维度切换 + 班级筛选
 * 暴露：window.Dashboard.render(rootEl)
 * ========================================================= */
(function () {
  'use strict';
  const S = window.Store;
  // 延迟取 el（app.js 在 dashboard.js 之后加载，CC 此时还未就绪）
  const el = function () { return window.CC.el.apply(null, arguments); };

  let state = {
    classFilter: 'all', // 'all' | classId
    rankDimId: null,
    scope: 'student',   // 'student' | 'class' | 'overall'
    periodType: 'all',  // 'all' | 'week' | 'month'
  };

  function isoWeekMonday(year, week) {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const w1Monday = new Date(jan4);
    w1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
    const target = new Date(w1Monday);
    target.setUTCDate(w1Monday.getUTCDate() + (week - 1) * 7);
    return target;
  }

  function monthKeysForWeek(weekKey) {
    const [yearStr, weekStr] = weekKey.split('-W');
    const monday = isoWeekMonday(Number(yearStr), Number(weekStr));
    const months = new Set();
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setUTCDate(monday.getUTCDate() + i);
      months.add(`${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return Array.from(months);
  }

  function normalizeAnalyticsRecords(records) {
    if (state.periodType !== 'all') return records.slice();

    const weeklyPresence = new Set();
    records.forEach((record) => {
      if (record.periodType !== 'week' || record.values.count == null) return;
      monthKeysForWeek(record.periodKey).forEach((monthKey) => {
        weeklyPresence.add(`${record.classId}::${record.studentId}::${monthKey}`);
      });
    });

    return records.map((record) => {
      if (record.periodType !== 'month' || record.values.count == null) return record;
      const dedupeKey = `${record.classId}::${record.studentId}::${record.periodKey}`;
      if (!weeklyPresence.has(dedupeKey)) return record;
      return {
        ...record,
        values: { ...record.values, count: undefined },
      };
    });
  }

  function getCountAnalyticsValue(record) {
    return Number(record.values.count) || 0;
  }

  function chooseTrendPeriod(records) {
    if (state.periodType === 'week' || state.periodType === 'month') return state.periodType;
    return records.some((record) => record.periodType === 'week' && getCountAnalyticsValue(record) > 0)
      ? 'week'
      : 'month';
  }

  function render(root) {
    root.innerHTML = '';

    const classes = S.listClasses();
    const rankDims = S.listRankDims();
    if (state.classFilter !== 'all' && !classes.some((c) => c.id === state.classFilter)) {
      state.classFilter = 'all';
    }
    if (state.rankDimId == null && rankDims.length) state.rankDimId = rankDims[0].id;
    if (state.rankDimId != null && !rankDims.some((rd) => rd.id === state.rankDimId)) {
      state.rankDimId = rankDims.length ? rankDims[0].id : null;
    }

    // ---------- 页头 ----------
    root.appendChild(el('div', { class: 'page-head anim-in' }, [
      el('div', {}, [
        el('div', { class: 'kicker', text: 'Dashboard' }),
        el('h1', { html: '<em>数据</em>看板' }),
        el('p', { class: 'subtitle', text: '多维度排名与沉淀统计' }),
      ]),
      el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn btn-ghost',
          text: '← 所有班级',
          onclick: () => (location.hash = '#/classes'),
        }),
      ]),
    ]));

    if (!classes.length) {
      root.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: '还没有班级' }),
        el('p', { text: '创建班级并录入打卡数据，这里会展示汇总分析。' }),
        el('button', {
          class: 'btn btn-primary', text: '前往创建',
          onclick: () => (location.hash = '#/classes'),
        }),
      ]));
      return;
    }

    // ---------- 筛选器 ----------
    const toolbar = el('div', { class: 'toolbar anim-in d1' }, [
      el('span', { class: 'muted small', text: '班级' }),
      (() => {
        const sel = el('select', { class: 'select' }, [
          el('option', { value: 'all', text: '全部班级' }),
          ...classes.map((c) => el('option', { value: c.id, text: c.name })),
        ]);
        sel.value = state.classFilter;
        sel.addEventListener('change', () => { state.classFilter = sel.value; render(root); });
        return sel;
      })(),
      el('span', { class: 'muted small', style: { marginLeft: '10px' }, text: '周期' }),
      (() => {
        const seg = el('div', { class: 'seg' }, [
          periodSegBtn('全部', 'all'),
          periodSegBtn('仅周', 'week'),
          periodSegBtn('仅月', 'month'),
        ]);
        return seg;
      })(),
    ]);
    root.appendChild(toolbar);

    // ---------- 数据聚合 ----------
    const filter = buildFilter();
    const targetClasses = state.classFilter === 'all' ? classes : classes.filter((c) => c.id === state.classFilter);
    const students = targetClasses.flatMap((c) => S.listStudents(c.id));
    const activeClassIds = new Set(targetClasses.map((c) => c.id));
    const activeStudentIds = new Set(students.map((s) => s.id));
    const records = S.listRecords(filter).filter((r) =>
      activeClassIds.has(r.classId) && activeStudentIds.has(r.studentId)
    );
    const analyticsRecords = normalizeAnalyticsRecords(records);

    // ---------- KPI ----------
    const totalCount = analyticsRecords.reduce((a, r) => a + getCountAnalyticsValue(r), 0);
    const totalRec = records.length;
    const avgPerf = (() => {
      const nums = analyticsRecords.map((r) => S.perfToNum(r.values.perf)).filter((n) => n > 0);
      if (!nums.length) return 0;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    })();
    const kpis = el('div', { class: 'dash-kpis anim-in d1' }, [
      kpiCard('班级数', targetClasses.length, '参与统计'),
      kpiCard('学生数', students.length, '参与统计'),
      kpiCard('打卡次数', totalCount, `${totalRec} 条记录`),
      kpiCard('平均表现', avgPerf ? avgPerf.toFixed(2) : '—', '1=加油 / 2=良 / 3=优'),
    ]);
    root.appendChild(kpis);

    // ---------- 排名区 ----------
    const rankSec = el('div', { class: 'dash-section anim-in d2' });
    const rankHead = el('div', {
      style: { display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '14px' },
    }, [
      el('h3', { style: { margin: 0 } }, [
        document.createTextNode('排名 '),
        el('span', { class: 'hint', text: '· 维度可切换' }),
      ]),
      el('div', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, [
        // scope
        el('div', { class: 'seg' }, [
          scopeBtn('个人', 'student'),
          scopeBtn('班级', 'class'),
          scopeBtn('总体', 'overall'),
        ]),
        el('button', {
          class: 'btn btn-outline btn-sm', text: '+ 自定义维度',
          onclick: () => createRankDimDialog(() => render(root)),
        }),
      ]),
    ]);
    rankSec.appendChild(rankHead);

    // 维度 chips
    const chips = el('div', { class: 'pill-chips', style: { marginBottom: '14px' } });
    rankDims.forEach((rd) => {
      chips.appendChild(el('div', {
        class: 'chip' + (state.rankDimId === rd.id ? ' active' : ''),
        text: rd.label + (rd.builtin ? '' : ' ⚙'),
        onclick: () => {
          state.rankDimId = rd.id; render(root);
        },
      }));
    });
    rankSec.appendChild(chips);

    // 排名列表
    const rankDim = rankDims.find((x) => x.id === state.rankDimId) || rankDims[0];
    const rankList = computeRank(analyticsRecords, students, targetClasses, rankDim);
    rankSec.appendChild(renderRankList(rankList, rankDim));

    root.appendChild(rankSec);

    // ---------- 趋势：按周期 count 总量 ----------
    const trendPeriod = chooseTrendPeriod(analyticsRecords);
    const trendLabel = trendPeriod === 'month'
      ? '· 最近 8 个月的打卡次数总和'
      : '· 最近 8 周的打卡次数总和';
    const trendSec = el('div', { class: 'dash-section anim-in d3' }, [
      el('h3', {}, [
        document.createTextNode('趋势 '),
        el('span', { class: 'hint', text: trendLabel }),
      ]),
      buildTrendChart(analyticsRecords, trendPeriod),
    ]);
    root.appendChild(trendSec);
  }

  // ---------- 子渲染 ----------
  function kpiCard(label, value, hint) {
    return el('div', { class: 'kpi' }, [
      el('div', { class: 'kpi-label', text: label }),
      el('div', { class: 'kpi-value', text: String(value) }),
      el('div', { class: 'kpi-hint', text: hint || '' }),
    ]);
  }

  function periodSegBtn(label, type) {
    return el('button', {
      class: state.periodType === type ? 'active' : '',
      text: label,
      onclick: () => { state.periodType = type; render(document.getElementById('view')); },
    });
  }
  function scopeBtn(label, s) {
    return el('button', {
      class: state.scope === s ? 'active' : '',
      text: label,
      onclick: () => { state.scope = s; render(document.getElementById('view')); },
    });
  }

  function buildFilter() {
    const f = {};
    if (state.classFilter !== 'all') f.classId = state.classFilter;
    if (state.periodType !== 'all') f.periodType = state.periodType;
    return f;
  }

  // ---------- 排名计算 ----------
  function computeRank(records, students, classes, rankDim) {
    if (!rankDim) return [];

    if (state.scope === 'student' || state.scope === 'overall') {
      const map = new Map();
      students.forEach((s) => {
        map.set(s.id, { id: s.id, name: s.name, classId: s.classId, recs: [] });
      });
      records.forEach((r) => {
        const slot = map.get(r.studentId);
        if (slot) slot.recs.push(r);
      });
      let arr = Array.from(map.values())
        .map((x) => ({ ...x, score: evalRank(rankDim.expr, x.recs) }))
        .filter((x) => x.recs.length > 0 || state.scope === 'overall');
      arr = sortScore(arr, rankDim.order);
      return arr.map((x, i) => ({
        rank: i + 1, key: x.id, name: x.name,
        sub: classLabel(classes, x.classId),
        score: formatScore(x.score),
        scoreRaw: x.score,
      }));
    } else {
      // class
      const map = new Map();
      classes.forEach((c) => map.set(c.id, { id: c.id, name: c.name, recs: [] }));
      records.forEach((r) => {
        const slot = map.get(r.classId);
        if (slot) slot.recs.push(r);
      });
      let arr = Array.from(map.values())
        .map((x) => ({ ...x, score: evalRank(rankDim.expr, x.recs) }));
      arr = sortScore(arr, rankDim.order);
      return arr.map((x, i) => ({
        rank: i + 1, key: x.id, name: x.name,
        sub: `${x.recs.length} 条记录`,
        score: formatScore(x.score),
        scoreRaw: x.score,
      }));
    }
  }

  function sortScore(arr, order) {
    return arr.sort((a, b) => {
      if (isNaN(a.score) && isNaN(b.score)) return 0;
      if (isNaN(a.score) && !isNaN(b.score)) return 1;
      if (isNaN(b.score) && !isNaN(a.score)) return -1;
      return order === 'asc' ? a.score - b.score : b.score - a.score;
    });
  }

  function evalRank(expr, recs) {
    // 内置 expr：sum(count) / avg(perfNum) / mix / sum(<key>) / avg(<key>) / count
    if (!recs.length) return 0;
    if (expr === 'mix') {
      const counts = recs.map((r) => Number(r.values.count) || 0);
      const perfs = recs.map((r) => S.perfToNum(r.values.perf)).filter((n) => n > 0);
      const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
      const avgPerf = perfs.length ? perfs.reduce((a, b) => a + b, 0) / perfs.length : 0;
      // 归一化：avgCount 上限假定 5，avgPerf 上限 3
      return +(avgCount / 5 * 0.6 + avgPerf / 3 * 0.4).toFixed(3);
    }
    const m = /^(sum|avg|count)\(([^)]*)\)$/.exec(expr);
    if (!m) return 0;
    const fn = m[1];
    const key = m[2];
    if (fn === 'count') return recs.length;
    const vals = recs.map((r) => {
      if (key === 'perfNum') return S.perfToNum(r.values.perf);
      const v = r.values[key];
      return typeof v === 'number' ? v : parseFloat(v) || 0;
    });
    if (fn === 'sum') return vals.reduce((a, b) => a + b, 0);
    if (fn === 'avg') {
      const nz = vals.filter((x) => x > 0);
      return nz.length ? +(nz.reduce((a, b) => a + b, 0) / nz.length).toFixed(2) : 0;
    }
    return 0;
  }

  function formatScore(n) {
    if (n == null) return '—';
    if (typeof n !== 'number' || isNaN(n)) return '—';
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2);
  }
  function classLabel(classes, classId) {
    const c = classes.find((x) => x.id === classId);
    return c ? c.name : '(已删)';
  }

  function renderRankList(list, rankDim) {
    if (!list.length) {
      return el('div', { class: 'muted small', style: { padding: '16px 0' }, text: '暂无数据，先去班级页录入几条打卡吧。' });
    }
    const maxScore = Math.max(...list.map((x) => Number(x.scoreRaw) || 0), 1);
    const wrap = el('div', { class: 'rank-list' });
    list.slice(0, 30).forEach((r) => {
      const pct = (Number(r.scoreRaw) / maxScore) * 100;
      const row = el('div', { class: 'rank-row' + (r.rank <= 3 ? ' top-' + r.rank : '') }, [
        el('span', { class: 'rank-no', text: '#' + r.rank }),
        el('div', {}, [
          el('span', { class: 'rank-name', text: r.name }),
          r.sub ? el('span', { class: 'rank-sub', text: ' · ' + r.sub }) : null,
        ].filter(Boolean)),
        el('span', { class: 'rank-score', text: r.score }),
        el('div', { class: 'rank-bar' }, el('i', { style: { width: Math.max(3, pct) + '%' } })),
      ]);
      wrap.appendChild(row);
    });
    return wrap;
  }

  // ---------- 趋势 ----------
  function buildTrendChart(records, trendPeriod) {
    if (!records.length) {
      return el('div', { class: 'muted small', text: '暂无趋势数据。' });
    }
    const byKey = {};
    records.forEach((r) => {
      if (r.periodType !== trendPeriod) return;
      byKey[r.periodKey] = (byKey[r.periodKey] || 0) + getCountAnalyticsValue(r);
    });
    const entries = Object.entries(byKey).sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
    if (!entries.length) {
      return el('div', { class: 'muted small', text: trendPeriod === 'month' ? '暂无月度趋势数据。' : '暂无周趋势数据。' });
    }
    const max = Math.max(...entries.map((e) => e[1]), 1);
    const W = 800, H = 160, P = 24;
    const innerW = W - P * 2, innerH = H - P * 2;
    const stepX = entries.length > 1 ? innerW / (entries.length - 1) : 0;

    const points = entries.map(([k, v], i) => ({
      x: P + stepX * i,
      y: P + innerH - (v / max) * innerH,
      k, v,
    }));
    const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const areaD = pathD + ` L${P + stepX * (points.length - 1)},${P + innerH} L${P},${P + innerH} Z`;

    const svg = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity=".28"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${areaD}" fill="url(#trendGrad)"/>
        <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--bg-elev)" stroke="var(--accent)" stroke-width="2"/>`).join('')}
      </svg>
    `;
    const wrap = el('div', { html: svg });
    // x 轴 label
    const labels = el('div', {
      style: { display: 'flex', justifyContent: 'space-between', marginTop: '6px', color: 'var(--text-mute)', fontSize: '11px', fontFamily: 'var(--font-mono)' },
    });
    entries.forEach(([k, v]) => {
      const short = k.startsWith('20') && k.includes('-W')
        ? k.replace(/^\d{4}-/, '')
        : k;
      labels.appendChild(el('span', { text: `${short} · ${v}` }));
    });
    const container = el('div');
    container.appendChild(wrap);
    container.appendChild(labels);
    return container;
  }

  // ---------- 自定义排名维度对话框 ----------
  function createRankDimDialog(onDone) {
    const dims = S.listDims(false);
    const label = el('input', { type: 'text', placeholder: '例如：课堂发言总和' });
    const fn = el('select', {}, [
      el('option', { value: 'sum', text: 'SUM（求和）' }),
      el('option', { value: 'avg', text: 'AVG（平均）' }),
      el('option', { value: 'count', text: 'COUNT（记录数）' }),
    ]);
    const key = el('select', {}, [
      el('option', { value: 'count', text: '打卡次数 (count)' }),
      el('option', { value: 'perfNum', text: '表现分 (perf → 1-3)' }),
      ...dims.filter((d) => d.type === 'number' && !d.builtin)
          .map((d) => el('option', { value: d.key, text: d.label + ` (${d.key})` })),
    ]);
    const order = el('select', {}, [
      el('option', { value: 'desc', text: '降序（高到低）' }),
      el('option', { value: 'asc', text: '升序（低到高）' }),
    ]);

    const body = el('div', {}, [
      el('div', { class: 'form-row' }, [el('label', { text: '名称' }), label]),
      el('div', { class: 'form-row' }, [el('label', { text: '聚合方式' }), fn]),
      el('div', { class: 'form-row' }, [el('label', { text: '维度字段' }), key]),
      el('div', { class: 'form-row' }, [el('label', { text: '排序方向' }), order]),
      el('div', { class: 'form-hint', text: 'COUNT 不使用字段，会计算记录条数。' }),
    ]);

    window.CC.Modal.open({
      title: '自定义排名维度', body,
      foot: [
        el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => window.CC.Modal.close() }),
        el('button', {
          class: 'btn btn-primary', text: '创建',
          onclick: () => {
            const v = label.value.trim();
            if (!v) return S.toast('请输入名称', 'error');
            const expr = fn.value === 'count' ? 'count(_)' : `${fn.value}(${key.value})`;
            const rd = S.createRankDim({
              label: v, expr, order: order.value,
              scope: 'student', builtin: false,
            });
            state.rankDimId = rd.id;
            window.CC.Modal.close();
            S.toast('已添加', 'success');
            onDone && onDone();
          },
        }),
      ],
    });
  }

  window.Dashboard = { render };
})();
