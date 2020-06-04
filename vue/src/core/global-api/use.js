/* @flow */

import {
  toArray
} from '../util/index'

export function initUse(Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 如果存在，直接返回 this 也就是 Vue
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    const args = toArray(arguments, 1)
    // 将 this（即 Vue）添加到数组第一项
    args.unshift(this)
    // 如果插件的 install 是函数，调用他
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      // 如果插件是函数，调用它
      plugin.apply(null, args)
    }
    // 添加到已安装的插件
    installedPlugins.push(plugin)
    // 返回 this(即Vue)
    return this
  }
}
