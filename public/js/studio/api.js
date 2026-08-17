/**
 * YuJian Studio — API Adapter
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D3-B
 *
 * 职责（Studio 数据层唯一「请求 + 映射 + 容错」入口，唯一入口 YJ.studio.api）：
 *   1. 请求层：仅消费 YuJianAPI（基础层，已挂载），禁止 fetch / axios / safeFetch
 *   2. 映射层：snake_case → camelCase（唯一转换点），页面/组件禁止看到 snake_case
 *   3. 容错层：handleError 统一错误归一化，输出 { code, message, status, retryable, friendlyMessage }
 *
 * 边界（严格遵守，违规即返工）：
 *   ❌ 页面直接 fetch（一切经本 Adapter）
 *   ❌ 二次解包 data.data（YuJianAPI 已解包，拿到即 data）
 *   ❌ 页面各自 catch 做错误文案映射（文案集中 handleError）
 *   ❌ 实现 pipeline detail / timeline / errors（复用 YJ.pipelineAdapter）
 *   ✅ vanilla JS + IIFE + window.YJ
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  规范化层（snake_case → camelCase，唯一转换点）
  // ═══════════════════════════════════════════════════════════════════

  /**
   * normalizeAvatar(data) → Avatar ViewModel
   *
   * 契约 data: { id, avatar_uuid, name, description, image_url, thumbnail_url,
   *              source, gender, status, created_at }
   */
  function normalizeAvatar(data) {
    if (!data) return null;
    return {
      id: data.id != null ? data.id : null,
      avatarUuid: data.avatar_uuid != null ? data.avatar_uuid : null,
      name: data.name != null ? data.name : null,
      description: data.description != null ? data.description : null,
      imageUrl: data.image_url != null ? data.image_url : null,
      thumbnailUrl: data.thumbnail_url != null ? data.thumbnail_url : null,
      source: data.source != null ? data.source : null,
      gender: data.gender != null ? data.gender : null,
      status: data.status != null ? data.status : null,
      createdAt: data.created_at != null ? data.created_at : null
    };
  }

  /**
   * normalizeVoice(data) → Voice ViewModel
   *
   * 契约 data: { id, voice_uuid, name, voice_key, model_id, provider, gender,
   *              language, sample_audio_url, description, source, status, created_at }
   */
  function normalizeVoice(data) {
    if (!data) return null;
    return {
      id: data.id != null ? data.id : null,
      voiceUuid: data.voice_uuid != null ? data.voice_uuid : null,
      name: data.name != null ? data.name : null,
      voiceKey: data.voice_key != null ? data.voice_key : null,
      modelId: data.model_id != null ? data.model_id : null,
      provider: data.provider != null ? data.provider : null,
      gender: data.gender != null ? data.gender : null,
      language: data.language != null ? data.language : null,
      sampleAudioUrl: data.sample_audio_url != null ? data.sample_audio_url : null,
      description: data.description != null ? data.description : null,
      source: data.source != null ? data.source : null,
      status: data.status != null ? data.status : null,
      createdAt: data.created_at != null ? data.created_at : null
    };
  }

  /**
   * normalizeScript(data) → Script ViewModel（CRUD 项）
   *
   * 契约 data: { id, title, source_type, full_script, structured_script,
   *              estimated_duration, total_words, status, created_at }
   * 注：structured_script 后端已 JSON.parse 成对象/null，原样透传（内部已是 camelCase）。
   */
  function normalizeScript(data) {
    if (!data) return null;
    return {
      id: data.id != null ? data.id : null,
      title: data.title != null ? data.title : null,
      sourceType: data.source_type != null ? data.source_type : null,
      fullScript: data.full_script != null ? data.full_script : null,
      structuredScript: data.structured_script != null ? data.structured_script : null,
      estimatedDuration: data.estimated_duration != null ? data.estimated_duration : null,
      totalWords: data.total_words != null ? data.total_words : 0,
      status: data.status != null ? data.status : null,
      createdAt: data.created_at != null ? data.created_at : null
    };
  }

  /**
   * normalizeGeneratedScript(data) → AI 生成结果 ViewModel
   *
   * 契约 data: { script_record_id, title, full_text, segments, total_words,
   *              estimated_duration, style, status, created_at }
   * 注：segments 内部（index/text/estimatedDurationSec/emotion/emphasis）原样透传。
   */
  function normalizeGeneratedScript(data) {
    if (!data) return null;
    return {
      scriptRecordId: data.script_record_id != null ? data.script_record_id : null,
      title: data.title != null ? data.title : null,
      fullText: data.full_text != null ? data.full_text : null,
      segments: Array.isArray(data.segments) ? data.segments : [],
      totalWords: data.total_words != null ? data.total_words : 0,
      estimatedDuration: data.estimated_duration != null ? data.estimated_duration : null,
      style: data.style != null ? data.style : null,
      status: data.status != null ? data.status : null,
      createdAt: data.created_at != null ? data.created_at : null
    };
  }

  /**
   * normalizePipelineExecute(data) → 提交结果 ViewModel
   *
   * 契约 data: { pipeline_id, pipeline_uuid, status }
   */
  function normalizePipelineExecute(data) {
    if (!data) return null;
    return {
      pipelineId: data.pipeline_id != null ? data.pipeline_id : null,
      pipelineUuid: data.pipeline_uuid != null ? data.pipeline_uuid : null,
      status: data.status != null ? data.status : null
    };
  }

  /**
   * normalizePipelineListItem(data) → 任务列表项 ViewModel
   *
   * 契约 data: { id, pipeline_uuid, status, progress, current_layer, failed_layer,
   *              input_summary: { product_name, image_url } | null,
   *              created_at, completed_at }
   */
  function normalizePipelineListItem(data) {
    if (!data) return null;
    var summary = data.input_summary;
    return {
      id: data.id != null ? data.id : null,
      pipelineUuid: data.pipeline_uuid != null ? data.pipeline_uuid : null,
      status: data.status != null ? data.status : null,
      progress: data.progress != null ? data.progress : 0,
      currentLayer: data.current_layer != null ? data.current_layer : null,
      failedLayer: data.failed_layer != null ? data.failed_layer : null,
      inputSummary: summary ? {
        productName: summary.product_name != null ? summary.product_name : null,
        imageUrl: summary.image_url != null ? summary.image_url : null
      } : null,
      createdAt: data.created_at != null ? data.created_at : null,
      completedAt: data.completed_at != null ? data.completed_at : null
    };
  }

  /**
   * normalizePlayUrl(data) → 素材播放 URL ViewModel
   *
   * 契约 data: { url, expires, type }（后端已返回 camelCase，无 snake_case 转换）
   * 注：expires=0 表示非 OSS 旧格式 URL 直接透传，无需签名。
   */
  function normalizePlayUrl(data) {
    if (!data) return null;
    return {
      url: data.url != null ? data.url : null,
      expires: data.expires != null ? data.expires : 0,
      type: data.type != null ? data.type : null
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  错误归一化（唯一容错点，页面禁止各自 catch 映射）
  // ═══════════════════════════════════════════════════════════════════

  /**
   * handleError(err) → { code, message, status, retryable, friendlyMessage }
   *
   * 输入任意 throw（YuJianAPI 已是 ApiError），输出统一归一化对象。
   * 401 单点处理：清 token + 跳 index.html（页面不各自处理 401）。
   */
  function handleError(err) {
    err = err || {};
    var status = (typeof err.status === 'number') ? err.status : 0;
    var code = (err.code != null) ? err.code : (status || 'UNKNOWN');
    var message = err.message || '操作失败，请稍后重试';
    var retryable = !!(err.retryable);
    var friendlyMessage;

    if (status === 401) {
      friendlyMessage = '登录已过期，请重新登录';
      // 单点：清 token + 返回主平台
      if (window.YuJianAuth && typeof YuJianAuth.logout === 'function') {
        YuJianAuth.logout();
      }
      if (window.location && window.location.href) {
        window.location.href = 'index.html';
      }
    } else if (status === 403) {
      friendlyMessage = '无权操作该资源（官方/系统资源只读）';
    } else if (status === 404) {
      friendlyMessage = '资源不存在或已删除';
    } else if (status >= 400) {
      // 400 校验 / 500 服务器：透传后端已脱敏中文
      friendlyMessage = message;
    } else if (status === 0) {
      friendlyMessage = '网络连接失败，请检查网络后重试';
    } else {
      friendlyMessage = message;
    }

    return {
      code: code,
      message: message,
      status: status,
      retryable: retryable,
      friendlyMessage: friendlyMessage
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  门面方法（请求 + 反向 snake_case 请求体 + 成功规范化 + 失败归一化）
  // ═══════════════════════════════════════════════════════════════════

  var avatar = {
    /**
     * 形象列表（官方/我的 双层目录，source=official|uploaded）
     */
    list: function (params) {
      params = params || {};
      var q = '?page=' + (params.page || 1) + '&pageSize=' + (params.pageSize || 20);
      if (params.source) q += '&source=' + encodeURIComponent(params.source);
      if (params.status) q += '&status=' + encodeURIComponent(params.status);
      return YuJianAPI.get('/enterprise/avatars' + q).then(function (data) {
        data = data || {};
        return {
          total: data.total != null ? data.total : 0,
          page: data.page != null ? data.page : 1,
          pageSize: data.pageSize != null ? data.pageSize : 20,
          items: (data.items || []).map(normalizeAvatar)
        };
      }).catch(function (err) { throw handleError(err); });
    },

    detail: function (id) {
      return YuJianAPI.get('/enterprise/avatars/' + id)
        .then(normalizeAvatar)
        .catch(function (err) { throw handleError(err); });
    },

    create: function (body) {
      body = body || {};
      var payload = {
        name: body.name,
        image_url: body.imageUrl,
        asset_id: body.assetId,
        description: body.description,
        gender: body.gender,
        thumbnail_url: body.thumbnailUrl
      };
      return YuJianAPI.post('/enterprise/avatars', payload)
        .then(normalizeAvatar)
        .catch(function (err) { throw handleError(err); });
    },

    update: function (id, body) {
      body = body || {};
      var payload = {};
      if (body.name !== undefined) payload.name = body.name;
      if (body.description !== undefined) payload.description = body.description;
      if (body.imageUrl !== undefined) payload.image_url = body.imageUrl;
      if (body.thumbnailUrl !== undefined) payload.thumbnail_url = body.thumbnailUrl;
      if (body.assetId !== undefined) payload.asset_id = body.assetId;
      if (body.gender !== undefined) payload.gender = body.gender;
      if (body.status !== undefined) payload.status = body.status;
      return YuJianAPI.request('/enterprise/avatars/' + id, { method: 'PUT', body: payload })
        .then(normalizeAvatar)
        .catch(function (err) { throw handleError(err); });
    },

    remove: function (id) {
      return YuJianAPI.request('/enterprise/avatars/' + id, { method: 'DELETE' }).then(function (data) {
        data = data || {};
        return {
          id: data.id != null ? data.id : null,
          deletedAt: data.deleted_at != null ? data.deleted_at : null
        };
      }).catch(function (err) { throw handleError(err); });
    }
  };

  var voice = {
    /**
     * 音色列表（音色库/我的 双层目录，source=system|custom）
     */
    list: function (params) {
      params = params || {};
      var q = '?page=' + (params.page || 1) + '&pageSize=' + (params.pageSize || 20);
      if (params.source) q += '&source=' + encodeURIComponent(params.source);
      if (params.gender) q += '&gender=' + encodeURIComponent(params.gender);
      if (params.status) q += '&status=' + encodeURIComponent(params.status);
      return YuJianAPI.get('/enterprise/voices' + q).then(function (data) {
        data = data || {};
        return {
          total: data.total != null ? data.total : 0,
          page: data.page != null ? data.page : 1,
          pageSize: data.pageSize != null ? data.pageSize : 20,
          items: (data.items || []).map(normalizeVoice)
        };
      }).catch(function (err) { throw handleError(err); });
    },

    detail: function (id) {
      return YuJianAPI.get('/enterprise/voices/' + id)
        .then(normalizeVoice)
        .catch(function (err) { throw handleError(err); });
    },

    create: function (body) {
      body = body || {};
      var payload = {
        name: body.name,
        voice_key: body.voiceKey,
        model_id: body.modelId,
        provider: body.provider,
        gender: body.gender,
        language: body.language,
        sample_audio_url: body.sampleAudioUrl,
        sample_audio_asset_id: body.sampleAudioAssetId,
        description: body.description
      };
      return YuJianAPI.post('/enterprise/voices', payload)
        .then(normalizeVoice)
        .catch(function (err) { throw handleError(err); });
    },

    update: function (id, body) {
      body = body || {};
      var payload = {};
      if (body.name !== undefined) payload.name = body.name;
      if (body.modelId !== undefined) payload.model_id = body.modelId;
      if (body.voiceKey !== undefined) payload.voice_key = body.voiceKey;
      if (body.gender !== undefined) payload.gender = body.gender;
      if (body.language !== undefined) payload.language = body.language;
      if (body.sampleAudioUrl !== undefined) payload.sample_audio_url = body.sampleAudioUrl;
      if (body.sampleAudioAssetId !== undefined) payload.sample_audio_asset_id = body.sampleAudioAssetId;
      if (body.description !== undefined) payload.description = body.description;
      if (body.status !== undefined) payload.status = body.status;
      return YuJianAPI.request('/enterprise/voices/' + id, { method: 'PUT', body: payload })
        .then(normalizeVoice)
        .catch(function (err) { throw handleError(err); });
    },

    remove: function (id) {
      return YuJianAPI.request('/enterprise/voices/' + id, { method: 'DELETE' }).then(function (data) {
        data = data || {};
        return {
          id: data.id != null ? data.id : null,
          deletedAt: data.deleted_at != null ? data.deleted_at : null
        };
      }).catch(function (err) { throw handleError(err); });
    }
  };

  var script = {
    /**
     * 脚本草稿列表（source_type=pipeline|ai|manual）
     */
    list: function (params) {
      params = params || {};
      var q = '?page=' + (params.page || 1) + '&pageSize=' + (params.pageSize || 20);
      if (params.sourceType) q += '&source_type=' + encodeURIComponent(params.sourceType);
      if (params.status) q += '&status=' + encodeURIComponent(params.status);
      return YuJianAPI.get('/enterprise/scripts' + q).then(function (data) {
        data = data || {};
        return {
          total: data.total != null ? data.total : 0,
          page: data.page != null ? data.page : 1,
          pageSize: data.pageSize != null ? data.pageSize : 20,
          items: (data.items || []).map(normalizeScript)
        };
      }).catch(function (err) { throw handleError(err); });
    },

    detail: function (id) {
      return YuJianAPI.get('/enterprise/scripts/' + id)
        .then(normalizeScript)
        .catch(function (err) { throw handleError(err); });
    },

    create: function (body) {
      body = body || {};
      var payload = {
        source_type: body.sourceType,
        title: body.title,
        full_script: body.fullScript,
        structured_script: body.structuredScript,
        pipeline_task_id: body.pipelineTaskId,
        estimated_duration: body.estimatedDuration,
        total_words: body.totalWords,
        character_count: body.characterCount,
        scene_count: body.sceneCount,
        status: body.status
      };
      return YuJianAPI.post('/enterprise/scripts', payload)
        .then(normalizeScript)
        .catch(function (err) { throw handleError(err); });
    },

    update: function (id, body) {
      body = body || {};
      var payload = {};
      if (body.title !== undefined) payload.title = body.title;
      if (body.fullScript !== undefined) payload.full_script = body.fullScript;
      if (body.structuredScript !== undefined) payload.structured_script = body.structuredScript;
      if (body.status !== undefined) payload.status = body.status;
      if (body.estimatedDuration !== undefined) payload.estimated_duration = body.estimatedDuration;
      if (body.totalWords !== undefined) payload.total_words = body.totalWords;
      if (body.sourceType !== undefined) payload.source_type = body.sourceType;
      return YuJianAPI.request('/enterprise/scripts/' + id, { method: 'PUT', body: payload })
        .then(normalizeScript)
        .catch(function (err) { throw handleError(err); });
    },

    remove: function (id) {
      return YuJianAPI.request('/enterprise/scripts/' + id, { method: 'DELETE' }).then(function (data) {
        data = data || {};
        return {
          id: data.id != null ? data.id : null,
          deletedAt: data.deleted_at != null ? data.deleted_at : null
        };
      }).catch(function (err) { throw handleError(err); });
    },

    generate: function (body) {
      body = body || {};
      var payload = {
        theme: body.theme,
        style: body.style,
        duration: body.duration,
        product_name: body.productName,
        scene_context: body.sceneContext
      };
      return YuJianAPI.post('/enterprise/scripts/generate', payload)
        .then(normalizeGeneratedScript)
        .catch(function (err) { throw handleError(err); });
    }
  };

  var pipeline = {
    /**
     * 提交并启动数字人流水线（detail/timeline/errors 复用 YJ.pipelineAdapter）
     */
    execute: function (body) {
      body = body || {};
      var payload = {
        image_url: body.imageUrl,
        images: body.images,
        theme: body.theme,
        style: body.style,
        voice_id: body.voiceId,
        resolution: body.resolution,
        duration: body.duration,
        product_name: body.productName,
        script_id: body.scriptId
      };
      return YuJianAPI.post('/enterprise/pipelines/execute', payload)
        .then(normalizePipelineExecute)
        .catch(function (err) { throw handleError(err); });
    },

    /**
     * 任务列表（status 逗号分隔 / start_date / end_date）
     */
    list: function (params) {
      params = params || {};
      var q = '?page=' + (params.page || 1) + '&pageSize=' + (params.pageSize || 20);
      if (params.status) q += '&status=' + encodeURIComponent(params.status);
      if (params.startDate) q += '&start_date=' + encodeURIComponent(params.startDate);
      if (params.endDate) q += '&end_date=' + encodeURIComponent(params.endDate);
      return YuJianAPI.get('/enterprise/pipelines' + q).then(function (data) {
        data = data || {};
        return {
          total: data.total != null ? data.total : 0,
          page: data.page != null ? data.page : 1,
          pageSize: data.pageSize != null ? data.pageSize : 20,
          items: (data.items || []).map(normalizePipelineListItem)
        };
      }).catch(function (err) { throw handleError(err); });
    },

    /**
     * 删除流水线任务（Step5-G1.1：删除 = 终止；History 复用同一能力，不另开接口）
     * 返回 status 供页面区分「终止」与「删除」文案（cancelled = 进行中任务被终止）。
     */
    remove: function (id) {
      return YuJianAPI.request('/enterprise/pipelines/' + id, { method: 'DELETE' }).then(function (data) {
        data = data || {};
        return {
          id: data.id != null ? data.id : null,
          status: data.status != null ? data.status : null,
          deletedAt: data.deleted_at != null ? data.deleted_at : null
        };
      }).catch(function (err) { throw handleError(err); });
    }
  };

  var asset = {
    /**
     * 获取素材播放 URL（私有 OSS 签名，7 天有效；视频/图片均支持）
     * 数字人成品视频前端播放 + 下载的唯一 URL 入口。
     */
    playUrl: function (assetId) {
      return YuJianAPI.get('/enterprise/assets/' + assetId + '/play-url')
        .then(normalizePlayUrl)
        .catch(function (err) { throw handleError(err); });
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  实体状态映射（唯一映射点增量，不改请求）
  //  组件层状态徽章经 resolveStatusMeta(domain, status) → { label, tone }
  // ═══════════════════════════════════════════════════════════════════

  // 后端真实状态枚举（已核对，非推断）：
  //   avatar / voice：active / disabled
  //   script：draft / reviewed / approved / rejected
  //   pipeline：复用 YJ.pipelineAdapter.PIPELINE_STATUS_MAP（不另立映射）
  var ENTITY_STATUS_MAP = {
    avatar: {
      active:   { label: '已启用', tone: 'success' },
      disabled: { label: '已禁用', tone: 'muted'   }
    },
    voice: {
      active:   { label: '已启用', tone: 'success' },
      disabled: { label: '已禁用', tone: 'muted'   }
    },
    script: {
      draft:    { label: '草稿',   tone: 'muted'   },
      reviewed: { label: '已审核', tone: 'info'    },
      approved: { label: '已通过', tone: 'success' },
      rejected: { label: '已驳回', tone: 'danger'  }
    }
  };

  /**
   * resolveStatusMeta(domain, status) → { label, tone }
   * domain: avatar | voice | script | pipeline
   * pipeline 委托 YJ.pipelineAdapter.PIPELINE_STATUS_MAP（单一来源）；
   * 未知 status 回退 muted，label 用原始 status 兜底。
   */
  function resolveStatusMeta(domain, status) {
    if (domain === 'pipeline') {
      var pipelineMap = (window.YJ && window.YJ.pipelineAdapter && window.YJ.pipelineAdapter.PIPELINE_STATUS_MAP) || null;
      if (pipelineMap && pipelineMap[status]) return pipelineMap[status];
      return { label: status || '未知', tone: 'muted' };
    }
    var map = ENTITY_STATUS_MAP[domain];
    if (map && map[status]) return map[status];
    return { label: status || '未知', tone: 'muted' };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  暴露到全局（仅挂载 YJ.studio.api，不新增顶层全局）
  // ═══════════════════════════════════════════════════════════════════

  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};
  YJ.studio.api = {
    avatar: avatar,
    voice: voice,
    script: script,
    pipeline: pipeline,
    asset: asset,
    resolveStatusMeta: resolveStatusMeta
  };
  window.YJ = YJ;

  console.log('[Studio/API] Studio API Adapter initialized (Phase DigitalHuman-Rebuild-004 Step5-D3-B)');
})();
