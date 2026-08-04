/**
 * YuJian Enterprise — Asset History Module
 *
 * Sprint 4.5: 素材创作历史加载与展示
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
  var formatWorkDate = utils.formatWorkDate || window.formatWorkDate;
  var formatTaskType = utils.formatTaskType || window.formatTaskType;
  var safeFetch = utils.safeFetch || window.safeFetch;

  var STATUS_CLASS = {
    'success': 'history-status-success',
    'processing': 'history-status-processing',
    'pending': 'history-status-pending',
    'failed': 'history-status-failed'
  };
  var STATUS_LABEL = {
    'success': '已完成',
    'processing': '处理中',
    'pending': '等待中',
    'failed': '失败'
  };

  // ─── Load Asset History ───────────────────────────────────
  async function loadAssetHistory(assetId) {
    var historyList = document.getElementById('assetHistoryList');
    if (!historyList) return;

    try {
      var wsData;
      if (api.Asset && api.Asset.getAssetGenerations) {
        wsData = await api.Asset.getAssetGenerations(assetId);
      } else if (api.Workspace && api.Workspace.getAssetStats) {
        wsData = await api.Workspace.getAssetStats(assetId);
      } else {
        wsData = await safeFetch('/enterprise/workspace/assets/' + assetId + '/generations');
      }

      var overlay = document.getElementById('assetDetailOverlay');
      if (!overlay || !overlay.classList.contains('show')) return;

      if (!wsData || !wsData.generations || wsData.generations.length === 0) {
        historyList.innerHTML = '<div class="history-empty"><i class="fas fa-inbox"></i><p>暂无创作记录</p></div>';
        return;
      }

      // Summary stats
      var summary = (wsData && wsData.summary) || {};
      var summaryHtml = '';
      if (summary.total > 0) {
        summaryHtml = '<div style="display:flex;gap:16px;margin-bottom:12px;font-size:12px;flex-wrap:wrap">' +
          '<span style="color:var(--text-muted)">总计 <strong style="color:#fff">' + summary.total + '</strong></span>' +
          (summary.success > 0 ? '<span style="color:#34d399">✓ 成功 <strong>' + summary.success + '</strong></span>' : '') +
          (summary.processing > 0 ? '<span style="color:#60a5fa">⟳ 处理中 <strong>' + summary.processing + '</strong></span>' : '') +
          (summary.failed > 0 ? '<span style="color:#f87171">✗ 失败 <strong>' + summary.failed + '</strong></span>' : '') +
          '</div>';
      }

      var html = summaryHtml;
      for (var i = 0; i < wsData.generations.length; i++) {
        var task = wsData.generations[i];
        var statusLabel = STATUS_LABEL[task.status] || (task.status || '未知');
        var statusClass = STATUS_CLASS[task.status] || 'history-status-pending';
        var dateStr = formatWorkDate((task && task.createdAt) || null);
        var promptText = (task && task.prompt) || '无提示词';
        var taskTypeIcon = (task && task.taskType) === 'text2video' ? 'fa-font' :
          (task && task.taskType) === 'image2video' ? 'fa-image' : 'fa-film';

        var outputAsset = task && task.outputAsset;
        var outputHtml = '';
        if (outputAsset) {
          var oaThumb = outputAsset.thumbnailUrl || outputAsset.url || '';
          var oaId = outputAsset.id || 0;
          var oaThumbImg = oaThumb
            ? '<img src="' + escapeHtml(oaThumb) + '" style="width:60px;height:40px;border-radius:6px;object-fit:cover;background:rgba(0,0,0,0.3)" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
            : '';
          outputHtml = '<div class="history-item-action" style="display:flex;align-items:center;gap:10px;margin-top:8px">' +
            oaThumbImg +
            '<button class="btn-view-work" onclick="viewHistoryOutput(' + oaId + ', ' + (task.id || 0) + ')"><i class="fas fa-external-link-alt"></i> 查看作品</button>' +
            '</div>';
        }

        var creativeTypeLabel = formatTaskType(task.taskType);
        html += '<div class="history-item">' +
          '<div class="history-item-header">' +
          '<div class="history-item-name">' +
          '<i class="fas ' + taskTypeIcon + ' task-icon"></i>' +
          escapeHtml(promptText.length > 28 ? promptText.substring(0, 28) + '...' : promptText) +
          '</div>' +
          '<span class="history-item-status ' + statusClass + '">' + escapeHtml(statusLabel) + '</span>' +
          '</div>' +
          '<div class="history-item-meta">' +
          '创作类型：' + escapeHtml(creativeTypeLabel) + ' · ' + dateStr +
          '</div>' +
          ((task && task.prompt) ? '<div class="history-item-prompt" title="' + escapeHtml(task.prompt) + '">Prompt: ' + escapeHtml(task.prompt) + '</div>' : '') +
          outputHtml +
          '</div>';
      }
      historyList.innerHTML = html;

    } catch (wsErr) {
      console.warn('[AssetHistory] Workspace API 加载失败，回退到旧接口:', wsErr.message || wsErr);
      // Fallback to old API
      try {
        var data;
        if (api.Asset && api.Asset.getAssetHistory) {
          data = await api.Asset.getAssetHistory(assetId);
        } else {
          data = await safeFetch('/enterprise/assets/' + assetId + '/history');
        }

        var overlay2 = document.getElementById('assetDetailOverlay');
        if (!overlay2 || !overlay2.classList.contains('show')) return;

        if (!data || !data.generationTasks || data.generationTasks.length === 0) {
          historyList.innerHTML = '<div class="history-empty"><i class="fas fa-inbox"></i><p>暂无创作记录</p></div>';
          return;
        }

        var html2 = '';
        for (var j = 0; j < data.generationTasks.length; j++) {
          var task2 = data.generationTasks[j];
          var sl = STATUS_LABEL[(task2 && task2.status)] || (task2 && task2.status) || '未知';
          var sc = STATUS_CLASS[(task2 && task2.status)] || 'history-status-pending';
          var ds = formatWorkDate((task2 && task2.createdAt) || null);
          var pt = (task2 && task2.prompt) || '无提示词';
          var ti = (task2 && task2.taskType) === 'text2video' ? 'fa-font' :
            (task2 && task2.taskType) === 'image2video' ? 'fa-image' : 'fa-film';

          var tOutput = task2 && task2.outputAsset;
          var oh = tOutput
            ? '<div class="history-item-action"><button class="btn-view-work" onclick="viewHistoryOutput(' + (tOutput.id || 0) + ', ' + (task2.id || 0) + ')"><i class="fas fa-external-link-alt"></i> 查看作品</button></div>'
            : '';

          var ctl = formatTaskType(task2.taskType);
          html2 += '<div class="history-item">' +
            '<div class="history-item-header">' +
            '<div class="history-item-name">' +
            '<i class="fas ' + ti + ' task-icon"></i>' +
            escapeHtml(pt.length > 28 ? pt.substring(0, 28) + '...' : pt) +
            '</div>' +
            '<span class="history-item-status ' + sc + '">' + escapeHtml(sl) + '</span>' +
            '</div>' +
            '<div class="history-item-meta">创作类型：' + escapeHtml(ctl) + ' · 创建时间: ' + ds + '</div>' +
            ((task2 && task2.prompt) ? '<div class="history-item-prompt" title="' + escapeHtml(task2.prompt) + '">Prompt: ' + escapeHtml(task2.prompt) + '</div>' : '') +
            oh +
            '</div>';
        }
        historyList.innerHTML = html2;
      } catch (err) {
        console.warn('[AssetHistory] 旧接口也加载失败:', err.message || err);
        var overlay3 = document.getElementById('assetDetailOverlay');
        if (!overlay3 || !overlay3.classList.contains('show')) return;
        var el = document.getElementById('assetHistoryList');
        if (el) el.innerHTML = '<div class="history-empty"><i class="fas fa-inbox"></i><p>暂无创作记录</p></div>';
      }
    }
  }

  // ─── View History Output (navigate to work) ───────────────
  function viewHistoryOutput(outputAssetId, taskId) {
    if (!taskId && taskId !== 0) {
      showToast('无法查看作品：任务ID缺失', 'warning');
      return;
    }
    if (typeof closeAssetDetail === 'function') closeAssetDetail();
    if (typeof navigateTo === 'function') navigateTo('myworks');
    setTimeout(function () {
      if (typeof showWorkDetail === 'function') showWorkDetail(taskId);
    }, 400);
  }

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  if (!YJ.modules) YJ.modules = {};
  YJ.modules.assetHistory = {
    loadAssetHistory: loadAssetHistory,
    viewHistoryOutput: viewHistoryOutput
  };
  window.YJ = YJ;

  window.loadAssetHistory = loadAssetHistory;
  window.viewHistoryOutput = viewHistoryOutput;

  console.log('[Enterprise/AssetHistory] Module initialized');
})();
