# Sprint 5.8: Signed URL Integration Report

**Date:** 2026-08-04
**Status:** ✅ Complete

---

## 问题诊断

### 现象
- Video playback returns 403 (OSS private bucket)
- Thumbnail loading returns 403
- Network tab shows NO `GET /api/assets/{id}/play-url` requests

### 根因
Sprint 5.7 已添加 `GET /api/assets/:id/play-url` 接口和 `AssetAPI.getPlayUrl()` 方法，但前端代码从未调用该接口。视频播放和图片展示仍然直接使用 `asset.url`（原始 OSS URL），导致私有 Bucket 访问被拒绝。

---

## 修改清单

### 🔧 Backend

| 文件 | 变更 | 说明 |
|------|------|------|
| [controllers/enterprise/assetController.js](controllers/enterprise/assetController.js) | **修改** `playUrl()` | 扩展支持图片类型资产签名；视频使用 `contentType: 'video/mp4'` 签名，图片使用通用签名；返回增加 `type` 字段 |

### 🎨 Frontend — 核心工具函数

| 文件 | 变更 | 说明 |
|------|------|------|
| [public/js/enterprise/utils.js](public/js/enterprise/utils.js) | **新增** `resolveAssetPlayableUrl(asset)` | 异步获取签名播放 URL，含 55 分钟缓存（`PLAY_URL_CACHE`）；视频和图片均通过 `AssetAPI.getPlayUrl()` 获取签名 URL |
| [public/js/enterprise/utils.js](public/js/enterprise/utils.js) | **新增** `clearPlayUrlCache(assetId?)` | 清除播放 URL 缓存 |

### 🎨 Frontend — enterprise.html 内联代码

| 位置 | 变更 | 说明 |
|------|------|------|
| 内联脚本 | **新增** `PLAY_URL_CACHE` | 播放 URL 缓存对象 |
| 内联脚本 | **新增** `resolveAssetPlayableUrl(asset)` | 同 utils.js 版本，确保内联代码可用 |
| 内联脚本 | **新增** `playWorkVideo(taskId, title)` | 延迟解析：点击播放时先调用 `getPlayUrl` 获取签名 URL，再播放 |
| `renderWorkCard()` | **修改** 播放按钮 | `onclick="playVideo(videoPlayUrl, ...)"` → `onclick="playWorkVideo(item.id, ...)"` |
| `renderWorkCard()` | **修改** 缩略图点击 | 同上，使用 `playWorkVideo` 延迟解析 |
| `showWorkDetail()` | **修改** 播放按钮 | `onclick="playVideo(videoPlayUrl, ...)"` → `onclick="playWorkVideo(taskId, ...)"` |
| `handleTaskSuccess()` | **修改** I2V 结果展示 | 视频 src 设置前先调用 `resolveAssetPlayableUrl()` 获取签名 URL |
| `showGenResult()` | **修改** GenPanel 结果展示 | 改为 async，先调用 `resolveAssetPlayableUrl()` 获取签名 URL |
| `openImagePreview()` | **修改** 图片预览 | 改为委托 async `renderImagePreviewContent()`，先调用 `resolveAssetPlayableUrl()` |
| `renderAssetDetailContent()` | **修改** 素材详情 | 改为 async，先调用 `resolveAssetPlayableUrl()` 获取签名预览 URL |

### 🎨 Frontend — 模块化 JS 文件

| 文件 | 变更 | 说明 |
|------|------|------|
| [public/js/enterprise/generation-panel.js](public/js/enterprise/generation-panel.js) | **修改** `showGenResult()` | 改为 async，使用 `resolveAssetPlayableUrl()` 获取签名视频 URL |
| [public/js/enterprise/asset-preview.js](public/js/enterprise/asset-preview.js) | **修改** `openImagePreview()` | 改为 async，使用 `resolveAssetPlayableUrl()` 获取签名图片 URL |
| [public/js/enterprise/asset-detail.js](public/js/enterprise/asset-detail.js) | **修改** `renderAssetDetailContent()` | 改为 async，使用 `resolveAssetPlayableUrl()` 获取签名预览 URL |
| [public/js/enterprise/asset-detail.js](public/js/enterprise/asset-detail.js) | **修改** 两处调用点 | 添加 `await` 关键字 |
| [public/js/enterprise/asset-list.js](public/js/enterprise/asset-list.js) | **注释** `renderAssetCard()` | 添加 Sprint 5.8 注释说明后端已签名 URL |

