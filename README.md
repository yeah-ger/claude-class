# Claude Class

一个面向老师的班级打卡与点评工具，纯前端实现，支持本地离线记录、周/月视图、多维度统计看板，以及一键导出手机竖屏长图。

## 特性

- 纯静态项目，直接打开 `index.html` 即可使用
- 班级、学生、回收站完整闭环
- 周视图与月视图记录，支持自定义评价维度
- 看板支持排名、趋势与汇总统计
- 导出预览与 PNG 下载保持一致
- 数据存储在浏览器 `localStorage`，默认不上传任何服务器

## 快速开始

1. 克隆或下载本仓库
2. 用浏览器打开 `index.html`
3. 新建班级，导入学生名单，开始记录

也可以直接在本地启动一个静态服务器，例如：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 项目结构

```text
.
├── index.html
├── PRD.md
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

## 数据与隐私

- 所有业务数据默认保存在当前浏览器的 `localStorage`
- 清理浏览器站点数据后，本地记录会一起被清除
- 如果部署到 GitHub Pages 或其他静态托管平台，数据仍然只保存在访问者自己的浏览器里

## 开发说明

- 不依赖打包工具
- 建议修改后执行：

```bash
for f in js/*.js; do node --check "$f" || exit 1; done
```

- 导出能力依赖仓库内置的 `lib/html2canvas.min.js`
- 页面默认使用 Google Fonts；在无网络环境下会回退到系统字体，不影响功能

## License

本项目默认采用 MIT License，详见 `LICENSE`。
