# PixelCore

一个可以独立部署的摄影作品集：Astro 网页、原生微信小程序与 FastAPI 基础后端，共用一套照片、相册和随笔数据。

此仓库从空数据库启动。无需连接作者的服务器，也不附带作者的照片、原片、账号或生产配置。

## 功能

- 网页作品墙、每日精选、题材筛选、搜索、大图预览与深浅色主题。
- 相册、图文随笔、摄影足迹地图与时间筛选。
- 网页管理后台：分块续传、图片处理、手动分类、地点与日期编辑、相似图片确认、发布与回收站。
- 生成 WebP 展示图和带水印 JPEG 下载；上传原文件仅管理员可以下载。
- 微信小程序：浏览作品、相册、足迹、随笔、分享和保存公开图片。
- SQLite 数据库与单独的图片处理 worker，不需要 Redis、MySQL 或 GPU。

基础版不包含 AI 分类服务、私人 RAW 备份及关联库、社交发布工作台、主备容灾或作者的部署脚本。上传支持 JPEG、PNG、WebP、TIFF，以及当前 libvips 构建可解码的 HEIC/HEIF；相机 RAW 不在此版本范围内。

## 仓库结构

```text
frontend/       Astro + TypeScript 网页及管理后台
miniprogram/    原生微信小程序，共用公开 API
backend/        FastAPI、SQLite、迁移及图片 worker
scripts/        本地配置、启动、演示和发布检查
deploy/         通用 HTTPS 反向代理示例
docs/           配置、部署、接口和授权说明
```

## 本地快速开始

需要 **Node.js 24 LTS**（最低 22.12）和 **Python 3.12**。以下命令从仓库根目录执行，适用于 macOS/Linux；Windows 请使用对应的 `.venv\Scripts\python.exe`。

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python scripts/setup.py
```

`setup.py` 会创建仅本机可读的 `.env` 并生成随机管理员密码，不覆盖已有配置。打开 `.env` 查看 `PC_ADMIN_USER` 和 `PC_ADMIN_PASSWORD`。默认使用 `http://127.0.0.1:18770`，内容保存在本仓库 `data/`，均已加入 Git 忽略规则。

在两个终端分别启动：

```sh
# 终端 1：网页和 API，同一个端口
.venv/bin/python scripts/run.py web
```

```sh
# 终端 2：处理上传的图片
.venv/bin/python scripts/run.py worker
```

访问 [作品集](http://127.0.0.1:18770/) 和 [管理后台](http://127.0.0.1:18770/admin/)。以 `.env` 中的账号登录。首次启动自动建表和创建管理员；新照片默认未发布，等待处理完成后编辑并发布。

本地 HTTP 需要 `PC_SECURE_COOKIE=false`；正式 HTTPS 部署使用 `true`。浏览器地址应与 `PC_PUBLIC_ORIGIN` 完全一致，包含主机名和端口，否则写请求可能被来源校验拦截。

### 可选演示内容

```sh
.venv/bin/python scripts/demo.py
```

只向空的本地 `data/` 数据库写入 4 张程序生成的几何插画、1 个相册和 1 篇随笔。已有内容时拒绝写入。这些插画只是排版示例，不是摄影作品。生成脚本属于 MIT 代码；仓库不提交生成图片或演示数据库。

如果 `pyvips` 安装或解码失败，请参阅 [安装与配置](docs/configuration.md)。

## 微信小程序

1. 先按上文启动后端。
2. 微信开发者工具导入 `miniprogram/`。仓库默认 `touristappid`、`urlCheck=false`，仅用于本地模拟器。
3. `miniprogram/config.js` 默认读取 `http://127.0.0.1:18770`；如果修改本地端口，请一并修改此配置。
4. 真机及发布版本填写自己的 AppID 和 HTTPS API 域名，配置 `request` / `downloadFile` 域名并开启域名校验。

游客模式能否访问具体功能取决于当前微信开发者工具及平台要求，不保证能直接真机预览或上传。注册、备案、类目、隐私配置及审核由部署者自行完成。详见 [小程序说明](miniprogram/README.md)。

管理功能统一放在网页版，小程序只调用公开接口，不嵌入管理员密码或服务密钥。

## 配置和部署

- [环境变量、图片格式与存储](docs/configuration.md)
- [HTTPS 部署、备份与升级](docs/deployment.md)
- [两端接口和发布约定](docs/api.md)
- [第三方数据与素材授权](THIRD_PARTY_NOTICES.md)

网页构建后由 FastAPI 同源提供静态文件和 `/api`，不需要另起 Astro 服务器。正式环境在前面配置 HTTPS 反向代理，并分别运行 API 和 worker。小程序与网页可独立发布，修改公开 API 时应保持兼容。

## 检查

```sh
.venv/bin/python -m pip install -r backend/requirements-dev.txt
PYTHONPATH=backend .venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run check
npm --prefix frontend test
npm --prefix frontend run build
node --test miniprogram/tests/*.test.js
node miniprogram/scripts/validate.js
.venv/bin/python scripts/check_release.py
```

测试使用临时数据库与合成图片，不访问作者的站点。`backend/requirements-dev.lock` 保存本次 Python 3.12 验证时的精确依赖版本，需复现时可用它替代 requirements-dev.txt 安装。发布检查是本地文件及常见敏感信息扫描，不能替代人工审查。请勿将 `.env`、`data/`、密钥或个人素材强制加入 Git。

## 授权

项目自有代码使用 [MIT License](LICENSE)，允许修改、分发及商用，并要求保留版权和许可声明。

`backend/app/data/cities15000.json.gz` 为转换后的 GeoNames 地名数据，单独适用 **CC BY 4.0**，并非 MIT；地图服务及依赖保持各自授权和署名，见 [第三方说明](THIRD_PARTY_NOTICES.md)。你的摄影作品、人物肖像和站点内容由你自行授权，代码开源不代表这些内容自动开放。
