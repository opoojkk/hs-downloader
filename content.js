// content.js

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractImages") {
        injectAndGetData().then(data => {
            sendResponse({ success: true, data: data });
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true; // 保持异步通道开启
    }
});

function injectAndGetData() {
    return new Promise((resolve, reject) => {
        // 1. 创建 script 标签
        const script = document.createElement('script');

        // [关键修改] 使用 src 引入，而不是 textContent
        // chrome.runtime.getURL 会把插件内的相对路径转换为绝对路径： chrome-extension://.../injected.js
        script.src = chrome.runtime.getURL('injected.js');

        script.onload = function () {
            // 脚本执行完后移除标签，保持页面整洁
            this.remove();
        };

        // 2. 准备接收数据的监听器
        const dataHandler = (e) => {
            cleanup();
            resolve(e.detail);
        };

        const errorHandler = (e) => {
            cleanup();
            reject(new Error(e.detail));
        };

        function cleanup() {
            window.removeEventListener("XHS_DATA_READY", dataHandler);
            window.removeEventListener("XHS_DATA_ERROR", errorHandler);
        }

        // 先绑定监听，再注入脚本，防止时序问题
        window.addEventListener("XHS_DATA_READY", dataHandler);
        window.addEventListener("XHS_DATA_ERROR", errorHandler);

        // 3. 注入到页面 (Head 或 HTML 根节点)
        (document.head || document.documentElement).appendChild(script);
    });
}