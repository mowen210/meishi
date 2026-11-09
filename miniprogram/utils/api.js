/* 与后端通信：地址和口令存在本地，首次使用去【设置】页填写 */
function app() {
  return getApp();
}
function base() {
  return (app().globalData.baseUrl || "").replace(/\/+$/, "");
}
function token() {
  return app().globalData.token || "";
}
function fileUrl(u) {
  if (!u) return "";
  if (/^https?:\/\//.test(u)) return u;
  return base() + u;
}

function request(method, path, data) {
  const b = base();
  if (!b) return Promise.reject(new Error("请先在【设置】里填写服务器地址"));
  return new Promise(function (resolve, reject) {
    wx.request({
      url: b + path,
      method: method,
      data: data,
      timeout: 20000,
      header: {
        "content-type": "application/json",
        "x-admin-token": token()
      },
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error((res.data && res.data.error) || ("请求失败 HTTP " + res.statusCode)));
        }
      },
      fail: function (e) {
        reject(new Error(e.errMsg || "网络请求失败"));
      }
    });
  });
}

/* 上传原图：不压缩、不缩放，微信把 tempFilePath 指向的原文件原样上传 */
function upload(filePath) {
  const b = base();
  if (!b) return Promise.reject(new Error("请先在【设置】里填写服务器地址"));
  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url: b + "/api/upload",
      filePath: filePath,
      name: "file",
      timeout: 120000,
      header: { "x-admin-token": token() },
      success: function (res) {
        let d = {};
        try { d = JSON.parse(res.data); } catch (e) {}
        if (res.statusCode >= 200 && res.statusCode < 300 && d.url) {
          resolve(d);
        } else {
          reject(new Error(d.error || ("上传失败 HTTP " + res.statusCode)));
        }
      },
      fail: function (e) {
        reject(new Error(e.errMsg || "上传失败"));
      }
    });
  });
}

function starText(n) {
  n = Math.round(Number(n) || 0);
  if (n < 0) n = 0;
  if (n > 5) n = 5;
  let s = "";
  for (let i = 0; i < 5; i++) s += i < n ? "★" : "☆";
  return s;
}

function toast(title, icon) {
  wx.showToast({ title: title, icon: icon || "none", duration: 2000 });
}

module.exports = {
  request: request,
  upload: upload,
  fileUrl: fileUrl,
  starText: starText,
  toast: toast,
  base: base,
  token: token
};
