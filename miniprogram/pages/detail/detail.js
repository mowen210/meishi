const api = require("../../utils/api");

Page({
  data: {
    id: "",
    shop: null,
    images: [],
    starText: "",
    loading: true,
    err: ""
  },

  onLoad(query) {
    this.setData({ id: (query && query.id) || "" });
    this.load();
  },

  onShow() {
    // 从编辑页返回时重新拉一次，避免看到旧内容
    if (this._loadedOnce && this.data.id) this.load();
    this._loadedOnce = true;
  },

  onPullDownRefresh() {
    const p = this.load();
    Promise.resolve(p).then(function () { wx.stopPullDownRefresh(); });
  },

  load() {
    const self = this;
    if (!this.data.id) {
      this.setData({ loading: false, err: "缺少商家编号" });
      return Promise.resolve();
    }
    this.setData({ loading: true, err: "" });
    return api.request("GET", "/api/shops/" + this.data.id)
      .then(function (s) {
        const images = (s.images || []).map(function (u) { return api.fileUrl(u); });
        self.setData({
          shop: s,
          images: images,
          starText: api.starText(s.recommend),
          loading: false
        });
        wx.setNavigationBarTitle({ title: s.name || "餐馆详情" });
      })
      .catch(function (e) {
        self.setData({ loading: false, err: e.message });
      });
  },

  preview(e) {
    const cur = e.currentTarget.dataset.src;
    wx.previewImage({
      current: cur,
      urls: this.data.images.length ? this.data.images : [cur]
    });
  },

  callPhone() {
    const s = this.data.shop;
    if (!s || !s.phone) return api.toast("这家店没有登记电话");
    wx.makePhoneCall({ phoneNumber: String(s.phone) });
  },

  nav() {
    const s = this.data.shop;
    if (!s) return;
    if (s.lat && s.lng) {
      wx.openLocation({
        latitude: Number(s.lat),
        longitude: Number(s.lng),
        name: s.name,
        address: s.address || "",
        scale: 18
      });
    } else if (s.address) {
      wx.setClipboardData({
        data: s.address,
        success: function () { api.toast("已复制地址"); }
      });
    } else {
      api.toast("没有登记位置");
    }
  },

  copyAddress() {
    const s = this.data.shop;
    if (!s || !s.address) return;
    wx.setClipboardData({ data: s.address });
  },

  goEdit() {
    wx.navigateTo({ url: "/pages/edit/edit?id=" + this.data.id });
  },

  onShareAppMessage() {
    const s = this.data.shop;
    if (!s) return { title: "餐饮图鉴", path: "/pages/index/index" };
    const dishes = (s.dishes || []).slice(0, 3).map(function (d) { return d.name; }).join("、");
    return {
      title: s.name + (dishes ? "｜招牌：" + dishes : "") + (s.rating ? "（" + s.rating + "分）" : ""),
      path: "/pages/detail/detail?id=" + s.id,
      imageUrl: this.data.images[0] || ""
    };
  },

  onShareTimeline() {
    const s = this.data.shop;
    return {
      title: s ? s.name + "｜我的美食记录" : "餐饮图鉴",
      query: "id=" + (s ? s.id : "")
    };
  }
});
