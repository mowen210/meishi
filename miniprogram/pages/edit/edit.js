const api = require("../../utils/api");

const RATING_RANGE = ["未评分", "1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0"];
const CATS = ["粉面", "火锅", "烧烤", "家常菜", "小吃", "饮品", "其他"];

Page({
  data: {
    id: "",
    isNew: true,
    loading: false,
    saving: false,
    ratingRange: RATING_RANGE,
    ratingIndex: 0,
    cats: CATS,
    stars: [1, 2, 3, 4, 5],
    form: {
      name: "", category: "", address: "", phone: "", hours: "", note: "",
      rating: 0, recommend: 0, lat: "", lng: ""
    },
    dishes: [],
    images: [],
    locName: ""
  },

  onLoad(query) {
    const id = (query && query.id) || "";
    if (id) {
      this.setData({ id: id, isNew: false });
      wx.setNavigationBarTitle({ title: "编辑餐馆" });
      this.loadShop(id);
    } else {
      wx.setNavigationBarTitle({ title: "添加餐馆" });
      this.setData({ dishes: [{ k: this.k(), name: "", price: "" }] });
    }
  },

  k() {
    this._seq = (this._seq || 0) + 1;
    return "k" + this._seq;
  },

  loadShop(id) {
    const self = this;
    this.setData({ loading: true });
    api.request("GET", "/api/shops/" + id).then(function (s) {
      const r = Number(s.rating) || 0;
      let range = RATING_RANGE.slice();
      let idx = 0;
      if (r > 0) {
        const label = r.toFixed(1);
        idx = range.indexOf(label);
        if (idx < 0) {                       // 后端可能是 4.6 这种，动态补进选项
          range = range.concat([label]).sort(function (a, b) {
            if (a === "未评分") return -1;
            if (b === "未评分") return 1;
            return Number(a) - Number(b);
          });
          idx = range.indexOf(label);
        }
      }
      self.setData({
        loading: false,
        ratingRange: range,
        ratingIndex: idx < 0 ? 0 : idx,
        locName: s.address || "",
        form: {
          name: s.name || "", category: s.category || "", address: s.address || "",
          phone: s.phone || "", hours: s.hours || "", note: s.note || "",
          rating: s.rating || 0, recommend: s.recommend || 0,
          lat: s.lat || "", lng: s.lng || ""
        },
        dishes: (s.dishes && s.dishes.length ? s.dishes : [{ name: "", price: "" }]).map(function (d) {
          return { k: self.k(), name: d.name || "", price: d.price || "" };
        }),
        images: (s.images || []).map(function (u) {
          return { k: self.k(), local: "", url: u, status: "ok", previewUrl: api.fileUrl(u) };
        })
      });
    }).catch(function (e) {
      self.setData({ loading: false });
      api.toast(e.message);
    });
  },

  /* ---------- 基本字段 ---------- */
  onField(e) {
    const f = e.currentTarget.dataset.field;
    const v = e.detail.value;
    const obj = {};
    obj["form." + f] = v;
    this.setData(obj);
  },

  pickCat(e) {
    this.setData({ "form.category": e.currentTarget.dataset.cat });
  },

  onRating(e) {
    const i = Number(e.detail.value);
    this.setData({ ratingIndex: i, "form.rating": i === 0 ? 0 : Number(RATING_RANGE[i]) });
  },

  setRecommend(e) {
    const n = Number(e.currentTarget.dataset.n);
    this.setData({ "form.recommend": this.data.form.recommend === n ? 0 : n });
  },

  /* ---------- 位置 ---------- */
  pickLocation() {
    const self = this;
    wx.chooseLocation({
      success(res) {
        self.setData({
          "form.lat": res.latitude,
          "form.lng": res.longitude,
          locName: (res.name || "") + (res.address ? "（" + res.address + "）" : "")
        });
        if (!self.data.form.address) {
          self.setData({ "form.address": res.address || res.name || "" });
        }
      },
      fail(err) {
        if (err && /auth|deny/i.test(err.errMsg || "")) {
          wx.showModal({
            title: "需要位置权限",
            content: "要记录商家位置，请在右上角「···」→「设置」里允许位置信息，或在微信里开启定位权限。",
            showCancel: false
          });
        }
      }
    });
  },

  clearLocation() {
    this.setData({ "form.lat": "", "form.lng": "", locName: "" });
  },

  /* ---------- 招牌菜 ---------- */
  addDish() {
    const list = this.data.dishes.concat([{ k: this.k(), name: "", price: "" }]);
    this.setData({ dishes: list });
  },

  delDish(e) {
    const list = this.data.dishes.slice();
    list.splice(Number(e.currentTarget.dataset.i), 1);
    this.setData({ dishes: list.length ? list : [{ k: this.k(), name: "", price: "" }] });
  },

  onDishName(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ ["dishes[" + i + "].name"]: e.detail.value });
  },

  onDishPrice(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ ["dishes[" + i + "].price"]: e.detail.value });
  },

  /* ---------- 图片：原图、不限张数、逐张上传 ---------- */
  addImages() {
    const self = this;
    wx.chooseMedia({
      count: 9,                       // 单次最多 9 张，可反复添加，总数不设限
      mediaType: ["image"],
      sizeType: ["original"],         // 原图，不压缩
      sourceType: ["album", "camera"],
      success(res) {
        const files = (res.tempFiles || []).map(function (f) {
          return { k: self.k(), local: f.tempFilePath, url: "", status: "wait", previewUrl: "", size: f.size || 0 };
        });
        self.setData({ images: self.data.images.concat(files) });
        self.uploadQueue();
      }
    });
  },

  uploadQueue() {
    if (this._uploading) return;
    const self = this;
    const list = this.data.images.slice();
    const next = list.filter(function (x) { return x.status === "wait"; })[0];
    if (!next) { this._uploading = false; return; }
    this._uploading = true;
    next.status = "uploading";
    this.setData({ images: list });

    api.upload(next.local).then(function (d) {
      const arr = self.data.images.slice();
      const i = arr.findIndex(function (x) { return x.k === next.k; });
      if (i >= 0) {
        arr[i].url = d.url;
        arr[i].status = "ok";
        arr[i].previewUrl = api.fileUrl(d.url);
      }
      self.setData({ images: arr });
      self._uploading = false;
      self.uploadQueue();
    }).catch(function (e) {
      const arr = self.data.images.slice();
      const i = arr.findIndex(function (x) { return x.k === next.k; });
      if (i >= 0) arr[i].status = "fail";
      self.setData({ images: arr });
      self._uploading = false;
      api.toast("有图片上传失败：" + e.message);
    });
  },

  retryUpload(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ ["images[" + i + "].status"]: "wait" });
    this.uploadQueue();
  },

  previewImg(e) {
    const urls = this.data.images.filter(function (x) { return x.previewUrl; }).map(function (x) { return x.previewUrl; });
    const cur = e.currentTarget.dataset.src;
    if (!cur) return api.toast("这张图还没上传完");
    wx.previewImage({ current: cur, urls: urls });
  },

  delImage(e) {
    const self = this;
    const i = Number(e.currentTarget.dataset.i);
    const img = this.data.images[i];
    const arr = this.data.images.slice();
    arr.splice(i, 1);
    this.setData({ images: arr });
    if (img && img.url) {
      api.request("DELETE", "/api/upload?url=" + encodeURIComponent(img.url)).catch(function () {});
    }
  },

  /* ---------- 保存 ---------- */
  save() {
    const self = this;
    const form = this.data.form;
    if (!form.name.trim()) return api.toast("请填写餐馆名称");
    if (this.data.images.some(function (x) { return x.status === "uploading" || x.status === "wait"; })) {
      return api.toast("还有图片在上传，请稍等");
    }
    if (this.data.images.some(function (x) { return x.status === "fail"; })) {
      return api.toast("有图片上传失败，请点重试或删除");
    }
    if (this.data.saving) return;

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      hours: form.hours.trim(),
      note: form.note.trim(),
      rating: form.rating || 0,
      recommend: form.recommend || 0,
      lat: form.lat,
      lng: form.lng,
      dishes: this.data.dishes
        .filter(function (d) { return d.name.trim(); })
        .map(function (d) { return { name: d.name.trim(), price: (d.price || "").trim() }; }),
      images: this.data.images.filter(function (x) { return x.url; }).map(function (x) { return x.url; })
    };

    this.setData({ saving: true });
    const req = this.data.id
      ? api.request("PUT", "/api/shops/" + this.data.id, payload)
      : api.request("POST", "/api/shops", payload);

    req.then(function () {
      self.setData({ saving: false });
      wx.showToast({ title: "已保存", icon: "success", duration: 900 });
      setTimeout(function () {
        const pages = getCurrentPages();
        if (pages.length > 1) wx.navigateBack();
        else wx.redirectTo({ url: "/pages/index/index" });
      }, 700);
    }).catch(function (e) {
      self.setData({ saving: false });
      if (/口令/.test(e.message)) {
        wx.showModal({
          title: "需要管理口令",
          content: "添加和修改需要口令。请到【设置】页填写服务器管理员给的口令（后端 ADMIN_TOKEN）。",
          confirmText: "去设置",
          success(r) { if (r.confirm) wx.navigateTo({ url: "/pages/settings/settings" }); }
        });
      } else {
        api.toast(e.message);
      }
    });
  },

  removeShop() {
    const self = this;
    wx.showModal({
      title: "删除这家餐馆？",
      content: "删除后不可恢复，图片也会一并清理。",
      confirmColor: "#A0223B",
      success(r) {
        if (!r.confirm) return;
        api.request("DELETE", "/api/shops/" + self.data.id).then(function () {
          wx.showToast({ title: "已删除", icon: "success" });
          setTimeout(function () { wx.navigateBack(); }, 700);
        }).catch(function (e) { api.toast(e.message); });
      }
    });
  },

  goSettings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  }
});
