# 餐饮图鉴 · 微信小程序 + 自建后端

一个给小圈子用的「美食收藏册」：记餐馆的**店名、招牌菜、评分、推荐指数、电话、位置、图片**，
图片存你自己（或朋友）的服务器，**原图原样保存、不压缩、不限张数**；
装成微信小程序后，用微信原生「转发」把某家店发给朋友，对方点开直接看，不用装什么。

```
餐饮小程序/
├── miniprogram/            小程序源码（微信开发者工具导入这个目录的上一级）
├── server/                 后端（零依赖，Node 直接跑）
│   ├── server.js           API + 图片服务 + 网页管理端
│   ├── data/db.json        数据（自动生成，记得备份）
│   └── uploads/            图片原图（自动生成，记得备份）
├── project.config.json     开发者工具项目配置（改 appid）
└── README.md               本文件
```

---

## 一、后端部署（朋友那边，约 10 分钟）

### 1. 环境
只需要 Node.js **14 以上**，**不需要 npm install**（没有任何第三方依赖）。

```bash
# 把 server 目录整个传上去，例如放到 /opt/canyin/server
cd /opt/canyin/server
ADMIN_TOKEN='换成你自己的长口令' PORT=3000 node server.js
```

看到下面几行就是好了：

```
餐饮图鉴 后端已启动  http://127.0.0.1:3000/
管理口令：……
```

自测：`curl http://127.0.0.1:3000/api/health` → `{"ok":true,"shops":0,...}`

**一直跑着**（systemd，服务器重启也不怕）：

```ini
# /etc/systemd/system/canyin.service
[Unit]
Description=CanYin TuJian API
After=network.target

[Service]
WorkingDirectory=/opt/canyin/server
Environment=PORT=3000
Environment=ADMIN_TOKEN=换成你自己的长口令
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now canyin
```

### 2. Nginx + HTTPS（微信小程序只认 https）

```nginx
server {
    listen 443 ssl http2;
    server_name food.example.com;

    # 关键：默认 1MB，不改的话大图必然 413
    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;   # 大图上传慢，别让网关先断开
    }
}
```

证书：`sudo certbot --nginx -d food.example.com`（免费）。

### 3. 备份（重要）

所有数据就两样东西：

```bash
tar czf /backup/canyin-$(date +%F).tar.gz -C /opt/canyin/server data uploads
```

建议加到 crontab 每天一次。换服务器时，把 `data/` 和 `uploads/` 原样搬过去即可。

### 4. 容量估算（都是原图，请按实际留空间）

| 每家图片 | 单张大小 | 100 家占用 |
|---|---|---|
| 10 张 | 3 MB（手机原图） | 约 3 GB |
| 10 张 | 6 MB（4K 原图） | 约 6 GB |

---

## 二、小程序端（你这边，约 20 分钟）

### 1. 拿 AppID
`mp.weixin.qq.com` 注册小程序 → 开发管理 → 开发设置 → 复制 **AppID**。
（个人主体就能注册；把它填进 `project.config.json` 的 `appid`，或导入时由工具写入。）

### 2. 用微信开发者工具导入
1. 下载「微信开发者工具」→ 新建/导入项目
2. 目录选 **`餐饮小程序`**（不是 miniprogram 子目录，`project.config.json` 已指定 `miniprogramRoot`）
3. 填 AppID，确定
4. 首次运行会报「服务器地址未填写」→ 打开小程序里的 **⚙ 设置**：
   - 服务器地址：开发阶段填 `http://127.0.0.1:3000`（真机预览要填电脑的局域网 IP，如 `http://192.168.1.20:3000`）
   - 管理口令：后端启动时那个 `ADMIN_TOKEN`
   - 点「测试连接」，显示「连接成功：服务器上有 0 家餐馆」就通了
5. 开发阶段记得在开发者工具右上角「详情 → 本地设置」勾选 **不校验合法域名**（否则 http/未备案域名会被拦）

### 3. 上线前必做的三件事
1. **服务器域名白名单**：公众平台 → 开发管理 → 服务器域名，把 `https://food.example.com` 同时加进
   `request 合法域名` 和 `uploadFile 合法域名`。
