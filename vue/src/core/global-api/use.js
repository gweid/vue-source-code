/* @flow */

import { toArray } from "../util/index";

export function initUse(Vue: GlobalAPI) {
  // 接受一个 plugin 参数
  Vue.use = function (plugin: Function | Object) {
    // this 就是 Vue 本身
    // _installedPlugins 存储了所有 plugin
    const installedPlugins =
      this._installedPlugins || (this._installedPlugins = []);
    // 如果 plugin 存在，那么返回 this（即 Vue）
    if (installedPlugins.indexOf(plugin) > -1) {
      return this;
    }

    // additional parameters
    const args = toArray(arguments, 1);
    // 将Vue对象拼接到数组头部
    args.unshift(this);
    if (typeof plugin.install === "function") {
      // 如果 plugin.install 存在， 直接调用 plugin.install, args 的第一项就是 Vue
      plugin.install.apply(plugin, args);
    } else if (typeof plugin === "function") {
      // plugin 存在，调用 plugin
      plugin.apply(null, args);
    }
    // 将plugin 存储到 installedPlugins
    installedPlugins.push(plugin);
    // 返回 this（即 Vue）
    return this;
  };
}
