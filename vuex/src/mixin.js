export default function (Vue) {
  const version = Number(Vue.version.split('.')[0])

  if (version >= 2) {
    // 通过在每一个组件的 beforeCreate 生命周期混入 vuexInit， vuexInit 就是使每个 Vue 的实例对象，都有一个 $store 属性
    Vue.mixin({
      beforeCreate: vuexInit
    })
  } else {
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init
    Vue.prototype._init = function (options = {}) {
      options.init = options.init ? [vuexInit].concat(options.init) :
        vuexInit
      _init.call(this, options)
    }
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   */
  // 最终每个 Vue 的实例对象，都有一个 $store 属性。且是同一个 Store 实例
  function vuexInit() {
    const options = this.$options
    // store injection
    // store 注入到每一个 Vue 实例中
    if (options.store) {
      this.$store = typeof options.store === 'function' ?
        options.store() :
        options.store
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store
    }
  }
}