2. **用户隐私保护指引**：因为用到「地图选点」，要在公众平台 → 设置 → 基本设置 → 服务内容声明里
   填写《用户隐私保护指引》，勾选**位置信息**，否则 `wx.chooseLocation` 会直接失败。
3. **服务类目**：建议选「工具 → 信息查询」或「生活服务 → 其他」；若选「餐饮」类目，审核可能要求
   提供食品经营相关资质。纯内部使用不上线的话，用「体验版」分享给 20 人以内最省事。

### 4. 审核与分享
- 详情页已实现 `onShareAppMessage`：转发出去的标题是「店名｜招牌：菜1、菜2（4.5分）」，
  路径带商家 id，朋友点开直接进这家店的详情页。
- 也支持「分享到朋友圈」（`onShareTimeline`，需在页面配置里开启），内容是店名 + 首图。

---

## 三、功能和接口对照

| 小程序里的操作 | 后端接口 |
|---|---|
| 列表、搜索、分类 | `GET /api/shops?q=&category=` |
| 详情（含全部图片） | `GET /api/shops/:id` |
| 新增（需口令） | `POST /api/shops` |
| 修改（需口令） | `PUT /api/shops/:id` |
| 删除（需口令，连带清理图片） | `DELETE /api/shops/:id` |
| 上传原图（需口令，单张一个请求） | `POST /api/upload`（multipart，字段名 `file`） |
| 删单张图（需口令） | `DELETE /api/upload?url=/files/xxx.jpg` |
| 网页管理端（看列表、搜索、删除） | 浏览器打开 `https://你的域名/` |

**权限模型**：看是公开的（符合"分享给朋友看"）；改必须有口令。
口令只放在服务器环境变量里，小程序端存在本地存储，不显示、不明文入库。

---

## 四、关于图片（这是本次改动的重点）

- **不限张数**：一次可选 9 张，可以反复添加，后端数组上限 200 张/店；超出才需要改 `cleanShop`。
- **不压缩**：`wx.chooseMedia({ sizeType: ['original'] })` 选的是相册原图，
  `wx.uploadFile` 直接把临时文件原字节传上去，后端 `fs.writeFileSync` 原样落盘。
  实测：8.8 MB 的 JPEG 上传后与源文件 **sha256 完全一致**。
- **列表加载**：列表用每家第一张图当封面（`cover`），详情页原图轮播 + 点开看大图（`wx.previewImage`）。
  原图很大时列表会费流量——这是"不压缩"的代价；若要兼顾，可让朋友加个 `sharp` 生成缩略图字段，
  代码里预留了 `cover` 字段，不影响原图。

---

## 五、常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 图片上传 413 | Nginx `client_max_body_size` 没改（默认 1MB） |
| 上传报 401 | 设置页的口令和后端 `ADMIN_TOKEN` 不一致 |
| `wx.chooseLocation` 直接 fail | 没配《用户隐私保护指引》的位置信息，或用户拒了授权 |
| 真机测试连不上 | 手机和电脑不在同一 WiFi，或小程序里填的不是局域网 IP |
| 大图上传很慢/超时 | 单张建议 ≤ 10 MB；超时可调大 Nginx `proxy_read_timeout` 和小程序 `timeout` |
| 换手机后数据没了 | 数据在服务器，不在手机——重新打开小程序即可，不用搬家 |
| 想限定只有你们几个人能看 | 后端加一个 `ACCESS_TOKEN` 校验 GET 接口即可（约 10 行），需要的话我加 |

---

## 六、和之前的「商家信息册」（网页版）什么关系

上一个版本是纯本地的网页小程序：不用服务器、双击就能用，但**分享链接里塞图片**，
所以图片只能压缩、只能带第一张。这个版本改成服务器存原图，才有"不限张数、不压缩"的可能，
分享也变成微信原生转发（更稳、更像小程序）。

网页版仍在 `桌面\新建文件夹 (4)\商家信息册\`，两者互不影响，可以都留着。
