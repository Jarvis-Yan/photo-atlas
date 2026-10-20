# Photo Atlas 微信小程序

与网页版共用基础后端，只访问 `/api/public/*` 及公开媒体。

## 本地导入

1. 在仓库根目录按主 README 安装并启动后端。
2. 微信开发者工具选择“导入项目”，目录选择 `miniprogram/`。
3. 默认 `project.config.json` 使用 `touristappid`，`urlCheck=false`；只用于本地模拟器。
4. `config.js` 默认 `API_ORIGIN=http://127.0.0.1:18770`。工具若要求登录或当前不支持游客功能，以工具界面为准。
5. 空数据库时正常显示空状态；可选运行 `scripts/demo.py` 查看合成演示内容。

## 真机与发布

- 使用自己的小程序 AppID 替换 `project.config.json` 的游客值。
- 参考 `config.example.js`，将 `config.js` 的 API_ORIGIN 改为自己的 HTTPS 域名，不带末尾斜杠。
- 在微信平台分别配置 `request` 与 `downloadFile` 合法域名；若图片使用独立域名，也需要配置对应域名。
- 将 `setting.urlCheck` 改为 `true`，关闭开发工具中跳过域名校验的选项。
- 分别验证 iOS / Android 的 API、图片预览、图片保存、分享和隐私授权，再按平台当前要求完成备案、类目、隐私配置及审核发布。
- 本机 `127.0.0.1` 只指向运行环境本身，真机必须改用手机可访问且符合平台要求的后端地址。

本仓库没有小程序管理员登录功能。请使用网页后台管理内容，不在客户端放置管理员密码、AppSecret 或上传私钥。`project.private.config.json` 与 `.miniprogram-ci/` 不入库。

## 测试

从仓库根目录执行：

```sh
node --test miniprogram/tests/*.test.js
node miniprogram/scripts/validate.js
```

## 官方文档

- [网络能力](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- [项目配置](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html)
- [隐私相关 API](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/)
- [小程序备案](https://developers.weixin.qq.com/miniprogram/product/record_guidelines.html)

配置步骤不代表已完成平台登记、审核或真机验收。
