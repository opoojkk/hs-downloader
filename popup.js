// popup.js

let currentImageUrls = [];

document.addEventListener('DOMContentLoaded', () => {
    const statusDiv = document.getElementById('status');
    const container = document.getElementById('imageContainer');
    const bulkActions = document.getElementById('bulkActions');
    const btnAllWebp = document.getElementById('btnDownloadAllWebp');
    const btnAllPng = document.getElementById('btnDownloadAllPng');

    // 1. 向 active tab 发送请求获取数据
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0 || !tabs[0].id) {
            statusDiv.textContent = "无法连接到页面。";
            return;
        }

        // 检查 URL 是否匹配
        if (!tabs[0].url.includes('xiaohongshu.com/explore') && !tabs[0].url.includes('xiaohongshu.com/discovery')) {
             statusDiv.innerHTML = '<span class="error">请在小红书笔记详情页使用此插件。</span>';
             return;
        }

        chrome.tabs.sendMessage(tabs[0].id, { action: "extractImages" }, (response) => {
            if (chrome.runtime.lastError) {
                 // 通常是因为页面还没加载完 content script
                 statusDiv.innerHTML = '<span class="error">连接失败，请刷新页面后再试。</span>';
                 return;
            }

            if (response && response.success) {
                currentImageUrls = response.data;
                if (currentImageUrls.length > 0) {
                    statusDiv.textContent = `成功找到 ${currentImageUrls.length} 张高清图`;
                    bulkActions.style.display = 'flex';
                    renderImages(currentImageUrls, container);
                } else {
                    statusDiv.textContent = "未找到图片（可能是视频笔记）。";
                }
            } else {
                statusDiv.innerHTML = `<span class="error">抓取失败: ${response?.error || '未知错误'}</span>`;
            }
        });
    });

    // 2. 绑定全部下载按钮事件
    btnAllWebp.addEventListener('click', () => downloadAll('webp'));
    btnAllPng.addEventListener('click', () => downloadAll('png'));
});

// 渲染图片列表界面
function renderImages(urls, container) {
    container.innerHTML = '';
    urls.forEach((url, index) => {
        const card = document.createElement('div');
        card.className = 'image-card';

        // 文件名基准
        const filenameBase = `xhs_image_${index + 1}_${new Date().getTime().toString().slice(-6)}`;

        card.innerHTML = `
            <div class="thumb-box">
                <img src="${url}" alt="image ${index}">
            </div>
            <div class="actions">
                <button class="btn primary btn-dl-webp">存 WebP</button>
                <button class="btn secondary btn-dl-png">存 PNG</button>
            </div>
        `;

        // 绑定单个下载事件
        card.querySelector('.btn-dl-webp').addEventListener('click', function() {
            downloadSingleImage(url, `${filenameBase}.webp`, 'webp', this);
        });
        card.querySelector('.btn-dl-png').addEventListener('click', function() {
            downloadSingleImage(url, `${filenameBase}.png`, 'png', this);
        });

        container.appendChild(card);
    });
}

// 下载单个图片核心逻辑
async function downloadSingleImage(url, filename, format, btnElement) {
    const originalText = btnElement.textContent;
    btnElement.textContent = '处理中...';
    btnElement.disabled = true;

    try {
        if (format === 'webp') {
            // WebP 直接利用 Chrome 下载 API
            await chrome.downloads.download({ url: url, filename: filename });
        } else if (format === 'png') {
            // PNG 需要 Canvas 转换
            const pngDataUrl = await convertImageToPngDataUrl(url);
            await chrome.downloads.download({ url: pngDataUrl, filename: filename });
        }
    } catch (error) {
        console.error("Download failed:", error);
        btnElement.textContent = '失败';
        setTimeout(() => {
            btnElement.textContent = originalText;
            btnElement.disabled = false;
        }, 2000);
        return;
    }
    
    btnElement.textContent = '已完成';
    setTimeout(() => {
        btnElement.textContent = originalText;
        btnElement.disabled = false;
    }, 2000);
}


// 核心工具：将网络图片转换为 PNG DataURL
function convertImageToPngDataUrl(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // 关键：设置跨域属性，否则 canvas 无法导出数据
        img.crossOrigin = "anonymous"; 
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            // 将图片绘制到 canvas
            ctx.drawImage(img, 0, 0);
            try {
                // 导出为 PNG data URI
                const dataUrl = canvas.toDataURL('image/png');
                resolve(dataUrl);
            } catch (e) {
                // 通常是因为图片服务器不支持 CORS
                reject(new Error("Canvas导出失败，可能是跨域问题。"));
            }
        };
        
        img.onerror = () => reject(new Error("图片加载失败，无法转换。"));
        // 加上时间戳防止缓存影响 CORS
        img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + new Date().getTime(); 
    });
}

// 批量下载逻辑
async function downloadAll(format) {
    const btn = format === 'webp' ? document.getElementById('btnDownloadAllWebp') : document.getElementById('btnDownloadAllPng');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '正在批量下载...';

    const timestamp = new Date().getTime().toString().slice(-6);

    // 串行下载，避免瞬间发起太多请求导致卡死或被浏览器拦截
    for (let i = 0; i < currentImageUrls.length; i++) {
        const url = currentImageUrls[i];
        const filename = `xhs_batch_${timestamp}_${i + 1}.${format}`;
        try {
             btn.textContent = `正在处理 (${i+1}/${currentImageUrls.length})...`;
            if (format === 'webp') {
                chrome.downloads.download({ url: url, filename: filename });
                // WebP 下载很快，稍微加点延时给浏览器喘息
                await new Promise(r => setTimeout(r, 300)); 
            } else {
                // PNG 转换比较耗时，需要等待
                const pngDataUrl = await convertImageToPngDataUrl(url);
                chrome.downloads.download({ url: pngDataUrl, filename: filename });
                // PNG 转换较慢，给予更多缓冲时间
                await new Promise(r => setTimeout(r, 800));
            }
        } catch (e) {
            console.error(`第 ${i+1} 张下载失败:`, e);
        }
    }

    btn.textContent = '全部完成!';
    setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
    }, 3000);
}
