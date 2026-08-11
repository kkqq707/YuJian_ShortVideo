/**
 * YuJian Enterprise — Generation Panel Module
 *
 * Sprint 4.5: AI创作弹窗、创作类型选择、Prompt输入、任务创建
 * 保持 Creative Template System 和阿里云 provider 配置
 *
 * 依赖：state.js, utils.js, api.js
 */

(function () {
  'use strict';

  var state = (window.YJ && window.YJ.state) || {};
  var utils = (window.YJ && window.YJ.utils) || {};
  var api = window.EnterpriseAPI || ((window.YJ && window.YJ.api) || {});

  var showToast = utils.showToast || window.showToast;
  var escapeHtml = utils.escapeHtml || window.escapeHtml;
  var formatAssetSize = utils.formatAssetSize || window.formatAssetSize;
  var safeFetch = utils.safeFetch || window.safeFetch;

  // ─── Template Mapping (Sprint 4.7: 模型由后端 Provider 自动解析，前端不传 model) ──

  // ─── Open Generation Panel ────────────────────────────────
  async function openGenPanel(assetOrId) {
    if (!YuJianAuth.isAuthenticated()) {
      if (typeof showLogin === 'function') showLogin();
      showToast('请先登录企业账号', 'warning');
      return;
    }

    var overlay = document.getElementById('genPanelOverlay');
    if (!overlay) return;

    // Reset state
    resetGenPanel();

    // Show loading
    overlay.classList.add('show');
    document.getElementById('genSourceName').textContent = '加载中...';
    document.getElementById('genSourceMeta').textContent = '';
    document.getElementById('genSourceThumb').src = '';

    var asset = null;
    var assetId = null;

    // Parse parameter
    if (typeof assetOrId === 'object' && assetOrId !== null && assetOrId.id) {
      asset = assetOrId;
      assetId = asset.id;
    } else if (typeof assetOrId === 'string' || typeof assetOrId === 'number') {
      assetId = String(assetOrId);
      // Try cache first
      asset = state.getCachedAsset ? state.getCachedAsset(assetId) : null;
      if (!asset && window.ASSET_CACHE) {
        asset = window.ASSET_CACHE[assetId] || null;
      }
    }

    // Set generation state
    if (assetId) {
      state.generation.assetId = assetId;
      state.generation.sourceAssetId = assetId;
    }

    if (asset) {
      state.setCurrentGenerationAsset(asset);
      state.generation.currentAsset = asset;
      state.generation.sourceAsset = asset;
      renderReferenceAssetInPanel(asset);
      return;
    }

    // No asset available
    if (!assetId) {
      document.getElementById('genSourceName').textContent = '素材不可用';
      document.getElementById('genSourceMeta').textContent = '未选择素材';
      return;
    }

    // Fetch from API
    try {
      if (api.Asset && api.Asset.getAssetDetail) {
        asset = await api.Asset.getAssetDetail(assetId);
      } else {
        asset = await safeFetch('/enterprise/assets/' + assetId);
      }
      // Cache it
      if (state.cacheAsset) state.cacheAsset(assetId, asset);
      if (window.ASSET_CACHE) window.ASSET_CACHE[assetId] = asset;
      state.setCurrentGenerationAsset(asset);
      state.generation.currentAsset = asset;
      state.generation.sourceAsset = asset;
      renderReferenceAssetInPanel(asset);
    } catch (err) {
      console.error('[GenPanel] 加载素材失败:', err);
      if (err.status === 404) {
        document.getElementById('genSourceName').textContent = '素材不存在或已删除';
      } else {
        document.getElementById('genSourceName').textContent = '素材不可用';
      }
      document.getElementById('genSourceMeta').textContent = '无法获取素材信息';
    }
  }

  // ─── Render Reference Asset in Panel ──────────────────────
  function renderReferenceAssetInPanel(asset) {
    document.getElementById('genSourceName').textContent = asset.name || '未命名素材';
    var metaParts = [];
    var typeLabel = asset.typeLabel || (asset.type === 'image' ? '图片' : asset.type === 'video' ? '视频' : (asset.type || '--'));
    metaParts.push(typeLabel);
    var sizeStr = asset.size ? formatAssetSize(asset.size) : '';
    if (sizeStr) metaParts.push(sizeStr);
    document.getElementById('genSourceMeta').textContent = metaParts.join(' · ') || '--';

    var thumbUrl = asset.thumbnailUrl || asset.url || '';
    var thumbEl = document.getElementById('genSourceThumb');
    if (thumbUrl) {
      thumbEl.src = thumbUrl;
      thumbEl.style.display = '';
    } else {
      thumbEl.style.display = 'none';
    }

    // Focus prompt input
    setTimeout(function () {
      var promptEl = document.getElementById('genPrompt');
      if (promptEl) promptEl.focus();
    }, 200);
  }

  // ─── Close Generation Panel ───────────────────────────────
  function closeGenPanel() {
    var overlay = document.getElementById('genPanelOverlay');
    if (overlay) overlay.classList.remove('show');

    // Stop polling
    if (state.generation.pollTimer) {
      clearInterval(state.generation.pollTimer);
      state.generation.pollTimer = null;
    }

    if (!state.generation.isSubmitting) {
      resetGenPanel();
    }
  }

  // ─── Reset Panel State ────────────────────────────────────
  function resetGenPanel() {
    state.resetGenerationState();

    document.getElementById('genPrompt').value = '';
    document.getElementById('genPromptCount').textContent = '0';
    document.getElementById('genTimelineContainer').style.display = 'none';
    document.getElementById('genSubmitBtn').disabled = false;
    document.getElementById('genSubmitText').textContent = '开始生成';

    // Reset creative type selection
    var modelCards = document.querySelectorAll('.gen-model-card');
    modelCards.forEach(function (c) { c.classList.remove('selected'); });
    var defaultTemplate = document.querySelector('.gen-model-card[data-template="image_to_video"]');
    if (defaultTemplate) defaultTemplate.classList.add('selected');
    state.generation.selectedTemplate = 'image_to_video';

    // Reset output type
    var outputBtns = document.querySelectorAll('.gen-output-type-btn');
    outputBtns.forEach(function (b) { b.classList.remove('selected'); });
    var defaultOutput = document.querySelector('.gen-output-type-btn[data-output="video"]');
    if (defaultOutput) defaultOutput.classList.add('selected');
    state.generation.selectedOutput = 'video';

    // Reset timeline
    resetGenTimeline();
  }

  // ─── Select Creative Template ─────────────────────────────
  function selectCreativeTemplate(el, templateId) {
    var cards = document.querySelectorAll('.gen-model-card');
    cards.forEach(function (c) { c.classList.remove('selected'); });
    if (el) el.classList.add('selected');
    state.generation.selectedTemplate = templateId;
  }

  // ─── Select Output Type ───────────────────────────────────
  function selectGenOutput(el, type) {
    var btns = document.querySelectorAll('.gen-output-type-btn');
    btns.forEach(function (b) { b.classList.remove('selected'); });
    if (el) el.classList.add('selected');
    state.generation.selectedOutput = type;
  }

  // ─── Reset Timeline ───────────────────────────────────────
  function resetGenTimeline() {
    var steps = ['genStepSubmit', 'genStepProcess', 'genStepComplete', 'genStepView'];
    var lines = ['genLine1', 'genLine2', 'genLine3'];
    steps.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.className = 'gen-timeline-step'; }
    });
    lines.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.classList.remove('done'); }
    });
  }

  // ─── Update Generation Timeline ───────────────────────────
  function updateGenTimeline(activeStep) {
    var timeline = document.getElementById('genTimelineContainer');
    if (timeline) timeline.style.display = 'block';

    var stepMap = { submit: 0, process: 1, complete: 2, view: 3 };
    var stepIds = ['genStepSubmit', 'genStepProcess', 'genStepComplete', 'genStepView'];
    var lineIds = ['genLine1', 'genLine2', 'genLine3'];
    var targetIdx = stepMap[activeStep] !== undefined ? stepMap[activeStep] : 0;

    for (var i = 0; i < stepIds.length; i++) {
      var el = document.getElementById(stepIds[i]);
      if (!el) continue;
      el.className = 'gen-timeline-step';
      if (i < targetIdx) el.classList.add('done');
      if (i === targetIdx) el.classList.add('active');
    }

    for (var j = 0; j < lineIds.length; j++) {
      var line = document.getElementById(lineIds[j]);
      if (!line) continue;
      if (j < targetIdx) line.classList.add('done');
      else line.classList.remove('done');
    }
  }

  // ─── Submit Generation Task ───────────────────────────────
  async function handleGenPanelSubmit() {
    if (state.generation.isSubmitting) return;
    if (!state.generation.assetId && !state.generation.sourceAssetId) {
      showToast('请先选择参考素材', 'warning');
      return;
    }

    var prompt = (document.getElementById('genPrompt').value || '').trim();
    if (!prompt) {
      showToast('请输入提示词', 'warning');
      return;
    }
    if (prompt.length > 2000) {
      showToast('提示词不能超过2000字', 'warning');
      return;
    }

    state.generation.isSubmitting = true;
    var submitBtn = document.getElementById('genSubmitBtn');
    var submitText = document.getElementById('genSubmitText');
    submitBtn.disabled = true;
    submitText.textContent = '提交中...';

    updateGenTimeline('submit');

    try {
      var templateId = state.generation.selectedTemplate || 'image_to_video';

      updateGenTimeline('process');
      submitText.textContent = '生成中...';

      // Phase UI-AICreation-02-B-2.4-C: Resolve model from Registry template→model mapping
      // 前端显式传递 model，确保 wan2.7-i2v 等非默认模型能正确传递到后端
      var modelConfig = (state.getModelByTemplateId && state.getModelByTemplateId(templateId)) || null;
      var resolvedModel = (modelConfig && modelConfig.id) ? modelConfig.id : null;

      var taskInput = {
        sourceAssetId: state.generation.assetId || state.generation.sourceAssetId,
        prompt: prompt,
        templateId: templateId,
        duration: 5
      };
      if (resolvedModel) {
        taskInput.model = resolvedModel;
      }

      var task;
      if (api.Generation && api.Generation.createTask) {
        task = await api.Generation.createTask(taskInput);
      } else {
        task = await YuJianVideoTask.createImageToVideoTask(taskInput);
      }

      state.generation.currentTaskId = task.id || task.task_id;
      console.log('[GenPanel] 任务创建成功, taskId:', state.generation.currentTaskId);

      // Start polling
      YuJianVideoTask.pollTaskStatus(state.generation.currentTaskId, {
        onUpdate: function (t) {
          updateGenTimeline('process');
          var pct = (t.progress !== null && t.progress !== undefined && t.progress > 0)
            ? t.progress
            : 0;
          var progressHint = (t.status === 'pending' || pct === 0)
            ? '排队中...'
            : '生成中 ' + pct + '%';
          submitText.textContent = progressHint;
        },
        onSuccess: function (t) {
          updateGenTimeline('complete');
          submitText.textContent = '完成 100%';
          setTimeout(function () {
            updateGenTimeline('view');
            submitText.textContent = '生成完成';
            submitBtn.disabled = false;
            state.generation.isSubmitting = false;
            showToast('视频生成成功！', 'success');
            showGenResult(t);
          }, 800);
        },
        onFailed: function (t) {
          var stepComplete = document.getElementById('genStepComplete');
          if (stepComplete) {
            stepComplete.className = 'gen-timeline-step failed';
          }
          submitText.textContent = '生成失败';
          submitBtn.disabled = false;
          state.generation.isSubmitting = false;
          showToast(t.error_msg || '生成失败，请重试', 'error');
        },
        onTimeout: function () {
          submitText.textContent = '超时';
          submitBtn.disabled = false;
          state.generation.isSubmitting = false;
          showToast('任务状态确认超时，可稍后在任务记录中查看', 'warning');
        },
        onError: function (err) {
          console.error('[GenPanel] 轮询出错:', err);
        }
      });

    } catch (err) {
      console.error('[GenPanel] 任务创建失败:', err);
      var stepComplete = document.getElementById('genStepComplete');
      if (stepComplete) {
        stepComplete.className = 'gen-timeline-step failed';
      }
      submitBtn.disabled = false;
      submitText.textContent = '重试';
      state.generation.isSubmitting = false;

      if (err.name === 'AbortError' || err.code === 'ABORTED') {
        showToast('操作已取消', 'info');
      } else {
        showToast(err.message || '任务创建失败，请重试', 'error');
      }
    }
  }

  // ─── Show Generation Result in Panel ──────────────────────
  async function showGenResult(task) {
    var timeline = document.getElementById('genTimelineContainer');
    if (!timeline) return;

    var existing = document.getElementById('genResultInline');
    if (existing) existing.remove();

    // Sprint 5.8: 通过 playUrl 接口获取签名播放 URL
    var resolveAssetPlayableUrl = (utils && utils.resolveAssetPlayableUrl) || window.resolveAssetPlayableUrl;
    var videoUrl = null;
    var outputAssetId = task.outputAsset && task.outputAsset.id;

    if (outputAssetId && resolveAssetPlayableUrl) {
      try {
        videoUrl = await resolveAssetPlayableUrl({
          id: outputAssetId,
          type: 'video',
          url: task.outputAsset && task.outputAsset.url
        });
      } catch (e) {
        console.warn('[GenPanel] playUrl 解析失败，降级:', e.message);
      }
    }

    // 降级：使用 task 中的 playUrl 或 output_url
    if (!videoUrl) {
      videoUrl = task.playUrl || task.output_url || '';
    }

    var resultHtml = '<div id="genResultInline" style="text-align:center;margin-top:16px;padding:16px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);border-radius:12px">';
    resultHtml += '<div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#34d399"><i class="fas fa-check-circle"></i> 生成完成</div>';

    if (videoUrl) {
      resultHtml += '<video src="' + escapeHtml(videoUrl) + '" controls playsinline style="width:100%;max-height:300px;border-radius:8px;margin-bottom:12px;background:#000"></video>';
    }

    resultHtml += '<div style="display:flex;gap:10px;justify-content:center">';
    if (task.outputAsset && task.outputAsset.id) {
      resultHtml += '<button class="btn btn-primary btn-sm" onclick="closeGenPanel();navigateTo(\'myworks\');setTimeout(function(){showWorkDetail(' + (state.generation.currentTaskId || 0) + ')},400)"><i class="fas fa-eye"></i> 查看作品详情</button>';
    }
    resultHtml += '<button class="btn btn-outline btn-sm" onclick="resetGenPanel();document.getElementById(\'genTimelineContainer\').style.display=\'none\'"><i class="fas fa-redo"></i> 再次创作</button>';
    resultHtml += '</div></div>';

    timeline.insertAdjacentHTML('afterend', resultHtml);
  }

  // ─── Bind Prompt Counter ──────────────────────────────────
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'genPrompt') {
      var counter = document.getElementById('genPromptCount');
      if (counter) counter.textContent = (e.target.value || '').length;
    }
  });

  // ─── ESC / Overlay Click to Close ─────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var imgOverlay = document.getElementById('imagePreviewOverlay');
      if (imgOverlay && imgOverlay.classList.contains('show')) {
        if (typeof closeImagePreview === 'function') closeImagePreview();
        return;
      }
      var genOverlay = document.getElementById('genPanelOverlay');
      if (genOverlay && genOverlay.classList.contains('show')) {
        closeGenPanel();
      }
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'genPanelOverlay') {
      closeGenPanel();
    }
  });

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  if (!YJ.modules) YJ.modules = {};
  YJ.modules.generationPanel = {
    openGenPanel: openGenPanel,
    closeGenPanel: closeGenPanel,
    resetGenPanel: resetGenPanel,
    selectCreativeTemplate: selectCreativeTemplate,
    selectGenOutput: selectGenOutput,
    resetGenTimeline: resetGenTimeline,
    updateGenTimeline: updateGenTimeline,
    handleGenPanelSubmit: handleGenPanelSubmit,
    showGenResult: showGenResult,
    renderReferenceAssetInPanel: renderReferenceAssetInPanel
  };
  window.YJ = YJ;

  window.openGenPanel = openGenPanel;
  window.closeGenPanel = closeGenPanel;
  window.resetGenPanel = resetGenPanel;
  window.selectCreativeTemplate = selectCreativeTemplate;
  window.selectGenOutput = selectGenOutput;
  window.handleGenPanelSubmit = handleGenPanelSubmit;

  console.log('[Enterprise/GenerationPanel] Module initialized');
})();
