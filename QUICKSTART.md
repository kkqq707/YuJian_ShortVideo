# 本地快速启动指南

## 环境要求

- Node.js >= 16.x
- MySQL >= 8.0
- npm 或 yarn

## 第一步：安装 MySQL

### Windows
下载 MySQL 8.0 安装包安装，默认端口 3306，设置 root 密码。

### Mac
```bash
brew install mysql
brew services start mysql
```

### 创建数据库
```sql
CREATE DATABASE yujian DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 第二步：配置环境变量

复制 `.env.example` 为 `.env`：
```bash
cp .env.example .env
```

修改 `.env` 中的数据库配置：
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=yujian
DB_USER=root
DB_PASSWORD=你的数据库密码
```

## 第三步：安装依赖

```bash
npm install
```

## 第四步：初始化数据库

```bash
npm run init
```

初始化完成后会自动创建：
- 所有数据表
- 默认超级管理员：admin / 123456
- 4个默认套餐
- 默认API配置

## 第五步：启动服务

```bash
npm start
```

开发模式（自动重启）：
```bash
npm run dev
```

## 第六步：访问

服务启动后访问：

| 页面 | 地址 |
|------|------|
| 首页 | http://localhost:3000 |
| 总后台 | http://localhost:3000/admin.html |
| 代理商后台 | http://localhost:3000/agent.html |
| 企业后台 | http://localhost:3000/enterprise.html |

## 配置阿里云 API

1. 登录总后台 admin / 123456
2. 进入「系统配置」→「API配置中心」
3. 填写你的阿里云百炼 API Key
4. 配置 OSS 存储信息

## 常见问题

### 1. 数据库连接失败
检查 .env 中的数据库配置是否正确，MySQL 服务是否启动。

### 2. 初始化报错
确保数据库已经创建，字符集为 utf8mb4。

### 3. 前端页面 404
确保三个 HTML 文件在 public 目录下。

### 4. API 请求失败
打开浏览器控制台查看具体错误信息，检查后端是否启动。
