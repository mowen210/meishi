App({
  globalData: {
    baseUrl: "",
    token: ""
  },
  onLaunch() {
    this.globalData.baseUrl = wx.getStorageSync("baseUrl") || "";
    this.globalData.token = wx.getStorageSync("token") || "";
  },
  setServer(baseUrl, token) {
    this.globalData.baseUrl = (baseUrl || "").trim().replace(/\/+$/, "");
    this.globalData.token = (token || "").trim();
    wx.setStorageSync("baseUrl", this.globalData.baseUrl);
    wx.setStorageSync("token", this.globalData.token);
  }
});
