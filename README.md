# Claude Class

一个为老师设计的、本地优先的班级打卡与点评工具。  
A local-first classroom check-in and feedback tool for teachers.

![Claude Class preview](./assets/claude-class-preview.svg)

Claude Class 是一个纯前端网页应用，用来记录学生打卡情况、填写简短点评、查看周/月汇总，并导出适合手机查看的班级长图。  
Claude Class is a pure frontend web app for tracking student check-ins, writing short feedback, viewing weekly or monthly summaries, and exporting polished mobile-friendly report images.

在线演示 / Live Demo: [https://yeah-ger.github.io/claude-class/](https://yeah-ger.github.io/claude-class/)

## 这个项目解决什么问题 / Why This Project

很多老师并不需要一整套复杂的教务系统，而是需要一个更轻、更快、更顺手的日常工具：  
Many teachers do not need a full school management system. They need something lighter, faster, and easier for everyday classroom work:

- 快速创建班级和学生名单 / Quick class setup
- 按周或按月记录课堂表现 / Fast weekly or monthly recording
- 给学生补一句简洁反馈 / Clear student feedback
- 用看板查看汇总、趋势和排名 / Useful summary dashboards
- 一键导出适合发群的图片 / Simple image export for sharing in group chats

这个项目就是围绕这条老师的真实工作流来设计的，并且保持浏览器即开即用。  
This project is built around that teacher workflow and stays browser-based and easy to open.

## 功能亮点 / Highlights

- 本地优先：所有数据默认保存在浏览器 `localStorage` / Local-first: all data is stored in the browser `localStorage`
- 纯静态项目：直接打开 `index.html` 即可使用，无需后端 / Pure static app: open `index.html` directly, no backend required
- 支持周视图和月视图记录 / Weekly and monthly views for classroom records
- 支持内置维度和自定义评价维度 / Built-in and custom evaluation dimensions
- 提供看板统计、趋势和排名能力 / Dashboard metrics, trends, and rankings
- 带回收站，删除班级和学生后可恢复 / Recycle bin for deleted classes and students
- 支持移动端友好的 PNG 导出 / Mobile-friendly PNG export
- 导出预览与最终下载图片保持一致 / Export preview matches the downloaded image output

## 适合谁使用 / Best For

- 日常管理小班或中班教学的老师 / Teachers running small or medium-sized classes
- 课后服务、培训班、辅导班场景 / After-school programs and tutoring groups
- 希望工具轻量、离线可用的使用者 / Users who prefer lightweight offline-friendly tools
- 想用图片汇报替代表格整理的教育工作者 / Educators who want a simple visual export instead of spreadsheets

## 快速开始 / Quick Start

### 方式一：直接打开 / Option 1: Open Directly

1. 克隆或下载本仓库 / Clone or download this repository
2. 用浏览器打开 `index.html` / Open `index.html` in your browser
3. 新建班级并开始记录 / Create a class and start recording

### 方式二：本地静态服务 / Option 2: Run a Local Static Server

```bash
python3 -m http.server 8080
```

然后访问 / Then visit [http://localhost:8080](http://localhost:8080)。

## 项目结构 / Project Structure

```text
.
├── index.html
├── PRD.md
├── RELEASE_NOTES.md
├── assets/
│   └── claude-class-preview.svg
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── dashboard.js
│   ├── export.js
│   ├── record.js
│   └── store.js
└── lib/
    └── html2canvas.min.js
```

## 数据与隐私 / Data and Privacy

- 项目不包含服务端存储 / No server-side storage is included
- 所有记录默认只保存在当前浏览器中 / All records stay in the current browser unless site data is cleared
- 清理浏览器站点数据后，本地记录也会一起被清除 / Clearing site data removes local records as well
- 即使部署到 GitHub Pages 或其他静态托管平台，数据仍然只会保存在访问者自己的浏览器里 / Even on GitHub Pages or other static hosting, data remains local to each visitor's browser

## 开发说明 / Development

- 不依赖打包工具 / No bundler required
- 主要技术栈：HTML、CSS、原生 JavaScript / Main stack: HTML, CSS, vanilla JavaScript
- PNG 导出依赖仓库内置的 `lib/html2canvas.min.js` / PNG export uses the vendored `lib/html2canvas.min.js`
- 页面视觉使用了 Google Fonts；无网络时会回退到系统字体，不影响功能 / Google Fonts are used for styling, with system font fallback when offline

建议修改后执行语法检查：  
Recommended syntax check:

```bash
for f in js/*.js; do node --check "$f" || exit 1; done
```

## 后续可继续完善的方向 / Roadmap Ideas

- 支持 JSON 数据导入与导出 / Import and export data as JSON
- 支持拖拽排序学生 / Drag-and-drop student sorting
- 月度点评生成可以更智能 / Richer monthly feedback generation
- 教师视角下的统计文案还能再更清晰一些 / Clearer analytics wording for teacher workflows

## 许可证 / License

本项目采用 MIT License，详见 `LICENSE`。  
This project is released under the MIT License. See `LICENSE`.
