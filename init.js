require('dotenv').config();
const { sequelize, Admin, Plan, Agent, ApiConfig, Enterprise, EnterpriseUser } = require('./models');

async function init() {
  console.log('正在初始化数据库...');

  try {
    // 测试连接
    await sequelize.authenticate();
    console.log('✓ 数据库连接成功');

    // 同步表结构
    await sequelize.sync({ alter: true });
    console.log('✓ 数据表创建完成');

    // 创建默认超级管理员
    const [admin, created] = await Admin.findOrCreate({
      where: { username: 'admin' },
      defaults: {
        username: 'admin',
        password: '123456',
        role: 'super'
      }
    });
    if (created) {
      console.log('✓ 默认管理员创建成功: admin / 123456');
    } else {
      console.log('✓ 管理员已存在');
    }

    // 创建默认套餐
    const plans = [
      {
        name: '基础版',
        price: 99,
        agent_price: 69,
        quota_points: 1000,
        duration_days: 30,
        description: '适合个人和小型团队',
        sort: 1
      },
      {
        name: '标准版',
        price: 2999,
        agent_price: 1999,
        quota_points: 31500,
        duration_days: 30,
        description: '适合中小企业日常创作',
        sort: 2
      },
      {
        name: '旗舰版',
        price: 30000,
        agent_price: 20000,
        quota_points: 330000,
        duration_days: 30,
        description: '适合大型企业批量生产',
        sort: 3
      },
      {
        name: '至尊版',
        price: 100000,
        agent_price: 68000,
        quota_points: 1150000,
        duration_days: 30,
        description: '定制化服务，专属客服',
        sort: 4
      }
    ];

    for (const plan of plans) {
      await Plan.findOrCreate({
        where: { name: plan.name },
        defaults: plan
      });
    }
    console.log('✓ 默认套餐初始化完成');

    // 初始化默认API配置
    const defaultConfigs = {
      common: {
        access_key: '',
        endpoint: 'https://dashscope.aliyuncs.com',
        workspace_id: ''
      },
      model_pricing: {
        // Sprint 4.4 Patch3: 阿里云百炼统一模型定价
        'qwen-image-3.0-pro': 1,
        'qwen-image-edit': 1,
        'happyhorse-i2v': 12,
        'happyhorse-t2v': 12,
        // 历史模型（向后兼容）
        'wan2.1-t2v': 8,
        'wan2.1-i2v': 8,
        'wanx-v1': 1
      },
      oss: {
        access_key_id: '',
        access_key_secret: '',
        region: 'oss-cn-beijing',
        bucket: '',
        domain: ''
      }
    };

    for (const key in defaultConfigs) {
      await ApiConfig.setConfig(key, defaultConfigs[key]);
    }
    console.log('✓ 默认API配置初始化完成');

    // 创建默认代理商
    const [defaultAgent, agentCreated] = await Agent.findOrCreate({
      where: { username: 'agent_demo' },
      defaults: {
        username: 'agent_demo',
        password: '123456',
        company_name: '演示代理商',
        contact_name: '张三',
        contact_phone: '13800000000',
        level: 'gold'
      }
    });
    if (agentCreated) {
      console.log('✓ 默认代理商创建成功: agent_demo / 123456');
    } else {
      console.log('✓ 代理商已存在');
    }

    // 创建默认企业
    const [defaultEnterprise, entCreated] = await Enterprise.findOrCreate({
      where: { company_name: '演示企业' },
      defaults: {
        agent_id: defaultAgent.id,
        company_name: '演示企业',
        plan_id: 1,
        status: 1
      }
    });
    if (entCreated) {
      console.log('✓ 默认企业创建成功: 演示企业');
    } else {
      console.log('✓ 企业已存在');
    }

    // 创建默认企业用户
    const [defaultEntUser, userCreated] = await EnterpriseUser.findOrCreate({
      where: { email: 'demo@yujian.com' },
      defaults: {
        enterprise_id: defaultEnterprise.id,
        email: 'demo@yujian.com',
        password: '123456',
        name: '演示用户',
        role: 'admin',
        status: 1
      }
    });
    if (userCreated) {
      console.log('✓ 默认企业用户创建成功: demo@yujian.com / 123456');
    } else {
      console.log('✓ 企业用户已存在');
    }

    console.log('\n═══════════════════════════════════════');
    console.log('  数据库初始化完成！');
    console.log('  总后台账号: admin / 123456');
    console.log('  代理商账号: agent_demo / 123456');
    console.log('  企业用户账号: demo@yujian.com / 123456');
    console.log('  请及时修改默认密码');
    console.log('═══════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('初始化失败:', error.message);
    process.exit(1);
  }
}

init();
