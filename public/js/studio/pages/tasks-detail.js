/**
 * YuJian Studio — Tasks Detail Page
 *
 * Phase DigitalHuman-Rebuild-004 Step5-D4
 *
 * 职责：生成任务详情页面（薄壳桥接层）—— 复用企业端流水线详情整页能力，
 *   把 YJ.pages.pipeline（渲染 + 轮询 + 四组件）桥接进 Studio 壳。
 *   - render()：产出外层容器（仅一个内容锚点，无业务骨架）
 *   - init(params)：先插入 YJ.pages.pipeline.render() 产物，再调 YJ.pages.pipeline.init(params.id)
 *   - destroy()：委托 YJ.pages.pipeline.destroy()（停轮询 + 停视图同步 + 解绑事件 + 清引用）
 *
 * 数据边界（严格遵守，违规即返工）：
 *   ❌ 不直接 fetch / 不拼 URL / 不解析错误文案（一切经 YJ.state.pipeline + YJ.pipelineAdapter）
 *   ❌ 不新增 state / API / 组件 / 轮询机制（复用 YJ.state.pipeline 全量管理）
 *   ❌ 不复制 pipeline 页面逻辑（整页复用 YJ.pages.pipeline，不局部重写）
 *   ❌ 不调用 YJ.studio.state/api/components（详情不经过 studio 的 cache/selection）
 *   ✅ vanilla JS + IIFE + window.YJ，暴露 render(params)/init(params)/destroy()
 */
(function () {
  'use strict';

  var YJ = window.YJ || {};
  if (!YJ.studio) YJ.studio = {};
  if (!YJ.studio.pages) YJ.studio.pages = {};

  // 复用的企业端流水线详情页（脚本加载序保证已就绪；防御性判空避免误配序时硬崩）
  var pipelinePage = (YJ.pages && YJ.pages.pipeline) || {};

  // ── 页面闭包瞬时状态（destroy 释放，不写 state）──
  var els = {};

  // ═══════════════════════════════════════════════════════════════════
  //  生命周期（render 纯字符串 / init 桥接 / destroy 委托销毁）
  // ═══════════════════════════════════════════════════════════════════

  function render(params) {
    return '' +
      '<div class="studio-page studio-tasks-detail">' +
        '<div class="studio-tasks-detail__content"></div>' +
      '</div>';
  }

  function init(params) {
    cacheEls();

    // 桥接（契约顺序）：先插入整页壳（YJ.pages.pipeline.init 依赖 #yjp-pipeline-page 已存在），
    // 再 init —— 由其内部驱动 load + startPoll + 视图同步。
    if (els.content && typeof pipelinePage.render === 'function') {
      els.content.innerHTML = pipelinePage.render();
    }
    if (typeof pipelinePage.init === 'function') {
      pipelinePage.init(params && params.id);
    }
  }

  function destroy() {
    // 委托销毁：停轮询 + 停视图同步 + 解绑事件 + 清引用，避免切页后残留轮询/定时器
    if (typeof pipelinePage.destroy === 'function') {
      pipelinePage.destroy();
    }
    els = {};
  }

  function cacheEls() {
    els.content = document.querySelector('#studio-main .studio-tasks-detail__content');
  }

  YJ.studio.pages['tasks-detail'] = {
    render: render,
    init: init,
    destroy: destroy
  };

  window.YJ = YJ;
})();
