/* =========================================================
 * app.js — 主应用：路由 + 主题 + 班级/学生/回收站/关于
 * 依赖：store.js, record.js, dashboard.js, export.js
 * ========================================================= */
(function () {
  'use strict';
  const S = window.Store;
  S.init();

  // ---------- 小工具 ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, props, children) => {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === 'class') e.className = props[k];
        else if (k === 'html') e.innerHTML = props[k];
        else if (k === 'text') e.textContent = props[k];
        else if (k === 'style') Object.assign(e.style, props[k]);
        else if (k.startsWith('on') && typeof props[k] === 'function') {
          e.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else if (k.startsWith('data-') || k === 'role' || k === 'aria-label' || k === 'href') {
          e.setAttribute(k, props[k]);
        } else {
          e[k] = props[k];
        }
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  };
  const fmtDateShort = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };
  function renderEmphasizedDelimiter(text, delimiter) {
    const frag = document.createDocumentFragment();
    const parts = String(text || '').split(delimiter);
    parts.forEach((part, idx) => {
      frag.appendChild(document.createTextNode(part));
      if (idx < parts.length - 1) {
        frag.appendChild(el('em', { text: delimiter }));
      }
    });
    return frag;
  }
  window.CC = { $, $$, el, fmtDateShort };

  function listActiveRecords(classId) {
    const studentIds = new Set(S.listStudents(classId).map((s) => s.id));
    return S.listRecords({ classId }).filter((r) => studentIds.has(r.studentId));
  }

  // ---------- 主题 ----------
  function applyTheme(mode) {
    const actual = mode === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    document.documentElement.setAttribute('data-theme', actual);
  }
  function initTheme() {
    const s = S.getSettings();
    applyTheme(s.theme || 'auto');
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener && mq.addEventListener('change', () => {
        if ((S.getSettings().theme || 'auto') === 'auto') applyTheme('auto');
      });
    }
    $('#themeToggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      S.setSettings({ theme: next });
      applyTheme(next);
      S.toast(next === 'dark' ? '夜间模式' : '日间模式');
    });
  }

  // ---------- Modal ----------
  const Modal = {
    open({ title, body, foot, cardClass }) {
      $('#modalTitle').textContent = title || '';
      const bodyEl = $('#modalBody'); bodyEl.innerHTML = '';
      const footEl = $('#modalFoot'); footEl.innerHTML = '';
      const cardEl = $('#modal .modal-card');
      cardEl.className = 'modal-card' + (cardClass ? ' ' + cardClass : '');
      if (body) {
        if (typeof body === 'string') bodyEl.textContent = body;
        else bodyEl.appendChild(body);
      }
      if (foot) (Array.isArray(foot) ? foot : [foot]).forEach((n) => footEl.appendChild(n));
      $('#modal').classList.add('open');
      $('#modal').setAttribute('aria-hidden', 'false');
      setTimeout(() => {
        const first = bodyEl.querySelector('input,textarea,select');
        first && first.focus();
      }, 30);
    },
    close() {
      $('#modal').classList.remove('open');
      $('#modal').setAttribute('aria-hidden', 'true');
    },
  };
  window.CC.Modal = Modal;

  $('#modal').addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close') || e.target.closest('[data-close="1"]')) Modal.close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modal').classList.contains('open')) Modal.close();
  });

  // ---------- 确认对话框 ----------
  function confirmDialog({ title, msg, okText = '确定', danger = false, onOk }) {
    const body = el('div', {}, [
      el('p', { style: { margin: 0, color: 'var(--text-soft)' }, text: msg || '' }),
    ]);
    const btnCancel = el('button', {
      class: 'btn btn-ghost',
      text: '取消',
      onclick: () => Modal.close(),
    });
    const btnOk = el('button', {
      class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'),
      text: okText,
      onclick: () => { Modal.close(); onOk && onOk(); },
    });
    Modal.open({ title: title || '确认', body, foot: [btnCancel, btnOk] });
  }

  // ---------- 路由 ----------
  const routes = {
    '#/classes': renderClasses,
    '#/dashboard': () => window.Dashboard.render($('#view')),
    '#/trash': renderTrash,
    '#/about': renderAbout,
    '#/class': renderClassSub, // #/class/:id/(record|students|settings)
  };
  function route() {
    if (window.Recorder && typeof window.Recorder.flushPendingSaves === 'function') {
      window.Recorder.flushPendingSaves();
    }
    const hash = location.hash || '#/classes';
    const segs = hash.split('/').filter(Boolean); // ['#', 'classes'] 注意 '#' 在首
    const first = '#/' + (segs[1] || 'classes');
    highlightNav(first);
    if (first === '#/class') {
      routes['#/class'](segs[2], segs[3] || 'record');
    } else {
      (routes[first] || renderClasses)();
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function highlightNav(key) {
    $$('#topNav a').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-route') === key);
    });
    // 班级详情属于班级路由
    if (key === '#/class') {
      const clsNav = $$('#topNav a').find((a) => a.getAttribute('data-route') === '#/classes');
      clsNav && clsNav.classList.add('active');
    }
  }
  window.addEventListener('hashchange', route);
  window.CC.navigate = (hash) => { location.hash = hash; };

  // ---------- 顶部 nav click ----------
  $$('#topNav a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      location.hash = a.getAttribute('data-route');
    });
  });

  // ====================================================
  //  班级列表
  // ====================================================
  function renderClasses() {
    const view = $('#view');
    view.innerHTML = '';
    const list = S.listClasses();

    if (!list.length) {
      const tpl = $('#tpl-empty-classes').content.cloneNode(true);
      view.appendChild(tpl);
      $('#heroCreate').addEventListener('click', () => createClassDialog());
      $('#heroDemo').addEventListener('click', () => {
        if (S.loadDemo()) { S.toast('示例数据已载入', 'success'); route(); }
      });
      return;
    }

    view.appendChild(el('div', { class: 'page-head anim-in' }, [
      el('div', {}, [
        el('div', { class: 'kicker', text: 'Classes' }),
        el('h1', { html: '我的 <em>班级</em>' }),
        el('p', { class: 'subtitle', text: `共 ${list.length} 个班级 · 点击卡片进入记录` }),
      ]),
      el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn btn-outline',
          html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/></svg> 回收站',
          onclick: () => (location.hash = '#/trash'),
        }),
        el('button', {
          class: 'btn btn-primary',
          html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> 新建班级',
          onclick: () => createClassDialog(),
        }),
      ]),
    ]));

    const grid = el('div', { class: 'class-grid' });
    list.forEach((c, i) => {
      const students = S.listStudents(c.id);
      const records = listActiveRecords(c.id);
      const last = records.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];

      const card = el('div', { class: 'class-card anim-in', style: { animationDelay: (0.04 * i) + 's' } }, [
        el('div', { class: 'cc-ops' }, [
          el('button', {
            class: 'icon-btn', title: '重命名', 'aria-label': '重命名',
            html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>',
            onclick: (e) => { e.stopPropagation(); renameClassDialog(c); },
          }),
          el('button', {
            class: 'icon-btn', title: '删除', 'aria-label': '删除',
            html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/></svg>',
            onclick: (e) => {
              e.stopPropagation();
              confirmDialog({
                title: '删除班级', msg: `确定删除班级「${c.name}」？可在回收站还原。`,
                okText: '移到回收站', danger: true,
                onOk: () => { S.deleteClass(c.id); S.toast('已移到回收站'); renderClasses(); },
              });
            },
          }),
        ]),
        el('div', { class: 'cc-name', text: c.name }),
        el('div', { class: 'cc-meta' }, [
          el('span', { html: `<b>${students.length}</b> 位学生` }),
          el('span', { html: `<b>${records.length}</b> 条记录` }),
        ]),
        el('div', { class: 'cc-footer' }, [
          el('span', { text: '最近记录 · ' + (last ? fmtDateShort(last.updatedAt) : '暂无') }),
          el('span', { class: 'muted small', text: fmtDateShort(c.createdAt) + ' 创建' }),
        ]),
      ]);
      card.addEventListener('click', () => (location.hash = `#/class/${c.id}/record`));
      grid.appendChild(card);
    });
    view.appendChild(grid);
  }

  function createClassDialog() {
    const input = el('input', { type: 'text', placeholder: '例如：KB2 · 周四班' });
    const body = el('div', {}, [
      el('div', { class: 'form-row' }, [
        el('label', { text: '班级名称' }),
        input,
        el('div', { class: 'form-hint', text: '支持中文/英文/数字，最多 40 字' }),
      ]),
    ]);
    const ok = () => {
      const v = input.value.trim();
      if (!v) { S.toast('请输入班级名', 'error'); input.focus(); return; }
      try {
        const c = S.createClass(v.slice(0, 40));
        Modal.close(); S.toast('班级已创建', 'success');
        location.hash = `#/class/${c.id}/record`;
      } catch (e) { S.toast(e.message, 'error'); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    Modal.open({
      title: '新建班级',
      body,
      foot: [
        el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => Modal.close() }),
        el('button', { class: 'btn btn-primary', text: '创建', onclick: ok }),
      ],
    });
  }
  function renameClassDialog(c) {
    const input = el('input', { type: 'text', value: c.name });
    const body = el('div', {}, [
      el('div', { class: 'form-row' }, [el('label', { text: '班级名称' }), input]),
    ]);
    const ok = () => {
      const v = input.value.trim();
      if (!v) return S.toast('名称不能为空', 'error');
      S.updateClass(c.id, { name: v.slice(0, 40) });
      Modal.close(); S.toast('已更新', 'success'); renderClasses();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    Modal.open({
      title: '重命名班级', body,
      foot: [
        el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => Modal.close() }),
        el('button', { class: 'btn btn-primary', text: '保存', onclick: ok }),
      ],
    });
  }

  // ====================================================
  //  班级详情（record/students/settings）
  // ====================================================
  function renderClassSub(classId, tab) {
    const view = $('#view');
    view.innerHTML = '';
    const c = S.getClass(classId);
    if (!c) {
      view.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: '班级不存在' }),
        el('p', { text: '可能已被删除。' }),
        el('a', { class: 'btn btn-outline', href: '#/classes', text: '返回班级列表' }),
      ]));
      return;
    }

    // 头
    view.appendChild(el('div', { class: 'page-head anim-in' }, [
        el('div', {}, [
          el('div', { class: 'kicker', text: 'Class' }),
          el('h1', {}, renderEmphasizedDelimiter(c.name, '·')),
          el('p', { class: 'subtitle', text: `${S.listStudents(classId).length} 位学生 · ${listActiveRecords(classId).length} 条记录` }),
        ]),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn-ghost', text: '← 所有班级', onclick: () => (location.hash = '#/classes') }),
      ]),
    ]));

    // Tabs
    const mkTab = (id, label) =>
      el('button', {
        class: 'tab' + (tab === id ? ' active' : ''),
        text: label,
        onclick: () => (location.hash = `#/class/${classId}/${id}`),
      });
    view.appendChild(el('div', { class: 'tabs' }, [
      mkTab('record', '课堂记录'),
      mkTab('students', '学生管理'),
      mkTab('settings', '班级设置'),
    ]));

    // 面板
    const panel = el('div', { class: 'anim-in d1' });
    view.appendChild(panel);

    if (tab === 'students') renderStudents(panel, classId);
    else if (tab === 'settings') renderClassSettings(panel, classId);
    else window.Recorder.render(panel, classId);
  }

  // ---------- 学生管理 ----------
  function renderStudents(root, classId) {
    root.innerHTML = '';
    const list = S.listStudents(classId);

    root.appendChild(el('div', { class: 'toolbar' }, [
      el('span', { class: 'muted small', html: `共 <b style="color:var(--text);font-family:var(--font-mono)">${list.length}</b> 位学生` }),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'btn btn-outline btn-sm', text: '批量导入',
        onclick: () => bulkImportDialog(classId),
      }),
      el('button', {
        class: 'btn btn-primary btn-sm', text: '+ 添加学生',
        onclick: () => addStudentDialog(classId),
      }),
    ]));

    if (!list.length) {
      root.appendChild(el('div', { class: 'empty' }, [
        el('h3', { text: '还没有学生' }),
        el('p', { text: '添加一个学生后，就能开始记录。' }),
        el('button', { class: 'btn btn-primary', text: '+ 添加学生', onclick: () => addStudentDialog(classId) }),
      ]));
      return;
    }

    const wrap = el('div', { class: 'table-wrap' });
    const tbl = el('table', { class: 'grid' });
    tbl.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { text: '#' }),
      el('th', { text: '姓名' }),
      el('th', { text: '排序' }),
      el('th', { text: '加入时间' }),
      el('th', { style: { textAlign: 'right' }, text: '操作' }),
    ])));
    const tbody = el('tbody');
    list.forEach((s, i) => {
      const nameIn = el('input', {
        class: 'inline-input', type: 'text', value: s.name,
        onchange: (e) => {
          const v = e.target.value.trim();
          if (!v) { e.target.value = s.name; return; }
          S.updateStudent(s.id, { name: v }); S.toast('已保存');
        },
      });
      const orderIn = el('input', {
        class: 'inline-input', type: 'number', value: s.order, style: { width: '70px' },
        onchange: (e) => {
          const v = parseInt(e.target.value, 10) || 0;
          S.updateStudent(s.id, { order: v });
          renderStudents(root, classId);
        },
      });
      tbody.appendChild(el('tr', {}, [
        el('td', { class: 'td-index', text: i + 1 }),
        el('td', { class: 'td-name' }, nameIn),
        el('td', {}, orderIn),
        el('td', { class: 'muted small', text: fmtDateShort(s.createdAt) }),
        el('td', { style: { textAlign: 'right' } }, [
          el('button', {
            class: 'btn btn-ghost btn-xs', text: '移到回收站',
            onclick: () => {
              S.deleteStudent(s.id);
              S.toast('已移到回收站'); renderStudents(root, classId);
            },
          }),
        ]),
      ]));
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    root.appendChild(wrap);
  }

  function addStudentDialog(classId) {
    const input = el('input', { type: 'text', placeholder: '学生姓名' });
    const ok = () => {
      const v = input.value.trim();
      if (!v) return S.toast('姓名不能为空', 'error');
      S.createStudent(classId, v);
      Modal.close(); S.toast('已添加', 'success');
      route();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    Modal.open({
      title: '添加学生',
      body: el('div', {}, [el('div', { class: 'form-row' }, [el('label', { text: '姓名' }), input])]),
      foot: [
        el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => Modal.close() }),
        el('button', { class: 'btn btn-primary', text: '添加', onclick: ok }),
      ],
    });
  }
  function bulkImportDialog(classId) {
    const ta = el('textarea', {
      placeholder: '每行一个姓名，例如：\n张嘉和\n李若辰\n王可昕',
      rows: 8,
    });
    const ok = () => {
      const names = ta.value.trim();
      if (!names) return S.toast('请输入姓名', 'error');
      const added = S.bulkCreateStudents(classId, names);
      Modal.close();
      S.toast(`已导入 ${added.length} 位`, 'success');
      route();
    };
    Modal.open({
      title: '批量导入学生',
      body: el('div', {}, [
        el('div', { class: 'form-row' }, [
          el('label', { text: '姓名（换行或逗号分隔）' }),
          ta,
          el('div', { class: 'form-hint', text: '支持中英文姓名，空行会被忽略。' }),
        ]),
      ]),
      foot: [
        el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => Modal.close() }),
        el('button', { class: 'btn btn-primary', text: '导入', onclick: ok }),
      ],
    });
  }

  // ---------- 班级设置（维度管理） ----------
  function renderClassSettings(root, classId) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'toolbar' }, [
      el('span', { class: 'muted small', text: '管理本应用的评价维度（全局共享）' }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-primary btn-sm', text: '+ 新增维度', onclick: () => createDimDialog() }),
    ]));

    const dims = S.listDims(false);
    const list = el('div', { class: 'dim-list' });
    dims.forEach((d) => {
      const orderedDims = dims.slice();
      const idx = orderedDims.findIndex((x) => x.id === d.id);
      const meta = (() => {
        if (d.type === 'number') return `数值 · 范围 ${d.config.min ?? 0} – ${d.config.maxFormula === 'weekCap' ? '5 (月视图按周数×5)' : (d.config.max ?? 99)}`;
        if (d.type === 'enum') return `选项 · ${(d.config.options || []).map((o) => o.label).join(' / ')}`;
        return '文本';
      })();
      list.appendChild(el('div', { class: 'dim-card' }, [
        el('div', {}, [
          el('div', {}, [
            el('b', { text: d.label }),
            d.builtin ? el('span', { class: 'badge count', style: { marginLeft: '8px' }, text: '内置' }) : null,
            !d.visible ? el('span', { class: 'badge cheer', style: { marginLeft: '8px' }, text: '已隐藏' }) : null,
          ].filter(Boolean)),
          el('div', { class: 'dim-meta', text: meta }),
        ]),
        el('div', { class: 'dim-ops' }, [
          el('button', {
            class: 'btn btn-ghost btn-xs', text: '上移',
            disabled: idx === 0,
            onclick: () => {
              S.moveDim(d.id, -1);
              renderClassSettings(root, classId);
            },
          }),
          el('button', {
            class: 'btn btn-ghost btn-xs', text: '下移',
            disabled: idx === orderedDims.length - 1,
            onclick: () => {
              S.moveDim(d.id, 1);
              renderClassSettings(root, classId);
            },
          }),
          el('button', {
            class: 'btn btn-ghost btn-xs', text: d.visible ? '隐藏' : '显示',
            onclick: () => { S.updateDim(d.id, { visible: !d.visible }); renderClassSettings(root, classId); },
          }),
          !d.builtin ? el('button', {
            class: 'btn btn-ghost btn-xs', text: '编辑',
            onclick: () => editDimDialog(d, () => renderClassSettings(root, classId)),
          }) : null,
          !d.builtin ? el('button', {
            class: 'btn btn-ghost btn-xs', text: '删除',
            onclick: () => confirmDialog({
              title: '删除维度', msg: `确定删除「${d.label}」？`,
              okText: '删除', danger: true,
              onOk: () => { S.deleteDim(d.id); renderClassSettings(root, classId); S.toast('已删除'); },
            }),
          }) : null,
        ].filter(Boolean)),
      ]));
    });
    root.appendChild(list);
  }

  function createDimDialog() {
    const name = el('input', { type: 'text', placeholder: '例如：课堂发言' });
    const type = el('select', {}, [
      el('option', { value: 'number', text: '数值' }),
      el('option', { value: 'enum', text: '选项（单选）' }),
      el('option', { value: 'text', text: '文本' }),
    ]);
    const extra = el('div');
    const body = el('div', {}, [
      el('div', { class: 'form-row' }, [el('label', { text: '维度名称' }), name]),
      el('div', { class: 'form-row' }, [el('label', { text: '类型' }), type]),
      extra,
    ]);

    function renderExtra() {
      extra.innerHTML = '';
      if (type.value === 'number') {
        extra.appendChild(el('div', { class: 'form-row' }, [
          el('label', { text: '最小值' }),
          el('input', { type: 'number', value: 0, id: '__dim_min' }),
        ]));
        extra.appendChild(el('div', { class: 'form-row' }, [
          el('label', { text: '最大值' }),
          el('input', { type: 'number', value: 10, id: '__dim_max' }),
        ]));
      } else if (type.value === 'enum') {
        extra.appendChild(el('div', { class: 'form-row' }, [
          el('label', { text: '选项（每行一个，格式 值|显示名|颜色，颜色可省）' }),
          el('textarea', {
            id: '__dim_opts', rows: 5,
            placeholder: 'a|优秀|var(--success)\nb|合格|var(--warning)\nc|需努力|var(--danger)',
          }),
        ]));
      } else {
        extra.appendChild(el('div', { class: 'form-row' }, [
          el('label', { text: '占位提示' }),
          el('input', { type: 'text', id: '__dim_ph', placeholder: '一句话…' }),
        ]));
      }
    }
    type.addEventListener('change', renderExtra);
    renderExtra();

    const ok = () => {
      const label = name.value.trim();
      if (!label) return S.toast('请输入名称', 'error');
      let dim;
      if (type.value === 'number') {
        dim = {
          label, type: 'number',
          config: {
            min: parseFloat($('#__dim_min', extra).value) || 0,
            max: parseFloat($('#__dim_max', extra).value) || 10,
          },
        };
      } else if (type.value === 'enum') {
        const lines = $('#__dim_opts', extra).value.trim().split('\n').filter(Boolean);
        const options = lines.map((ln) => {
          const [v, l, c] = ln.split('|').map((x) => x && x.trim());
          return { value: v || S.uid(), label: l || v, color: c || 'var(--accent)' };
        });
        if (!options.length) return S.toast('至少一个选项', 'error');
        dim = { label, type: 'enum', config: { options } };
      } else {
        dim = {
          label, type: 'text',
          config: { placeholder: ($('#__dim_ph', extra).value || '').trim() },
        };
      }
      S.createDim(dim);
      Modal.close(); S.toast('已添加', 'success');
      route();
    };

    Modal.open({
      title: '新增评价维度', body,
      foot: [
        el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => Modal.close() }),
        el('button', { class: 'btn btn-primary', text: '创建', onclick: ok }),
      ],
    });
  }
  function editDimDialog(d, onDone) {
    const name = el('input', { type: 'text', value: d.label });
    const body = el('div', {}, [
      el('div', { class: 'form-row' }, [el('label', { text: '维度名称' }), name]),
      el('div', { class: 'form-hint', text: '类型不可更改。如需改类型，请删除后重建。' }),
    ]);
    Modal.open({
      title: '编辑维度', body,
      foot: [
        el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => Modal.close() }),
        el('button', {
          class: 'btn btn-primary', text: '保存',
          onclick: () => {
            const v = name.value.trim();
            if (!v) return S.toast('名称不能为空', 'error');
            S.updateDim(d.id, { label: v });
            Modal.close(); S.toast('已保存', 'success'); onDone && onDone();
          },
        }),
      ],
    });
  }

  // ====================================================
  //  回收站
  // ====================================================
  function renderTrash() {
    const view = $('#view');
    view.innerHTML = '';
    const trash = S.listTrash();

    view.appendChild(el('div', { class: 'page-head anim-in' }, [
      el('div', {}, [
        el('div', { class: 'kicker', text: 'Trash' }),
        el('h1', { html: '<em>回收站</em>' }),
        el('p', { class: 'subtitle', text: '30 天内可还原（暂无自动清理策略）' }),
      ]),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn-ghost', text: '← 所有班级', onclick: () => (location.hash = '#/classes') }),
      ]),
    ]));

    const cols = el('div', { class: 'trash-cols anim-in d1' });

    // 班级列
    const colClasses = el('div', {}, [el('h3', { style: { marginTop: 0 }, text: `班级（${trash.classes.length}）` })]);
    if (!trash.classes.length) {
      colClasses.appendChild(el('div', { class: 'muted small', text: '暂无。' }));
    } else {
      trash.classes.forEach((c) => {
        colClasses.appendChild(el('div', { class: 'trash-card' }, [
          el('div', {}, [
            el('div', { style: { fontWeight: 500 }, text: c.name }),
            el('div', { class: 'tc-meta', text: '删除于 ' + fmtDateShort(c.archivedAt) }),
          ]),
          el('div', { class: 'tc-ops' }, [
            el('button', {
              class: 'btn btn-outline btn-xs', text: '还原',
              onclick: () => { S.restoreClass(c.id); S.toast('已还原'); renderTrash(); },
            }),
            el('button', {
              class: 'btn btn-danger btn-xs', text: '永久删除',
              onclick: () => confirmDialog({
                title: '永久删除班级', msg: `「${c.name}」的所有数据将被清除，无法恢复。`,
                okText: '删除', danger: true,
                onOk: () => { S.purgeClass(c.id); renderTrash(); S.toast('已永久删除'); },
              }),
            }),
          ]),
        ]));
      });
    }
    cols.appendChild(colClasses);

    // 学生列
    const colStudents = el('div', {}, [el('h3', { style: { marginTop: 0 }, text: `学生（${trash.students.length}）` })]);
    if (!trash.students.length) {
      colStudents.appendChild(el('div', { class: 'muted small', text: '暂无。' }));
    } else {
      trash.students.forEach((s) => {
        const c = S.getClass(s.classId);
        colStudents.appendChild(el('div', { class: 'trash-card' }, [
          el('div', {}, [
            el('div', { style: { fontWeight: 500 }, text: s.name }),
            el('div', { class: 'tc-meta', text: (c ? c.name : '(班级已删)') + ' · 删除于 ' + fmtDateShort(s.archivedAt) }),
          ]),
          el('div', { class: 'tc-ops' }, [
            el('button', {
              class: 'btn btn-outline btn-xs', text: '还原',
              disabled: !c,
              onclick: () => { S.restoreStudent(s.id); S.toast('已还原'); renderTrash(); },
            }),
            el('button', {
              class: 'btn btn-danger btn-xs', text: '永久删除',
              onclick: () => confirmDialog({
                title: '永久删除学生', msg: `「${s.name}」及其所有记录将被清除。`,
                okText: '删除', danger: true,
                onOk: () => { S.purgeStudent(s.id); renderTrash(); S.toast('已永久删除'); },
              }),
            }),
          ]),
        ]));
      });
    }
    cols.appendChild(colStudents);

    view.appendChild(cols);
  }

  // ====================================================
  //  关于
  // ====================================================
  function renderAbout() {
    $('#view').innerHTML = `
      <div class="page-head anim-in">
        <div>
          <div class="kicker">About</div>
          <h1>关于 <em>Claude Class</em></h1>
          <p class="subtitle">一个温柔而清晰的课堂记录工具</p>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" onclick="location.hash='#/classes'">← 返回</button>
        </div>
      </div>
      <div class="dash-section anim-in d1" style="max-width:760px">
        <p>Claude Class 为老师而设计，全部数据保存在本浏览器的 localStorage，不上传不同步。</p>
        <hr class="hr-dotted"/>
        <h3>功能清单</h3>
        <ul style="line-height:1.9;color:var(--text-soft)">
          <li><b>班级 / 学生管理</b>：增删改查，批量导入，误删可在回收站还原</li>
          <li><b>多维度评价</b>：三项内置维度（打卡次数、表现、评语）+ 支持新增自定义数值 / 选项 / 文本维度</li>
          <li><b>周视图 & 月视图</b>：次数上限自动按周数×周上限，单元格自动保存</li>
          <li><b>数据看板</b>：个人 / 班级 / 总排名，内置 + 自定义排名维度，趋势折线图</li>
          <li><b>导出长图</b>：一键生成手机竖屏 PNG，智能宽度自适应，四种风格可选</li>
          <li><b>回收站</b>：班级和学生支持软删除与还原，永久删除前二次确认</li>
          <li><b>明暗主题</b>：跟随系统或手动切换，无 FOUC 闪烁</li>
        </ul>
        <hr class="hr-dotted"/>
        <p class="muted small">版本 ${S.VERSION} · 2026 · Made by Yeahger and his agent mates.</p>
      </div>
    `;
  }

  // ---------- 启动 ----------
  initTheme();
  route();
})();
