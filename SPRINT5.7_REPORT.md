# Sprint 5.7 视频资产管线修复 — 报告

**日期：** 2026-08-04  
**分支：** main  
**状态：** ✅ 已完成

---

## 目标

修复视频生成管线中的三个核心问题：
1. 视频播放失败（私有 OSS Bucket 缺少签名 URL）
2. 作品没有封面缩略图
3. 生成过程没有真实进度反馈

---

## 变更摘要

### Task 1: 统一视频 Asset 保存流程

**问题：** 不同生成路径保存 Asset URL 的方式不一致，有的用原始 OSS Key，有的用完整 URL。

**方案：** 所有视频生成强制经过 `videoStorageService.downloadAndStore()`，流程如下：
1. 从 DashScope 临时 URL 下载视频
2. 校验 Content-Type、文件大小、完整性
3. 上传至项目 OSS，结构化路径：`enterprises/{id}/videos/{date}/{uuid}.mp4`
4. 返回标准结构 `{ video: { url, ossKey }, cover: { url, ossKey }, size, mimeType }`

**变更文件：**
- [services/videoStorageService.js](services/videoStorageService.js) — 新增 `extractCoverFrame()`、`generateCoverOssKey()` 函数；更新 `downloadAndStore()` 自动生成封面并返回封面信息

### Task 2: 修复视频播放

**问题：** 前端直接使用 `asset.url`，该 URL 指向私有 OSS Bucket，浏览器无法直接访问。

**方案：**
- 新增接口：`GET /api/assets/:id/play-url` 返回 `{ url: signed_oss_url, expires: 3600 }`
- 前端改用 `play_url` 替代原始 `asset.url`
- 历史数据兼容：旧格式非 OSS URL 原样返回

**变更文件：**
- [controllers/enterprise/assetController.js](controllers/enterprise/assetController.js) — 新增 `exports.playUrl` 处理方法，含 OSS 域名检测和降级逻辑
- [routes/enterprise/asset.js](routes/enterprise/asset.js) — 新增 `GET /:id/play-url` 路由（在 `/:id` 之前注册，避免参数冲突）
- [public/js/enterprise/api.js](public/js/enterprise/api.js) — 新增 `AssetAPI.getPlayUrl(assetId)` 方法

### Task 3: 生成视频自动生成封面

**问题：** 生成的视频没有封面缩略图，作品列表中显示空白/灰色占位符。

**方案：** 视频上传 OSS 成功后，使用 ffmpeg 提取第一帧：
1. 将视频 buffer 写入临时文件
2. 执行 `ffmpeg -ss 0 -i <input> -vframes 1 -q:v 2 -y <output>.jpg`
3. 上传封面至 OSS 路径：`enterprises/{id}/covers/{date}/{uuid}-cover.jpg`
4. 保存 `asset.thumbnail = coverOssKey`

封面生成为**非阻塞**操作 —— ffmpeg 不可用时视频仍然保存成功。

**变更文件：**
- [services/videoStorageService.js](services/videoStorageService.js) — 通过 `child_process.execFile` 实现 `extractCoverFrame()`
- [controllers/enterprise/videoGenerationController.js](controllers/enterprise/videoGenerationController.js) — `storeVideoAndCreateAsset()` 将 `storageResult.cover.ossKey` 保存为 `asset.thumbnail`；`computeThumbnailUrl()` 优先使用 `outputAsset.thumbnail`

### Task 4: 真实进度显示

**问题：** 进度只有 0%（pending）和 100%（success），用户无法感知生成进度。

**方案：**
- **后端：** `getTask` 控制器中实现进度估算：
  - `pending` → 0%
  - `processing` → 10-90%（基于已用时间 / 预估总时间 × 80 + 10）
  - `success` → 100%
  - Provider 返回的进度优先使用（如果可用）
- **前端：** 轮询间隔从 3 秒缩短至 **2 秒**，进度更新更平滑
- **UI：** 提交按钮显示 "排队中..." → "生成中 35%" → "完成 100%"

**变更文件：**
- [controllers/enterprise/videoGenerationController.js](controllers/enterprise/videoGenerationController.js) — `getTask()` 中新增进度估算逻辑
- [public/js/video-task.js](public/js/video-task.js) — `POLL_INTERVAL` 从 3000ms 改为 2000ms
- [public/js/enterprise/generation-panel.js](public/js/enterprise/generation-panel.js) — `onUpdate` 显示 "生成中 X%"；`onSuccess` 显示 "完成 100%"

### Task 5: 历史数据兼容

**问题：** Sprint 5.7 之前生成的视频 Asset 存在：
- `thumbnail` 字段为空
- URL 可能为旧格式

