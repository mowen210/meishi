const api = require("../../utils/api");

Page({
  data: {
    shops: [],
    categories: ["全部"],
    cat: "全部",
    q: "",
    loading: true,
    showEmpty: false,
    err: ""
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    const p = this.load();
    Promise.resolve(p).then(function () { wx.stopPullDownRefresh(); });
  },

  load() {
    const self = this;
    this.setData({ loading: true, showEmpty: false, err: "" });
    const q = encodeURIComponent((this.data.q || "").trim());
    const cat = encodeURIComponent(this.data.cat === "全部" ? "" : this.data.cat);
    return api.request("GET", "/api/shops?q=" + q + "&category=" + cat)
      .then(function (d) {
        const shops = (d.shops || []).map(function (s) {
          return Object.assign({}, s, {
            coverUrl: api.fileUrl(s.cover),
            starText: api.starText(s.recommend),
            dishText: (s.dishes || []).map(function (x) {
              return x.name + (x.price ? " ¥" + x.price : "");
            }).join("、")
          });
        });
        self.setData({
          shops: shops,
          categories: ["全部"].concat(d.categories || []),
          loading: false,
          showEmpty: shops.length === 0
        });
      })
      .catch(function (e) {
        self.setData({ loading: false, showEmpty: false, err: e.message });
      });
  },

  onInput(e) {
    const self = this;
    this.setData({ q: e.detail.value });
    clearTimeout(this._t);
    this._t = setTimeout(function () { self.load(); }, 350);
  },

  onConfirm() { this.load(); },

  pickCat(e) {
    this.setData({ cat: e.currentTarget.dataset.cat });
    this.load();
  },

  goDetail(e) {
    wx.navigateTo({ url: "/pages/detail/detail?id=" + e.currentTarget.dataset.id });
  },

  goAdd() {
    wx.navigateTo({ url: "/pages/edit/edit" });
  },

  goEdit(e) {
    wx.navigateTo({ url: "/pages/edit/edit?id=" + e.currentTarget.dataset.id });
  },

  goSettings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  },

  callPhone(e) {
    const phone = e.currentTarget.dataset.phone;
    if (!phone) return api.toast("这家店没有登记电话");
    wx.makePhoneCall({ phoneNumber: String(phone) });
  },

  nav(e) {
    const s = this.data.shops[e.currentTarget.dataset.index];
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
        success: function () { api.toast("已复制地址，可粘贴到地图搜索"); }
      });
    } else {
      api.toast("这家店没有登记位置");
    }
  },

  onShareAppMessage() {
    return {
      title: "餐饮图鉴 · 我收藏的好店都在这儿",
      path: "/pages/index/index"
    };
  }
});
