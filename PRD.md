# Claude Class — 班级打卡与点评系统

> 一个 Claude 官网风格的纯前端 Web 应用，用于记录班级学生的打卡表现与简要点评，支持一键导出手机竖屏长图、多维度排名看板。

- 版本：v1.0
- 日期：2026-04-18
- 仓库形态：纯前端静态项目
- 打开方式：浏览器直接双击 `index.html`（纯前端，无需服务器）

---

## 1. 目标与范围

### 1.1 目标
为英语老师提供一个**轻量、美观、离线可用**的班级打卡记录工具，重点解决：
1. 快速录入：一周/一月内对全班打卡情况批量打分、写点评
2. 漂亮导出：一键生成手机屏幕友好的点评长图，用于发班群
3. 数据沉淀：多班级多周期的数据可视化排名

### 1.2 非目标
- 不做多用户账户系统（单机本地存储）
- 不做后端同步（全部 localStorage）
- 不做移动端原生 App（响应式 Web 即可）

---

## 2. 技术方案

| 项 | 选型 | 理由 |
|---|---|---|
| 技术栈 | 原生 HTML / CSS / JS | 零依赖、`file://` 直开、无 CORS 问题 |
| 持久化 | localStorage | 单机够用，键名 `cc_*` 前缀 |
| 导出 | html2canvas 1.4.1（本地副本） | 成熟稳定，离线也可导出 PNG |
| 字体 | Google Fonts — Copernicus/Tiempos Headline 风格替代（Fraunces 显示 + Inter Tight 正文） | 接近 Claude 官网质感 |
| 图标 | 内联 SVG | 无依赖，主题可切色 |
| 打开方式 | `file://` | 放桌面双击即可 |

### 2.1 目录结构
```
project-root/
├── index.html          # 入口
├── PRD.md              # 本文档
├── css/
│   └── style.css       # 所有样式
├── js/
│   ├── store.js        # 数据层（localStorage CRUD）
│   ├── app.js          # 视图路由 + 班级/学生 + 回收站
│   ├── record.js       # 打卡评价模块
│   ├── dashboard.js    # 看板模块
│   └── export.js       # 导出模块
└── lib/
    └── html2canvas.min.js  # 本地副本（离线也可用）
```

---

## 3. 设计系统（Claude 官网风）

### 3.1 色彩 Tokens

**Light 模式（基调：温暖米白 + 橙焦点）**
```
--bg          #faf9f5   # 主背景
--bg-elev     #ffffff   # 卡片
--bg-subtle   #f0eee6   # 次要面板
--border      #e8e6dc   # 分隔线
--text        #141413   # 主文本
--text-mute   #6b6a63   # 次要文本
--accent      #d97757   # Claude 橙（主强调）
--accent-2    #6a9bcc   # 蓝（次强调）
--accent-3    #788c5d   # 绿（三强调）
--success     #788c5d   # 优
--warning     #d4a24d   # 良
--danger      #c05850   # 加油
```

**Dark 模式（基调：深墨 + 暖橙保留）**
```
--bg          #1a1916
--bg-elev     #252420
--bg-subtle   #2d2c27
--border      #3a3832
--text        #ecebe4
--text-mute   #9a9890
--accent      #e88f70   # 夜间版本更亮一档
--accent-2    #82b0d6
--accent-3    #8ea86f
```

### 3.2 字体
- 显示字体：**Fraunces**（600/700，细腻衬线，贴合 Claude 的 Copernicus 气质）
- 正文字体：**Inter Tight**（400/500/600）
- 数字字体：**JetBrains Mono**（看板数据展示）

### 3.3 度量
- 圆角：`--r-sm: 6px` / `--r: 10px` / `--r-lg: 16px`
- 间距基准：8px 栅格
- 阴影：柔和双层（`0 1px 2px rgba(20,20,19,.04), 0 4px 16px rgba(20,20,19,.06)`）
- 动效：`cubic-bezier(.2,.7,.2,1)` 180-280ms

### 3.4 组件气质
- 按钮：主按钮橙填充、次按钮描边、幽灵按钮纯文本
- 表格：斑马条 + 悬停高亮，胶囊状分数徽章
- 卡片：薄边 + 微阴影，非毛玻璃
- 顶部导航：左 Logo + 文字、右主题切换 + 设置入口
- 整体：**克制、文雅、间距大**，不是科技感/炫光

---

