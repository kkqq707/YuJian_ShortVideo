# 煜见光影 - 短视频创作 SaaS 平台

## 项目简介

煜见光影是一套完整的短视频创作 SaaS 平台，支持品牌贴牌定制、自有域名部署、源码独立交付。后端对接阿里云百炼大模型 API，提供文生视频、图生视频、参考生视频、数字人口播等 AI 创作能力。

## 系统架构

### 三级用户体系
- **总后台** - 超级管理员，管理代理商、企业、API配置
- **代理商后台** - 代理商管理旗下企业、分配额度
- **企业后台** - 企业用户使用 AI 创作功能

### 技术栈
- **后端**: Node.js + Express + MySQL 8.0 + Sequelize + JWT
- **前端**: 纯 HTML + CSS + JavaScript + Font Awesome + Chart.js
- **AI能力**: 阿里云百炼 DashScope API
- **存储**: 阿里云 OSS 对象存储

### 核心功能
- ✅ 文生视频（HappyHorse / 万相双模型）
- ✅ 图生视频
- ✅ 参考生视频（多图融合）
- ✅ 数字人口播
- ✅ 文生图片
- ✅ 素材管理（OSS直传）
- ✅ 积分额度体系（三级流转）
- ✅ 订单管理
- ✅ 团队成员管理
- ✅ 品牌贴牌定制

## 目录结构

```
yujian-server/
├── config/          # 数据库配置
├── models/          # 数据模型
├── middlewares/     # 中间件
├── controllers/     # 控制器
│   ├── admin/       # 总后台
│   ├── agent/       # 代理商后台
│   └── enterprise/  # 企业后台
├── routes/          # 路由
├── services/        # 服务层（阿里云API封装）
├── utils/           # 工具函数
├── public/          # 前端静态文件
├── app.js           # 入口文件
├── init.js          # 初始化脚本
└── package.json
```

## 默认账号

| 后台 | 账号 | 密码 |
|------|------|------|
| 总后台 | admin | 123456 |

## 快速开始

详见 [QUICKSTART.md](./QUICKSTART.md)

## 服务器部署

详见 [DEPLOY.md](./DEPLOY.md)

## API 接口

### 统一前缀
- 总后台: `/api/admin/*`
- 代理商: `/api/agent/*`
- 企业后台: `/api/enterprise/*`

### 统一响应格式
```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### 鉴权方式
Header: `Authorization: Bearer <token>`

## 技术支持

部署和使用过程中有任何问题，请参考文档或联系技术支持。
