require('dotenv').config();
const crypto = require('crypto');
const { sequelize, Admin, Plan, Agent, ApiConfig, Enterprise, EnterpriseUser, Avatar, Voice } = require('./models');
const registry = require('./config/ai-model-registry');

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
      model_pricing: (() => {
        // Phase 2-C-1-E-5: 从 registry 动态生成定价配置
        const pricing = {};
        for (const m of registry.getAllModels()) {
          if (m.apiModelName && m.pricing) {
            pricing[m.apiModelName] = m.pricing.pointsPerUnit;
          }
        }
        return pricing;
      })(),
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

    // 创建官方数字人（Phase 004-Step7-A.5：Official Digital Human Seed）
    // 幂等键: name + source='official'（官方形象天然以 name 唯一，enterprise_id IS NULL）
    // avatar_uuid 仅在创建时生成，重复执行 npm run init 不会产生重复数据
    const officialAvatars = [
      {
        name: 'wan2.2-s2v 官方示例人物',
        image_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/digital-human/official/wan2.2-s2v-official-sample.jpg'
      },
      {
        name: 'emo-v1 官方示例人物',
        image_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/digital-human/official/emo-v1-official-sample.png'
      }
    ];

    for (const avatar of officialAvatars) {
      const [avatarRow, avatarCreated] = await Avatar.findOrCreate({
        where: { name: avatar.name, source: 'official' },
        defaults: {
          avatar_uuid: crypto.randomUUID(),
          name: avatar.name,
          source: 'official',
          enterprise_id: null,
          user_id: null,
          image_url: avatar.image_url,
          gender: 'unknown',
          status: 'active',
          sort: 0
        }
      });
      if (avatarCreated) {
        console.log(`✓ 官方数字人创建成功: ${avatar.name}`);
      } else {
        console.log(`✓ 官方数字人已存在: ${avatar.name}`);
      }
    }
    console.log('✓ 官方数字人初始化完成');

    // 创建官方声音（Phase 004-Step7-B.5：Official Voice Seed）
    // 幂等键: voice_key + source='system'（voice_key=真实阿里云 voice_id，系统音色天然唯一）
    // voice_uuid 仅在创建时生成，重复执行 npm run init 不会产生重复数据
    const OFFICIAL_VOICE_MODEL_ID = 'qwen3-tts-flash-realtime';
    const officialVoices = [
      {
        name: '芊悦',
        voice_key: 'Cherry',
        gender: 'female',
        sample_audio_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/audio/official/Cherry.mp3'
      },
      {
        name: '可儿',
        voice_key: 'Chelsie',
        gender: 'female',
        sample_audio_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/audio/official/Chelsie.mp3'
      },
      {
        name: '詹妮弗',
        voice_key: 'Jennifer',
        gender: 'female',
        sample_audio_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/audio/official/Jennifer.mp3'
      },
      {
        name: '瑟琳',
        voice_key: 'Seren',
        gender: 'female',
        sample_audio_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/audio/official/Seren.mp3'
      },
      {
        name: '尼尔',
        voice_key: 'Neil',
        gender: 'male',
        sample_audio_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/audio/official/Neil.mp3'
      },
      {
        name: '月白',
        voice_key: 'Moon',
        gender: 'male',
        sample_audio_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/audio/official/Moon.mp3'
      },
      {
        name: '甜茶',
        voice_key: 'Ryan',
        gender: 'male',
        sample_audio_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/audio/official/Ryan.mp3'
      },
      {
        name: '艾德里克',
        voice_key: 'Eldric Sage',
        gender: 'male',
        sample_audio_url: 'https://guangying-video-2026.oss-cn-beijing.aliyuncs.com/audio/official/Eldric-Sage.mp3'
      }
    ];

    for (const voice of officialVoices) {
      const [voiceRow, voiceCreated] = await Voice.findOrCreate({
        where: { voice_key: voice.voice_key, source: 'system' },
        defaults: {
          voice_uuid: crypto.randomUUID(),
          name: voice.name,
          voice_key: voice.voice_key,
          model_id: OFFICIAL_VOICE_MODEL_ID,
          provider: 'aliyun',
          gender: voice.gender,
          language: 'zh',
          sample_audio_url: voice.sample_audio_url,
          source: 'system',
          enterprise_id: null,
          user_id: null,
          status: 'active',
          description: '阿里云官方系统音色',
          sort: 0
        }
      });
      if (voiceCreated) {
        console.log(`✓ 官方声音创建成功: ${voice.name} (${voice.voice_key})`);
      } else {
        console.log(`✓ 官方声音已存在: ${voice.name} (${voice.voice_key})`);
      }
    }
    console.log('✓ 官方声音初始化完成');

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
