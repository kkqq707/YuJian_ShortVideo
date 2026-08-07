(function () {

  'use strict';

  function renderStoryboardPage() {
    var APP = window.APP;
    var s = APP.storyboard;
    var totalDuration = s.shots.reduce(function (a, b) { return a + b.duration; }, 0);
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">'
      + '<div><h2 style="font-size:20px;margin-bottom:4px">' + s.title + '</h2>'
      + '<div style="font-size:13px;color:var(--text-sub)">共 ' + s.shots.length + ' 个分镜 · 总时长 ' + totalDuration + ' 秒</div></div>'
      + '<div style="display:flex;gap:10px">'
      + '<button class="btn btn-outline"><i class="fas fa-file-import"></i> 导入剧本</button>'
      + '<button class="btn btn-outline"><i class="fas fa-plus"></i> 新增分镜</button>'
      + '<button class="btn btn-primary btn-lg" onclick="alert(\'开始批量生成视频，预计消耗150积分\')"><i class="fas fa-magic"></i> 一键生成全部</button>'
      + '</div></div>'
      + '<div class="storyboard-editor">'
      + '<div class="storyboard-header"><div class="storyboard-title">分镜列表</div>'
      + '<div class="storyboard-actions">'
      + '<button class="btn btn-sm btn-outline" style="background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2);color:#fff"><i class="fas fa-sort"></i> 排序</button>'
      + '<button class="btn btn-sm btn-outline" style="background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2);color:#fff"><i class="fas fa-cog"></i> 全局设置</button>'
      + '</div></div>'
      + '<div class="shot-list">'
      + s.shots.map(function (shot, idx) {
          return '<div class="shot-item">'
            + '<div class="shot-num">' + (idx + 1) + '</div>'
            + '<div class="shot-desc">' + shot.desc
            + '<div class="shot-line">💬 ' + shot.line + '</div></div>'
            + '<div class="shot-style">风格：' + shot.style + '</div>'
            + '<div class="shot-duration">' + shot.duration + 's</div>'
            + '<div class="shot-actions">'
            + '<button title="编辑" onclick="openStoryboard(' + shot.id + ')"><i class="fas fa-edit"></i></button>'
            + '<button title="生成"><i class="fas fa-play"></i></button>'
            + '<button title="删除"><i class="fas fa-trash"></i></button>'
            + '</div></div>';
        }).join('')
      + '</div></div>'
      // 时间轴预览
      + '<div style="margin-top:20px" class="card">'
      + '<div class="card-header"><h3>⏱️ 时间轴预览</h3></div>'
      + '<div class="card-body">'
      + '<div style="background:#1a1a2e;border-radius:10px;padding:20px;display:flex;gap:4px;align-items:flex-end;height:120px">'
      + s.shots.map(function (shot, idx) {
          return '<div style="flex:' + shot.duration + ';background:linear-gradient(180deg, #3b7fe0, #0a58ca);border-radius:6px 6px 0 0;height:' + (60 + idx * 8) + 'px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px">'
            + shot.duration + 's</div>';
        }).join('')
      + '</div></div></div>';
  }

  window.YJ = window.YJ || {};
  window.YJ.pages = window.YJ.pages || {};

  window.YJ.pages.storyboard = {
    render: renderStoryboardPage
  };

  window.renderStoryboardPage = renderStoryboardPage;

})();
