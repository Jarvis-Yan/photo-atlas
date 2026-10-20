# 配置

所有启动命令通过 `scripts/run.py` 加载仓库根目录 `.env`，进程环境变量优先。复制 `.env.example` 时需要自己填写至少 12 字符的唯一密码；推荐 `scripts/setup.py` 生成随机密码。

## 环境变量

- `PA_ADMIN_USER`：首次建库的管理员用户名，默认 `admin`。
- `PA_ADMIN_PASSWORD`：首次建库的管理员密码，至少 12 字符，无内置密码。配置中的旧示例占位密码不能使用。
- `PA_PUBLIC_ORIGIN`：唯一入口，默认 `http://127.0.0.1:18770`，不带路径或末尾斜杠。
- `PA_SECURE_COOKIE`：默认 `true`；本地 HTTP 的 `.env.example` 设置为 `false`。
- `PA_DATA_ROOT`：原始上传文件、展示图和临时分块目录，启动脚本默认使用仓库 `data/`。
- `PA_DB_PATH`：默认 `PA_DATA_ROOT/database.sqlite3`。
- `PA_FRONTEND_ROOT`：默认本仓库 `frontend/dist`，一般无需设置。
- `PA_MAX_UPLOAD_BYTES`：单文件上传上限，默认 8589934592（8 GiB）。前端选择器也有 8 GiB 上限。
- `PA_REQUIRED_MOUNT`：可选；必须已挂载的存储挂载点。设置后挂载不可用将阻止启动或上传处理。
- `PA_CANONICAL_ALIASES`：可选；逗号分隔的精确别名主机名，GET 重定向到主入口，不允许通配符。

修改 `.env` 中的管理员用户名或密码**不会更改已有数据库中的账号**；首次建库时才使用它们。当前基础版没有密码修改界面。请妥善保存密码；已有站点需要维护者通过离线维护方式重置密码，不能靠删除数据库处理。

## 图片处理

运行独立 worker 后才会生成展示图。JPEG、PNG、WebP、TIFF 由 libvips 解码；HEIC/HEIF 是否可用取决于安装的 libvips 解码支持。`pyvips[binary]` 尝试安装当前平台可用的二进制库，如果缺少可用 wheel，需自行安装 libvips（macOS 可用 `brew install vips`，Linux 使用发行版软件包）。

超大、损坏或解码失败的文件会保留原始上传文件并在后台显示错误。图片处理存在约 1.2 亿像素的保护上限；RAW 解码、AI 模型和 GPU 不在基础版中。

公开展示图移除原文件 EXIF；公开接口只提供有限拍摄参数，地点坐标按两位小数输出。足迹位置仍会公开到城市或大致地区，发布前请自行检查。管理员访问原始文件时仍可得到原始元数据。

原始文件不是静态公共目录；公开下载为带水印 JPEG。回收站是归档操作，不会自动回收原文件存储空间。

## 地图及地名

城市匹配使用仓库内 GeoNames 数据，不需要调用地理编码 API。网页地图按需从 OpenFreeMap 加载样式和瓦片，需网络连接。地图不可用时仍可使用照片列表及筛选。替换地图服务时，需要同时更新 `frontend/src/scripts/footprints.ts` 和后端 CSP 白名单，并保留提供者要求的署名。

每日精选按北京时间日期生成，日内保持稳定；这一日期边界与服务器的本地时区无关。