## 4. 数据模型

### 4.1 实体

```js
Class {
  id: string (uuid)
  name: string
  createdAt: iso
  archived: false
}

Student {
  id: string
  classId: string
  name: string
  order: number          // 表格排序
  createdAt: iso
  archived: false        // 软删除进回收站
}

// 评价维度（可自定义）
Dimension {
  id: string
  key: string            // 内置 key: 'count' | 'perf' | 'remark'；自定义 key 前缀 'custom_'
  label: string          // 显示名：打卡次数 / 打卡表现 / 简要评语 / ...
  type: 'number' | 'enum' | 'text'
  config: {
    // number：min / max / maxFormula（'weekCap'=5 或 '5*weeks'）
    // enum：options: [{value, label, color}]
  }
  builtin: boolean       // 内置维度不可删
  visible: true
  order: number
}

// 默认维度
DEFAULT_DIMS = [
  { key:'count',  label:'打卡次数', type:'number', config:{ min:0, max:5, maxFormula:'weekCap' } },
  { key:'perf',   label:'打卡表现', type:'enum',   config:{ options:[
      {value:'excellent', label:'优',   color:'var(--success)'},
      {value:'good',      label:'良',   color:'var(--warning)'},
      {value:'cheer',     label:'加油', color:'var(--danger)'}
  ]}},
  { key:'remark', label:'简要评语', type:'text',   config:{ placeholder:'一句话点评…' } }
]

// 一条记录 = 某学生在某周期的一组维度值
Record {
  id: string
  classId: string
  studentId: string
  periodType: 'week' | 'month'
  periodKey: string      // 'W' + ISO 年周 like '2026-W16'；'M' + '2026-04'
  values: { [dimKey]: any }
  updatedAt: iso
}

// 排名维度（看板用）
RankDim {
  id, label,
  expr: string           // 计算表达式，内置见 §7.3；自定义支持 dim 引用
  order: 'desc' | 'asc'
  scope: 'student' | 'class' | 'overall'
  builtin: boolean
}
```

### 4.2 localStorage 键
```
cc_classes          Class[]
cc_students         Student[]
cc_dims             Dimension[]
cc_records          Record[]
cc_rankdims         RankDim[]
cc_trash            { classes:[], students:[] }   // 回收站
cc_settings         { theme:'light'|'dark'|'auto', lastClassId, lastPeriod }
cc_version          '1.0'
```

### 4.3 周期计算
- 周：ISO 8601，周一开始，`YYYY-Www`
- 月：`YYYY-MM`
- **月视图 count 上限**：若当月包含 N 个 ISO 周，则 `max = 5 × N`
- 计算方式：`getISOWeeksInMonth(year, month)`（月内完整包含/部分包含的周数，默认"部分即计"）

---

## 5. 功能规格

### 5.1 班级与学生管理（回收站）

**班级列表页**
- 顶部："+ 新建班级"、搜索框
- 卡片网格：班级名 / 学生数 / 最近一次记录时间 / 操作
- 操作：进入、重命名、删除（→ 回收站）

**班级详情页（默认入口）**
- Tab：打卡记录（默认）| 学生管理 | 设置
- 学生管理表格：姓名、排序、创建时间、操作（改名 / 移除）
- 批量导入：粘贴姓名列表（换行分隔），一键建学生

**回收站页**
- 分段：被删班级 | 被删学生
- 操作：还原 / 永久删除
- 班级还原 → 该班级下学生保留原状
- 永久删除 → 级联清理 records

### 5.2 打卡记录

**切换视图**：周视图 / 月视图 单选
**切换周期**：左右箭头 + 日期选择器（周选星期/月选月份）
**切换班级**：顶部下拉

**表格列**（顺序）：
1. 序号
2. 学生姓名
3. 打卡次数（1-5 胶囊选择器，0 表示未打卡）
4. 打卡表现（优/良/加油 胶囊）
5. 简要评语（单行输入，弹窗展开多行）
6. 自定义维度列（按 `visible && order`）
7. 操作（清空当行）

**交互**：
- 任一单元格变更 → 自动保存（debounce 300ms）
- 表头可隐藏列（维度管理）
- 底部显示：已填 N/M、上次保存时间

**月视图差异**：
- count 的 max 按"当月周数 × 5"显示：如 4 周 → 0-20 步进输入
- 打卡表现、评语：字段一致

### 5.3 评价维度管理

