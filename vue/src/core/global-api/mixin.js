/* @flow */

import { mergeOptions } from '../util/index'

// 全局混入选项，影响之后所有创建的 Vue 实例
export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 通过 mergeOptions 将 mixin 对象合并到全局的 Vue 配置 options 中
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
