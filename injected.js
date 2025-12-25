// injected.js
(function () {
    console.log("🚀 小红书注入脚本开始执行...");
    try {
        const state = window.__INITIAL_STATE__;
        if (!state || !state.note || !state.note.noteDetailMap) {
            throw new Error("页面数据尚未加载或结构已变");
        }

        const urls = Object.values(state.note.noteDetailMap)
            .flatMap(item => item.note.imageList || [])
            .map(img => img.infoList?.[0]?.url || img.urlDefault || img.url)
            .map(url => url.startsWith('//') ? 'https:' + url : url)
            .filter(url => !!url); // 过滤空值

        console.log("✅ 数据提取成功，准备发送...", urls);

        // 发送自定义事件，携带数据给 content.js
        window.dispatchEvent(new CustomEvent("XHS_DATA_READY", { detail: urls }));
    } catch (e) {
        console.error("❌ 数据提取失败:", e);
        window.dispatchEvent(new CustomEvent("XHS_DATA_ERROR", { detail: e.message }));
    }
})();