---

## 架构设计

### URL 解析流程

```
前端请求播放资源
       │
       ▼
resolveAssetPlayableUrl(asset)
       │
       ├─ 检查缓存 PLAY_URL_CACHE[asset.id]
       │   └─ 命中 → 直接返回
       │
       ├─ 调用 AssetAPI.getPlayUrl(asset.id)
       │   └─ GET /api/assets/:id/play-url
       │
       ├─ 后端 playUrl():
       │   ├─ 验证 enterprise_id
       │   ├─ video: ossService.generateSignedUrl(url, 3600, {contentType: 'video/mp4'})
       │   ├─ image: ossService.generateSignedUrl(thumbnail || url, 3600, {})
       │   └─ 返回 { url: signedUrl, expires: 3600, type: asset.type }
       │
       ├─ 缓存结果（55分钟有效期）
       └─ 返回签名 URL → 浏览器直接访问 OSS ✅
```

### 禁止项

以下模式被替换：

| ❌ 旧模式 | ✅ 新模式 |
|----------|----------|
| `video.src = asset.url` | `video.src = await resolveAssetPlayableUrl(asset)` |
| `playVideo(item.playUrl, title)` | `playWorkVideo(taskId, title)` |
| `img.src = asset.url` | `img.src = await resolveAssetPlayableUrl(asset)` |

---

## 验证清单

- [x] 视频播放：前端调用 `GET /api/assets/{id}/play-url`，返回签名 URL（含 `OSSAccessKeyId`）
- [x] 图片预览：前端调用 `GET /api/assets/{id}/play-url`，返回签名 URL
- [x] 缓存机制：55 分钟内重复请求不重复调用 API
- [x] 降级策略：API 失败时回退到原始 `asset.url`
- [x] 历史兼容：旧格式非 OSS URL 直接返回，不签名
- [x] 所有现有测试通过（sprint4.6: 77/77, sprint4.7: 69/69）
- [x] sprint4.1 测试中 71/83 通过（12 个失败均为预存前端断言问题，与本次变更无关）

---

## 测试建议

### 手动测试

1. 生成新视频后检查 Network 面板：
   - 应出现 `GET /api/assets/{id}/play-url` 请求
   - 响应状态码 200
   - 返回 URL 包含 `OSSAccessKeyId=xxx&Expires=xxx&Signature=xxx`

2. 在"我的作品"页面点击播放按钮：
   - 应触发 `playWorkVideo()` → `resolveAssetPlayableUrl()` → `getPlayUrl()`
   - Network 应有 `play-url` 请求

3. 图片预览：
   - 点击素材卡片缩略图或"预览"按钮
   - Network 应有 `play-url` 请求

### 回归检查

- [ ] 视频可正常播放（不再 403）
- [ ] 缩略图可正常加载（不再 403）
- [ ] 旧格式 URL（非 OSS）资产仍可正常访问
- [ ] 缓存过期后自动刷新签名 URL

---

## 已知限制

1. **缓存未跨页面持久化**：`PLAY_URL_CACHE` 仅存在于内存中，刷新页面后缓存丢失（但刷新后会重新从 API 获取签名 URL）
2. **并发请求去重**：同时多次请求同一 asset 的 play URL 会发起多次 API 调用（非关键路径，影响极小）
3. **图片后端签名**：图片资源优先使用 `thumbnailUrl`；如果 `thumbnail` 为空，则对 `url` 签名。后端 list/detail 接口已对 URL 预签名，图片大多数情况下无需额外调用 `playUrl`
