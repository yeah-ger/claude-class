/* =========================================================
 * export.js — 导出图片
 * 职责：预览卡片 + 样式切换 + html2canvas 抓图为 PNG
 * 暴露：window.Exporter.open({ classId, periodType, periodKey })
 * ========================================================= */
(function () {
  'use strict';
  const S = window.Store;
  // 延迟取 el（同样的原因）
  const el = function () { return window.CC.el.apply(null, arguments); };

  const STYLES = [
    { key: 'warm',  name: 'Warm 米白',   desc: '默认，温暖克制' },
    { key: 'mono',  name: 'Mono 极简',   desc: '黑白素纸' },
    { key: 'paper', name: 'Paper 牛皮',  desc: '噪点 + 暖棕' },
    { key: 'dusk',  name: 'Dusk 夜幕',   desc: '深墨 + 橙焦点' },
  ];
  const CARD_MIN = 300;
  const CARD_MAX = 390;

  let state = {
    classId: null,
    periodType: null,
    periodKey: null,
    style: 'warm',
    note: '',
    aliases: null,
  };

  function getDefaultAliases() {
    return {
      nameCol: '姓名',
      countCol: '次数',
      feedbackCol: '作业点评',
      countPrefix: '次数',
    };
  }
  function loadAliases() {
    const s = S.getSettings();
    return { ...getDefaultAliases(), ...(s.exportAliases || {}) };
  }
  function saveAliases(aliases) {
    S.setSettings({ exportAliases: aliases });
  }

  function formatLocalDateStamp(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function calcCardWidth(students, exportDims, useTable) {
    // 基础宽度：学生少时紧凑
    let w = CARD_MIN;
    const n = students.length;
    if (n > 6) w = 320;
    if (n > 12) w = 340;
    if (n > 20) w = CARD_MAX;
    // 明细布局需要更宽
    if (!useTable) w = Math.max(w, 340);
    // 兜底
    return Math.min(CARD_MAX, Math.max(CARD_MIN, w));
  }

  function open(opts) {
    state.classId = opts.classId;
    state.periodType = opts.periodType;
    state.periodKey = opts.periodKey;
    state.style = 'warm';
    state.note = defaultNote();
    state.aliases = loadAliases();

    const body = el('div', { class: 'export-preview-wrap' }, [
      // 左：配置
      el('div', {}, [
        el('div', { class: 'form-row' }, [
          el('label', { text: '样式' }),
          el('div', { class: 'export-styles', id: 'expStyles' },
            STYLES.map((s) =>
              el('div', {
                class: 'style-opt' + (state.style === s.key ? ' active' : ''),
                'data-style': s.key,
                onclick: () => {
                  state.style = s.key;
                  document.querySelectorAll('#expStyles .style-opt').forEach((n) =>
                    n.classList.toggle('active', n.getAttribute('data-style') === s.key));
                  rebuildPreview();
                },
              }, [
                el('div', { class: 'sw' }),
                el('div', {}, [
                  el('div', { class: 'name', text: s.name }),
                  el('div', { class: 'desc', text: s.desc }),
                ]),
              ])
            )
          ),
        ]),
        el('div', { class: 'form-row' }, [
          el('label', { text: '老师寄语（可选）' }),
          (() => {
            const ta = el('textarea', {
              rows: 3, placeholder: '一句话总结本周课堂…',
              value: state.note,
            });
            ta.addEventListener('input', () => { state.note = ta.value; rebuildPreview(); });
            return ta;
          })(),
          el('div', { class: 'form-hint', text: '会显示在图片顶部，类似批注卡片。' }),
        ]),
        // 列名设置
        (() => {
          const aliases = state.aliases;
          const mkInput = (label, key, placeholder) => {
            const inp = el('input', {
              type: 'text',
              value: aliases[key],
              placeholder,
              style: { width: '100%', padding: '6px 10px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-elev)' },
            });
            inp.addEventListener('input', () => {
              aliases[key] = inp.value;
              rebuildPreview();
            });
            inp.addEventListener('blur', () => { saveAliases(aliases); });
            return el('div', { style: { marginBottom: '8px' } }, [
              el('label', { text: label, style: { display: 'block', fontSize: '12px', color: 'var(--text-mute)', marginBottom: '3px' } }),
              inp,
            ]);
          };
          return el('div', { class: 'form-row' }, [
            el('label', { text: '列名设置（可选）' }),
            el('div', { class: 'export-aliases' }, [
              mkInput('姓名列', 'nameCol', '姓名'),
              mkInput('次数列', 'countCol', '次数'),
              mkInput('点评列', 'feedbackCol', '作业点评'),
              mkInput('明细前缀', 'countPrefix', '次数'),
            ]),
            el('div', { class: 'form-hint', text: '仅影响导出图片中的显示，不修改记录页。' }),
          ]);
        })(),
      ]),
      // 右：预览
      el('div', { class: 'export-preview', id: 'expPreview' }),
    ]);

    window.CC.Modal.open({
      title: '导出图片 · 预览',
      body,
      cardClass: 'modal-card-wide',
      foot: [
        el('button', {
          class: 'btn btn-ghost', text: '取消',
          onclick: () => window.CC.Modal.close(),
        }),
        el('button', {
          class: 'btn btn-primary',
          html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> 下载 PNG',
          onclick: () => doDownload(),
        }),
      ],
    });

    // 等 DOM ready，再首渲预览
    setTimeout(rebuildPreview, 10);
  }

  function rebuildPreview() {
    const mount = document.getElementById('expPreview');
    if (!mount) return;
    mount.innerHTML = '';
    mount.appendChild(el('div', { class: 'export-canvas' }, buildCard({
      id: 'expCard',
    })));
  }

  function buildCard(opts) {
    opts = opts || {};
    const c = S.getClass(state.classId);
    const dims = S.listDims(true);
    const students = S.listStudents(state.classId);
    const exportDims = dims.filter((d) => d.key !== 'count');
    const periodLabel = state.periodType === 'week'
      ? S.formatWeekLabel(state.periodKey)
      : S.formatMonthLabel(state.periodKey);

    // 智能宽度：根据学生数量和维度多少自适应
    const useTable = exportDims.length <= 2;
    const cardWidth = calcCardWidth(students, exportDims, useTable);

    const card = el('div', { class: 'export-card ' + state.style, id: opts.id || '' });
    card.style.width = cardWidth + 'px';
    card.style.maxWidth = cardWidth + 'px';

    // head
    card.appendChild(el('div', { class: 'ec-kicker', text: 'Class Report' }));
    card.appendChild(el('h2', { class: 'ec-title', text: c ? c.name : '班级' }));
    card.appendChild(el('div', { class: 'ec-period', text: periodLabel }));

    // note
    if (state.note && state.note.trim()) {
      card.appendChild(el('div', { class: 'ec-note', text: state.note.trim() }));
    }

    // 维度少：表格布局；维度多：明细卡片布局
    let any = false;

    const aliases = state.aliases || getDefaultAliases();

    if (useTable) {
      const tbl = el('table', { class: 'ec-tbl' });
      tbl.appendChild(el('thead', {}, el('tr', {}, [
        el('th', { text: aliases.nameCol }),
        el('th', { style: { textAlign: 'center' }, text: aliases.countCol }),
        el('th', { text: aliases.feedbackCol }),
      ])));
      const tbody = el('tbody');
      students.forEach((s) => {
        const rec = S.getRecord(state.classId, s.id, state.periodType, state.periodKey);
        const v = rec ? rec.values : {};
        const count = v.count;
        const feedback = buildFeedbackCell(exportDims, v);
        if (count == null && !feedback) return;
        any = true;
        tbody.appendChild(el('tr', {}, [
          el('td', { class: 'name', text: s.name }),
          el('td', { class: 'cnt' }, count != null ? el('b', { text: count }) : document.createTextNode('—')),
          el('td', { class: 'cmt' }, feedback || document.createTextNode('—')),
        ]));
      });
      tbl.appendChild(tbody);
      if (any) card.appendChild(tbl);
    } else {
      const wrap = el('div', { class: 'ec-detail-wrap' });
      students.forEach((s) => {
        const rec = S.getRecord(state.classId, s.id, state.periodType, state.periodKey);
        const v = rec ? rec.values : {};
        const count = v.count;
        const hasDims = exportDims.some((d) => formatDimValue(d, v[d.key]));
        if (count == null && !hasDims) return;
        any = true;
        wrap.appendChild(buildDetailBlock(s, exportDims, v, count));
      });
      if (any) card.appendChild(wrap);
    }

    if (!any) {
      card.appendChild(el('div', {
        style: { textAlign: 'center', padding: '30px 0', opacity: .6 },
        text: '本周期暂无记录',
      }));
    }

    // 底
    card.appendChild(el('div', { class: 'ec-foot' }, [
      el('span', { text: formatLocalDateStamp(new Date()) }),
      el('span', { class: 'ec-seal', text: 'Claude Class' }),
    ]));

    return card;
  }

  function defaultNote() {
    const c = S.getClass(state.classId);
    if (!c) return '';
    return `亲爱的家长：以下是 ${c.name} 本期的课堂记录，辛苦查阅。`;
  }

  // 表格布局：cmt 列内每个维度一行
  function buildFeedbackCell(dims, values) {
    const wrap = el('div', { class: 'ec-feedback' });
    let hasAny = false;

    // perf 单独一行（徽章样式）
    const perfDim = dims.find((d) => d.key === 'perf');
    if (perfDim) {
      const raw = values[perfDim.key];
      const formatted = formatDimValue(perfDim, raw);
      if (formatted) {
        hasAny = true;
        wrap.appendChild(el('div', { class: 'ec-fb-perf' }, [
          el('span', { class: 'ec-fb-tag ec-fb-tag--' + (raw || ''), text: formatted }),
        ]));
      }
    }

    // 其他维度垂直排列
    dims.filter((d) => d.key !== 'perf').forEach((dim) => {
      const raw = values[dim.key];
      const formatted = formatDimValue(dim, raw);
      if (!formatted) return;
      hasAny = true;
      wrap.appendChild(el('div', { class: 'ec-fb-row' }, [
        el('span', { class: 'ec-fb-label', text: dim.label + '：' }),
        el('span', { class: 'ec-fb-text', text: formatted }),
      ]));
    });

    return hasAny ? wrap : null;
  }

  // 明细卡片布局（维度多时）
  function buildDetailBlock(student, dims, values, count) {
    const aliases = state.aliases || getDefaultAliases();
    const block = el('div', { class: 'ec-detail' });

    // 头部：姓名 + 次数
    const headChildren = [el('span', { class: 'ec-detail-name', text: student.name || '(未命名)' })];
    if (count != null) {
      headChildren.push(el('span', { class: 'ec-detail-count', text: (aliases.countPrefix || '次数') + ' ' + count }));
    }
    block.appendChild(el('div', { class: 'ec-detail-head' }, headChildren));

    // 分隔线
    block.appendChild(el('div', { class: 'ec-detail-line' }));

    // 维度列表
    const dimsWrap = el('div', { class: 'ec-detail-dims' });
    dims.forEach((dim) => {
      const raw = values[dim.key];
      const formatted = formatDimValue(dim, raw);
      if (!formatted) return;
      const row = el('div', { class: 'ec-detail-row' }, [
        el('span', { class: 'ec-detail-label', text: dim.label }),
        el('span', { class: 'ec-detail-val' + (dim.key === 'perf' ? ' ec-detail-val--' + raw : '') }, formatted),
      ]);
      dimsWrap.appendChild(row);
    });
    block.appendChild(dimsWrap);

    return block;
  }

  function formatDimValue(dim, value) {
    if (value == null) return '';
    if (dim.type === 'text') {
      if (typeof value === 'undefined') return '';
      return String(value).trim();
    }
    if (dim.type === 'enum') {
      const opt = (dim.config.options || []).find((item) => item.value === value);
      return opt ? opt.label : String(value).trim();
    }
    if (dim.type === 'number') return String(value);
    return String(value).trim();
  }

  // ---------- 下载 ----------
  async function doDownload() {
    const previewCard = document.getElementById('expCard');
    if (!previewCard) return;

    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) {}
    }

    // 克隆预览卡进行截图，保持导出结果与预览一致。
    const clone = previewCard.cloneNode(true);
    clone.style.margin = '0';

    // 放在页面内（而非远距离离屏），避免浏览器对离屏元素布局计算不完整
    const sandbox = document.createElement('div');
    sandbox.style.position = 'fixed';
    sandbox.style.left = '0';
    sandbox.style.top = '0';
    sandbox.style.opacity = '0';
    sandbox.style.pointerEvents = 'none';
    sandbox.style.zIndex = '-1';
    document.body.appendChild(sandbox);
    sandbox.appendChild(clone);

    const bgMap = { warm: '#faf9f5', mono: '#ffffff', paper: '#f2e6cf', dusk: '#1a1916' };
    const bg = bgMap[state.style] || '#ffffff';

    let canvas;
    try {
      canvas = await html2canvas(clone, {
        backgroundColor: bg,
        scale: 2,
        useCORS: true,
        logging: false,
      });
    } catch (e) {
      console.error(e);
      S.toast('导出失败：' + e.message, 'error');
      sandbox.remove();
      return;
    }

    sandbox.remove();

    canvas.toBlob((blob) => {
      if (!blob) { S.toast('导出失败', 'error'); return; }
      const c = S.getClass(state.classId);
      const fname = [
        (c ? c.name : '班级').replace(/[\\\/:*?"<>|]/g, '_'),
        state.periodKey,
        state.style,
      ].join('_') + '.png';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      S.toast('已下载 ' + fname, 'success');
    }, 'image/png');
  }

  window.Exporter = { open };
})();