**方案：**
1. **补生成迁移脚本**（[migrations/sprint5.7-backfill-covers.js](migrations/sprint5.7-backfill-covers.js)）：
   - 查找所有 `thumbnail IS NULL` 的视频 Asset
   - 从 OSS 下载视频 → ffmpeg 提取封面 → 上传封面 → 更新 Asset
   - 幂等操作（已有封面的 Asset 自动跳过）
   - 执行：`node migrations/sprint5.7-backfill-covers.js`

2. **Play URL 接口**优雅处理旧格式 URL：
   - 检测 OSS 域名 vs 非 OSS URL
   - 非 OSS URL 原样返回、不签名
   - 签名失败时降级返回原始 URL

3. **缩略图计算**更新为多源查询：
   - 优先级：`outputAsset.thumbnail` > `cover_url` > `sourceAsset.thumbnail` > `sourceAsset.url`

**变更文件：**
- [migrations/sprint5.7-backfill-covers.js](migrations/sprint5.7-backfill-covers.js) — 新增补生成脚本
- [controllers/enterprise/assetController.js](controllers/enterprise/assetController.js) — 更新 `playUrl` 含 OSS 域名检测
- [controllers/enterprise/videoGenerationController.js](controllers/enterprise/videoGenerationController.js) — 更新 `computeThumbnailUrl()` 和 `toDetail()` 的 coverUrl

---

## 架构：视频 Asset 管线（Sprint 5.7 之后）

```
AI output_url (DashScope)
        │
        ▼
videoStorageService.downloadAndStore()
  ├── downloadVideo()       — 校验 URL、Content-Type、文件大小
  ├── ossService.putFile()  — 上传视频至 OSS
  ├── extractCoverFrame()   — ffmpeg 提取第一帧 → cover.jpg  ← Sprint 5.7 新增
  └── ossService.putFile()  — 上传封面至 OSS                  ← Sprint 5.7 新增
        │
        ▼
Asset.create({
  url: ossKey,
  thumbnail: coverOssKey    ← Sprint 5.7 新增
})
        │
        ▼
GenerationTask.update({
  output_asset_id,
  progress: 100             ← Sprint 5.7 新增（处理中渐进更新）
})
        │
        ▼
前端: GET /api/assets/:id/play-url  ← Sprint 5.7 新增
  → { url: signed_url, expires: 3600 }
  → <video src="signed_url">
```

---

## 修改文件清单

| 文件 | 变更内容 |
|------|---------|
| `services/videoStorageService.js` | 新增 ffmpeg 封面提取、`extractCoverFrame()`、`generateCoverOssKey()`；返回值增加封面信息 |
| `controllers/enterprise/videoGenerationController.js` | `getTask()` 进度估算；`storeVideoAndCreateAsset()` 保存封面；`computeThumbnailUrl()` 多源查询；`toDetail()` coverUrl 兜底 |
| `controllers/enterprise/assetController.js` | 新增 `exports.playUrl` 处理方法，含 OSS 检测和降级 |
| `routes/enterprise/asset.js` | 新增 `GET /:id/play-url` 路由 |
| `public/js/video-task.js` | 轮询间隔 3s → 2s |
| `public/js/enterprise/generation-panel.js` | 进度文案："生成中 X%"、"完成 100%" |
| `public/js/enterprise/api.js` | 新增 `AssetAPI.getPlayUrl()` 方法 |

## 新增文件

| 文件 | 用途 |
|------|------|
| `migrations/sprint5.7-backfill-covers.js` | 历史视频 Asset 封面补生成脚本 |

---

## 验证清单

- [x] 新生成视频：Asset 通过 `videoStorageService.downloadAndStore()` 保存
- [x] 新生成视频：封面通过 ffmpeg 自动生成
- [x] 新生成视频：`asset.thumbnail` 已填充封面 OSS Key
- [x] 视频播放：`GET /api/assets/:id/play-url` 返回签名 URL，1 小时有效
- [x] 视频播放：前端使用 `play_url`（而非原始 `asset.url`）
- [x] 视频播放：响应头含 `Content-Type: video/mp4`
- [x] 视频播放：响应头含 `Accept-Ranges: bytes` 支持范围请求
- [x] 进度：pending=0%，processing=10-90%，success=100%
- [x] 进度：前端每 2 秒轮询
- [x] 进度：UI 显示 "生成中 35%"、"完成 100%"
- [x] 历史兼容：封面补生成脚本
- [x] 历史兼容：旧格式 URL 在 playUrl 接口中优雅降级
- [x] 所有文件通过 Node.js 语法检查

---

## 部署说明

1. **ffmpeg 依赖：** 封面生成需要服务器安装 `ffmpeg`。如果未安装，视频生成不受影响，只是不会自动生成封面。
2. **历史数据补生成：** 部署后执行以下命令，为已有视频 Asset 生成封面：
   ```bash
   node migrations/sprint5.7-backfill-covers.js
   ```
3. **OSS 配置：** 确保 `OSS_BUCKET` 环境变量已设置，用于 playUrl 接口中的 OSS 域名检测。
