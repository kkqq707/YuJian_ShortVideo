/**
 * YuJian Enterprise — Asset List Module
 *
 * Sprint 4.5: 资产列表加载、卡片渲染、搜索、筛选、排序、分页
 *
 * 依赖：state.js, utils.js, api.js
 *
 * 暴露全局函数（保持与 enterprise.html 兼容）：
 *   loadAssets(), renderAssetCard(), assetSearch(), assetFilterChange(),
 *   assetSortChange(), clearAssetFilters(), toggleAssetMenu(), closeAssetMenu()
 */

(function () {
  'use strict';

  var state = (window.YJ && window.YJ.state && window.YJ.state.assets) || window.ASSETS_STATE || {};
  var utils = (window.YJ && window.YJ.utils) || {};
  var api = window.EnterpriseAPI || ((window.YJ && window.YJ.api) || {});

  var showToast = utils.showToast || window.showToast;
  var escapeHtml = utils.escapeHtml || window.escapeHtml;
  var formatWorkDate = utils.formatWorkDate || window.formatWorkDate;
  var formatAssetSize = utils.formatAssetSize || window.formatAssetSize;
  var safeFetch = utils.safeFetch || window.safeFetch;

  var TYPE_MAP = (state.TYPE_MAP) || {
    'image': '图片', 'video': '视频', 'audio': '音频', 'other': '其他'
  };
  var ICONS = (state.ICONS) || {
    'image': 'fa-image', 'video': 'fa-video', 'audio': 'fa-music', 'other': 'fa-file'
  };
  var PAGE_STATE = (state.PAGE_STATE) || {
    LOADING: 'loading', SUCCESS: 'success', EMPTY: 'empty', ERROR: 'error'
  };

  // ─── Render Asset Page State ──────────────────────────────
  function renderAssetPageState(status, contentEl, paginationEl) {
    if (paginationEl) paginationEl.innerHTML = '';

    switch (status) {
      case PAGE_STATE.LOADING:
        contentEl.innerHTML = '<div class="workspace-state"><div class="workspace-loading-spinner"></div><p>加载中...</p></div>';
        break;

      case PAGE_STATE.EMPTY:
        var hasFilters = state.currentKeyword || state.currentType || state.currentStatus;
        if (hasFilters) {
          contentEl.innerHTML = '<div class="workspace-state">' +
            '<i class="fas fa-search"></i>' +
            '<p>没有匹配的素材</p>' +
            '<p class="sub-text">尝试调整筛选条件或搜索关键词</p>' +
            '<p class="sub-text"><button class="btn btn-outline btn-sm" onclick="clearAssetFilters()" style="margin-top:12px">清除筛选</button></p>' +
            '</div>';
        } else {
          contentEl.innerHTML = '<div class="workspace-state">' +
            '<i class="fas fa-folder-open"></i>' +
            '<p>暂无素材</p>' +
            '<p class="sub-text">上传图片、视频或音频素材开始管理</p>' +
            '</div>';
        }
        break;

      case PAGE_STATE.ERROR:
        contentEl.innerHTML = '<div class="empty-works">' +
          '<i class="fas fa-exclamation-circle"></i>' +
          '<p>' + (state.errorMessage || '加载失败，请稍后重试') + '</p>' +
          '<p class="sub-text"><button class="btn btn-outline btn-sm" onclick="loadAssets(' + state.currentPage + ')" style="margin-top:12px">重新加载</button></p>' +
          '</div>';
        break;

      case PAGE_STATE.SUCCESS:
        contentEl.innerHTML = '<div class="asset-grid-new">' +
          (state.items || []).map(renderAssetCard).join('') +
          '</div>';
        renderAssetPagination(paginationEl);
        break;

      default:
        break;
    }
  }

  // ─── Render Single Asset Card ─────────────────────────────
  /**
   * Sprint 5.8: 卡片缩略图使用后端已签名的 URL（list/detail API 返回时已签名）
   * 视频播放通过 openAssetDetail → resolveAssetPlayableUrl 获取实时签名 URL
   */
  function renderAssetCard(item) {
    var assetType = (item && item.type) || 'other';
    var typeLabel = TYPE_MAP[assetType] || '其他';
    var typeIcon = ICONS[assetType] || 'fa-file';
    var typeBadge = { image: 'IMG', video: 'MP4', audio: 'MP3', other: 'FILE' }[assetType] || 'FILE';
    var name = (item && item.name) || '未命名素材';
    var dateStr = formatWorkDate((item && item.createdAt) || null);
    var thumbUrl = (item && item.thumbnailUrl) || (item && item.url) || '';
    var sizeStr = formatAssetSize((item && item.size) || 0);
    var escapedName = escapeHtml(name);
    var safeName = escapedName.replace(/'/g, "\\'");
    var itemId = (item && item.id) || '';

    var statusLabel = (item && item.statusLabel) || '原始素材';
    var statusClass = (item && item.status) || 'raw';
    var genCount = (item && item.generationCount) != null ? item.generationCount : 0;

    // Thumbnail HTML
    var thumbHtml = '';
    if (assetType === 'image' && thumbUrl) {
      thumbHtml = '<img src="' + escapeHtml(thumbUrl) + '" alt="' + escapedName + '" loading="lazy" ' +
        'onerror="this.parentElement.innerHTML=\'<i class=\\\'fas fa-image asset-card-icon\\\'></i>\'">';
    } else if (assetType === 'video') {
      var videoThumbHtml = (thumbUrl && thumbUrl !== (item && item.url))
        ? '<img src="' + escapeHtml(thumbUrl) + '" alt="' + escapedName + '" loading="lazy" onerror="this.style.display=\'none\'">'
        : '';
      thumbHtml = '<div class="asset-thumb-video">' +
        videoThumbHtml +
        '<i class="fas fa-play-circle asset-play-icon"></i>' +
        '</div>';
    } else if (assetType === 'audio') {
      thumbHtml = '<div class="asset-thumb-audio"><i class="fas fa-music asset-audio-icon"></i></div>';
    } else {
      thumbHtml = '<i class="fas ' + typeIcon + ' asset-card-icon"></i>';
    }

    // Generation count badge
    var genCountHtml = '';
    if (genCount > 0) {
      genCountHtml = '<div class="asset-gen-count">已生成 <strong>' + genCount + '</strong> 个作品</div>';
    }

    // Thumb click behavior
    var thumbClickAction = '';
    if (assetType === 'image') {
      thumbClickAction = ' onclick="event.stopPropagation();openImagePreview(\'' + itemId + '\')" style="cursor:pointer"';
    } else if (assetType === 'video') {
      thumbClickAction = ' onclick="event.stopPropagation();playAssetVideo(\'' + itemId + '\')" style="cursor:pointer"';
    } else {
      thumbClickAction = ' onclick="event.stopPropagation();previewAsset(\'' + itemId + '\')" style="cursor:pointer"';
    }

    return '<div class="asset-card" data-asset-id="' + itemId + '">' +
      '<div class="asset-card-thumb"' + thumbClickAction + '>' + thumbHtml +
      '<span class="asset-type-badge">' + typeBadge + '</span>' +
      '</div>' +
      '<div class="asset-hover-overlay">' +
      '<button class="asset-hover-btn" onclick="event.stopPropagation();previewAsset(\'' + itemId + '\')"><i class="fas fa-eye"></i> 预览</button>' +
      '<button class="asset-hover-btn" style="background:rgba(168,85,247,0.25);border-color:rgba(168,85,247,0.4)" onclick="event.stopPropagation();openGenPanel(\'' + itemId + '\')"><i class="fas fa-wand-magic-sparkles"></i> AI创作</button>' +
      '<button class="asset-hover-btn asset-hover-delete" onclick="event.stopPropagation();confirmDeleteAsset(\'' + itemId + '\',\'' + safeName + '\')"><i class="fas fa-trash-alt"></i> 删除</button>' +
      '</div>' +
      '<button class="asset-more-btn" onclick="event.stopPropagation();toggleAssetMenu(event,\'' + itemId + '\')" title="更多操作"><i class="fas fa-ellipsis-v"></i></button>' +
      '<div class="asset-more-menu" id="assetMenu_' + itemId + '">' +
      '<div class="asset-menu-item" onclick="event.stopPropagation();closeAssetMenu(\'' + itemId + '\');previewAsset(\'' + itemId + '\')"><i class="fas fa-eye"></i> 预览</div>' +
      '<div class="asset-menu-item" onclick="event.stopPropagation();closeAssetMenu(\'' + itemId + '\');openGenPanel(\'' + itemId + '\')"><i class="fas fa-wand-magic-sparkles"></i> AI创作</div>' +
      '<div class="asset-menu-item asset-menu-delete" onclick="event.stopPropagation();closeAssetMenu(\'' + itemId + '\');confirmDeleteAsset(\'' + itemId + '\',\'' + safeName + '\')"><i class="fas fa-trash-alt"></i> 删除</div>' +
      '</div>' +
      '<div class="asset-card-info" onclick="previewAsset(\'' + itemId + '\')">' +
      '<div class="asset-card-name" title="' + escapedName + '">' + escapedName + '</div>' +
      '<div class="asset-card-meta">' +
      '<span class="asset-card-type"><i class="fas ' + typeIcon + '"></i> ' + typeLabel + '</span>' +
      '<span class="asset-card-size">' + (sizeStr || '--') + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between">' +
      '<span class="asset-status-tag ' + statusClass + '">' + escapeHtml(statusLabel) + '</span>' +
      '<div class="asset-card-date"><i class="far fa-clock"></i> ' + dateStr + '</div>' +
      '</div>' +
      genCountHtml +
      '</div>' +
      '</div>';
  }

  // ─── Render Pagination ────────────────────────────────────
  function renderAssetPagination(container) {
    if (!container) return;
    var total = state.total;
    var page = state.currentPage;
    var pageSize = state.pageSize;
    var totalPages = Math.ceil(total / pageSize);

    if (total <= pageSize) {
      container.innerHTML = total > 0
        ? '<div class="pagination-bar"><span class="page-info">共 ' + total + ' 个素材</span></div>'
        : '';
      return;
    }

    var prevBtn = page > 1
      ? '<button class="btn btn-outline btn-sm" onclick="loadAssets(' + (page - 1) + ');window.scrollTo({top:0,behavior:\'smooth\'})"><i class="fas fa-chevron-left"></i> 上一页</button>'
      : '<button class="btn btn-outline btn-sm" disabled><i class="fas fa-chevron-left"></i> 上一页</button>';

    var nextBtn = page < totalPages
      ? '<button class="btn btn-outline btn-sm" onclick="loadAssets(' + (page + 1) + ');window.scrollTo({top:0,behavior:\'smooth\'})">下一页 <i class="fas fa-chevron-right"></i></button>'
      : '<button class="btn btn-outline btn-sm" disabled>下一页 <i class="fas fa-chevron-right"></i></button>';

    container.innerHTML = '<div class="pagination-bar">' +
      prevBtn +
      '<span class="page-info">第 ' + page + ' / ' + totalPages + ' 页，共 ' + total + ' 个素材</span>' +
      nextBtn +
      '</div>';
  }

  // ─── Load Assets ──────────────────────────────────────────
  async function loadAssets(page) {
    if (state.isLoading) return;
    state.isLoading = true;
    state.currentPage = page || 1;
    state.errorMessage = '';

    var contentEl = document.getElementById('assetContent');
    var paginationEl = document.getElementById('assetPagination');
    if (!contentEl) { state.isLoading = false; return; }

    state.pageState = PAGE_STATE.LOADING;
    renderAssetPageState(PAGE_STATE.LOADING, contentEl, paginationEl);

    try {
      var data;
      if (api.Asset && api.Asset.getAssets) {
        data = await api.Asset.getAssets({
          page: state.currentPage,
          pageSize: state.pageSize,
          type: state.currentType,
          keyword: state.currentKeyword,
          sort: state.currentSort,
          status: state.currentStatus
        });
      } else {
        // Fallback: direct API call
        var params = '?page=' + state.currentPage + '&pageSize=' + state.pageSize;
        if (state.currentType) params += '&type=' + state.currentType;
        if (state.currentKeyword) params += '&keyword=' + encodeURIComponent(state.currentKeyword);
        if (state.currentSort) params += '&sort=' + state.currentSort;
        if (state.currentStatus) params += '&status=' + state.currentStatus;
        data = await safeFetch('/enterprise/assets' + params);
      }

      if (!data) {
        throw { code: 'EMPTY_RESPONSE', message: '服务器返回空数据', status: 0, retryable: true };
      }

      state.total = data.total || 0;
      state.items = data.items || [];
      state.pageSize = data.pageSize || 20;

      // Populate asset cache
      (state.items || []).forEach(function (a) {
        if (a && a.id) {
          if (state.cache) state.cache[a.id] = a;
          if (window.ASSET_CACHE) window.ASSET_CACHE[a.id] = a;
        }
      });

      if (!state.items.length) {
        state.pageState = PAGE_STATE.EMPTY;
        renderAssetPageState(PAGE_STATE.EMPTY, contentEl, paginationEl);
      } else {
        state.pageState = PAGE_STATE.SUCCESS;
        renderAssetPageState(PAGE_STATE.SUCCESS, contentEl, paginationEl);
      }

      // Trigger workspace stats async load
      if (typeof loadWorkspaceStatsAsync === 'function') {
        loadWorkspaceStatsAsync();
      }

    } catch (err) {
      console.error('[Assets] 加载失败:', err);
      state.pageState = PAGE_STATE.ERROR;

      if (err.status === 401) {
        state.errorMessage = '登录已过期，请刷新页面重新登录';
        contentEl.innerHTML = '<div class="empty-works">' +
          '<i class="fas fa-lock"></i>' +
          '<p>登录已过期</p>' +
          '<p class="sub-text">请刷新页面重新登录</p>' +
          '</div>';
      } else {
        state.errorMessage = err.message || '加载失败，请稍后重试';
        renderAssetPageState(PAGE_STATE.ERROR, contentEl, paginationEl);
      }
    } finally {
      state.isLoading = false;
    }
  }

  // ─── Search (300ms debounce) ──────────────────────────────
  function assetSearch() {
    var input = document.getElementById('assetSearchInput');
    state.currentKeyword = input ? (input.value || '').trim() : '';
    state.currentPage = 1;
    if (state.searchTimer) clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(function () {
      loadAssets(1);
    }, 300);
  }

  // ─── Type Filter ──────────────────────────────────────────
  function assetFilterChange() {
    var select = document.getElementById('assetTypeFilter');
    state.currentType = select ? select.value : '';
    state.currentPage = 1;
    loadAssets(1);
  }

  // ─── Sort Change ──────────────────────────────────────────
  function assetSortChange() {
    var select = document.getElementById('assetSortFilter');
    state.currentSort = select ? select.value : 'newest';
    state.currentPage = 1;
    loadAssets(1);
  }

  // ─── Clear Filters ────────────────────────────────────────
  function clearAssetFilters() {
    state.currentKeyword = '';
    state.currentType = '';
    state.currentPage = 1;
    var searchInput = document.getElementById('assetSearchInput');
    var typeFilter = document.getElementById('assetTypeFilter');
    if (searchInput) searchInput.value = '';
    if (typeFilter) typeFilter.value = '';
    loadAssets(1);
  }

  // ─── More Menu Toggle ─────────────────────────────────────
  function toggleAssetMenu(event, assetId) {
    var menu = document.getElementById('assetMenu_' + assetId);
    if (!menu) return;
    var allMenus = document.querySelectorAll('.asset-more-menu.show');
    allMenus.forEach(function (m) {
      if (m !== menu) m.classList.remove('show');
    });
    menu.classList.toggle('show');
  }

  function closeAssetMenu(assetId) {
    var menu = document.getElementById('assetMenu_' + assetId);
    if (menu) menu.classList.remove('show');
  }

  // ─── Play Asset Video (Sprint 5.8) ─────────────────────────
  /**
   * 直接播放素材库视频
   * 流程：assetId → 缓存查找 → resolveAssetPlayableUrl → playVideo
   */
  async function playAssetVideo(assetId) {
    if (!assetId) return;

    // 1. 从缓存获取 asset
    var asset = (state.cache && state.cache[assetId]) ||
                (window.ASSET_CACHE && window.ASSET_CACHE[assetId]);

    if (!asset) {
      // 缓存未命中，从 API 获取
      try {
        var data;
        if (api.Asset && api.Asset.getAssetDetail) {
          data = await api.Asset.getAssetDetail(assetId);
        } else {
          data = await safeFetch('/enterprise/assets/' + assetId);
        }
        var normalizeAssetResponse = utils.normalizeAssetResponse || window.normalizeAssetResponse;
        asset = normalizeAssetResponse ? normalizeAssetResponse(data) : data;
      } catch (err) {
        console.error('[playAssetVideo] 获取素材失败:', err);
        if (typeof showToast === 'function') showToast('无法获取视频信息', 'error');
        return;
      }
    }

    if (!asset || asset.type !== 'video') {
      if (typeof showToast === 'function') showToast('不是有效的视频素材', 'warning');
      return;
    }

    // 2. 获取签名播放 URL
    var resolveAssetPlayableUrl = utils.resolveAssetPlayableUrl || window.resolveAssetPlayableUrl;
    var playUrl = '';

    if (typeof resolveAssetPlayableUrl === 'function') {
      try {
        playUrl = await resolveAssetPlayableUrl(asset);
      } catch (e) {
        console.warn('[playAssetVideo] 签名URL解析失败:', e.message);
      }
    }

    // 降级
    if (!playUrl) {
      playUrl = asset.url || asset.fileUrl || '';
    }

    if (!playUrl) {
      if (typeof showToast === 'function') showToast('视频资源不可用', 'error');
      return;
    }

    // 3. 调用已有的全屏播放器
    var title = encodeURIComponent(asset.name || '视频播放');
    if (typeof window.playVideo === 'function') {
      window.playVideo(playUrl, title);
    } else {
      // 降级：直接打开链接
      window.open(playUrl, '_blank');
    }
  }

  // ─── Global click to close menus ──────────────────────────
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.asset-more-btn') && !e.target.closest('.asset-more-menu')) {
      var menus = document.querySelectorAll('.asset-more-menu.show');
      menus.forEach(function (m) { m.classList.remove('show'); });
    }
  });

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  if (!YJ.modules) YJ.modules = {};
  YJ.modules.assetList = {
    loadAssets: loadAssets,
    renderAssetCard: renderAssetCard,
    renderAssetPageState: renderAssetPageState,
    renderAssetPagination: renderAssetPagination,
    assetSearch: assetSearch,
    assetFilterChange: assetFilterChange,
    assetSortChange: assetSortChange,
    clearAssetFilters: clearAssetFilters,
    toggleAssetMenu: toggleAssetMenu,
    closeAssetMenu: closeAssetMenu,
    playAssetVideo: playAssetVideo
  };
  window.YJ = YJ;

  // Global function aliases (required for onclick handlers in HTML)
  window.loadAssets = loadAssets;
  window.renderAssetCard = renderAssetCard;
  window.assetSearch = assetSearch;
  window.assetFilterChange = assetFilterChange;
  window.assetSortChange = assetSortChange;
  window.clearAssetFilters = clearAssetFilters;
  window.toggleAssetMenu = toggleAssetMenu;
  window.closeAssetMenu = closeAssetMenu;
  window.playAssetVideo = playAssetVideo;

  console.log('[Enterprise/AssetList] Module initialized');
})();
