/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 通过 mergeOptions 将 mixin 的参数合并到全局的 Vue 配置中
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