- 路径：班级详情 → 设置 → 维度
- 列表：内置（灰色锁）+ 自定义
- 新增类型：number / enum / text
- enum 可添加选项（value/label/色）
- 字段：是否可见、是否参与排名、显示顺序
- 内置维度可隐藏不可删

### 5.4 导出图片

**触发**：记录页右上"导出" → 弹窗预览
**预览参数**：
- 样式（4 选 1，沿用昨天的 stellar/aurora/nebula 的精神但做 Claude 风重设计）：
  - **Warm**（米白 + 橙标题，默认）
  - **Mono**（极简黑白）
  - **Paper**（牛皮纸噪点）
  - **Dusk**（夜间深墨）
- 宽度：手机竖屏 390px 基准，scale=2 输出 780px
- 内容区块：
  1. 头部：班级名 + 周期 + 老师寄语（可编辑一句话）
  2. 表格：姓名 / 打卡次数 / 作业点评（合并 perf + remark 成一段）
  3. 底部：日期 + 班级代号 + 小印章式签名
**输出**：PNG，文件名 `{班级}_{周期}_{样式}.png`
**兼容性要点**（昨晚教训）：
- 导出前临时 `border-radius: 0`（避免圆角穿底白）
- 不用 webp
- 等自定义字体 ready 后再抓图（`document.fonts.ready`）

### 5.5 数据汇总看板

**顶部筛选**：班级（多选 / 全部）、周期范围（起止 周/月）、维度
**模块**：
1. 概览卡：总打卡次数、总记录人次、活跃班级数、平均表现
2. 个人排名：按选定 RankDim 排序 Top N + 全部分页
3. 班级排名：班级聚合（求和或平均）
4. 总排名：所有学生跨班级
5. 趋势图（进阶，v1.0 用简洁折线）：总打卡次数按周期

**内置 RankDim**：
- 打卡次数总和（desc）
- 平均表现分（优=3 良=2 加油=1，desc）
- 综合分（count × 0.6 + perf × 0.4，归一化）

**自定义 RankDim**：
- 基于某个数值/枚举维度
- 聚合方式：SUM / AVG / COUNT
- 排序方向

---

## 6. 路由（Hash）

```
#/classes                  班级列表
#/class/:id/record         打卡记录（默认 Tab）
#/class/:id/students       学生管理
#/class/:id/settings       班级设置（维度等）
#/dashboard                看板
#/trash                    回收站
#/about                    关于
```

---

## 7. 关键逻辑伪代码

### 7.1 ISO 周计算
```js
function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((date - firstThursday) / 86400000 - 3) / 7);
  return { year: date.getUTCFullYear(), week: weekNum };
}
function weekKey(d) {
  const {year, week} = getISOWeek(d);
  return `${year}-W${String(week).padStart(2,'0')}`;
}
```

### 7.2 月含周数
```js
function weeksInMonth(year, month) { // month 0-11
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const set = new Set();
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1))
    set.add(weekKey(d));
  return set.size;
}
```

### 7.3 排名计算
```js
function rank(scope, rankDim, filter) {
  const recs = filterRecords(filter);
  const groups = groupBy(recs, scope === 'student' ? 'studentId' :
                               scope === 'class'   ? 'classId'   : null);
  return Object.entries(groups).map(([k, arr]) => {
    const score = evalRankExpr(rankDim.expr, arr);
    return { key: k, score };
  }).sort((a,b) => rankDim.order === 'desc' ? b.score - a.score : a.score - b.score);
}
```

---

## 8. 验收清单

- [ ] 浏览器双击 `index.html` 能直接运行（`file://`）
- [ ] 新建班级 → 添加 5 个学生 → 周视图录入 → 数据持久化（刷新不丢）
- [ ] 删除班级 → 进入回收站 → 还原 → 数据完整
- [ ] 月视图 count 上限正确随月份周数变化
- [ ] 自定义维度：新增一个 number 维度，出现在打卡表格与看板
- [ ] 导出 PNG：手机打开显示正常，无圆角穿底，PNG 格式
- [ ] 看板：切换排名维度数据正确
- [ ] 明暗切换：主题切换丝滑，无样式错乱
- [ ] 清空所有数据 → 状态回到初次引导页

---

## 9. 分期

v1.0（本次）：以上全部
v1.1（后续）：导入导出 JSON 备份、PWA 离线、键盘快捷键、家长评分记录
