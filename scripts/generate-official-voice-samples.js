/**
 * Generate Official Voice Samples — 官方系统音色试听生成（一次性运维脚本）
 *
 * Phase DigitalHuman-Rebuild-004 Step7-B.3 (W4)
 *
 * 功能：
 *   使用 qwen3-tts-flash-realtime 对固定试听文本逐音色合成一次（标准
 *   synthesizeSpeech 路径 → 真实 TTS → OSS 上传），输出 8 个官方音色的
 *   sample_audio_url（OSS URL），供 init.js 官方声音种子引用。
 *
 * 硬性红线：
 *   ❌ 禁止 Mock 音频（buffer / base64 / 假 URL）
 *   ❌ 禁止第三方 CDN / 过期签名 URL
 *   ✅ 只走 aliyunProvider.synthesizeSpeech（真实 DashScope TTS → OSS）
 *
 * 用法：
 *   node scripts/generate-official-voice-samples.js
 *
 * 说明：
 *   必须在本阶段 W1（Provider _buildTtsCommand 补 input.voice）落地后运行，
 *   否则合成结果仍是默认音色而非所选官方音色。
 *   依赖 .env 中的 DASHSCOPE_API_KEY 与 OSS_* 配置（OSSService 经 DB ApiConfig
 *   读取，需数据库可达）。
 */

require('dotenv').config();
const { sequelize } = require('../models');
const aliyunProvider = require('../providers/aliyunProvider');

// 固定试听文本（Step7-B.2 冻结）
const SAMPLE_TEXT = '你好，我是御剑数字人，很高兴为你播报。';

// 官方目录模型（Step7-B.2 冻结）
const MODEL_ID = 'qwen3-tts-flash-realtime';

// 8 个官方音色（voice_key = 真实阿里云 voice_id，区分大小写；Step7-B.2 冻结清单）
const VOICES = [
  { voiceKey: 'Cherry', name: '芊悦', gender: 'female' },
  { voiceKey: 'Chelsie', name: '可儿', gender: 'female' },
  { voiceKey: 'Jennifer', name: '詹妮弗', gender: 'female' },
  { voiceKey: 'Seren', name: '瑟琳', gender: 'female' },
  { voiceKey: 'Neil', name: '尼尔', gender: 'male' },
  { voiceKey: 'Moon', name: '月白', gender: 'male' },
  { voiceKey: 'Ryan', name: '甜茶', gender: 'male' },
  { voiceKey: 'Eldric Sage', name: '艾德里克', gender: 'male' },
];

/**
 * 逐音色合成并上传 OSS，返回 8 条 { voiceKey, name, gender, audioUrl, ossKey, ... }
 */
async function main() {
  // ── 1. 数据库可达（ossService 经 ApiConfig 读取 OSS 配置，ApiConfig 在 DB）─
  await sequelize.authenticate();
  console.log(`[VoiceSamples] DB connected | voices=${VOICES.length} | model=${MODEL_ID}`);

  const results = [];

  for (const v of VOICES) {
    console.log(
      `[VoiceSamples] synthesizing | voiceKey=${v.voiceKey} | name=${v.name} | ` +
      `time=${new Date().toISOString()}`
    );

    try {
      const audio = await aliyunProvider.synthesizeSpeech({
        text: SAMPLE_TEXT,
        voiceId: v.voiceKey,
        modelId: MODEL_ID,
        format: 'mp3',
        enterpriseId: 0,
      });

      if (!audio.audioUrl) {
        throw new Error('audioUrl empty from synthesizeSpeech');
      }

      console.log(
        `[VoiceSamples] synthesized ✓ | voiceKey=${v.voiceKey} | ` +
        `audioUrl=${audio.audioUrl} | duration=${audio.duration}s | ` +
        `fileSize=${(audio.fileSize / 1024).toFixed(1)}KB | model=${audio.model}`
      );

      results.push({
        voiceKey: v.voiceKey,
        name: v.name,
        gender: v.gender,
        audioUrl: audio.audioUrl,
        ossKey: audio.ossKey || null,
        duration: audio.duration || 0,
        fileSize: audio.fileSize || 0,
        model: audio.model || MODEL_ID,
      });
    } catch (err) {
      console.error(
        `[VoiceSamples] synthesizing FAILED | voiceKey=${v.voiceKey} | ` +
        `error=${err.message} | time=${new Date().toISOString()}`
      );
      results.push({
        voiceKey: v.voiceKey,
        name: v.name,
        gender: v.gender,
        audioUrl: null,
        ossKey: null,
        error: err.message,
      });
    }
  }

  // ── 2. 输出结果（供 init.js 种子引用）─────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('OFFICIAL VOICE SAMPLE RESULTS');
  console.log('═══════════════════════════════════════════════════════');
  console.log(JSON.stringify(results, null, 2));
  console.log('═══════════════════════════════════════════════════════');

  const succeeded = results.filter(r => r.audioUrl).length;
  console.log(`[VoiceSamples] DONE | success=${succeeded}/${VOICES.length}`);

  await sequelize.close();
  process.exit(succeeded === VOICES.length ? 0 : 1);
}

main().catch(async (err) => {
  console.error(`[VoiceSamples] FATAL | ${err.message}`);
  try { await sequelize.close(); } catch (_) { /* ignore */ }
  process.exit(1);
});
