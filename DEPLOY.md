# ECS 服务器部署指南

## 服务器环境

- 系统：Alibaba Cloud Linux 3 / CentOS 7+
- 配置：建议 2核4G 以上
- 公网IP：需要开放 80 端口

## 第一步：连接服务器

```bash
ssh root@你的服务器IP
```

## 第二步：安装 Node.js 18

```bash
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

# 验证
node -v
npm -v
```

## 第三步：安装 MySQL 8.0

```bash
yum install -y mysql-server

# 启动并设置开机自启
systemctl start mysqld
systemctl enable mysqld

# 设置root密码
mysql -u root
```

在 MySQL 命令行执行：
```sql
ALTER USER 'root'@'localhost' IDENTIFIED BY '你的密码';
FLUSH PRIVILEGES;
CREATE DATABASE yujian DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit;
```

## 第四步：安装 PM2 和 Nginx

```bash
# PM2 进程守护
npm install -g pm2

# Nginx
yum install -y nginx
systemctl start nginx
systemctl enable nginx
```

## 第五步：上传项目代码

将 `yujian-server.zip` 上传到服务器 `/www/` 目录：

```bash
mkdir -p /www
cd /www

# 上传后解压
unzip yujian-server.zip
cd yujian-server
```

## 第六步：安装依赖和配置

```bash
# 安装生产环境依赖
npm install --production

# 复制配置文件
cp .env.example .env

# 编辑配置
vi .env
```

修改以下内容：
```
NODE_ENV=production
DB_PASSWORD=你的MySQL密码
JWT_SECRET=改成一串复杂的随机字符串
```

保存退出：按 `Esc`，输入 `:wq` 回车。

## 第七步：初始化并启动

```bash
# 初始化数据库
npm run init

# PM2 启动
pm2 start app.js --name yujian-server

# 设置开机自启
pm2 startup
pm2 save
```

查看状态：
```bash
pm2 status
pm2 logs yujian-server
```

## 第八步：配置 Nginx 反向代理

```bash
vi /etc/nginx/conf.d/yujian.conf
```

粘贴以下配置：
```nginx
server {
    listen 80;
    server_name 你的服务器IP或域名;

    client_max_body_size 100M;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }

    location / {
        root /www/yujian-server/public;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
}
```

检查并重载配置：
```bash
nginx -t
nginx -s reload
```

## 第九步：开放安全组

阿里云控制台 → ECS → 安全组 → 入方向 → 手动添加：
- 端口范围：80
- 授权对象：0.0.0.0/0

## 第十步：访问测试

浏览器打开：`http://你的服务器IP`

默认账号：
- 总后台：admin / 123456

## 部署完成后必做

1. **修改默认管理员密码**
2. **配置阿里云 API 密钥**（总后台 → API配置中心）
3. **配置 OSS 存储**
4. **绑定域名**（可选，建议配置 HTTPS）

## 常用运维命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs yujian-server

# 重启服务
pm2 restart yujian-server

# 停止服务
pm2 stop yujian-server

# 重载Nginx
nginx -s reload

# 查看Nginx错误日志
tail -f /var/log/nginx/error.log
```

## 更新代码

```bash
cd /www/yujian-server
# 上传新代码覆盖后
pm2 restart yujian-server
```

## 配置 HTTPS（可选）

建议使用 Let's Encrypt 免费证书：
```bash
yum install -y certbot python3-certbot-nginx
certbot --nginx -d 你的域名
```
