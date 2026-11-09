const api = require("../../utils/api");

Page({
  data: {
    baseUrl: "",
    token: "",
    testing: false,
    result: ""
  },

  onLoad() {
    this.setData({
      baseUrl: getApp().globalData.baseUrl || "",
      token: getApp().globalData.token || ""
    });
  },

  onBase(e) { this.setData({ baseUrl: e.detail.value }); },
  onToken(e) { this.setData({ token: e.detail.value }); },

  save() {
    let u = (this.data.baseUrl || "").trim();
    if (u && !/^https?:\/\//.test(u)) {
      return api.toast("地址要以 http:// 或 https:// 开头");
    }
    getApp().setServer(u, this.data.token);
    api.toast("已保存", "success");
  },

  test() {
    const self = this;
    const u = (this.data.baseUrl || "").trim().replace(/\/+$/, "");
    if (!u) return api.toast("先填服务器地址");
    this.setData({ testing: true, result: "" });
    getApp().setServer(u, this.data.token);
    wx.request({
      url: u + "/api/health",
      method: "GET",
      timeout: 15000,
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.ok) {
          self.setData({ testing: false, result: "连接成功：服务器上有 " + (res.data.shops || 0) + " 家餐馆。" });
        } else {
          self.setData({ testing: false, result: "服务器返回异常 HTTP " + res.statusCode });
        }
      },
      fail(e) {
        self.setData({
          testing: false,
          result: "连不上：" + (e.errMsg || "") + "\n常见原因：地址写错、服务器没启动、没在小程序后台把域名加入白名单（开发时可在开发者工具勾选「不校验合法域名」）。"
        });
      }
    });
  }
});
