# API 约定

网页与小程序共用 `/api/public/*`，无需管理员会话。网页管理后台通过 Cookie 与 CSRF 使用 `/api/admin/*`。

公开读取入口包括：

- `GET /api/public/home`：设置、当日精选、相册、随笔及 `daily_date`。
- `GET /api/public/site`：设置、相册和随笔。
- `GET /api/public/catalog`：`limit`、`offset`、`search`、`category` 过滤作品。
- `GET /api/public/footprints`：有地理信息的作品数据及来源署名。
- `GET /api/public/photos/{id}`、`/albums/{id}`、`/posts/{id}`：内容详情。
- `GET /api/public/photos/{id}/download`：公开照片的带水印 JPEG。
- `GET /media/{id}/{variant}`：按权限提供生成的展示图。

`footprints` 返回作品列表，客户端根据地理字段决定显示位置。照片没有时间或地点时保持缺失状态，不根据上传时间补造拍摄时间。

登录使用 `POST /api/auth/login`，登录后 `GET /api/auth/me` 返回 CSRF 值。管理员写请求携带 `X-CSRF-Token`。管理员会话只在自己的网页同源环境中使用。

上传顺序：`POST /api/admin/uploads` 创建会话，`PUT /api/admin/uploads/{id}/chunks/{number}` 发送带 SHA-256 的分块，`POST /api/admin/uploads/{id}/complete` 完成；worker 随后异步生成展示图。

静态接口 schema 见 [openapi.json](openapi.json)，由本地空实例生成，不含生产数据。错误响应使用 `code` 和 `message`，常见鉴权错误为 401/403，未公开内容对访客返回 404。

小程序只应调用公开接口；服务器内部路径、原始文件和管理字段不得写入客户端配置。对公开接口采用兼容性变更，不因为网页已更新就立即删除旧小程序依赖的字段。
